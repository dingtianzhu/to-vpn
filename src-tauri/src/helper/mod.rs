//! Privileged Helper 模块
pub mod manager;
pub mod status;

#[derive(serde::Serialize)]
pub struct HelperResult {
    pub success: bool,
    pub message: String,
}

pub mod constants {
    use std::path::PathBuf;

    /// 获取助手标记文件路径
    pub fn get_helper_marker_path() -> PathBuf {
        #[cfg(target_os = "windows")]
        {
            // Windows 放在 LocalAppData
            let base = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".into());
            PathBuf::from(base).join("ToVPN").join(".helper_installed")
        }
        #[cfg(not(target_os = "windows"))]
        {
            PathBuf::from("/Library/Application Support/ToVPN/.helper_installed")
        }
    }

    #[cfg(target_os = "macos")]
    pub const SUDOERS_FILE: &str = "/etc/sudoers.d/tovpn";
}
