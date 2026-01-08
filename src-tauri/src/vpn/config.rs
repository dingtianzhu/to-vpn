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

/// 路由模式
/// 
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum RouteMode {
    /// 规则模式：根据 geo 规则分流（中国直连，其他代理）
    #[default]
    Rule,
    /// 全局模式：所有流量走代理
    Global,
    /// 直连模式：所有流量直连
    Direct,
}

impl RouteMode {
    /// 从字符串解析路由模式
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "global" => RouteMode::Global,
            "direct" => RouteMode::Direct,
            _ => RouteMode::Rule, // 默认规则模式
        }
    }
    
    /// 转换为字符串
    #[allow(dead_code)]
    pub fn as_str(&self) -> &'static str {
        match self {
            RouteMode::Rule => "rule",
            RouteMode::Global => "global",
            RouteMode::Direct => "direct",
        }
    }
}

/// TUN 网络栈类型
/// 
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 8.1, 8.2**
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TunStack {
    /// gvisor: 用户态网络栈（默认，平衡性能和兼容性）
    #[default]
    Gvisor,
    /// system: 系统网络栈（高性能，原生实现）
    System,
    /// lwip: 轻量级网络栈（低资源占用）
    Lwip,
}

impl TunStack {
    /// 从字符串解析 TUN 网络栈类型
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "system" => TunStack::System,
            "lwip" => TunStack::Lwip,
            _ => TunStack::Gvisor, // 默认 gvisor
        }
    }
    
    /// 转换为 sing-box 配置字符串
    #[allow(dead_code)]
    pub fn as_str(&self) -> &'static str {
        match self {
            TunStack::Gvisor => "gvisor",
            TunStack::System => "system",
            TunStack::Lwip => "lwip",
        }
    }
}

/// 高级配置选项
/// 
/// **Feature: vpn-optimization**
/// **Validates: Requirements - 配置参数分析**
#[derive(Debug, Clone)]
pub struct ConfigOptions {
    /// 上行带宽限制 (Mbps, 默认 500)
    pub up_mbps: u32,
    /// 下行带宽限制 (Mbps, 默认 1000)
    pub down_mbps: u32,
    /// 阻断 QUIC 流量 (默认 true)
    pub block_quic: bool,
    /// 禁用 IPv6 (默认 true，防止泄漏)
    pub disable_ipv6: bool,
    /// 路由模式 (默认 Rule)
    /// **Feature: vpn-pure-mode**
    /// **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
    pub route_mode: RouteMode,
    /// DNS 泄漏防护 (默认 true)
    /// **Feature: vpn-pure-mode**
    /// **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    pub dns_leak_protection: bool,
    /// 自定义直连域名列表
    /// **Feature: vpn-pure-mode**
    /// **Validates: Requirements 5.1, 5.3**
    pub custom_bypass_domains: Vec<String>,
    /// 自定义代理域名列表
    /// **Feature: vpn-pure-mode**
    /// **Validates: Requirements 5.2, 5.3**
    pub custom_proxy_domains: Vec<String>,
    /// WebRTC 阻断 (默认 true)
    /// **Feature: vpn-pure-mode**
    /// **Validates: Requirements 6.1, 6.2, 6.3**
    pub block_webrtc: bool,
    /// 排除的应用列表（绕过 VPN）
    /// **Feature: vpn-pure-mode**
    /// **Validates: Requirements 7.1, 7.3**
    pub excluded_apps: Vec<String>,
    /// 强制代理的应用列表
    /// **Feature: vpn-pure-mode**
    /// **Validates: Requirements 7.2, 7.3**
    pub forced_proxy_apps: Vec<String>,
    /// TUN 网络栈 (默认 gvisor)
    /// **Feature: vpn-pure-mode**
    /// **Validates: Requirements 8.1, 8.2**
    pub tun_stack: TunStack,
    /// 绕过局域网 (默认 true)
    /// **Feature: vpn-pure-mode**
    /// **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
    pub bypass_lan: bool,
}

impl Default for ConfigOptions {
    fn default() -> Self {
        Self {
            up_mbps: 500,
            down_mbps: 1000,
            block_quic: true,
            disable_ipv6: true,
            route_mode: RouteMode::Rule,
            dns_leak_protection: true,
            custom_bypass_domains: Vec::new(),
            custom_proxy_domains: Vec::new(),
            block_webrtc: true,
            excluded_apps: Vec::new(),
            forced_proxy_apps: Vec::new(),
            tun_stack: TunStack::Gvisor,
            bypass_lan: true,
        }
    }
}

impl ConfigOptions {
    /// 创建新的配置选项
    pub fn new(up_mbps: u32, down_mbps: u32, block_quic: bool, disable_ipv6: bool) -> Self {
        Self {
            up_mbps,
            down_mbps,
            block_quic,
            disable_ipv6,
            route_mode: RouteMode::Rule,
            dns_leak_protection: true,
            custom_bypass_domains: Vec::new(),
            custom_proxy_domains: Vec::new(),
            block_webrtc: true,
            excluded_apps: Vec::new(),
            forced_proxy_apps: Vec::new(),
            tun_stack: TunStack::Gvisor,
            bypass_lan: true,
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
