//! Linux 平台特定实现

use std::fs;
use std::path::Path;
use std::process::Command;
use crate::constants::SINGBOX_PID_FILE;
use super::TunPrecheck;

/// 检查 sing-box 进程是否在运行
pub fn is_singbox_running() -> bool {
    if let Ok(pid_str) = fs::read_to_string(SINGBOX_PID_FILE) {
        if let Ok(pid) = pid_str.trim().parse::<i32>() {
            return Command::new("kill")
                .args(["-0", &pid.to_string()])
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
        }
    }
    Command::new("pgrep")
        .arg("-x")
        .arg("sing-box")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// 检查 sing-box 是否已安装
pub fn check_singbox_installed() -> bool {
    Command::new("which")
        .arg("sing-box")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// 检查 pkexec 是否可用
pub fn check_pkexec_available() -> bool {
    Path::new("/usr/bin/pkexec").exists()
}

/// TUN 模式预检查
pub fn precheck_tun_permission() -> TunPrecheck {
    TunPrecheck {
        singbox_installed: check_singbox_installed(),
        sudo_cached: false,
        will_prompt: check_pkexec_available(),
    }
}

/// 以 root 权限运行 sing-box (TUN 模式)
pub fn run_singbox_tun_as_root(config_path: &str, _log_file: &str) -> Result<(), String> {
    if is_singbox_running() {
        let _ = stop_singbox_tun_as_root();
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    let output = Command::new("pkexec")
        .args(["sing-box", "run", "-c", config_path])
        .spawn();

    match output {
        Ok(mut child) => {
            if let Some(pid) = child.id() {
                let _ = fs::write(SINGBOX_PID_FILE, pid.to_string());
            }
            std::thread::sleep(std::time::Duration::from_millis(1000));
            if is_singbox_running() {
                Ok(())
            } else {
                Err("sing-box failed to start".to_string())
            }
        }
        Err(e) => Err(format!("Failed to start sing-box: {}", e)),
    }
}

/// 停止 sing-box (TUN 模式)
pub fn stop_singbox_tun_as_root() -> Result<(), String> {
    if let Ok(pid_str) = fs::read_to_string(SINGBOX_PID_FILE) {
        if let Ok(pid) = pid_str.trim().parse::<i32>() {
            let _ = Command::new("kill").args(["-TERM", &pid.to_string()]).output();
            let _ = fs::remove_file(SINGBOX_PID_FILE);
        }
    }

    if is_singbox_running() {
        let _ = Command::new("pkill").args(["-TERM", "sing-box"]).output();
    }
    Ok(())
}

/// 清理 TUN 路由
pub fn cleanup_tun_routes() {
    // 删除 tun0 相关路由
    let _ = Command::new("ip")
        .args(["route", "del", "default", "dev", "tun0"])
        .output();
    
    // 删除 tun 接口
    let _ = Command::new("ip")
        .args(["link", "del", "tun0"])
        .output();
}

/// 恢复默认网关
pub fn restore_default_gateway() {
    // 恢复 DNS 配置
    if Path::new("/etc/resolv.conf.bak").exists() {
        let _ = fs::copy("/etc/resolv.conf.bak", "/etc/resolv.conf");
        let _ = fs::remove_file("/etc/resolv.conf.bak");
    }
}

/// 强制清理所有 TUN 相关资源
pub fn force_cleanup() {
    if is_singbox_running() {
        let _ = stop_singbox_tun_as_root();
    }
    let _ = fs::remove_file(SINGBOX_PID_FILE);
    cleanup_tun_routes();
    restore_default_gateway();
}

/// 设置系统 SOCKS 代理
/// 
/// 支持 GNOME 桌面环境，使用 gsettings
#[allow(dead_code)]
pub fn set_system_socks_proxy(enable: bool) {
    if enable {
        // 设置代理模式为手动
        let _ = Command::new("gsettings")
            .args(["set", "org.gnome.system.proxy", "mode", "'manual'"])
            .output();

        // 设置 SOCKS 代理主机和端口
        let _ = Command::new("gsettings")
            .args(["set", "org.gnome.system.proxy.socks", "host", "'127.0.0.1'"])
            .output();

        let _ = Command::new("gsettings")
            .args(["set", "org.gnome.system.proxy.socks", "port", "1080"])
            .output();
    } else {
        // 禁用代理
        let _ = Command::new("gsettings")
            .args(["set", "org.gnome.system.proxy", "mode", "'none'"])
            .output();
    }

    // 备用方案：设置环境变量（适用于终端应用）
    // 这需要用户手动 source 配置文件
}

/// 检测桌面环境
#[allow(dead_code)]
fn detect_desktop_environment() -> Option<String> {
    std::env::var("XDG_CURRENT_DESKTOP").ok()
}

