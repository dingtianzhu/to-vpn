/**
 * 本地存储键名常量
 * 统一管理所有 localStorage 的键名，避免硬编码
 */

// 认证相关
export const STORAGE_KEYS = {
  // 用户认证
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  TOKEN_EXPIRE_AT: 'token_expire_at',
  USER_INFO: 'user_info',
  
  // 设置
  SETTINGS: 'settings',
  THEME: 'theme',
  
  // VPN 状态
  CURRENT_SERVER_ID: 'currentServerId',
  DAILY_USAGE: 'daily_usage',
  
  // 游客
  GUEST_UUID: 'guest_uuid',
} as const

// 存储前缀
export const STORAGE_PREFIX = 'tovpn_'
