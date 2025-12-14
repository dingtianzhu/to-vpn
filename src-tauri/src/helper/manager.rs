//! Helper 安装/卸载管理模块（sudoers：确保断开不弹框）

use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;
use tracing::{error, info, warn};

use super::constants::{HELPER_MARKER_PATH, SUDOERS_FILE};
use super::status::is_helper_installed;
use super::HelperResult;

const SYSTEM_INSTALL_DIR: &str = "/Library/Application Support/ToVPN";
pub const SYSTEM_BIN_PATH: &str = "/Library/Application Support/ToVPN/sing-box";

#[tauri::command]
pub async fn install_helper(app_handle: tauri::AppHandle) -> Result<HelperResult, String> {
    info!("Starting privileged helper installation...");

    let source_bin_path = match resolve_sidecar_path(&app_handle) {
        Ok(p) => p,
        Err(e) => {
            error!("Install failed: {}", e);
            return Err(e);
        }
    };

    info!("Source binary found at: {:?}", source_bin_path);

    let install_script = create_install_script(&source_bin_path)?;
    let escaped_script = install_script.replace('\\', "\\\\").replace('"', "\\\"");
    let applescript = format!(
        r#"do shell script "{}" with administrator privileges"#,
        escaped_script
    );

    info!("Requesting administrator privileges...");

    let output = Command::new("osascript")
        .args(["-e", &applescript])
        .output()
        .map_err(|e| format!("Failed to execute osascript: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("canceled") || stderr.contains("-128") {
            warn!("User canceled installation");
            return Ok(HelperResult {
                success: false,
                message: "Installation canceled by user".into(),
            });
        }
        error!("Installation script failed: {}", stderr);
        return Ok(HelperResult {
            success: false,
            message: format!("Installation failed: {}", stderr),
        });
    }

    if is_helper_installed() && Path::new(SYSTEM_BIN_PATH).exists() {
        info!("Privileged helper installed successfully");
        Ok(HelperResult {
            success: true,
            message: "Helper installed successfully".into(),
        })
    } else {
        warn!("Installation script finished but verification failed");
        Ok(HelperResult {
            success: false,
            message: "Installation verification failed".into(),
        })
    }
}

#[tauri::command]
pub async fn uninstall_helper(_app_handle: tauri::AppHandle) -> Result<HelperResult, String> {
    info!("Uninstalling privileged helper...");

    if !Path::new(HELPER_MARKER_PATH).exists() && !Path::new(SUDOERS_FILE).exists() {
        return Ok(HelperResult {
            success: true,
            message: "Helper was not installed".into(),
        });
    }

    let script = create_uninstall_script()?;
    let escaped_script = script.replace('\\', "\\\\").replace('"', "\\\"");
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
        warn!("Uninstallation failed or canceled: {}", stderr);
        return Ok(HelperResult {
            success: false,
            message: "Uninstallation canceled or failed".into(),
        });
    }

    info!("Helper uninstalled successfully");
    Ok(HelperResult {
        success: true,
        message: "Helper uninstalled successfully".into(),
    })
}

fn resolve_sidecar_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let target_triple = match std::env::consts::ARCH {
        "aarch64" => "aarch64-apple-darwin",
        "x86_64" => "x86_64-apple-darwin",
        _ => return Err(format!("Unsupported architecture: {}", std::env::consts::ARCH)),
    };

    let bin_name = format!("sing-box-{}", target_triple);

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let paths_to_check = vec![
            resource_dir.join("binaries").join(&bin_name),
            resource_dir.join(&bin_name),
        ];
        for path in paths_to_check {
            if path.exists() {
                return Ok(path);
            }
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        let dev_path = cwd.join("binaries").join(&bin_name);
        if dev_path.exists() {
            return Ok(dev_path);
        }
        let fallback = cwd.join("binaries").join("sing-box");
        if fallback.exists() {
            return Ok(fallback);
        }
    }

    Err(format!("Binary '{}' not found in src-tauri/binaries/", bin_name))
}

fn create_install_script(source_path: &Path) -> Result<String, String> {
    let source_path_str = source_path.to_str().ok_or("Invalid source path")?;

    // sudoers 里要转义空格
    let target_bin_escaped = SYSTEM_BIN_PATH.replace(" ", "\\ ");

    let script = format!(
r#"#!/bin/bash
set -euo pipefail

SOURCE_BIN='{source}'
TARGET_DIR='{target_dir}'
TARGET_BIN='{target_bin}'
SUDOERS_FILE='{sudoers}'
HELPER_MARKER='{marker}'

mkdir -p "$TARGET_DIR"

if [ -f "$SOURCE_BIN" ]; then
  cp -f "$SOURCE_BIN" "$TARGET_BIN"
else
  echo "Error: Source binary not found: $SOURCE_BIN"
  exit 1
fi

/usr/bin/xattr -dr com.apple.quarantine "$TARGET_BIN" 2>/dev/null || true

chown root:wheel "$TARGET_BIN"
chmod 755 "$TARGET_BIN"

cat > "$SUDOERS_FILE" << 'EOF'
# ToVPN Privileged Helper Rules (v6)
Cmnd_Alias TOVPN_SINGBOX = {target_bin_escaped} *
Cmnd_Alias TOVPN_ROUTE  = /sbin/route *
Cmnd_Alias TOVPN_PKILL  = /usr/bin/pkill *
Cmnd_Alias TOVPN_KILL   = /bin/kill *
%admin ALL=(root) NOPASSWD: TOVPN_SINGBOX, TOVPN_ROUTE, TOVPN_PKILL, TOVPN_KILL
EOF

chmod 440 "$SUDOERS_FILE"
chown root:wheel "$SUDOERS_FILE"

if ! /usr/sbin/visudo -c -f "$SUDOERS_FILE"; then
  echo "Sudoers syntax error"
  rm -f "$SUDOERS_FILE"
  exit 1
fi

mkdir -p "$(dirname "$HELPER_MARKER")"
/bin/date -u +%Y-%m-%dT%H:%M:%SZ > "$HELPER_MARKER"
chmod 644 "$HELPER_MARKER"

exit 0
"#,
        source = source_path_str,
        target_dir = SYSTEM_INSTALL_DIR,
        target_bin = SYSTEM_BIN_PATH,
        sudoers = SUDOERS_FILE,
        marker = HELPER_MARKER_PATH,
        target_bin_escaped = target_bin_escaped
    );

    Ok(script)
}

fn create_uninstall_script() -> Result<String, String> {
    let script = format!(
r#"#!/bin/bash
set -euo pipefail
rm -f "{sudoers}"
rm -f "{marker}"
rm -f "{target_bin}"
rmdir "{target_dir}" 2>/dev/null || true
exit 0
"#,
        sudoers = SUDOERS_FILE,
        marker = HELPER_MARKER_PATH,
        target_bin = SYSTEM_BIN_PATH,
        target_dir = SYSTEM_INSTALL_DIR
    );

    Ok(script)
}