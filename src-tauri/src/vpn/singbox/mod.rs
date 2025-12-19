//! sing-box 配置生成模块入口
//! 提供公共工具函数和分发逻辑

pub mod socks;
pub mod tun;

use serde_json::Value;
use std::{
    fs,
    net::{IpAddr, ToSocketAddrs},
    path::{Path, PathBuf},
};
use tracing::info;

use crate::constants;
use crate::error::Result;
use crate::vpn::config::ConnectConfig;

// 嵌入资源文件
static GEOSITE_CN_SRS: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/resources/rulesets/geosite-cn.srs"
));
static GEOIP_CN_SRS: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/resources/rulesets/geoip-cn.srs"
));

/// 规则集路径结构体
pub struct RuleSetPaths {
    pub geosite_cn: PathBuf,
    pub geoip_cn: PathBuf,
}

/// 统一入口函数
pub fn generate_config(config: &ConnectConfig, cache_path: &Path) -> Result<Value> {
    info!(">>> generate_config (Split Module Mode) <<<");

    // 确保规则集存在 (公共逻辑)
    let base_dir = cache_path.parent().unwrap_or(Path::new(".")).to_path_buf();
    let ruleset_paths = ensure_local_rulesets(&base_dir)?;

    if config.mode == "tun" {
        tun::generate(config, cache_path, ruleset_paths)
    } else {
        socks::generate(config, cache_path, ruleset_paths)
    }
}

/// 确保本地规则集文件存在
pub fn ensure_local_rulesets(base_dir: &Path) -> Result<RuleSetPaths> {
    let rules_dir = base_dir.join("rulesets");
    let geosite_cn = rules_dir.join("geosite-cn.srs");
    let geoip_cn = rules_dir.join("geoip-cn.srs");

    if !geosite_cn.exists() || geosite_cn.metadata().map(|m| m.len()).unwrap_or(0) == 0 {
        write_atomic(&geosite_cn, GEOSITE_CN_SRS)?;
    }
    if !geoip_cn.exists() || geoip_cn.metadata().map(|m| m.len()).unwrap_or(0) == 0 {
        write_atomic(&geoip_cn, GEOIP_CN_SRS)?;
    }

    Ok(RuleSetPaths {
        geosite_cn,
        geoip_cn,
    })
}

/// 原子写入文件 helper
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o644));
    }
    Ok(())
}

/// 解析域名 IP helper
pub fn resolve_ipv4(host: &str, port: u16) -> Vec<IpAddr> {
    let mut out = Vec::new();
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

/// 选择 DNS helper
pub fn pick_remote_dns_address(choice: &str) -> String {
    match choice {
        "google" => constants::dns::GOOGLE_DOH.to_string(),
        "cloudflare" => constants::dns::CLOUDFLARE_DOH.to_string(),
        "quad9" => constants::dns::QUAD9_UDP.to_string(),
        "aliyun" => constants::dns::ALIYUN_UDP.to_string(),
        "" => constants::dns::CLOUDFLARE_DOH.to_string(),
        _ if choice.starts_with("custom:") => choice
            .strip_prefix("custom:")
            .unwrap_or("")
            .trim()
            .to_string(),
        _ => constants::dns::CLOUDFLARE_DOH.to_string(),
    }
}

/// 日志解析 helper
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

pub fn is_fatal_error(line: &str) -> bool {
    let u = line.trim().to_uppercase();
    u.starts_with("FATAL") || u.contains("PANIC") || u.contains("bind: address already in use")
}
