/**
 * 简单的内存缓存工具
 * 用于缓存 API 响应数据，减少重复请求
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresAt: number
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>()
  private defaultTTL = 5 * 60 * 1000 // 默认 5 分钟

  /**
   * 获取缓存数据
   * @param key 缓存键
   * @returns 缓存数据或 null
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined
    if (!entry) return null

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  /**
   * 设置缓存数据
   * @param key 缓存键
   * @param data 数据
   * @param ttl 过期时间（毫秒），默认 5 分钟
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const now = Date.now()
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + (ttl ?? this.defaultTTL),
    })
  }

  /**
   * 删除缓存
   * @param key 缓存键
   */
  delete(key: string): void {
    this.cache.delete(key)
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * 检查缓存是否存在且有效
   * @param key 缓存键
   */
  has(key: string): boolean {
    return this.get(key) !== null
  }

  /**
   * 获取或设置缓存（如果不存在则调用 fetcher 获取）
   * @param key 缓存键
   * @param fetcher 数据获取函数
   * @param ttl 过期时间（毫秒）
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    const data = await fetcher()
    this.set(key, data, ttl)
    return data
  }

  /**
   * 使缓存失效（按前缀）
   * @param prefix 缓存键前缀
   */
  invalidateByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    }
  }
}

// 导出单例
export const cache = new MemoryCache()

// 缓存键常量
export const CACHE_KEYS = {
  SERVERS: 'servers',
  USER_PROFILE: 'user_profile',
  USER_USAGE: 'user_usage',
} as const

// 缓存 TTL 常量（毫秒）
export const CACHE_TTL = {
  SERVERS: 5 * 60 * 1000, // 5 分钟
  USER_PROFILE: 10 * 60 * 1000, // 10 分钟
  USER_USAGE: 1 * 60 * 1000, // 1 分钟
} as const
