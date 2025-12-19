//! SOCKS 模式配置模块

use serde_json::{json, Value};
use std::net::IpAddr;
use std::path::Path;
use tracing::info;

use super::{pick_remote_dns_address, resolve_ipv4, RuleSetPaths};
use crate::constants::{self, DEFAULT_SOCKS_PORT, SINGBOX_API_PORT_SOCKS};
use crate::error::Result;
use crate::vpn::config::ConnectConfig;

pub fn generate(config: &ConnectConfig, cache_path: &Path, ruleset: RuleSetPaths) -> Result<Value> {
    info!(">>> Generating SOCKS config <<<");

    // 1. 解析 IP
    let server_ips: Vec<IpAddr> = match config.server_host.parse::<IpAddr>() {
        Ok(ip) => vec![ip],
        Err(_) => resolve_ipv4(&config.server_host, config.server_port),
    };

    let hysteria_server = server_ips
        .iter()
        .find(|ip| ip.is_ipv4())
        .map(|ip| ip.to_string())
        .unwrap_or_else(|| config.server_host.clone());

    // 2. Inbounds (SOCKS 特有)
    let inbounds = json!([{
        "type": "socks",
        "tag": "socks-in",
        "listen": "127.0.0.1",
        "listen_port": DEFAULT_SOCKS_PORT,
        "sniff": true,
        "sniff_override_destination": true
    }]);

    // 3. DNS (复刻原文件逻辑，保持一致)
    let local_dns_addr = constants::dns::ALIYUN_UDP;
    let remote_dns_addr = pick_remote_dns_address(&config.dns);

    let dns_config = json!({
        "servers": [
            { "tag": "local-dns",  "address": local_dns_addr,  "detour": "direct" },
            { "tag": "remote-dns", "address": remote_dns_addr, "detour": "proxy" },
            { "tag": "block-dns",  "address": "rcode://success" }
        ],
        "rules": [
            { "outbound": "any", "server": "local-dns" },
            { "domain_suffix": [".cn"], "server": "local-dns" },
            { "rule_set": "geosite-cn", "server": "local-dns" },
            { "protocol": "quic", "server": "block-dns" }
        ],
        "final": "remote-dns",
        "strategy": "ipv4_only",
        "independent_cache": true
    });

    // 4. 路由规则 (复刻原文件逻辑)
    let mut route_rules = Vec::new();
    route_rules.push(json!({ "protocol": "dns", "action": "hijack-dns" }));
    route_rules.push(
        json!({ "domain_suffix": [".lan", ".local", ".home", ".internal"], "outbound": "direct" }),
    );
    // 屏蔽 QUIC (UDP 443)
    route_rules.push(json!({ "port": 443, "network": "udp", "action": "reject" }));

    if !server_ips.is_empty() {
        let cidrs: Vec<String> = server_ips
            .iter()
            .filter(|ip| ip.is_ipv4())
            .map(|ip| format!("{}/32", ip))
            .collect();
        if !cidrs.is_empty() {
            route_rules.push(json!({ "ip_cidr": cidrs, "outbound": "direct" }));
        }
    }

    route_rules.push(json!({ "rule_set": "geosite-cn", "outbound": "direct" }));
    route_rules.push(json!({ "rule_set": "geoip-cn", "outbound": "direct" }));
    route_rules.push(json!({ "ip_is_private": true, "outbound": "direct" }));

    // 5. Outbounds (复刻原文件逻辑)
    let proxy_ob = json!({
        "type": "hysteria2",
        "tag": "proxy",
        "server": hysteria_server,
        "server_port": config.server_port,
        "password": config.password,
        "up_mbps": 100,
        "down_mbps": 100,
        "tls": {
            "enabled": true,
            "alpn": ["h3"],
            "insecure": true,
            "server_name": &config.server_host
        }
    });

    let direct_ob = json!({ "type": "direct", "tag": "direct" });

    let route_config = json!({
        "auto_detect_interface": true,
        "final": "proxy",
        "rule_set": [
            { "tag": "geosite-cn", "type": "local", "format": "binary", "path": ruleset.geosite_cn },
            { "tag": "geoip-cn",   "type": "local", "format": "binary", "path": ruleset.geoip_cn }
        ],
        "rules": route_rules
    });

    // 6. 组装 (SOCKS 端口)
    Ok(json!({
        "log": { "level": "info", "timestamp": true },
        "experimental": {
            "clash_api": {
                "external_controller": format!("127.0.0.1:{}", SINGBOX_API_PORT_SOCKS),
                "secret": ""
            },
            "cache_file": { "enabled": true, "path": cache_path }
        },
        "dns": dns_config,
        "inbounds": inbounds,
        "outbounds": [ proxy_ob, direct_ob, { "type": "block", "tag": "block" } ],
        "route": route_config
    }))
}
