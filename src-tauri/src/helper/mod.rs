//! Privileged Helper 模块
//! 
//! 通过 sudoers 规则实现无密码执行特权命令
//! 
//! ## 模块结构
//! - `manager`: Helper 安装/卸载管理
//! - `status`: Helper 状态检查

pub mod manager;
pub mod status;

/// Helper 操作结果
#[derive(serde::Serialize)]
pub struct HelperResult {
    pub success: bool,
    pub message: String,
}

/// Helper 相关常量
pub mod constants {
    /// Helper 安装标记文件路径
    pub const HELPER_MARKER_PATH: &str = "/Library/Application Support/ToVPN/.helper_installed";
    
    /// sudoers 规则文件路径
    pub const SUDOERS_FILE: &str = "/etc/sudoers.d/tovpn";
}
