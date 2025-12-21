//! 平台特定实现模块

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::*;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::*;

/// TUN 模式预检查结果
#[derive(serde::Serialize, Clone)]
pub struct TunPrecheck {
    pub singbox_installed: bool,
    pub sudo_cached: bool,
    pub will_prompt: bool,
}

// 确保在所有平台的实现文件中都定义并导出了此函数
// 在 macos.rs, windows.rs, linux.rs 中应已定义
