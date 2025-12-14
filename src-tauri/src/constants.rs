//! VPN 相关常量定义 (已清理)

/// sing-box 进程 PID 文件路径（用于进程管理）
pub const SINGBOX_PID_FILE: &str = "/tmp/tovpn-singbox.pid";

/// TUN 模式标记文件 (用于辅助清理)
pub const TUN_PID_FILE: &str = "/tmp/tovpn-tun.lock";

/// 默认 SOCKS 代理端口
pub const DEFAULT_SOCKS_PORT: u16 = 1080;

/// sing-box API 端口
pub const SINGBOX_API_PORT: u16 = 9090;

/// 默认 MTU 最大值
pub const MTU_MAX: u16 = 1500;

/// 监控间隔 (毫秒)
pub const MONITOR_INTERVAL_MS: u64 = 1000;

/// DNS 服务器配置
pub mod dns {
    pub const GOOGLE: &str = "https://8.8.8.8/dns-query";
    pub const CLOUDFLARE: &str = "https://1.1.1.1/dns-query";
    pub const ALIYUN: &str = "223.5.5.5";
}

/// TUN 网络配置
pub mod tun {
    pub const IPV4_ADDRESS: &str = "172.19.0.1/30";
}
