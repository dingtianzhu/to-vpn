//! TUN 模式配置模块
use super::{get_lan_bypass_cidrs, get_webrtc_domains, get_webrtc_ports, pick_remote_dns_address, resolve_ipv4, RuleSetPaths};
use crate::constants::{self, tun, MTU_MAX, SINGBOX_API_PORT_TUN};
use crate::error::Result;
use crate::vpn::config::{ConfigOptions, ConnectConfig, TunStack};
use serde_json::{json, Value};
use std::net::IpAddr;
use std::path::Path;
use tracing::info;

pub fn generate(config: &ConnectConfig, cache_path: &Path, ruleset: RuleSetPaths) -> Result<Value> {
    // 使用默认配置选项
    generate_with_options(config, cache_path, ruleset, &ConfigOptions::default())
}

/// 生成 TUN 模式配置（带高级选项）
/// 
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 5.1, 5.2, 5.3**
pub fn generate_with_options(
    config: &ConnectConfig, 
    cache_path: &Path, 
    ruleset: RuleSetPaths,
    options: &ConfigOptions,
) -> Result<Value> {
    info!(">>> Generating TUN config (Dual Stack) with options <<<");

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
    // **Feature: vpn-optimization, Property 11: IPv4 Only 策略**
    // **Validates: Requirements - IPv6 禁用**
    // 由于 VPS 服务器不支持 IPv6，仅配置 IPv4 地址以避免连接问题
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 8.1, 8.2 - TUN 网络栈选择**
    let tun_stack = options.tun_stack.as_str();
    info!("Using TUN stack: {}", tun_stack);
    
    let inbounds = json!([{
        "type": "tun",
        "tag": "tun-in",
        "address": [tun::IPV4_ADDRESS],
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
        // **Feature: vpn-optimization, Property 11: IPv4 Only 策略**
        // **Validates: Requirements - IPv6 禁用**
        // 强制只解析 IPv4 地址，因为 VPS 服务器不支持 IPv6
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
    if options.block_quic {
        route_rules.push(json!({ "port": 443, "network": "udp", "action": "reject" }));
    }
    
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 6.2, 6.3 - WebRTC 阻断**
    // 阻断 STUN/TURN 端口和 WebRTC 相关域名，防止浏览器通过 WebRTC 泄露真实 IP
    // 注意：使用精确域名匹配（domain）而非后缀匹配（domain_suffix），避免误伤正常服务
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
    
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 7.3 - 分应用代理（进程路由规则）**
    // 强制代理的应用 - 放在 geo 规则之前
    if !options.forced_proxy_apps.is_empty() {
        let proxy_apps: Vec<&str> = options.forced_proxy_apps.iter().map(|s| s.as_str()).collect();
        route_rules.push(json!({ "process_name": proxy_apps, "outbound": "proxy" }));
        info!("Forced proxy apps: {:?}", options.forced_proxy_apps);
    }
    
    // 排除的应用（绕过 VPN）- 放在 geo 规则之前
    if !options.excluded_apps.is_empty() {
        let excluded_apps: Vec<&str> = options.excluded_apps.iter().map(|s| s.as_str()).collect();
        route_rules.push(json!({ "process_name": excluded_apps, "outbound": "direct" }));
        info!("Excluded apps (bypass VPN): {:?}", options.excluded_apps);
    }
    
    route_rules.push(json!({ "rule_set": "geosite-cn", "outbound": "direct" }));
    route_rules.push(json!({ "rule_set": "geoip-cn", "outbound": "direct" }));
    
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 9.1, 9.2, 9.3, 9.4 - 绕过局域网配置**
    // 当 bypass_lan 启用时，添加完整的 RFC1918 私有地址范围和 link-local 地址
    if options.bypass_lan {
        let lan_cidrs = get_lan_bypass_cidrs();
        route_rules.push(json!({ "ip_cidr": lan_cidrs, "outbound": "direct" }));
        info!("LAN bypass enabled: routing private IP ranges directly");
    }
    
    // 私有 IP 通用规则（作为后备）
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
