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

/// 高级配置选项
/// 
/// **Feature: vpn-optimization**
/// **Validates: Requirements - 配置参数分析**
#[derive(Debug, Clone)]
pub struct ConfigOptions {
    /// TCP Fast Open 开关 (默认 true)
    pub tcp_fast_open: bool,
    /// 上行带宽限制 (Mbps, 默认 500)
    pub up_mbps: u32,
    /// 下行带宽限制 (Mbps, 默认 1000)
    pub down_mbps: u32,
    /// 阻断 QUIC 流量 (默认 true)
    pub block_quic: bool,
    /// 禁用 IPv6 (默认 true，防止泄漏)
    pub disable_ipv6: bool,
}

impl Default for ConfigOptions {
    fn default() -> Self {
        Self {
            tcp_fast_open: true,
            up_mbps: 500,
            down_mbps: 1000,
            block_quic: true,
            disable_ipv6: true,
        }
    }
}

impl ConfigOptions {
    /// 创建新的配置选项
    pub fn new(tcp_fast_open: bool, up_mbps: u32, down_mbps: u32, block_quic: bool, disable_ipv6: bool) -> Self {
        Self {
            tcp_fast_open,
            up_mbps,
            down_mbps,
            block_quic,
            disable_ipv6,
        }
    }

    /// 验证配置选项
    pub fn validate(&self) -> Result<()> {
        // 验证带宽限制范围 (1-10000 Mbps)
        if self.up_mbps == 0 || self.up_mbps > 10000 {
            return Err(VpnError::Config(
                "up_mbps must be between 1 and 10000".to_string(),
            ));
        }
        if self.down_mbps == 0 || self.down_mbps > 10000 {
            return Err(VpnError::Config(
                "down_mbps must be between 1 and 10000".to_string(),
            ));
        }
        Ok(())
    }
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
