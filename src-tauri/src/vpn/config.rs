//! VPN 连接配置模块

use crate::constants;
use crate::error::{Result, VpnError};

/// 连接配置
#[derive(Debug, Clone)]
pub struct ConnectConfig {
    pub server_host: String,
    pub server_port: u16,
    pub password: String,
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
        if self
            .server_host
            .chars()
            .any(|c| c.is_whitespace() || c == '/' || c == '\\')
        {
            return Err(VpnError::InvalidServer(
                "Server host contains invalid characters".to_string(),
            ));
        }

        // 验证端口
        if self.server_port == 0 {
            return Err(VpnError::InvalidServer(
                "Server port is invalid".to_string(),
            ));
        }

        // 验证密码
        if self.password.is_empty() {
            return Err(VpnError::InvalidServer("Password is empty".to_string()));
        }
        if self.password.len() > 256 {
            return Err(VpnError::InvalidServer("Password too long".to_string()));
        }

        // 🔧 修复: 验证模式 - 修正语法错误
        if !["tun", "socks"].contains(&self.mode.as_str()) {
            return Err(VpnError::Config(
                "Invalid mode, must be 'tun' or 'socks'".to_string(),
            ));
        }

        // 🔧 修复: 验证 MTU - 修正语法错误
        if self.mtu > 0 && (self.mtu < 576 || self.mtu > constants::MTU_MAX) {
            return Err(VpnError::Config(format!(
                "MTU must be between 576 and {}, or 0 for auto",
                constants::MTU_MAX
            )));
        }

        // 🔧 修复: 验证 DNS - 修正语法错误
        let valid_dns = ["google", "aliyun", "cloudflare", "quad9", ""];
        if !valid_dns.contains(&self.dns.as_str()) && !self.dns.starts_with("custom:") {
            return Err(VpnError::Config(
                "Invalid DNS option, use: google/cloudflare/aliyun/quad9 or custom:address"
                    .to_string(),
            ));
        }

        Ok(())
    }
}
