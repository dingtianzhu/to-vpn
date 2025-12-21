//! Windows 平台特定实现 - 补全版
use super::TunPrecheck;
use crate::constants::{get_singbox_pid_file, SINGBOX_API_PORT_SOCKS, SINGBOX_API_PORT_TUN};
use std::fs;
use std::net::TcpStream;
use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

/// 检查进程是否在运行 (基于 PID 文件和任务列表)
pub fn is_singbox_running() -> bool {
    let pid_file = get_singbox_pid_file();
    if let Ok(pid_str) = fs::read_to_string(&pid_file) {
        if let Ok(pid) = pid_str.trim().parse::<u32>() {
            let output = Command::new("tasklist")
                .args(["/FI", &format!("PID eq {}", pid), "/NH"])
                .output()
                .ok();
            if let Some(o) = output {
                return String::from_utf8_lossy(&o.stdout).contains("sing-box");
            }
        }
    }
    // 备选方案：直接按名称查
    let output = Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq sing-box.exe", "/NH"])
        .output()
        .ok();
    output.map_or(false, |o| {
        String::from_utf8_lossy(&o.stdout).contains("sing-box")
    })
}

pub fn check_singbox_installed() -> bool {
    true // Windows 下通常随 Sidecar 分发
}

/// 检查是否已经是管理员
fn is_admin() -> bool {
    let output = Command::new("net").arg("session").output();
    output.map(|o| o.status.success()).unwrap_or(false)
}

pub fn precheck_tun_permission() -> TunPrecheck {
    TunPrecheck {
        singbox_installed: true,
        sudo_cached: is_admin(),
        will_prompt: !is_admin(),
    }
}

/// 寻找 Sidecar 的绝对路径 (Windows 专用)
fn resolve_bin_path() -> String {
    // 这是一个简化版逻辑，实际应从 tauri app_handle 获取
    // 这里假设它在当前目录或标准 sidecar 路径
    if Path::new("sing-box.exe").exists() {
        return "sing-box.exe".to_string();
    }
    "sing-box".to_string() // 依赖 PATH
}

/// 以管理员权限运行 sing-box (TUN 模式)
pub fn run_singbox_tun_as_root(config_path: &str, log_file: &str) -> Result<(), String> {
    force_cleanup();

    let bin_path = resolve_bin_path();
    let config_abs_path = fs::canonicalize(config_path)
        .map_err(|_| "Invalid config path")?
        .to_string_lossy()
        .to_string();

    tracing::info!("Starting sing-box TUN via UAC: {}", bin_path);

    // 使用 PowerShell 提权启动进程
    // -WindowStyle Hidden 隐藏黑色控制台窗口
    let ps_script = format!(
        "Start-Process -FilePath '{}' -ArgumentList 'run', '-c', '{}' -Verb RunAs -WindowStyle Hidden",
        bin_path, config_abs_path
    );

    let status = Command::new("powershell")
        .args(["-Command", &ps_script])
        .status()
        .map_err(|e| e.to_string())?;

    if !status.success() {
        return Err("UAC authorization failed or PowerShell error".to_string());
    }

    // 等待 API 端口就绪，视为启动成功
    if wait_port_ready(SINGBOX_API_PORT_TUN, 5000) {
        // 尝试记录 PID (注意：RunAs 启动的 PID 不好直接抓取，通常靠端口和名称管理)
        Ok(())
    } else {
        Err("TUN device start timeout (check Wintun driver)".to_string())
    }
}

pub fn stop_singbox_tun_as_root() -> Result<(), String> {
    force_cleanup();
    Ok(())
}

fn wait_port_ready(port: u16, timeout_ms: u64) -> bool {
    let start = Instant::now();
    while start.elapsed() < Duration::from_millis(timeout_ms) {
        if TcpStream::connect_timeout(
            &format!("127.0.0.1:{}", port).parse().unwrap(),
            Duration::from_millis(100),
        )
        .is_ok()
        {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

pub fn force_cleanup() {
    tracing::info!("Windows force cleanup...");

    // 1. 杀掉进程 (强制且包含子进程)
    let _ = Command::new("taskkill")
        .args(["/F", "/T", "/IM", "sing-box.exe"])
        .output();

    // 2. 清理系统代理 (Registry)
    set_system_socks_proxy(false);

    // 3. 删除 PID 文件
    let _ = fs::remove_file(get_singbox_pid_file());

    std::thread::sleep(Duration::from_millis(300));
}

/// 设置 Windows 系统代理 (注册表)
pub fn set_system_socks_proxy(enable: bool) {
    let reg_path = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings";

    if enable {
        let _ = Command::new("reg")
            .args([
                "add",
                reg_path,
                "/v",
                "ProxyEnable",
                "/t",
                "REG_DWORD",
                "/d",
                "1",
                "/f",
            ])
            .output();
        let _ = Command::new("reg")
            .args([
                "add",
                reg_path,
                "/v",
                "ProxyServer",
                "/t",
                "REG_SZ",
                "/d",
                "socks=127.0.0.1:1080",
                "/f",
            ])
            .output();
    } else {
        let _ = Command::new("reg")
            .args([
                "add",
                reg_path,
                "/v",
                "ProxyEnable",
                "/t",
                "REG_DWORD",
                "/d",
                "0",
                "/f",
            ])
            .output();
    }

    // 通知系统代理已更改 (防止浏览器延迟生效)
    // 简单方法：通过 IE 设置刷新（虽然较老但依然有效）
    let _ = Command::new("netsh")
        .args(["winhttp", "reset", "proxy"])
        .output();
}

pub fn detect_default_interface() -> Option<String> {
    // Windows sing-box 的 auto_detect_interface 效果很好，通常不需要手动指定
    None
}
