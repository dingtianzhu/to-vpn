//! TUN 模式配置模块
use super::{pick_remote_dns_address, resolve_ipv4, RuleSetPaths};
use crate::constants::{self, tun, MTU_MAX, SINGBOX_API_PORT_TUN};
use crate::error::Result;
use crate::vpn::config::ConnectConfig;
use serde_json::{json, Value};
use std::net::IpAddr;
use std::path::Path;
use tracing::info;

pub fn generate(config: &ConnectConfig, cache_path: &Path, ruleset: RuleSetPaths) -> Result<Value> {
    info!(">>> Generating TUN config (Dual Stack) <<<");

    // 1. 基础参数
    let mtu = if config.mtu > 0 && config.mtu <= MTU_MAX {
        config.mtu
    } else {
        MTU_MAX
    };

    // 2. 解析 IP
    let server_ips: Vec<IpAddr> = match config.server_host.parse::<IpAddr>() {
        Ok(ip) => vec![ip],
        Err(_) => resolve_ipv4(&config.server_host, config.server_port),
    };
    let hysteria_server = server_ips
        .iter()
        .find(|ip| ip.is_ipv4())
        .map(|ip| ip.to_string())
        .unwrap_or_else(|| config.server_host.clone());

    // 3. Inbounds (TUN 特有)
    let inbounds = json!([{
        "type": "tun",
        "tag": "tun-in",
        // FIX 1: 添加 IPv6 CIDR，让 TUN 网卡具备接收 IPv6 能力
        "address": [tun::IPV4_ADDRESS,tun::IPV6_ADDRESS],
        "mtu": mtu,
        "auto_route": true,
        "strict_route": true,
        "stack": "gvisor",//gvisor
        "sniff": true,
        "sniff_override_destination": true,
        "platform": {
            "http_proxy": {
                "enabled": false,
                "server": "127.0.0.1",
                "server_port": 0
            }
        }
    }]);

    // 4. DNS
    let local_dns_addr = constants::dns::ALIYUN_UDP;
    let remote_dns_addr = pick_remote_dns_address(&config.dns);

    let dns_config = json!({
        "servers": [
            { "tag": "local-dns", "address": local_dns_addr, "detour": "direct" },
            { "tag": "remote-dns", "address": remote_dns_addr, "detour": "proxy" }
        ],
        "rules": [
            // 1. 本地直连域名的 DNS 走本地
            { "rule_set": "geosite-cn", "server": "local-dns" },
            // 2. 特殊后缀走本地
            { "domain_suffix": [".cn", ".lan", ".local"], "server": "local-dns" },
            // 3. 剩下的（外网）全部强制走远程加密 DNS
            { "query_type": ["A", "AAAA"], "server": "remote-dns" }
        ],
        "final": "remote-dns",
        // FIX 2: 允许解析 IPv6，否则虽然网卡支持了，但域名解析不到 IPv6 地址
        "strategy": "ipv4_only",
        "independent_cache": true
    });

    // 5. 路由规则
    let mut route_rules = Vec::new();
    // A. 强制绕过 VPS 服务器 IP (防止环路)
    if !server_ips.is_empty() {
        let cidrs: Vec<String> = server_ips
            .iter()
            .map(|ip| {
                if ip.is_ipv4() {
                    format!("{}/32", ip)
                } else {
                    format!("{}/128", ip)
                }
            })
            .collect();
        route_rules.push(json!({ "ip_cidr": cidrs, "outbound": "direct" }));
    }
    route_rules.push(json!({ "protocol": "dns", "action": "hijack-dns" }));
    route_rules.push(
        json!({ "domain_suffix": [".lan", ".local", ".home", ".internal"], "outbound": "direct" }),
    );
    // 屏蔽 QUIC (UDP 443)
    route_rules.push(json!({ "port": 443, "network": "udp", "action": "reject" }));
    route_rules.push(json!({ "rule_set": "geosite-cn", "outbound": "direct" }));
    route_rules.push(json!({ "rule_set": "geoip-cn", "outbound": "direct" }));
    route_rules.push(json!({ "ip_is_private": true, "outbound": "direct" }));

    // 6. Outbounds
    let proxy_ob = json!({
        "type": "hysteria2",
        "tag": "proxy",
        "server": hysteria_server,
        "server_port": config.server_port,
        "password": config.password,
        "up_mbps": 200,
        "down_mbps": 500,
        "tcp_fast_open": true,
        "tls": {
            "enabled": true,
            "alpn": ["h3"],
            "insecure": true,
            "server_name": &config.server_host
        }
    });

    // let direct_ob = json!({ "type": "direct", "tag": "direct" });
    // 修改 outbounds 部分
    let direct_ob = json!({
        "type": "direct",
        "tag": "direct",
        "bind_interface": "en0" // 这是一个难点：不同机器网卡名不同
    });

    let route_config = json!({
        "auto_detect_interface": true,

        "final": "proxy",

        "rule_set": [
            { "tag": "geosite-cn", "type": "local", "format": "binary", "path": ruleset.geosite_cn },
            { "tag": "geoip-cn", "type": "local", "format": "binary", "path": ruleset.geoip_cn }
        ],
        "rules": route_rules
    });

    // 7. 组装
    Ok(json!({
        "log": { "level": "info", "timestamp": true },
        "experimental": {
            "clash_api": {
                "external_controller": format!("127.0.0.1:{}", SINGBOX_API_PORT_TUN),
                "secret": ""
            },
            "cache_file": { "enabled": true, "path": cache_path }
        },
        "dns": dns_config,
        "inbounds": inbounds,
        "outbounds": [
            proxy_ob,
            direct_ob,
            { "type": "block", "tag": "block" }
        ],
        "route": route_config
    }))
}
