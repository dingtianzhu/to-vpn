//! Windows 平台特定实现

use super::TunPrecheck;
use crate::constants::SINGBOX_PID_FILE;
use std::fs;
use std::process::Command;

/// 检查 sing-box 进程是否在运行
pub fn is_singbox_running() -> bool {
    // 首先检查 PID 文件
    if let Ok(pid_str) = fs::read_to_string(SINGBOX_PID_FILE) {
        if let Ok(_pid) = pid_str.trim().parse::<u32>() {
            // Windows 上通过 tasklist 检查进程
            if let Ok(output) = Command::new("tasklist")
                .args(["/FI", &format!("PID eq {}", _pid), "/NH"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if stdout.contains("sing-box") {
                    return true;
                }
            }
        }
    }

    // 备用方案：通过进程名检查
    Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq sing-box.exe", "/NH"])
        .output()
        .map(|o| {
            let stdout = String::from_utf8_lossy(&o.stdout);
            stdout.contains("sing-box")
        })
        .unwrap_or(false)
}

/// 检查 sing-box 是否已安装（Tauri sidecar 由框架管理）
pub fn check_singbox_installed() -> bool {
    // Tauri sidecar 会自动处理，这里始终返回 true
    true
}

/// 检查是否以管理员权限运行
fn is_admin() -> bool {
    // 尝试检查是否有管理员权限
    // 简化方案：检查是否能访问受保护的系统目录
    Command::new("net")
        .args(["session"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// TUN 模式预检查
pub fn precheck_tun_permission() -> TunPrecheck {
    TunPrecheck {
        singbox_installed: check_singbox_installed(),
        sudo_cached: is_admin(),
        will_prompt: !is_admin(),
    }
}

/// 以管理员权限运行 sing-box (TUN 模式)
///
/// Windows 上使用 PowerShell 的 Start-Process -Verb RunAs 来提权
pub fn run_singbox_tun_as_root(config_path: &str, _log_file: &str) -> Result<(), String> {
    // 先停止已有进程
    if is_singbox_running() {
        let _ = stop_singbox_tun_as_root();
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    // 转义路径中的特殊字符
    let escaped_config = config_path.replace("'", "''").replace("\\", "\\\\");

    // 使用 PowerShell 提权运行
    // Start-Process -Verb RunAs 会弹出 UAC 提示
    let ps_command = format!(
        "Start-Process -FilePath 'sing-box' -ArgumentList 'run','-c','{}' -Verb RunAs -WindowStyle Hidden",
        escaped_config
    );

    let output = Command::new("powershell")
        .args(["-Command", &ps_command])
        .output();

    match output {
        Ok(o) => {
            if o.status.success() {
                // 等待进程启动
                std::thread::sleep(std::time::Duration::from_millis(1500));

                if is_singbox_running() {
                    Ok(())
                } else {
                    Err("sing-box failed to start (process not found after launch)".to_string())
                }
            } else {
                let stderr = String::from_utf8_lossy(&o.stderr);
                if stderr.contains("canceled") || stderr.contains("cancelled") {
                    Err("User cancelled administrator permission request".to_string())
                } else {
                    Err(format!("Failed to start sing-box: {}", stderr))
                }
            }
        }
        Err(e) => Err(format!("Failed to execute PowerShell: {}", e)),
    }
}

/// 停止 sing-box (TUN 模式)
pub fn stop_singbox_tun_as_root() -> Result<(), String> {
    // 使用 taskkill 强制终止进程
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", "sing-box.exe"])
        .output();

    // 清理 PID 文件
    let _ = fs::remove_file(SINGBOX_PID_FILE);

    // 等待进程退出
    std::thread::sleep(std::time::Duration::from_millis(500));

    if is_singbox_running() {
        // 如果还在运行，再次尝试
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/IM", "sing-box.exe"])
            .output();
    }

    Ok(())
}

/// 清理 TUN 路由（Windows 上由 sing-box 自动处理）
pub fn cleanup_tun_routes() {
    // Windows 上 sing-box 使用 Wintun，会自动清理路由
    // 如果需要手动清理，可以使用 netsh 命令
}

/// 恢复默认网关
pub fn restore_default_gateway() {
    // Windows 上通常不需要手动恢复，sing-box 会处理
}

/// 强制清理所有 TUN 相关资源
pub fn force_cleanup() {
    if is_singbox_running() {
        let _ = stop_singbox_tun_as_root();
    }
    let _ = fs::remove_file(SINGBOX_PID_FILE);
    cleanup_tun_routes();
}

/// 设置系统 SOCKS 代理
#[allow(dead_code)]
pub fn set_system_socks_proxy(enable: bool) {
    let reg_path = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

    if enable {
        // 启用代理
        let _ = Command::new("reg")
            .args(["add", reg_path, "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "1", "/f"])
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

        // 刷新系统代理设置
        let _ = Command::new("netsh")
            .args(["winhttp", "import", "proxy", "source=ie"])
            .output();
    } else {
        // 禁用代理
        let _ = Command::new("reg")
            .args(["add", reg_path, "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "0", "/f"])
            .output();

        // 重置代理设置
        let _ = Command::new("netsh")
            .args(["winhttp", "reset", "proxy"])
            .output();
    }
}
