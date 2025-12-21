//! Windows 平台特定实现
use super::TunPrecheck;
use crate::constants::{get_singbox_pid_file, SINGBOX_API_PORT_TUN};
use std::fs;
use std::net::TcpStream;
use std::process::Command;
use std::time::{Duration, Instant};

pub fn is_singbox_running() -> bool {
    if let Ok(pid_str) = fs::read_to_string(get_singbox_pid_file()) {
        if let Ok(pid) = pid_str.trim().parse::<u32>() {
            if let Ok(output) = Command::new("tasklist")
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

    Command::new("tasklist")
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
    Command::new("net")
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

    let output = Command::new("powershell")
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
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", "sing-box.exe"])
        .output();
    let _ = fs::remove_file(get_singbox_pid_file());
    std::thread::sleep(Duration::from_millis(500));
    Ok(())
}

pub fn force_cleanup() {
    let _ = stop_singbox_tun_as_root();
    let _ = Command::new("taskkill")
        .args(["/F", "/T", "/IM", "sing-box.exe"])
        .output();
}

pub fn set_system_socks_proxy(enable: bool) {
    let reg_path = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
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
    let _ = Command::new("netsh")
        .args(["winhttp", "reset", "proxy"])
        .output();
}

pub fn detect_default_interface() -> Option<String> {
    None
}
