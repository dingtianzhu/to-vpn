//! sing-box 配置生成模块（本地化 rule-set + system TUN 国内直连/国外代理）
//
// 关键修复：system 栈下关闭 auto_route，路由由 macos.rs 手动添加 0/1 + 128/1，避免回环黑洞。

use serde_json::{json, Value};
use std::{
    fs,
    net::{IpAddr, ToSocketAddrs},
    path::{Path, PathBuf},
};
use tracing::debug;

use super::config::ConnectConfig;
use crate::constants::{self, dns, tun};
use crate::error::Result;

static GEOSITE_CN_SRS: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/resources/rulesets/geosite-cn.srs"
));
static GEOIP_CN_SRS: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/resources/rulesets/geoip-cn.srs"
));

fn resolve_ipv4(host: &str, port: u16) -> Vec<IpAddr> {
    let mut out = Vec::<IpAddr>::new();
    if let Ok(iter) = (host, port).to_socket_addrs() {
        for sa in iter {
            let ip = sa.ip();
            if ip.is_ipv4() && !out.contains(&ip) {
                out.push(ip);
            }
        }
    }
    out
}

fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    if let Ok(meta) = fs::metadata(path) {
        if meta.is_file() && meta.len() == bytes.len() as u64 {
            return Ok(());
        }
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o644))?;
    }

    Ok(())
}

struct RuleSetPaths {
    geosite_cn: PathBuf,
    geoip_cn: PathBuf,
}

fn ensure_local_rulesets(base_dir: &Path) -> Result<RuleSetPaths> {
    let rules_dir = base_dir.join("rulesets");
    let geosite_cn = rules_dir.join("geosite-cn.srs");
    let geoip_cn = rules_dir.join("geoip-cn.srs");

    write_atomic(&geosite_cn, GEOSITE_CN_SRS)?;
    write_atomic(&geoip_cn, GEOIP_CN_SRS)?;

    Ok(RuleSetPaths {
        geosite_cn,
        geoip_cn,
    })
}

pub fn generate_config(config: &ConnectConfig, cache_path: &Path) -> Result<Value> {
    let mtu = if config.mtu > 0 && config.mtu <= constants::MTU_MAX {
        config.mtu
    } else {
        1400
    };

    let base_dir = cache_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();

    let ruleset = ensure_local_rulesets(&base_dir)?;

    let server_ips: Vec<IpAddr> = match config.server_host.parse::<IpAddr>() {
        Ok(ip) => vec![ip],
        Err(_) => resolve_ipv4(&config.server_host, config.server_port),
    };

    debug!(
        mtu = mtu,
        server_host = %config.server_host,
        ?server_ips,
        "Generating sing-box config (local rulesets + system tun, auto_route=false)"
    );

    // server 用 IP 更稳（避免 tun 接管后解析死锁）
    let hysteria_server = match config.server_host.parse::<IpAddr>() {
        Ok(_) => config.server_host.clone(),
        Err(_) => server_ips
            .iter()
            .find(|ip| ip.is_ipv4())
            .map(|ip| ip.to_string())
            .unwrap_or_else(|| config.server_host.clone()),
    };

    // -------- Inbounds --------
    let inbounds = if config.mode == "socks" {
        json!([{
            "type": "socks",
            "tag": "socks-in",
            "listen": "127.0.0.1",
            "listen_port": constants::DEFAULT_SOCKS_PORT,
            "sniff": true
        }])
    } else {
        json!([{
            "type": "tun",
            "tag": "tun-in",
            "address": [tun::IPV4_ADDRESS],
            "mtu": mtu,

            // 关键：关闭 auto_route，由平台层手动加 0/1 + 128/1（避免 system 栈回环）
            "auto_route": false,

            "strict_route": false,
            "stack": "system",
            "sniff": true,
            "sniff_override_destination": true
        }])
    };

    // -------- Route rules --------
    let mut route_rules = Vec::new();
    route_rules.push(json!({ "protocol": "dns", "action": "hijack-dns" }));

    // 服务端直连（双保险：即便流量进 tun 也不走 proxy）
    if !server_ips.is_empty() {
        let cidrs = server_ips
            .iter()
            .filter(|ip| ip.is_ipv4())
            .map(|ip| format!("{}/32", ip))
            .collect::<Vec<_>>();
        route_rules.push(json!({ "ip_cidr": cidrs, "outbound": "direct" }));
    }

    route_rules.push(json!({ "rule_set": "geosite-cn", "outbound": "direct" }));
    route_rules.push(json!({ "rule_set": "geoip-cn", "outbound": "direct" }));
    route_rules.push(json!({ "ip_is_private": true, "outbound": "direct" }));

    // -------- DNS --------
    let primary_dns = match config.dns.as_str() {
        "google" => dns::GOOGLE.to_string(),
        "cloudflare" => dns::CLOUDFLARE.to_string(),
        "aliyun" => dns::ALIYUN.to_string(),
        custom if custom.starts_with("custom:") => custom.trim_start_matches("custom:").to_string(),
        _ => dns::CLOUDFLARE.to_string(),
    };

    // 这里保持 udp:// 写法；如果你仍看到 legacy warning，后面可以再按 1.12 文档进一步迁移
    let local_dns_addr = format!("udp://{}", dns::ALIYUN);
    let remote_dns_addr = format!("udp://{}", primary_dns);

    Ok(json!({
        "log": { "level": "debug", "timestamp": true },

        "experimental": {
            "clash_api": {
                "external_controller": format!("127.0.0.1:{}", constants::SINGBOX_API_PORT),
                "secret": ""
            }
        },

        "dns": {
            "servers": [
                { "tag": "local",  "address": local_dns_addr,  "detour": "direct" },
                { "tag": "remote", "address": remote_dns_addr, "detour": "proxy", "address_resolver": "local" }
            ],
            "rules": [
                { "rule_set": "geosite-cn", "server": "local" }
            ],
            "final": "remote",
            "strategy": "ipv4_only",
            "independent_cache": true
        },

        "inbounds": inbounds,

        "outbounds": [
            {
                "type": "hysteria2",
                "tag": "proxy",
                "server": hysteria_server,
                "server_port": config.server_port,
                "password": config.password,
                "up_mbps": 100,
                "down_mbps": 100,
                "tls": {
                    "enabled": true,
                    "server_name": config.sni,
                    "alpn": ["h3"],
                    "insecure": true
                }
            },
            { "type": "direct", "tag": "direct" }
        ],

        "route": {
            "auto_detect_interface": true,
            "final": "proxy",
            "default_domain_resolver": "local",
            "rule_set": [
                { "tag": "geosite-cn", "type": "local", "format": "binary", "path": ruleset.geosite_cn },
                { "tag": "geoip-cn",   "type": "local", "format": "binary", "path": ruleset.geoip_cn }
            ],
            "rules": route_rules
        }
    }))
}
/// 解析日志级别（给 SOCKS sidecar 的 stdout/stderr 用）
pub fn parse_log_level(line: &str) -> (&str, String) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return ("", String::new());
    }

    let (level, message) = if trimmed.starts_with("FATAL") {
        ("error", extract_message(trimmed, "FATAL"))
    } else if trimmed.starts_with("ERROR") {
        ("error", extract_message(trimmed, "ERROR"))
    } else if trimmed.starts_with("WARN") {
        ("warn", extract_message(trimmed, "WARN"))
    } else if trimmed.starts_with("INFO") {
        ("info", extract_message(trimmed, "INFO"))
    } else if trimmed.starts_with("DEBUG") {
        ("debug", extract_message(trimmed, "DEBUG"))
    } else {
        ("info", trimmed.to_string())
    };

    (level, message)
}

fn extract_message(line: &str, prefix: &str) -> String {
    let after = &line[prefix.len()..];
    if after.starts_with('[') {
        if let Some(end) = after.find(']') {
            return after[end + 1..].trim().to_string();
        }
    }
    after.trim().to_string()
}

/// 检查是否为致命错误（给 SOCKS sidecar 的日志判断用）
pub fn is_fatal_error(line: &str) -> bool {
    let u = line.trim().to_uppercase();
    u.starts_with("FATAL") || u.contains("PANIC")
}
