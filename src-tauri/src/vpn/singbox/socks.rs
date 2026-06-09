//! SOCKS 模式配置模块

use serde_json::{json, Value};
use std::net::IpAddr;
use std::path::Path;
use tracing::info;

use super::{get_china_cdn_domains, get_dns_leak_test_domains, get_lan_bypass_cidrs, get_webrtc_domains, get_webrtc_ports, pick_remote_dns_address, resolve_ipv4, RuleSetPaths};
use crate::constants::{self, DEFAULT_HTTP_PORT, DEFAULT_SOCKS_PORT, SINGBOX_API_PORT_SOCKS};
use crate::error::Result;
use crate::vpn::config::{ConfigOptions, ConnectConfig, RouteMode};

/// 代理端口配置
/// 
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 1.1, 1.2, 1.5**
#[derive(Debug, Clone)]
pub struct ProxyPorts {
    pub socks_port: u16,
    pub http_port: u16,
}

impl Default for ProxyPorts {
    fn default() -> Self {
        Self {
            socks_port: DEFAULT_SOCKS_PORT,
            http_port: DEFAULT_HTTP_PORT,
        }
    }
}

/// 生成 SOCKS 模式配置
/// 
/// **Feature: vpn-optimization**
/// **Validates: Requirements - 配置参数分析**
#[allow(dead_code)]
pub fn generate(config: &ConnectConfig, cache_path: &Path, ruleset: RuleSetPaths) -> Result<Value> {
    // 使用默认配置选项和默认端口
    generate_with_options(config, cache_path, ruleset, &ConfigOptions::default())
}

/// 生成 SOCKS 模式配置（带高级选项）
/// 
/// **Feature: vpn-optimization**
/// **Validates: Requirements - 配置参数分析**
pub fn generate_with_options(
    config: &ConnectConfig,
    cache_path: &Path,
    ruleset: RuleSetPaths,
    options: &ConfigOptions,
) -> Result<Value> {
    // 使用默认端口
    generate_with_ports(config, cache_path, ruleset, options, &ProxyPorts::default())
}

/// 生成 SOCKS 模式配置（带高级选项和自定义端口）
/// 
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 1.5**
pub fn generate_with_ports(
    config: &ConnectConfig,
    cache_path: &Path,
    ruleset: RuleSetPaths,
    options: &ConfigOptions,
    ports: &ProxyPorts,
) -> Result<Value> {
    info!(">>> Generating SOCKS config with options: {:?}, ports: {:?} <<<", options, ports);

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

    // 2. Inbounds (SOCKS + HTTP 代理)
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 1.1, 1.2, 1.5 - 使用配置的端口而非硬编码值**
    let inbounds = json!([
        {
            "type": "socks",
            "tag": "socks-in",
            "listen": "127.0.0.1",
            "listen_port": ports.socks_port,
            "sniff": true,
            "sniff_override_destination": true
        },
        {
            "type": "http",
            "tag": "http-in",
            "listen": "127.0.0.1",
            "listen_port": ports.http_port,
            "sniff": true,
            "sniff_override_destination": true
        }
    ]);

    // 3. DNS (复刻原文件逻辑，保持一致)
    let local_dns_addr = constants::dns::ALIYUN_UDP;
    let remote_dns_addr = pick_remote_dns_address(&config.dns);

    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 4.2, 4.3, 4.4**
    // 根据 DNS 泄漏防护设置生成不同的 DNS 配置
    let dns_config = if options.dns_leak_protection {
        // DNS 泄漏防护启用：DNS 泄漏检测域名强制走远程
        let mut dns_rules = vec![
            // DNS 泄漏检测域名必须走远程 DNS，防止泄露真实 IP
            json!({ "domain": get_dns_leak_test_domains(), "server": "remote-dns" }),
            json!({ "outbound": "any", "server": "local-dns" }),
        ];
        
        // 规则模式下，.cn 域名和 geosite-cn 可以走本地 DNS
        if matches!(options.route_mode, RouteMode::Rule) {
            dns_rules.push(json!({ "domain_suffix": [".cn"], "server": "local-dns" }));
            dns_rules.push(json!({ "rule_set": "geosite-cn", "server": "local-dns" }));
        }
        
        dns_rules.push(json!({ "protocol": "quic", "server": "block-dns" }));
        
        json!({
            "servers": [
                { "tag": "local-dns",  "address": local_dns_addr,  "detour": "direct" },
                { "tag": "remote-dns", "address": remote_dns_addr, "detour": "proxy" },
                { "tag": "block-dns",  "address": "rcode://success" }
            ],
            "rules": dns_rules,
            "final": "remote-dns",
            "strategy": "ipv4_only",
            "independent_cache": true
        })
    } else {
        // DNS 泄漏防护禁用：使用传统的 DNS 分流策略
        json!({
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
        })
    };
    
    info!("DNS leak protection: {}", if options.dns_leak_protection { "enabled" } else { "disabled" });

    // 4. 路由规则
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 3.2, 3.3, 3.4**
    let mut route_rules = Vec::new();
    route_rules.push(json!({ "protocol": "dns", "action": "hijack-dns" }));
    route_rules.push(
        json!({ "domain_suffix": [".lan", ".local", ".home", ".internal"], "outbound": "direct" }),
    );
    // 屏蔽 QUIC (UDP 443) - 根据配置选项决定
    if options.block_quic {
        route_rules.push(json!({ "port": 443, "network": "udp", "action": "reject" }));
    }

    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 6.2, 6.3 - WebRTC 阻断**
    // 阻断 STUN/TURN 端口和 WebRTC 相关域名，防止浏览器通过 WebRTC 泄露真实 IP
    if options.block_webrtc {
        // 阻断 STUN/TURN 端口 (3478, 5349, 19302)
        let webrtc_ports = get_webrtc_ports();
        route_rules.push(json!({ "port": webrtc_ports, "network": "udp", "action": "reject" }));
        info!("WebRTC blocking enabled: blocking UDP ports {:?}", webrtc_ports);
        
        // 阻断 WebRTC 相关域名 - 使用精确匹配（domain）而非后缀匹配（domain_suffix）
        let webrtc_domains = get_webrtc_domains();
        route_rules.push(json!({ "domain": webrtc_domains, "action": "reject" }));
        info!("WebRTC blocking: blocking {} STUN/TURN domains", webrtc_domains.len());
    }

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

    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 5.3 - 自定义域名优先级高于 geo 规则**
    // 自定义代理域名（强制走代理）- 放在 geo 规则之前
    if !options.custom_proxy_domains.is_empty() {
        let proxy_domains: Vec<&str> = options.custom_proxy_domains.iter().map(|s| s.as_str()).collect();
        route_rules.push(json!({ "domain_suffix": proxy_domains, "outbound": "proxy" }));
        info!("Custom proxy domains: {:?}", options.custom_proxy_domains);
    }
    
    // 自定义直连域名（强制直连）- 放在 geo 规则之前
    if !options.custom_bypass_domains.is_empty() {
        let bypass_domains: Vec<&str> = options.custom_bypass_domains.iter().map(|s| s.as_str()).collect();
        route_rules.push(json!({ "domain_suffix": bypass_domains, "outbound": "direct" }));
        info!("Custom bypass domains: {:?}", options.custom_bypass_domains);
    }

    // 根据路由模式生成不同的规则
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 3.2, 3.3, 3.4**
    match options.route_mode {
        RouteMode::Global => {
            // 全局模式：只保留基本规则，所有流量走代理
            // **Feature: vpn-pure-mode**
            // **Validates: Requirements 9.1, 9.2, 9.3, 9.4 - 绕过局域网配置**
            if options.bypass_lan {
                let lan_cidrs = get_lan_bypass_cidrs();
                route_rules.push(json!({ "ip_cidr": lan_cidrs, "outbound": "direct" }));
                info!("LAN bypass enabled in Global mode: routing private IP ranges directly");
            }
            // 私有 IP 仍然直连（局域网访问）
            route_rules.push(json!({ "ip_is_private": true, "outbound": "direct" }));
            info!("Route mode: Global - all traffic through proxy");
        }
        RouteMode::Direct => {
            // 直连模式：所有流量直连，不走代理
            info!("Route mode: Direct - all traffic direct");
        }
        RouteMode::Rule => {
            // 规则模式：根据 geo 规则分流（中国直连，其他代理）
            // 常见国内 CDN 域名直连 (提高节点纯净度)
            // **Feature: vpn-optimization**
            // **Validates: Requirements 5.1, 5.2, 7.1**
            route_rules.push(json!({
                "domain_suffix": get_china_cdn_domains(),
                "outbound": "direct"
            }));
            route_rules.push(json!({ "rule_set": "geosite-cn", "outbound": "direct" }));
            route_rules.push(json!({ "rule_set": "geoip-cn", "outbound": "direct" }));
            // **Feature: vpn-pure-mode**
            // **Validates: Requirements 9.1, 9.2, 9.3, 9.4 - 绕过局域网配置**
            if options.bypass_lan {
                let lan_cidrs = get_lan_bypass_cidrs();
                route_rules.push(json!({ "ip_cidr": lan_cidrs, "outbound": "direct" }));
                info!("LAN bypass enabled in Rule mode: routing private IP ranges directly");
            }
            route_rules.push(json!({ "ip_is_private": true, "outbound": "direct" }));
            info!("Route mode: Rule - geo-based routing (bypass China)");
        }
    }
    
    // 确定最终出站
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 3.2, 3.3, 3.4**
    let final_outbound = match options.route_mode {
        RouteMode::Direct => "direct",
        _ => "proxy", // Rule 和 Global 模式默认走代理
    };

    // 5. Outbounds (复刻原文件逻辑)
    let proxy_ob = json!({
        "type": "hysteria2",
        "tag": "proxy",
        "server": hysteria_server,
        "server_port": config.server_port,
        "password": config.password,
        "up_mbps": options.up_mbps,
        "down_mbps": options.down_mbps,
        "tls": {
            "enabled": true,
            "alpn": ["h3"],
            "insecure": true,
            "server_name": &config.server_host
        }
    });

    let direct_ob = json!({ "type": "direct", "tag": "direct" });

    // 根据路由模式决定是否需要规则集
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 3.2, 3.3, 3.4**
    let route_config = match options.route_mode {
        RouteMode::Rule => {
            // 规则模式需要 geo 规则集
            json!({
                "auto_detect_interface": true,
                "final": final_outbound,
                "rule_set": [
                    { "tag": "geosite-cn", "type": "local", "format": "binary", "path": ruleset.geosite_cn },
                    { "tag": "geoip-cn",   "type": "local", "format": "binary", "path": ruleset.geoip_cn }
                ],
                "rules": route_rules
            })
        }
        _ => {
            // Global 和 Direct 模式不需要 geo 规则集
            json!({
                "auto_detect_interface": true,
                "final": final_outbound,
                "rules": route_rules
            })
        }
    };

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
