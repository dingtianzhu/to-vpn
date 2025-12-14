//! VPN 连接配置模块

use crate::constants;
use crate::error::{Result, VpnError};

/// 连接配置
#[derive(Debug, Clone)]
pub struct ConnectConfig {
    pub server_host: String,
    pub server_port: u16,
    pub password: String,
    pub sni: String,
    pub mode: String,
    pub mtu: u16,
    pub dns: String,
}

impl ConnectConfig {
    pub fn new(
        domain: String,
        port: u16,
        password: String,
        mode: String,
        mtu: u16,
        dns: String,
    ) -> Self {
        Self {
            server_host: domain.clone(),
            server_port: port,
            password,
            sni: domain,
            mode,
            mtu,
            dns,
        }
    }

    /// 验证配置参数
    pub fn validate(&self) -> Result<()> {
        // 验证服务器地址
        if self.server_host.is_empty() {
            return Err(VpnError::InvalidServer("Server host is empty".to_string()));
        }
        if self.server_host.len() > 253 {
            return Err(VpnError::InvalidServer("Server host too long".to_string()));
        }
        if self.server_host.chars().any(|c| c.is_whitespace() || c == '/' || c == '\\') {
            return Err(VpnError::InvalidServer(
                "Server host contains invalid characters".to_string(),
            ));
        }

        // 验证端口
        if self.server_port == 0 {
            return Err(VpnError::InvalidServer("Server port is invalid".to_string()));
        }

        // 验证密码
        if self.password.is_empty() {
            return Err(VpnError::InvalidServer("Password is empty".to_string()));
        }
        if self.password.len() > 256 {
            return Err(VpnError::InvalidServer("Password too long".to_string()));
        }

        // 验证模式
        if !["tun", "socks"].contains(&self.mode.as_str()) {
            return Err(VpnError::Config(format!("Invalid mode: {}", self.mode)));
        }

        // 验证 MTU
        if self.mtu > 0 && (self.mtu < 576 || self.mtu > constants::MTU_MAX) {
            return Err(VpnError::Config(format!(
                "MTU must be between 576 and {}",
                constants::MTU_MAX
            )));
        }

        // 验证 DNS (支持 google, aliyun, cloudflare, 或 custom:IP 格式)
        let valid_dns = ["google", "aliyun", "cloudflare", ""];
        if !valid_dns.contains(&self.dns.as_str()) && !self.dns.starts_with("custom:") {
            return Err(VpnError::Config(format!("Invalid DNS option: {}", self.dns)));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_validation_valid() {
        let config = ConnectConfig::new(
            "test.example.com".to_string(),
            443,
            "password123".to_string(),
            "tun".to_string(),
            1280,
            "google".to_string(),
        );
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_config_validation_empty_host() {
        let config = ConnectConfig::new(
            "".to_string(),
            443,
            "password".to_string(),
            "tun".to_string(),
            1280,
            "google".to_string(),
        );
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_config_validation_invalid_port() {
        let config = ConnectConfig::new(
            "test.com".to_string(),
            0,
            "password".to_string(),
            "tun".to_string(),
            1280,
            "google".to_string(),
        );
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_config_validation_empty_password() {
        let config = ConnectConfig::new(
            "test.com".to_string(),
            443,
            "".to_string(),
            "tun".to_string(),
            1280,
            "google".to_string(),
        );
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_config_validation_invalid_mode() {
        let config = ConnectConfig::new(
            "test.com".to_string(),
            443,
            "password".to_string(),
            "invalid".to_string(),
            1280,
            "google".to_string(),
        );
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_config_validation_invalid_mtu() {
        let config = ConnectConfig::new(
            "test.com".to_string(),
            443,
            "password".to_string(),
            "tun".to_string(),
            100,
            "google".to_string(),
        );
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_config_validation_host_with_spaces() {
        let config = ConnectConfig::new(
            "test .com".to_string(),
            443,
            "password".to_string(),
            "tun".to_string(),
            1280,
            "google".to_string(),
        );
        assert!(config.validate().is_err());
    }
}
