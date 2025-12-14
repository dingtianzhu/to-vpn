//! Helper 状态检查模块

use std::path::Path;
use std::process::Command;
use serde::Serialize;

use super::constants::{HELPER_MARKER_PATH, SUDOERS_FILE};

/// Helper 状态结果
#[derive(Serialize)]
pub struct HelperStatusResult {
    pub status: String,
}

/// 检查 Helper 是否已正确安装
pub fn is_helper_installed() -> bool {
    // 检查标记文件
    if !Path::new(HELPER_MARKER_PATH).exists() {
        return false;
    }
    
    // 检查 sudoers 规则文件
    if !Path::new(SUDOERS_FILE).exists() {
        return false;
    }
    
    // 验证 sudoers 规则是否有效
    // 注意：我们的 sudoers 规则只允许 sing-box 和 pkill sing-box
    if let Ok(output) = Command::new("sudo")
        .args(["-n", "-l"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        // 检查是否包含关键权限：
        // 1. sing-box (运行)
        // 2. pkill (停止)
        // 注意: 我们已移除 /bin/kill 和 route 权限
        let has_singbox = stdout.contains("sing-box");
        let has_pkill = stdout.contains("pkill");
        
        if has_singbox && has_pkill {
            return true;
        }
        
        // 备用检查：只要 stdout 包含 NOPASSWD 就认为已配置
        if stdout.contains("NOPASSWD") && stdout.contains("sing-box") {
            return true;
        }
    }
    
    // 检查 sudoers 文件权限是否正确（440）
    if let Ok(metadata) = std::fs::metadata(SUDOERS_FILE) {
        use std::os::unix::fs::PermissionsExt;
        let mode = metadata.permissions().mode() & 0o777;
        // 权限应该是 440 (r--r-----)
        if mode == 0o440 {
            return true;
        }
    }
    
    false
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

/// 检查是否可以无密码执行 sudo（针对 sing-box 命令）
pub fn can_sudo_without_password() -> bool {
    // 检查标记文件和 sudoers 文件是否存在
    if !Path::new(HELPER_MARKER_PATH).exists() || !Path::new(SUDOERS_FILE).exists() {
        return false;
    }
    
    // 检查 sudoers 文件权限是否正确（440）
    if let Ok(metadata) = std::fs::metadata(SUDOERS_FILE) {
        use std::os::unix::fs::PermissionsExt;
        let mode = metadata.permissions().mode() & 0o777;
        if mode == 0o440 {
            // 使用 sudo -n -l 检查是否有 sing-box 权限
            if let Ok(output) = Command::new("sudo").args(["-n", "-l"]).output() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                return stdout.contains("sing-box") || stdout.contains("NOPASSWD");
            }
        }
    }
    
    false
}
