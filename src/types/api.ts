export const ErrorCodes = {
  // 成功
  SUCCESS: 0,

  // 认证相关 (10xxx)
  AUTH_FAILED: 10001, // 认证失败
  TOKEN_EXPIRED: 10002, // Token过期
  TOKEN_INVALID: 10003, // Token无效
  REFRESH_TOKEN_EXPIRED: 10004, // RefreshToken过期

  // 用户相关 (20xxx)
  USER_NOT_FOUND: 20001, // 用户不存在
  USER_DISABLED: 20002, // 用户已禁用
  PASSWORD_WRONG: 20003, // 密码错误
  EMAIL_EXISTS: 20004, // 邮箱已存在

  // VPN相关 (30xxx)
  NODE_NOT_FOUND: 30001, // 节点不存在
  NODE_OFFLINE: 30002, // 节点离线
  QUOTA_EXCEEDED: 30003, // 配额超限
  VIP_EXPIRED: 30004, // VIP已过期

  // 系统相关 (50xxx)
  SYSTEM_ERROR: 50001, // 系统错误
  PARAM_ERROR: 50002, // 参数错误
  RATE_LIMIT: 50003, // 请求频率限制
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
