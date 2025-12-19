//! VPN 相关常量定义

/// sing-box 进程 PID 文件路径（用于进程管理）
pub const SINGBOX_PID_FILE: &str = "/tmp/tovpn-singbox.pid";

/// TUN 模式标记文件 (用于辅助清理)
pub const TUN_PID_FILE: &str = "/tmp/tovpn-tun.lock";

/// 默认 SOCKS 代理端口
pub const DEFAULT_SOCKS_PORT: u16 = 1080;

/// [修改点] TUN 模式专用的 API 端口
pub const SINGBOX_API_PORT_TUN: u16 = 9090;

/// [修改点] SOCKS 模式专用的 API 端口 (实现端口分离，避免切换冲突)
pub const SINGBOX_API_PORT_SOCKS: u16 = 9091;

/// 默认 MTU 最大值
pub const MTU_MAX: u16 = 1500;

/// 监控间隔 (毫秒)
pub const MONITOR_INTERVAL_MS: u64 = 1000;

/// 端口检查超时（毫秒）- 快速检查
pub const PORT_CHECK_TIMEOUT_MS: u64 = 100;

/// DNS 服务器配置
pub mod dns {
    /// Google DoH：使用官方域名端点（不要用 8.8.8.8 的 https URL）
    pub const GOOGLE_DOH: &str = "https://dns.google/dns-query";

    /// Cloudflare DoH：使用官方域名端点（不要用 1.1.1.1 的 https URL）
    pub const CLOUDFLARE_DOH: &str = "https://cloudflare-dns.com/dns-query";

    /// 阿里 DNS（UDP 53），适合作为"直连可用"的本地/国内 DNS
    pub const ALIYUN_UDP: &str = "223.5.5.5";

    /// Quad9（UDP 53）
    pub const QUAD9_UDP: &str = "9.9.9.9";
}

/// TUN 网络配置
pub mod tun {
    pub const IPV4_ADDRESS: &str = "172.19.0.1/30";
    pub const IPV6_ADDRESS: &str = "fd00::1/126";
}
