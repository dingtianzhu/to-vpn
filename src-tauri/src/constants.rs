//! VPN 相关常量定义
//! 版本：v2025-12-22-Final

use std::path::PathBuf;

/// 获取临时文件存放目录
pub fn get_cache_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        // Windows 使用用户临时目录
        std::env::temp_dir()
    }
    #[cfg(not(target_os = "windows"))]
    {
        PathBuf::from("/tmp")
    }
}

/// sing-box 进程 PID 文件路径
pub fn get_singbox_pid_file() -> PathBuf {
    get_cache_dir().join("tovpn-singbox.pid")
}

/// TUN 模式标记文件 (用于辅助清理)
pub fn get_tun_lock_file() -> PathBuf {
    get_cache_dir().join("tovpn-tun.lock")
}

/// 默认 SOCKS 代理端口
pub const DEFAULT_SOCKS_PORT: u16 = 1080;

/// TUN 模式专用的 API 端口
pub const SINGBOX_API_PORT_TUN: u16 = 9090;

/// SOCKS 模式专用的 API 端口
pub const SINGBOX_API_PORT_SOCKS: u16 = 9091;

/// 默认 MTU 最大值
pub const MTU_MAX: u16 = 1500;

/// 监控间隔 (毫秒)
pub const MONITOR_INTERVAL_MS: u64 = 1000;

/// 端口检查超时（毫秒）
pub const PORT_CHECK_TIMEOUT_MS: u64 = 100;

/// DNS 服务器配置
pub mod dns {
    pub const GOOGLE_DOH: &str = "https://dns.google/dns-query";
    pub const CLOUDFLARE_DOH: &str = "https://cloudflare-dns.com/dns-query";
    pub const ALIYUN_UDP: &str = "223.5.5.5";
    pub const QUAD9_UDP: &str = "9.9.9.9";
}

/// TUN 网络配置
pub mod tun {
    pub const IPV4_ADDRESS: &str = "172.19.0.1/30";
    pub const IPV6_ADDRESS: &str = "fdfe::1/126";
}
