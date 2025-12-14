/** 字符串错误消息映射 */
export const ERROR_MESSAGES: Record<string, string> = {
  HELPER_NOT_INSTALLED: '助手未安装，请先安装助手',
  HELPER_NOT_RUNNING: '助手未运行，请检查助手状态',
  CONNECTION_TIMEOUT: '连接超时，请重试',
  CONNECTION_FAILED: '连接失败',
  NETWORK_UNREACHABLE: '网络不可达，已自动回滚',
  CONFIG_INVALID: '配置无效',
  PERMISSION_DENIED: '权限不足',
  UNKNOWN: '未知错误',
}

/** API 错误码映射表 */
export const API_ERROR_CODES: Record<number, string> = {
  // 通用错误
  0: '操作成功',
  1: '未知错误，请稍后重试',
  2: '参数无效',
  3: '资源不存在',
  
  // 用户相关 (10xxx)
  10001: '用户不存在',
  10002: '用户已存在',
  10003: '账号已被禁用',
  10004: '密码错误',
  10008: '验证码错误',
  10009: '验证码已过期',
  10010: '验证码发送过于频繁',
  
  // 认证相关 (20xxx)
  20001: '请先登录',
  20002: '登录已失效',
  20003: '登录已过期',
  20005: '刷新令牌无效',
  20006: '权限不足',
  
  // 订单相关 (30xxx)
  30001: '订单不存在',
  30002: '订单已支付',
  30003: '订单已取消',
  30004: '订单已过期',
  30005: '支付失败',
  
  // 授权相关 (40xxx)
  40003: '授权已过期',
  40005: '设备数量已达上限',
  40006: '设备不存在',
}

/**
 * 根据错误码获取用户友好的错误消息
 * @param code 错误码
 * @returns 用户友好的错误消息
 */
export function getErrorMessage(code: number): string {
  return API_ERROR_CODES[code] || `错误 (${code})`
}

export function formatError(error: unknown): string {
  if (typeof error === 'string') {
    return ERROR_MESSAGES[error] || error
  }
  
  if (error && typeof error === 'object') {
    const err = error as { code?: string | number; message?: string }
    
    // 处理数字错误码
    if (typeof err.code === 'number' && API_ERROR_CODES[err.code]) {
      return API_ERROR_CODES[err.code]
    }
    
    // 处理字符串错误码
    if (typeof err.code === 'string' && ERROR_MESSAGES[err.code]) {
      return ERROR_MESSAGES[err.code]
    }
    
    if (err.message) {
      return err.message
    }
  }
  
  return ERROR_MESSAGES.UNKNOWN
}

export function isUserCancellation(error: unknown): boolean {
  const msg = typeof error === 'string' 
    ? error 
    : (error as { message?: string })?.message || ''
  
  return msg.toLowerCase().includes('cancel') || 
         msg.toLowerCase().includes('user denied')
}
