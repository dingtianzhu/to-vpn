//! Helper 安装/卸载管理模块
//! 版本：v2025-12-22-Final-Clean-Build

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

use tracing::{error, info};

use super::constants::get_helper_marker_path;
#[cfg(target_os = "macos")]
use super::constants::SUDOERS_FILE;
use super::HelperResult;

#[cfg(target_os = "macos")]
const SYSTEM_INSTALL_DIR: &str = "/Library/Application Support/ToVPN";
#[cfg(target_os = "macos")]
pub const SYSTEM_BIN_PATH: &str = "/Library/Application Support/ToVPN/sing-box";

#[tauri::command]
pub async fn install_helper(app_handle: tauri::AppHandle) -> Result<HelperResult, String> {
    // === Windows 平台逻辑 ===
    #[cfg(target_os = "windows")]
    {
        use tauri::path::BaseDirectory;
        let marker_path = get_helper_marker_path();
        info!("Windows: Checking environment...");
        if let Some(parent) = marker_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        // Tauri 2.0 正确的资源路径解析方式
        let dll_exists = app_handle.path()
            .resolve("binaries/wintun.dll", BaseDirectory::Resource)
            .map(|path| path.exists())
            .unwrap_or(false);

        if !dll_exists {
            return Ok(HelperResult {
                success: false,
                message: "wintun.dll 未找到，请检查安装包".into(),
            });
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        fs::write(&marker_path, format!("installed_at: {}", now))
            .map_err(|e| e.to_string())?;

        Ok(HelperResult { success: true, message: "Windows 环境就绪".into() })
    }

    // === macOS 平台逻辑 ===
    #[cfg(target_os = "macos")]
    {
        info!("macOS: Starting privileged helper installation...");

        let source_bin_path = match resolve_sidecar_path(&app_handle) {
            Ok(p) => p,
            Err(e) => {
                error!("Path resolution failed: {}", e);
                return Err(e);
            }
        };

        info!("Source binary resolved at: {:?}", source_bin_path);

        let install_script = create_macos_install_script(&source_bin_path)?;
        let escaped_script = install_script.replace('\\', "\\\\").replace('"', "\\\"");
        let applescript = format!(
            r#"do shell script "{}" with administrator privileges"#,
            escaped_script
        );

        let output = Command::new("osascript")
            .args(["-e", &applescript])
            .output()
            .map_err(|e| format!("Failed to execute osascript: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("canceled") || stderr.contains("-128") {
                return Ok(HelperResult { success: false, message: "用户取消授权".into() });
            }
            return Err(format!("安装失败: {}", stderr));
        }

        Ok(HelperResult { success: true, message: "特权助手安装成功".into() })
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(HelperResult { success: true, message: "该平台无需安装助手".into() })
    }
}

#[tauri::command]
pub async fn uninstall_helper(_app_handle: tauri::AppHandle) -> Result<HelperResult, String> {
    let marker_path = get_helper_marker_path();
    if marker_path.exists() {
        let _ = fs::remove_file(&marker_path);
    }

    #[cfg(target_os = "macos")]
    {
        let script = format!("rm -f '{}'; rm -f '{}'; rm -rf '{}'", SUDOERS_FILE, SYSTEM_BIN_PATH, SYSTEM_INSTALL_DIR);
        let applescript = format!(r#"do shell script "{}" with administrator privileges"#, script);
        let _ = Command::new("osascript").args(["-e", &applescript]).output();
    }

    Ok(HelperResult { success: true, message: "助手已卸载".into() })
}

#[cfg(target_os = "macos")]
fn resolve_sidecar_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let target_triple = match std::env::consts::ARCH {
        "aarch64" => "aarch64-apple-darwin",
        "x86_64" => "x86_64-apple-darwin",
        _ => return Err("不支持的架构".into()),
    };
    let bin_name = format!("sing-box-{}", target_triple);

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let path1 = resource_dir.join("binaries").join(&bin_name);
        if path1.exists() { return Ok(path1); }
        let path2 = resource_dir.join(&bin_name);
        if path2.exists() { return Ok(path2); }
    }

    if let Ok(cwd) = std::env::current_dir() {
        let path = cwd.join("src-tauri").join("binaries").join(&bin_name);
        if path.exists() { return Ok(path); }
        let path = cwd.join("binaries").join(&bin_name);
        if path.exists() { return Ok(path); }
    }

    Err(format!("Sidecar '{}' 未找到", bin_name))
}

#[cfg(target_os = "macos")]
fn create_macos_install_script(source_path: &Path) -> Result<String, String> {
    let source_path_str = source_path.to_str().ok_or("无效路径")?;
    let target_bin_escaped = SYSTEM_BIN_PATH.replace(" ", "\\ ");
    let marker_path = get_helper_marker_path().to_string_lossy().to_string();

    Ok(format!(
r#"#!/bin/bash
mkdir -p "{target_dir}"
cp -f "{source}" "{target_bin}"
chown root:wheel "{target_bin}"
chmod 755 "{target_bin}"
cat > "{sudoers}" << 'EOF'
Cmnd_Alias TOVPN_SINGBOX = {target_bin_escaped} *
Cmnd_Alias TOVPN_KILL = /usr/bin/pkill *, /bin/kill *
%admin ALL=(root) NOPASSWD: TOVPN_SINGBOX, TOVPN_KILL
EOF
chmod 440 "{sudoers}"
chown root:wheel "{sudoers}"
mkdir -p "$(dirname "{marker}")"
date > "{marker}"
exit 0
"#,
        source = source_path_str,
        target_dir = SYSTEM_INSTALL_DIR,
        target_bin = SYSTEM_BIN_PATH,
        sudoers = SUDOERS_FILE,
        target_bin_escaped = target_bin_escaped,
        marker = marker_path
    ))
}