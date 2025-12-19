//! VPN 错误类型定义

use serde::Serialize;
use thiserror::Error;

/// VPN 操作错误类型
#[derive(Debug, Error, Serialize, Clone)]
#[allow(dead_code)]
pub enum VpnError {
    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Connection failed: {0}")]
    Connection(String),

    #[error("Already connected")]
    AlreadyConnected,

    #[error("Already connecting")]
    AlreadyConnecting,

    #[error("Invalid server: {0}")]
    InvalidServer(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("DNS leak detected: {0}")]
    DnsLeak(String),

    #[error("OAuth callback failed: {0}")]
    OAuthCallback(String),
}

impl From<std::io::Error> for VpnError {
    fn from(err: std::io::Error) -> Self {
        VpnError::Io(err.to_string())
    }
}

impl From<reqwest::Error> for VpnError {
    fn from(err: reqwest::Error) -> Self {
        VpnError::Network(err.to_string())
    }
}

pub type Result<T> = std::result::Result<T, VpnError>;

impl VpnError {
    /// 用户友好的错误提示
    pub fn user_message(&self) -> String {
        match self {
            VpnError::Config(_) => "配置错误 / Configuration Error".to_string(),
            VpnError::Connection(_) => "连接失败 / Connection Failed".to_string(),
            VpnError::AlreadyConnected => "已连接 / Already Connected".to_string(),
            VpnError::AlreadyConnecting => "正在连接中 / Connection in Progress".to_string(),
            VpnError::InvalidServer(_) => "无效的服务器配置 / Invalid Server".to_string(),
            VpnError::Network(_) => "网络错误 / Network Error".to_string(),
            VpnError::Io(_) => "系统内部错误 / System Error".to_string(),
            VpnError::DnsLeak(_) => "DNS泄漏 / DNS Leak Detected".to_string(),
            VpnError::OAuthCallback(_) => "认证回调失败 / OAuth Failed".to_string(),
        }
    }
}
