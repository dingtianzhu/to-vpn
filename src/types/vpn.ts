export type VpnStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

export type HelperStatus = "not_installed" | "installed" | "running" | "error";

export type ConnectionMode = "tun" | "socks";
export type DnsMode = "cloudflare" | "google" | "aliyun" | "custom";

// P0: 路由模式类型
export type RouteMode = "rule" | "global" | "direct";

// P3: TUN 网络栈类型
export type TunStack = "gvisor" | "system" | "lwip";

export interface VpnSettings {
  mtu: number;
  dnsMode: DnsMode;
  customDns: string;
  autoReconnect: boolean;
  connectionMode: ConnectionMode;
  // 高级网络设置
  upMbps: number;              // 上行带宽限制 (Mbps)
  downMbps: number;            // 下行带宽限制 (Mbps)
  blockQuic: boolean;          // 阻断 QUIC 流量
  disableIpv6: boolean;        // TUN 模式下禁用 IPv6（防止泄漏）
  
  // P0: 代理端口配置
  socksPort: number;           // SOCKS 代理端口，默认 1080
  httpPort: number;            // HTTP 代理端口，默认 1087
  
  // P0: Kill Switch (网络锁)
  killSwitch: boolean;         // Kill Switch 开关，默认 false
  
  // P0: 路由模式
  routeMode: RouteMode;        // 路由模式，默认 'rule'
  
  // P1: DNS 泄漏防护
  dnsLeakProtection: boolean;  // DNS 泄漏防护，默认 true
  
  // P1: 自定义域名
  customBypassDomains: string[];  // 直连域名列表
  customProxyDomains: string[];   // 强制代理域名列表
  
  // P2: WebRTC 阻断
  blockWebRTC: boolean;        // WebRTC 阻断，默认 true
  
  // P2: 分应用代理
  excludedApps: string[];      // 排除的应用（绕过 VPN）
  forcedProxyApps: string[];   // 强制代理的应用
  
  // P3: TUN 网络栈
  tunStack: TunStack;          // TUN 网络栈，默认 'gvisor'
  
  // 绕过局域网
  bypassLan: boolean;          // 绕过局域网，默认 true
}

export interface ConnectionStats {
  ip: string;
  downloadSpeed: number;
  uploadSpeed: number;
  latency: number;
  connectedTime: number;
  totalDownload: number;
  totalUpload: number;
}

export interface ConnectionLog {
  id: string;
  timestamp: number;
  level: "info" | "warn" | "error";
  message: string;
}

/** 用量限制检查结果 */
export interface UsageLimitCheckResult {
  canConnect: boolean;
  trafficExceeded: boolean;
  timeExceeded: boolean;
  remainingTraffic: number;  // bytes
  remainingTime: number;     // seconds
  reason?: string;
}
