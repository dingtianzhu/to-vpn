//! Helper 状态检查模块

use serde::Serialize;
use std::path::Path;
use std::process::Command;

use super::constants::{HELPER_MARKER_PATH, SUDOERS_FILE};

/// Helper 状态结果
#[derive(Serialize)]
pub struct HelperStatusResult {
    pub status: String,
}

/// 检查 Helper 是否已正确安装
pub fn is_helper_installed() -> bool {
    // 1) 基础文件存在性
    if !Path::new(HELPER_MARKER_PATH).exists() {
        return false;
    }
    if !Path::new(SUDOERS_FILE).exists() {
        return false;
    }

    // 2) sudoers 文件权限应该是 440
    #[cfg(unix)]
    {
        if let Ok(metadata) = std::fs::metadata(SUDOERS_FILE) {
            use std::os::unix::fs::PermissionsExt;
            let mode = metadata.permissions().mode() & 0o777;
            if mode != 0o440 {
                return false;
            }
        } else {
            return false;
        }
    }

    // 3) 尝试 sudo -n -l（非交互）验证当前用户是否确实有 NOPASSWD 规则
    // manager.rs 生成的规则包含 sing-box/route/pkill/kill（以那边为准）
    let output = Command::new("sudo").args(["-n", "-l"]).output();
    let Ok(output) = output else {
        return false;
    };
    if !output.status.success() {
        return false;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // 经验上 sudo -l 输出格式在不同系统略有差异：这里用“关键字包含”做温和判断
    let has_nopasswd = stdout.contains("NOPASSWD") || stdout.contains("no password");
    let mentions_singbox = stdout.contains("sing-box") || stdout.contains("TOVPN_SINGBOX");

    has_nopasswd && mentions_singbox
}

/// 检查 Helper 安装状态
#[tauri::command]
pub async fn check_helper_status() -> Result<HelperStatusResult, String> {
    let status = if is_helper_installed() {
        "installed"
    } else if Path::new(HELPER_MARKER_PATH).exists() {
        // 标记存在但验证失败，可能需要重新安装
        "error"
    } else {
        "not_installed"
    };

    Ok(HelperStatusResult {
        status: status.to_string(),
    })
}
