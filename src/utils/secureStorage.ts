/**
 * 安全存储工具 - 使用系统安全钥匙串进行加密存储
 * 用于存储敏感数据如 Token，比 localStorage 更安全
 */

import { invoke } from '@tauri-apps/api/core'

/**
 * 安全存储 - 获取值
 */
export async function secureGet<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const value = await invoke<string>('get_secure_item', { key })
    if (value === '' || value === null || value === undefined) {
      return defaultValue
    }
    if (typeof defaultValue === 'string') {
      return value as unknown as T
    }
    try {
      return JSON.parse(value) as T
    } catch {
      return value as unknown as T
    }
  } catch (e) {
    console.error(`Failed to get secure item [${key}]:`, e)
    return defaultValue
  }
}

/**
 * 安全存储 - 设置值
 */
export async function secureSet<T>(key: string, value: T): Promise<void> {
  try {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
    await invoke('set_secure_item', { key, value: stringValue })
  } catch (e) {
    console.error(`Failed to set secure item [${key}]:`, e)
  }
}

/**
 * 安全存储 - 删除值
 */
export async function secureRemove(key: string): Promise<void> {
  try {
    await invoke('delete_secure_item', { key })
  } catch (e) {
    console.error(`Failed to remove secure item [${key}]:`, e)
  }
}

/**
 * 安全存储 - 清除所有数据
 */
export async function secureClear(): Promise<void> {
  try {
    await secureRemove(SECURE_KEYS.ACCESS_TOKEN)
    await secureRemove(SECURE_KEYS.REFRESH_TOKEN)
    await secureRemove(SECURE_KEYS.TOKEN_EXPIRE_AT)
  } catch (e) {
    console.error('Failed to clear secure storage:', e)
  }
}

/**
 * 安全存储 - 检查是否存在
 */
export async function secureHas(key: string): Promise<boolean> {
  try {
    const value = await invoke<string>('get_secure_item', { key })
    return value !== '' && value !== null && value !== undefined
  } catch (e) {
    console.error(`Failed to check secure item [${key}]:`, e)
    return false
  }
}

// ============ Token 专用存储 Keys ============
export const SECURE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  TOKEN_EXPIRE_AT: 'token_expire_at',
} as const

// ============ Token 便捷方法 ============
export async function getAccessToken(): Promise<string> {
  return secureGet(SECURE_KEYS.ACCESS_TOKEN, '')
}

export async function setAccessToken(token: string): Promise<void> {
  return secureSet(SECURE_KEYS.ACCESS_TOKEN, token)
}

export async function getRefreshToken(): Promise<string> {
  return secureGet(SECURE_KEYS.REFRESH_TOKEN, '')
}

export async function setRefreshToken(token: string): Promise<void> {
  return secureSet(SECURE_KEYS.REFRESH_TOKEN, token)
}

export async function getTokenExpireAt(): Promise<number> {
  return secureGet(SECURE_KEYS.TOKEN_EXPIRE_AT, 0)
}

export async function setTokenExpireAt(expireAt: number): Promise<void> {
  return secureSet(SECURE_KEYS.TOKEN_EXPIRE_AT, expireAt)
}

export async function clearTokens(): Promise<void> {
  await secureRemove(SECURE_KEYS.ACCESS_TOKEN)
  await secureRemove(SECURE_KEYS.REFRESH_TOKEN)
  await secureRemove(SECURE_KEYS.TOKEN_EXPIRE_AT)
}
