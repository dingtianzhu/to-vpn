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
    /// 将 VpnError 转换为用户友好的错误消息
    pub fn user_message(&self) -> String {
        match self {
            VpnError::Config(msg) => format!("Configuration error: {}", msg),
            VpnError::Connection(msg) => format!("Connection failed: {}", msg),
            VpnError::AlreadyConnected => "Already connected".to_string(),
            VpnError::AlreadyConnecting => "Connection in progress".to_string(),
            VpnError::InvalidServer(msg) => format!("Invalid server: {}", msg),
            VpnError::Network(msg) => format!("Network error: {}", msg),
            VpnError::Io(msg) => format!("IO error: {}", msg),
        }
    }
}
