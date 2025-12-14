// src-tauri/src/vpn/platform/macos.rs
use super::TunPrecheck;
use crate::constants::{SINGBOX_API_PORT, SINGBOX_PID_FILE, TUN_PID_FILE};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use std::fs::{self, File};
use std::net::IpAddr;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const SYSTEM_BIN_PATH: &str = "/Library/Application Support/ToVPN/sing-box";

const CMD_SUDO: &str = "/usr/bin/sudo";
const CMD_OSASCRIPT: &str = "/usr/bin/osascript";
const CMD_CURL: &str = "/usr/bin/curl";
const CMD_PGREP: &str = "/usr/bin/pgrep";
const CMD_PS: &str = "/bin/ps";
const CMD_PKILL: &str = "/usr/bin/pkill";
const CMD_ROUTE: &str = "/sbin/route";
const CMD_NETSTAT: &str = "/usr/sbin/netstat";
const CMD_SH: &str = "/bin/sh";

#[derive(Debug, Serialize, Deserialize)]
struct TunRuntimeState {
    utun: String,
    default_iface: String,
    bypass_ips: Vec<String>,
}

fn escape_single_quotes(s: &str) -> String {
    s.replace('\'', "'\"'\"'")
}

fn escape_for_applescript(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn sudo_ok(args: &[&str]) -> bool {
    Command::new(CMD_SUDO)
        .args(["-n", "-k"])
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn can_sudo_run_singbox_nopasswd() -> bool {
    Path::new(SYSTEM_BIN_PATH).exists() && sudo_ok(&[SYSTEM_BIN_PATH, "version"])
}

fn can_sudo_route_nopasswd() -> bool {
    sudo_ok(&[CMD_ROUTE, "-n", "get", "default"])
}

fn can_sudo_pkill_nopasswd() -> bool {
    sudo_ok(&[CMD_PKILL, "-0", "-x", "sing-box"])
}

fn detect_default_interface() -> Option<String> {
    let out = Command::new(CMD_ROUTE)
        .args(["-n", "get", "default"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout);
    for line in s.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("interface:") {
            let iface = rest.trim();
            if !iface.is_empty() {
                return Some(iface.to_string());
            }
        }
    }
    None
}

fn stop_via_api() {
    let url = format!("http://127.0.0.1:{}/connections", SINGBOX_API_PORT);
    let _ = Command::new(CMD_CURL)
        .args(["-s", "-m", "1", "-X", "DELETE", &url])
        .output();
}

pub fn is_singbox_running() -> bool {
    if let Ok(output) = Command::new(CMD_PGREP).args(["-x", "sing-box"]).output() {
        if output.status.success() {
            return true;
        }
    }

    if let Ok(pid_str) = fs::read_to_string(SINGBOX_PID_FILE) {
        if let Ok(pid) = pid_str.trim().parse::<i32>() {
            if let Ok(output) = Command::new(CMD_PS).args(["-p", &pid.to_string()]).output() {
                return String::from_utf8_lossy(&output.stdout).contains(&pid.to_string());
            }
        }
    }
    false
}

pub fn check_sudo_cached() -> bool {
    Command::new(CMD_SUDO)
        .args(["-n", "true"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn check_singbox_installed() -> bool {
    Path::new(SYSTEM_BIN_PATH).exists()
}

pub fn precheck_tun_permission() -> TunPrecheck {
    let singbox_installed = check_singbox_installed();
    let sudo_cached = can_sudo_run_singbox_nopasswd();
    TunPrecheck {
        singbox_installed,
        sudo_cached,
        will_prompt: !sudo_cached,
    }
}

fn prepare_log_file(target_path: &str) -> Result<(File, String), String> {
    let path = Path::new(target_path);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    match File::create(path) {
        Ok(f) => Ok((f, target_path.to_string())),
        Err(e) => {
            tracing::warn!("Log create failed: {}, trying fallback", e);
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            let fallback = format!("/tmp/tovpn-{}.log", ts);
            let f = File::create(&fallback).map_err(|e| format!("Fallback log failed: {}", e))?;
            Ok((f, fallback))
        }
    }
}

fn wait_for_singbox_started(log_file: &str) -> Result<(), String> {
    for _ in 0..40 {
        std::thread::sleep(Duration::from_millis(250));
        if let Ok(log) = fs::read_to_string(log_file) {
            if log.contains("FATAL") {
                return Err(log);
            }
            if log.contains("sing-box started") {
                return Ok(());
            }
        }
    }
    if is_singbox_running() {
        Ok(())
    } else {
        Err("Connection timeout".to_string())
    }
}

fn parse_utun_from_log(log_file: &str) -> Option<String> {
    let log = fs::read_to_string(log_file).ok()?;
    for line in log.lines().rev() {
        // e.g. "inbound/tun[tun-in]: started at utun4"
        if let Some(pos) = line.rfind("started at ") {
            let rest = line[(pos + "started at ".len())..].trim();
            if rest.starts_with("utun") {
                // utun4
                let name = rest.split_whitespace().next().unwrap_or(rest);
                return Some(name.to_string());
            }
        }
    }
    None
}

fn extract_ips_from_config(config_path: &str) -> Vec<String> {
    let mut ips = Vec::<String>::new();

    let text = match fs::read_to_string(config_path) {
        Ok(t) => t,
        Err(_) => return ips,
    };

    let v: Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(_) => return ips,
    };

    // 1) hysteria2 server
    if let Some(arr) = v.get("outbounds").and_then(|x| x.as_array()) {
        for ob in arr {
            if ob.get("type").and_then(|x| x.as_str()) == Some("hysteria2") {
                if let Some(s) = ob.get("server").and_then(|x| x.as_str()) {
                    if s.parse::<IpAddr>().is_ok() {
                        ips.push(s.to_string());
                    }
                }
            }
        }
    }

    // 2) dns servers：udp://x.x.x.x
    if let Some(arr) = v
        .get("dns")
        .and_then(|d| d.get("servers"))
        .and_then(|x| x.as_array())
    {
        for s in arr {
            if let Some(addr) = s.get("address").and_then(|x| x.as_str()) {
                let ip = addr.trim().strip_prefix("udp://").unwrap_or(addr.trim());
                if ip.parse::<IpAddr>().is_ok() {
                    ips.push(ip.to_string());
                }
            }
        }
    }

    ips.sort();
    ips.dedup();
    ips
}

fn route_add_host_via_iface(ip: &str, iface: &str) {
    let _ = Command::new(CMD_SUDO)
        .args([
            "-n",
            "-k",
            CMD_ROUTE,
            "-n",
            "add",
            "-host",
            ip,
            "-interface",
            iface,
        ])
        .output();
}

fn route_delete_host(ip: &str) {
    let _ = Command::new(CMD_SUDO)
        .args(["-n", "-k", CMD_ROUTE, "-n", "delete", "-host", ip])
        .output();
}

fn route_add_split_to_utun(utun: &str) {
    let _ = Command::new(CMD_SUDO)
        .args([
            "-n",
            "-k",
            CMD_ROUTE,
            "-n",
            "add",
            "-net",
            "0.0.0.0/1",
            "-interface",
            utun,
        ])
        .output();

    let _ = Command::new(CMD_SUDO)
        .args([
            "-n",
            "-k",
            CMD_ROUTE,
            "-n",
            "add",
            "-net",
            "128.0.0.0/1",
            "-interface",
            utun,
        ])
        .output();
}

fn route_delete_split() {
    for target in ["0.0.0.0/1", "128.0.0.0/1"] {
        let _ = Command::new(CMD_SUDO)
            .args(["-n", "-k", CMD_ROUTE, "-n", "delete", target])
            .output();
    }
}

pub fn run_singbox_tun_as_root(config_path: &str, log_file: &str) -> Result<(), String> {
    tracing::info!("Performing aggressive cleanup before start...");
    force_cleanup();

    if is_singbox_running() {
        tracing::info!("Previous sing-box detected, stopping...");
        let _ = stop_singbox_tun_as_root();
        std::thread::sleep(Duration::from_millis(300));
    }

    if !Path::new(SYSTEM_BIN_PATH).exists() {
        return Err("Core component missing. Please reinstall helper.".to_string());
    }

    if !can_sudo_run_singbox_nopasswd() {
        return Err("Sudo NOPASSWD not available. Please reinstall helper.".to_string());
    }

    let default_iface = detect_default_interface().unwrap_or_else(|| "en0".to_string());
    tracing::info!(
        "Starting sing-box (TUN mode) via sudo bin={} default_iface={}",
        SYSTEM_BIN_PATH,
        default_iface
    );

    let (log_file_handle, actual_log_file) = prepare_log_file(log_file)?;
    let log_file_err = log_file_handle
        .try_clone()
        .map_err(|e| format!("Failed to clone log: {}", e))?;

    let child = Command::new(CMD_SUDO)
        .args(["-n", "-k", SYSTEM_BIN_PATH, "run", "-c", config_path])
        .stdout(log_file_handle)
        .stderr(log_file_err)
        .spawn()
        .map_err(|e| format!("Sudo execution failed: {}", e))?;

    let _ = fs::write(SINGBOX_PID_FILE, child.id().to_string());

    // 等待 sing-box started
    wait_for_singbox_started(&actual_log_file)?;

    // 解析 utunX
    let mut utun = None;
    for _ in 0..20 {
        utun = parse_utun_from_log(&actual_log_file);
        if utun.is_some() {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let utun = utun.ok_or("TUN started but utun name not found in log".to_string())?;
    tracing::info!("TUN interface detected: {}", utun);

    // 读取 config 提取绕行 IP（服务端/DNS），给它们加 host route 走默认网卡
    let bypass_ips = extract_ips_from_config(config_path);
    tracing::info!(?bypass_ips, "Adding host routes for bypass ips");

    if !can_sudo_route_nopasswd() {
        return Err(
            "Sudo NOPASSWD for /sbin/route not available. Please reinstall helper.".to_string(),
        );
    }

    for ip in &bypass_ips {
        route_add_host_via_iface(ip, &default_iface);
    }

    // 添加半默认路由到 utun（关键）
    tracing::info!("Adding split default routes to {}", utun);
    route_add_split_to_utun(&utun);

    // 记录状态，供 stop/cleanup 清理
    let state = TunRuntimeState {
        utun,
        default_iface,
        bypass_ips,
    };
    let _ = fs::write(
        TUN_PID_FILE,
        serde_json::to_string_pretty(&state).unwrap_or_default(),
    );

    Ok(())
}

pub fn stop_singbox_tun_as_root() -> Result<(), String> {
    tracing::info!("Stopping sing-box TUN mode...");

    stop_via_api();

    let running = is_singbox_running();
    tracing::info!("Stop: is_singbox_running={}", running);

    if running {
        if !can_sudo_pkill_nopasswd() {
            return Err("Stop requires helper sudoers (NOPASSWD for /usr/bin/pkill).".to_string());
        }
        let _ = Command::new(CMD_SUDO)
            .args(["-n", "-k", CMD_PKILL, "-TERM", "-x", "sing-box"])
            .output();

        for _ in 0..20 {
            std::thread::sleep(Duration::from_millis(100));
            if !is_singbox_running() {
                break;
            }
        }

        let _ = Command::new(CMD_SUDO)
            .args(["-n", "-k", CMD_PKILL, "-KILL", "-x", "sing-box"])
            .output();
    }

    cleanup_after_stop_fast();
    tracing::info!("Stop: cleanup done.");
    Ok(())
}

fn cleanup_after_stop_fast() {
    let _ = fs::remove_file(SINGBOX_PID_FILE);

    // 清理我们自己加的路由
    if let Ok(s) = fs::read_to_string(TUN_PID_FILE) {
        if let Ok(st) = serde_json::from_str::<TunRuntimeState>(&s) {
            for ip in st.bypass_ips {
                route_delete_host(&ip);
            }
        }
    }
    route_delete_split();

    // 删除可能残留的 utun default（兜底）
    for i in 0..10 {
        let _ = Command::new(CMD_SUDO)
            .args([
                "-n",
                "-k",
                CMD_ROUTE,
                "-n",
                "delete",
                "default",
                "-interface",
                &format!("utun{}", i),
            ])
            .output();
    }

    let _ = fs::remove_file(TUN_PID_FILE);

    // 尝试恢复默认网关（异步）
    std::thread::spawn(move || restore_default_gateway());
}

fn restore_default_gateway() {
    if let Ok(o) = Command::new(CMD_NETSTAT).args(["-rn"]).output() {
        let s = String::from_utf8_lossy(&o.stdout);
        if s.contains("default")
            && !s
                .lines()
                .any(|l| l.contains("default") && l.contains("utun"))
        {
            return;
        }
    }

    let can_sudo_route = can_sudo_route_nopasswd();
    for iface in ["Wi-Fi", "Ethernet"] {
        if let Ok(o) = Command::new(CMD_SH)
            .args([
                "-c",
                &format!(
                    "networksetup -getinfo {} 2>/dev/null | grep Router | awk '{{print $2}}'",
                    iface
                ),
            ])
            .output()
        {
            let gw = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if !gw.is_empty() {
                if can_sudo_route {
                    let _ = Command::new(CMD_SUDO)
                        .args(["-n", "-k", CMD_ROUTE])
                        .args(["-n", "add", "default", &gw])
                        .output();
                } else {
                    let _ = Command::new(CMD_ROUTE)
                        .args(["-n", "add", "default", &gw])
                        .output();
                }
                return;
            }
        }
    }
}

pub fn force_cleanup() {
    if is_singbox_running() {
        let _ = stop_singbox_tun_as_root();
    } else {
        cleanup_after_stop_fast();
    }
}
