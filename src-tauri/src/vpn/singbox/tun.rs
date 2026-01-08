//! TUN 模式配置模块
//! 
//! **Feature: vpn-optimization**
//! **Validates: Requirements 1.3, 6.2, 6.3**

use super::{get_china_cdn_domains, get_dns_leak_test_domains, get_lan_bypass_cidrs, get_webrtc_domains, get_webrtc_ports, pick_remote_dns_address, resolve_ipv4, RuleSetPaths};
use crate::constants::{self, tun, MTU_MAX, SINGBOX_API_PORT_TUN};
use crate::error::Result;
use crate::vpn::config::{ConfigOptions, ConnectConfig, RouteMode, TunStack};
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
    
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 8.2 - TUN 网络栈配置**
    // 根据用户设置选择 TUN 网络栈：gvisor（默认）、system、lwip
    let tun_stack = match options.tun_stack {
        TunStack::System => "system",
        TunStack::Lwip => "lwip",
        TunStack::Gvisor => "gvisor",
    };
    info!("TUN stack: {}", tun_stack);
    
    let inbounds = json!([{
        "type": "tun",
        "tag": "tun-in",
        "address": tun_addresses,
        "mtu": mtu,
        "auto_route": true,
        "strict_route": true,
        "stack": tun_stack,
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
    
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 4.2, 4.3, 4.4**
    // 根据 DNS 泄漏防护设置生成不同的 DNS 配置
    let dns_config = if options.dns_leak_protection {
        // DNS 泄漏防护启用：所有 DNS 查询走远程，DNS 泄漏检测域名强制走远程
        let mut dns_rules = vec![
            // DNS 泄漏检测域名必须走远程 DNS，防止泄露真实 IP
            json!({ "domain": get_dns_leak_test_domains(), "server": "remote-dns" }),
            // 只有明确的本地域名走本地 DNS
            json!({ "domain_suffix": [".lan", ".local", ".home", ".internal", ".localhost"], "server": "local-dns" }),
        ];
        
        // 规则模式下，.cn 域名可以走本地 DNS（减少延迟）
        if matches!(options.route_mode, RouteMode::Rule) {
            dns_rules.push(json!({ "domain_suffix": [".cn"], "server": "local-dns" }));
        }
        
        json!({
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
            "rules": dns_rules,
            // 默认走远程加密 DNS，防止 DNS 泄漏
            "final": "remote-dns",
            // 根据用户设置决定 DNS 策略
            "strategy": dns_strategy,
            "independent_cache": true,
            // 禁用 DNS 缓存共享，防止泄漏
            "disable_cache": false,
            "disable_expire": false
        })
    } else {
        // DNS 泄漏防护禁用：使用传统的 DNS 分流策略
        json!({
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
                // 本地域名走本地 DNS
                { "domain_suffix": [".lan", ".local", ".home", ".internal", ".localhost"], "server": "local-dns" },
                // .cn 域名走本地 DNS
                { "domain_suffix": [".cn"], "server": "local-dns" },
                // geosite-cn 走本地 DNS（可能导致 DNS 泄漏，但用户选择禁用防护）
                { "rule_set": "geosite-cn", "server": "local-dns" }
            ],
            "final": "remote-dns",
            "strategy": dns_strategy,
            "independent_cache": true,
            "disable_cache": false,
            "disable_expire": false
        })
    };
    
    info!("DNS leak protection: {}", if options.dns_leak_protection { "enabled" } else { "disabled" });

    // 5. 路由规则
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 3.2, 3.3, 3.4**
    let mut route_rules = Vec::new();
    
    // A. 强制绕过 VPS 服务器 IP (防止环路) - 所有模式都需要
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
    
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 6.2, 6.3 - WebRTC 阻断**
    // 阻断 STUN/TURN 端口和 WebRTC 相关域名，防止浏览器通过 WebRTC 泄露真实 IP
    if options.block_webrtc {
        // 阻断 STUN/TURN 端口 (3478, 5349, 19302)
        let webrtc_ports = get_webrtc_ports();
        route_rules.push(json!({ "port": webrtc_ports, "network": "udp", "action": "reject" }));
        info!("WebRTC blocking enabled: blocking UDP ports {:?}", webrtc_ports);
        
        // 阻断 WebRTC 相关域名
        let webrtc_domains = get_webrtc_domains();
        route_rules.push(json!({ "domain_suffix": webrtc_domains, "action": "reject" }));
        info!("WebRTC blocking: blocking {} domains", webrtc_domains.len());
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
    
    // B. 根据路由模式生成不同的规则
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
            // 注意：这种模式下 VPN 基本不起作用，仅用于测试
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

    // 6. Outbounds
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
                    { "tag": "geoip-cn", "type": "local", "format": "binary", "path": ruleset.geoip_cn }
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
