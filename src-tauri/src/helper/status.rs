//! Helper 状态检查模块

use serde::Serialize;
use crate::helper::constants::get_helper_marker_path;

/// Helper 状态结果
#[derive(Serialize)]
pub struct HelperStatusResult {
    pub status: String,
}

/// 检查 Helper 是否已正确安装
pub fn is_helper_installed() -> bool {
    #[cfg(target_os = "windows")]
    {
        get_helper_marker_path().exists()
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        use std::path::Path;
        use crate::helper::constants::SUDOERS_FILE;

        if !get_helper_marker_path().exists() || !Path::new(SUDOERS_FILE).exists() {
            return false;
        }

        let output = Command::new("sudo").args(["-n", "-l"]).output();
        let Ok(output) = output else {
            return false;
        };
        if !output.status.success() {
            return false;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let has_nopasswd = stdout.contains("NOPASSWD") || stdout.contains("no password");
        let mentions_singbox = stdout.contains("sing-box") || stdout.contains("TOVPN_SINGBOX");

        has_nopasswd && mentions_singbox
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        true
    }
}

/// 检查 Helper 安装状态
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