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
        use std::path::Path;
        use crate::helper::constants::SUDOERS_FILE;
        const SYSTEM_BIN_PATH: &str = "/Library/Application Support/ToVPN/sing-box";

        get_helper_marker_path().exists() && Path::new(SUDOERS_FILE).exists() && Path::new(SYSTEM_BIN_PATH).exists()
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