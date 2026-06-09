//! Windows 平台特定实现
use super::TunPrecheck;
use crate::constants::{get_singbox_pid_file, SINGBOX_API_PORT_TUN};
use std::fs;
use std::net::TcpStream;
use std::process::Command;
use std::time::{Duration, Instant};

// 辅助函数：创建隐藏黑窗口的命令行子进程
fn new_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

pub fn is_singbox_running() -> bool {
    if let Ok(pid_str) = fs::read_to_string(get_singbox_pid_file()) {
        if let Ok(pid) = pid_str.trim().parse::<u32>() {
            if let Ok(output) = new_command("tasklist")
                .args(["/FI", &format!("PID eq {}", pid), "/NH"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if stdout.contains("sing-box") {
                    return true;
                }
            }
        }
    }

    new_command("tasklist")
        .args(["/FI", "IMAGENAME eq sing-box.exe", "/NH"])
        .output()
        .map(|o| {
            let stdout = String::from_utf8_lossy(&o.stdout);
            stdout.contains("sing-box")
        })
        .unwrap_or(false)
}

pub fn check_singbox_installed() -> bool {
    true
}

fn is_admin() -> bool {
    new_command("net")
        .args(["session"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn precheck_tun_permission() -> TunPrecheck {
    TunPrecheck {
        singbox_installed: check_singbox_installed(),
        sudo_cached: is_admin(),
        will_prompt: !is_admin(),
    }
}

pub fn run_singbox_tun_as_root(config_path: &str, _log_file: &str) -> Result<(), String> {
    if is_singbox_running() {
        let _ = stop_singbox_tun_as_root();
        std::thread::sleep(Duration::from_millis(500));
    }

    let escaped_config = config_path.replace("'", "''").replace("\\", "\\\\");
    let ps_command = format!(
        "Start-Process -FilePath 'sing-box' -ArgumentList 'run','-c','{}' -Verb RunAs -WindowStyle Hidden",
        escaped_config
    );

    let output = new_command("powershell")
        .args(["-Command", &ps_command])
        .output();

    match output {
        Ok(o) => {
            if o.status.success() {
                std::thread::sleep(Duration::from_millis(1500));
                if is_singbox_running() {
                    Ok(())
                } else {
                    Err("sing-box failed to start".into())
                }
            } else {
                let stderr = String::from_utf8_lossy(&o.stderr);
                Err(format!("Failed: {}", stderr))
            }
        }
        Err(e) => Err(format!("Failed to execute powershell: {}", e)),
    }
}

pub fn stop_singbox_tun_as_root() -> Result<(), String> {
    if is_admin() {
        let _ = new_command("taskkill")
            .args(["/F", "/IM", "sing-box.exe"])
            .output();
    } else {
        // 如果不是管理员，需要通过 powershell 提升权限执行 taskkill
        let ps_command = "Start-Process -FilePath 'taskkill' -ArgumentList '/F','/IM','sing-box.exe' -Verb RunAs -WindowStyle Hidden";
        let _ = new_command("powershell")
            .args(["-Command", ps_command])
            .output();
    }
    let _ = fs::remove_file(get_singbox_pid_file());
    std::thread::sleep(Duration::from_millis(500));
    Ok(())
}

pub fn force_cleanup() {
    let _ = stop_singbox_tun_as_root();
    if is_admin() {
        let _ = new_command("taskkill")
            .args(["/F", "/T", "/IM", "sing-box.exe"])
            .output();
    } else {
        let ps_command = "Start-Process -FilePath 'taskkill' -ArgumentList '/F','/T','/IM','sing-box.exe' -Verb RunAs -WindowStyle Hidden";
        let _ = new_command("powershell")
            .args(["-Command", ps_command])
            .output();
    }
}

pub fn set_system_socks_proxy(enable: bool, port: u16) {
    let reg_path = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
    if enable {
        let _ = new_command("reg")
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
        let socks_val = format!("socks=127.0.0.1:{}", port);
        let _ = new_command("reg")
            .args([
                "add",
                reg_path,
                "/v",
                "ProxyServer",
                "/t",
                "REG_SZ",
                "/d",
                &socks_val,
                "/f",
            ])
            .output();
    } else {
        let _ = new_command("reg")
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
    let _ = new_command("netsh")
        .args(["winhttp", "reset", "proxy"])
        .output();
}

/// 设置系统 HTTP 代理
/// 
/// **Feature: vpn-enhancement**
/// **Validates: Requirements 1.2, 1.4**
pub fn set_system_http_proxy(enable: bool, port: u16) {
    let reg_path = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
    if enable {
        // Windows 使用统一的代理服务器设置，包含 HTTP 和 HTTPS
        let proxy_val = format!("http=127.0.0.1:{};https=127.0.0.1:{}", port, port);
        let _ = new_command("reg")
            .args([
                "add",
                reg_path,
                "/v",
                "ProxyServer",
                "/t",
                "REG_SZ",
                "/d",
                &proxy_val,
                "/f",
            ])
            .output();
    }
    // 禁用时由 set_system_socks_proxy 统一处理
}

/// 设置所有系统代理（SOCKS + HTTP）
/// 
/// **Feature: vpn-enhancement**
/// **Validates: Requirements 1.2, 1.4 - 同时设置/清除 SOCKS 和 HTTP 代理**
pub fn set_system_proxy(enable: bool, socks_port: u16, http_port: u16) {
    if enable {
        let reg_path = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
        let _ = new_command("reg")
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
        // 设置包含 SOCKS 和 HTTP 的代理服务器
        let proxy_val = format!("http=127.0.0.1:{};https=127.0.0.1:{};socks=127.0.0.1:{}", http_port, http_port, socks_port);
        let _ = new_command("reg")
            .args([
                "add",
                reg_path,
                "/v",
                "ProxyServer",
                "/t",
                "REG_SZ",
                "/d",
                &proxy_val,
                "/f",
            ])
            .output();
    } else {
        set_system_socks_proxy(false, socks_port);
    }
}

pub fn detect_default_interface() -> Option<String> {
    None
}

/// 恢复 Windows 网络状态
/// 
/// 在应用启动时调用，清理可能残留的代理和网络设置
/// 
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements - 启动时恢复网络状态**
pub fn restore_network_state_windows() {
    println!(">>> Restoring Windows network state...");
    
    // 1. 禁用系统代理
    set_system_proxy(false, crate::constants::DEFAULT_SOCKS_PORT, crate::constants::DEFAULT_HTTP_PORT);
    
    // 2. 重置 WinHTTP 代理
    let _ = new_command("netsh")
        .args(["winhttp", "reset", "proxy"])
        .output();
    
    // 3. 刷新 DNS 缓存
    let _ = new_command("ipconfig")
        .args(["/flushdns"])
        .output();
    
    // 4. 重置 Winsock（如果有严重网络问题）
    // 注意：这个命令需要管理员权限，可能会失败
    // let _ = new_command("netsh")
    //     .args(["winsock", "reset"])
    //     .output();
    
    println!(">>> Windows network state restored");
}
