//! Helper 状态检查模块
use serde::Serialize;
use std::path::Path;
use crate::helper::constants::get_helper_marker_path;

#[derive(Serialize)]
pub struct HelperStatusResult {
    pub status: String,
}

pub fn is_helper_installed() -> bool {
    #[cfg(target_os = "windows")]
    {
        // Windows 的逻辑：
        // 1. 检查标记文件是否已创建
        // 2. 检查 Wintun 驱动是否就绪 (简化逻辑：只检查标记)
        get_helper_marker_path().exists()
    }

    #[cfg(target_os = "macos")]
    {
        use crate::helper::constants::SUDOERS_FILE;
        use std::process::Command;
        
        if !get_helper_marker_path().exists() || !Path::new(SUDOERS_FILE).exists() {
            return false;
        }

        let output = Command::new("sudo").args(["-n", "-l"]).output();
        let Ok(output) = output else { return false; };
        if !output.status.success() { return false; }
        
        let stdout = String::from_utf8_lossy(&output.stdout);
        stdout.contains("NOPASSWD") && (stdout.contains("sing-box") || stdout.contains("TOVPN_SINGBOX"))
    }

    #[cfg(target_os = "linux")]
    { true }
}

#[tauri::command]
pub async fn check_helper_status() -> Result<HelperStatusResult, String> {
    let status = if is_helper_installed() {
        "installed"
    } else {
        "not_installed"
    };

    Ok(HelperStatusResult {
        status: status.to_string(),
    })
}