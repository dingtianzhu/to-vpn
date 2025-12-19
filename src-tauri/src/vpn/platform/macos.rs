//! macOS 平台层 - TUN 模式管理
//! 版本：v2025-12-17-PortSeparation

use super::TunPrecheck;
use crate::constants::{
    SINGBOX_API_PORT_SOCKS, SINGBOX_API_PORT_TUN, SINGBOX_PID_FILE, TUN_PID_FILE,
};

use serde::{Deserialize, Serialize};

use std::fs;
use std::fs::File;
use std::net::TcpStream;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const SYSTEM_BIN_PATH: &str = "/Library/Application Support/ToVPN/sing-box";

const CMD_SUDO: &str = "/usr/bin/sudo";
const CMD_PGREP: &str = "/usr/bin/pgrep";
const CMD_PKILL: &str = "/usr/bin/pkill";
const CMD_ROUTE: &str = "/sbin/route";

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TunRuntimeState {
    mode: String,
    started_at: u64,
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

/// 强力杀掉占用指定端口的进程
fn kill_process_by_port(port: u16) {
    let port_str = format!(":{}", port);

    // 只杀 LISTEN 状态的进程，防止杀掉主程序
    if let Ok(output) = Command::new("lsof")
        .args(["-t", "-i", &port_str, "-sTCP:LISTEN"])
        .output()
    {
        let pids = String::from_utf8_lossy(&output.stdout);
        for pid in pids.lines() {
            let pid = pid.trim();
            if !pid.is_empty() {
                tracing::debug!("Killing listener on port {}: PID {}", port, pid);
                let _ = Command::new("kill").args(["-9", pid]).output();
            }
        }
    }
}

pub fn detect_default_interface() -> Option<String> {
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
            return Some(rest.trim().to_string());
        }
    }
    None
}

pub fn is_singbox_running() -> bool {
    Command::new(CMD_PGREP)
        .args(["-x", "sing-box"])
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
    let _ = fs::remove_file(path);

    File::create(path)
        .map(|f| (f, target_path.to_string()))
        .map_err(|e| format!("Log create failed: {}", e))
}

fn wait_for_singbox_started(log_file: &str, timeout_ms: u64) -> Result<(), String> {
    let start = Instant::now();
    let timeout = Duration::from_millis(timeout_ms);

    while start.elapsed() < timeout {
        std::thread::sleep(Duration::from_millis(100));
        if let Ok(log) = fs::read_to_string(log_file) {
            if log.contains("FATAL") {
                return Err(log);
            }
            if log.contains("sing-box started") {
                return Ok(());
            } //add
            tracing::info!("===== sing-box log content =====\n{}", log);
        }
    }

    if is_singbox_running() {
        Ok(())
    } else {
        Err("Timeout".to_string())
    }
}

fn wait_process_stop(timeout_ms: u64) -> bool {
    let start = Instant::now();
    while start.elapsed() < Duration::from_millis(timeout_ms) {
        if !is_singbox_running() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    if is_singbox_running() {
        quick_kill_singbox();
        std::thread::sleep(Duration::from_millis(100));
    }

    !is_singbox_running()
}

fn wait_port_free(port: u16, timeout_ms: u64) -> bool {
    let start = Instant::now();
    while start.elapsed() < Duration::from_millis(timeout_ms) {
        if TcpStream::connect_timeout(
            &format!("127.0.0.1:{}", port).parse().unwrap(),
            Duration::from_millis(50),
        )
        .is_err()
        {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    kill_process_by_port(port);
    std::thread::sleep(Duration::from_millis(100));

    TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", port).parse().unwrap(),
        Duration::from_millis(50),
    )
    .is_err()
}

fn quick_kill_singbox() {
    tracing::debug!("Executing quick_kill_singbox...");

    // [修改点] 同时清理所有可能的端口
    kill_process_by_port(1080);
    kill_process_by_port(SINGBOX_API_PORT_TUN);
    kill_process_by_port(SINGBOX_API_PORT_SOCKS);

    // 针对 Root 权限的核打击 (精确匹配进程名)
    let _ = Command::new(CMD_SUDO)
        .args(["-n", "-k", CMD_PKILL, "-9", "-x", "sing-box"])
        .output();

    let _ = Command::new(CMD_SUDO)
        .args(["-n", "-k", "/usr/bin/killall", "-9", "sing-box"])
        .output();

    // 普通权限补刀
    let _ = Command::new(CMD_PKILL)
        .args(["-9", "-x", "sing-box"])
        .output();

    tracing::debug!("Kill commands executed.");
}

pub fn run_singbox_tun_as_root(config_path: &str, log_file: &str) -> Result<(), String> {
    tracing::info!("=== Starting TUN mode ===");
    //add
    // let cfg = fs::read_to_string(config_path).map_err(|e| format!("read config failed: {}", e))?;

    // tracing::info!(
    //     "Using config file: {}\nSHA1: {:x}",
    //     config_path,
    //     sha1::Sha1::from(cfg.as_bytes()).digest()
    // );
    //add
    force_cleanup();

    if !wait_process_stop(1000) {
        return Err("Failed to stop previous process".into());
    }

    let _ = fs::remove_file(TUN_PID_FILE);
    let _ = fs::remove_file(SINGBOX_PID_FILE);

    if !Path::new(SYSTEM_BIN_PATH).exists() {
        return Err("sing-box not installed in system directory".into());
    }
    if !can_sudo_run_singbox_nopasswd() {
        return Err("Sudo permission not available".into());
    }
    // ===== 关键诊断：打印 sing-box 真实版本 =====
    let version_output = Command::new(CMD_SUDO)
        .args(["-n", "-k", SYSTEM_BIN_PATH, "version"])
        .output()
        .map_err(|e| format!("Failed to exec sing-box version: {}", e))?;

    tracing::info!(
        "Using sing-box binary: {}, version:\n{}",
        SYSTEM_BIN_PATH,
        String::from_utf8_lossy(&version_output.stdout)
    );
    // ============================================
    let (log_handle, actual_log) = prepare_log_file(log_file)?;
    let log_err = log_handle.try_clone().map_err(|e| e.to_string())?;

    let child = Command::new(CMD_SUDO)
        .args(["-n", "-k", SYSTEM_BIN_PATH, "run", "-c", config_path])
        .stdout(log_handle)
        .stderr(log_err)
        .spawn()
        .map_err(|e| format!("Failed to spawn sing-box: {}", e))?;

    let _ = fs::write(SINGBOX_PID_FILE, child.id().to_string());

    if let Err(e) = wait_for_singbox_started(&actual_log, 8000) {
        tracing::error!("sing-box start failed: {}", e);
        force_cleanup();
        return Err(format!("Failed to start: {}", e));
    }

    let state = TunRuntimeState {
        mode: "tun".to_string(),
        started_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    };
    let _ = fs::write(
        TUN_PID_FILE,
        serde_json::to_string_pretty(&state).unwrap_or_default(),
    );

    std::thread::sleep(Duration::from_millis(1500));
    tracing::info!("=== TUN started successfully ===");
    Ok(())
}

pub fn stop_singbox_tun_as_root() -> Result<(), String> {
    tracing::info!("=== Stopping TUN mode ===");
    force_cleanup();
    tracing::info!("=== TUN stopped ===");
    Ok(())
}

pub fn force_cleanup() {
    tracing::info!("=== Force cleanup ===");

    quick_kill_singbox();
    let _ = wait_process_stop(1000);

    // [修改点] 端口分离后，虽然不用死等，但清理还是尽可能彻底
    wait_port_free(SINGBOX_API_PORT_TUN, 500);
    wait_port_free(SINGBOX_API_PORT_SOCKS, 500);
    wait_port_free(1080, 500);

    let _ = fs::remove_file(SINGBOX_PID_FILE);
    let _ = fs::remove_file(TUN_PID_FILE);

    tracing::info!("=== Force cleanup completed ===");
}
