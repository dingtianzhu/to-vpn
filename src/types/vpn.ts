export type VpnStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

export type HelperStatus = "not_installed" | "installed" | "running" | "error";

export type ConnectionMode = "tun" | "socks";
export type DnsMode = "cloudflare" | "google" | "aliyun" | "custom";

export interface VpnSettings {
  mtu: number;
  dnsMode: DnsMode;
  customDns: string;
  autoReconnect: boolean;
  connectionMode: ConnectionMode;
  // 高级网络设置
  enableTcpFastOpen: boolean;  // TCP Fast Open 开关
  upMbps: number;              // 上行带宽限制 (Mbps)
  downMbps: number;            // 下行带宽限制 (Mbps)
  blockQuic: boolean;          // 阻断 QUIC 流量
  disableIpv6: boolean;        // TUN 模式下禁用 IPv6（防止泄漏）
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
