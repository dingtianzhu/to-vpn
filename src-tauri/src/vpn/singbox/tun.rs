//! TUN 模式配置模块
//! 
//! **Feature: vpn-optimization**
//! **Validates: Requirements 1.3, 6.2, 6.3**

use super::{get_china_cdn_domains, pick_remote_dns_address, resolve_ipv4, RuleSetPaths};
use crate::constants::{self, tun, MTU_MAX, SINGBOX_API_PORT_TUN};
use crate::error::Result;
use crate::vpn::config::{ConfigOptions, ConnectConfig};
use crate::vpn::platform::detect_active_interface;
use serde_json::{json, Value};
use std::net::IpAddr;
use std::path::Path;
use tracing::info;

/// 生成 TUN 模式配置
/// 
/// **Feature: vpn-optimization**
/// **Validates: Requirements - 配置参数分析**
#[allow(dead_code)]
pub fn generate(config: &ConnectConfig, cache_path: &Path, ruleset: RuleSetPaths) -> Result<Value> {
    // 使用默认配置选项
    generate_with_options(config, cache_path, ruleset, &ConfigOptions::default())
}

/// 生成 TUN 模式配置（带高级选项）
/// 
/// **Feature: vpn-optimization**
/// **Validates: Requirements - 配置参数分析**
pub fn generate_with_options(
    config: &ConnectConfig,
    cache_path: &Path,
    ruleset: RuleSetPaths,
    options: &ConfigOptions,
) -> Result<Value> {
    info!(">>> Generating TUN config (Dual Stack) with options: {:?} <<<", options);

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
    // **Feature: vpn-optimization**
    // **Validates: Requirements - 根据用户设置决定是否启用 IPv6**
    // 如果禁用 IPv6：只配置 IPv4 地址，防止 IPv6 泄漏
    // 如果启用 IPv6：同时配置 IPv4 和 IPv6 地址
    let tun_addresses: Vec<&str> = if options.disable_ipv6 {
        vec![tun::IPV4_ADDRESS]
    } else {
        vec![tun::IPV4_ADDRESS, tun::IPV6_ADDRESS]
    };
    
    let inbounds = json!([{
        "type": "tun",
        "tag": "tun-in",
        "address": tun_addresses,
        "mtu": mtu,
        "auto_route": true,
        "strict_route": true,
        "stack": "gvisor",
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

    // 4. DNS - 防止 DNS 泄漏
    // 所有 DNS 查询都通过远程加密 DNS，防止泄漏
    let remote_dns_addr = pick_remote_dns_address(&config.dns);

    // DNS 配置 - 防止 DNS 泄漏
    // 关键：所有非中国域名必须走远程 DNS，否则会泄漏
    // DNS 策略根据用户设置决定：禁用 IPv6 时使用 ipv4_only，否则使用 prefer_ipv4
    let dns_strategy = if options.disable_ipv6 { "ipv4_only" } else { "prefer_ipv4" };
    
    let dns_config = json!({
        "servers": [
            { 
                "tag": "remote-dns", 
                "address": remote_dns_addr, 
                "detour": "proxy"
            },
            { 
                "tag": "local-dns", 
                "address": constants::dns::ALIYUN_UDP, 
                "detour": "direct" 
            },
            {
                "tag": "block-dns",
                "address": "rcode://success"
            }
        ],
        "rules": [
            // 只有明确的本地域名走本地 DNS
            { "domain_suffix": [".lan", ".local", ".home", ".internal", ".localhost"], "server": "local-dns" },
            // 只有 .cn 域名走本地 DNS（减少延迟）
            { "domain_suffix": [".cn"], "server": "local-dns" }
            // 注意：移除了 geosite-cn 规则，因为它会导致 DNS 泄漏
            // geosite-cn 包含太多域名，可能误匹配导致 DNS 查询走本地
            // 路由规则中的 geosite-cn 仍然有效，只是 DNS 查询统一走远程
        ],
        // 默认走远程加密 DNS，防止 DNS 泄漏
        "final": "remote-dns",
        // 根据用户设置决定 DNS 策略
        "strategy": dns_strategy,
        "independent_cache": true,
        // 禁用 DNS 缓存共享，防止泄漏
        "disable_cache": false,
        "disable_expire": false
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
    // 屏蔽 QUIC (UDP 443) - 根据配置选项决定
    if options.block_quic {
        route_rules.push(json!({ "port": 443, "network": "udp", "action": "reject" }));
    }
    // B. 常见国内 CDN 域名直连 (提高节点纯净度)
    // **Feature: vpn-optimization**
    // **Validates: Requirements 5.1, 5.2, 7.1**
    route_rules.push(json!({
        "domain_suffix": get_china_cdn_domains(),
        "outbound": "direct"
    }));
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
        "up_mbps": options.up_mbps,
        "down_mbps": options.down_mbps,
        "tcp_fast_open": options.tcp_fast_open,
        "tls": {
            "enabled": true,
            "alpn": ["h3"],
            "insecure": true,
            "server_name": &config.server_host
        }
    });

    // 动态检测网络接口，如果检测失败则依赖 auto_detect_interface
    // **Feature: vpn-optimization, Property 2 & 3**
    // **Validates: Requirements 1.3, 6.2, 6.3**
    let direct_ob = match detect_active_interface() {
        Some(interface_info) => {
            info!("Detected active interface: {} (type: {:?})", interface_info.name, interface_info.interface_type);
            json!({
                "type": "direct",
                "tag": "direct",
                "bind_interface": interface_info.name
            })
        }
        None => {
            info!("No active interface detected, using auto_detect_interface mode");
            // 回退到不指定 bind_interface，依赖 route 配置中的 auto_detect_interface: true
            json!({
                "type": "direct",
                "tag": "direct"
            })
        }
    };

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
