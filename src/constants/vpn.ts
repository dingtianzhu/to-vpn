/**
 * VPN 相关常量定义
 */

// VPN 连接状态
export const VPN_STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTING: 'disconnecting',
  ERROR: 'error',
} as const

// Helper 状态
export const HELPER_STATUS = {
  NOT_INSTALLED: 'not_installed',
  INSTALLED: 'installed',
  RUNNING: 'running',
  ERROR: 'error',
} as const

// 连接模式
export const CONNECTION_MODE = {
  SOCKS: 'socks',
  TUN: 'tun',
} as const

// DNS 模式
export const DNS_MODE = {
  CLOUDFLARE: 'cloudflare',
  GOOGLE: 'google',
  ALIYUN: 'aliyun',
  CUSTOM: 'custom',
} as const

// 默认配置
export const DEFAULT_MTU = 1400 // 使用 1400 而非 1280，更不容易被检测为 VPN
export const DEFAULT_SOCKS_PORT = 1080

// 用户限制 (普通用户)
export const USER_DAILY_TRAFFIC_LIMIT = 1 * 1024 * 1024 * 1024 // 1GB
export const USER_DAILY_TIME_LIMIT = 2 * 60 * 60 // 2 小时 (秒)

// 自动重连配置
export const RECONNECT_MAX_ATTEMPTS = 5
export const RECONNECT_BASE_DELAY = 1000 // 1 秒
export const RECONNECT_MAX_DELAY = 30000 // 30 秒

// Token 刷新阈值 (提前 5 分钟刷新)
export const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000
