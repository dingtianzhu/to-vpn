/**
 * 安全存储工具 - 使用 Tauri Store 插件进行加密存储
 * 用于存储敏感数据如 Token，比 localStorage 更安全
 */

import { Store } from '@tauri-apps/plugin-store'

// 安全存储文件名
const SECURE_STORE_FILE = 'secure-store.json'

// 存储实例（懒加载）
let storeInstance: Store | null = null

// 获取存储实例
async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await Store.load(SECURE_STORE_FILE)
  }
  return storeInstance
}

/**
 * 安全存储 - 获取值
 */
export async function secureGet<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const store = await getStore()
    const value = await store.get<T>(key)
    return value !== null && value !== undefined ? value : defaultValue
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
    const store = await getStore()
    await store.set(key, value)
    await store.save()
  } catch (e) {
    console.error(`Failed to set secure item [${key}]:`, e)
  }
}

/**
 * 安全存储 - 删除值
 */
export async function secureRemove(key: string): Promise<void> {
  try {
    const store = await getStore()
    await store.delete(key)
    await store.save()
  } catch (e) {
    console.error(`Failed to remove secure item [${key}]:`, e)
  }
}

/**
 * 安全存储 - 清除所有数据
 */
export async function secureClear(): Promise<void> {
  try {
    const store = await getStore()
    await store.clear()
    await store.save()
  } catch (e) {
    console.error('Failed to clear secure storage:', e)
  }
}

/**
 * 安全存储 - 检查是否存在
 */
export async function secureHas(key: string): Promise<boolean> {
  try {
    const store = await getStore()
    const value = await store.get(key)
    return value !== null && value !== undefined
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
