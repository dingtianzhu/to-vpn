/**
 * 防抖和节流工具
 */

/**
 * 防抖函数 - 延迟执行，重复调用会重置计时器
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: number | null = null

  return function (this: unknown, ...args: Parameters<T>) {
    if (timer) clearTimeout(timer)
    timer = window.setTimeout(() => {
      fn.apply(this, args)
      timer = null
    }, delay)
  }
}

/**
 * 节流函数 - 固定时间间隔内只执行一次
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  interval: number
): (...args: Parameters<T>) => void {
  let lastTime = 0

  return function (this: unknown, ...args: Parameters<T>) {
    const now = Date.now()
    if (now - lastTime >= interval) {
      fn.apply(this, args)
      lastTime = now
    }
  }
}

/**
 * 请求锁 - 防止重复请求
 * 在请求进行中时，后续调用会被忽略
 */
export function createRequestLock() {
  const locks = new Map<string, boolean>()

  return {
    /**
     * 尝试获取锁
     * @param key 锁的标识
     * @returns 是否成功获取锁
     */
    acquire(key: string): boolean {
      if (locks.get(key)) {
        return false
      }
      locks.set(key, true)
      return true
    },

    /**
     * 释放锁
     * @param key 锁的标识
     */
    release(key: string): void {
      locks.delete(key)
    },

    /**
     * 检查是否已锁定
     * @param key 锁的标识
     */
    isLocked(key: string): boolean {
      return locks.get(key) === true
    },

    /**
     * 包装异步函数，自动管理锁
     * @param key 锁的标识
     * @param fn 要执行的异步函数
     */
    async withLock<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
      if (!this.acquire(key)) {
        console.log(`Request [${key}] is already in progress, skipping...`)
        return null
      }

      try {
        return await fn()
      } finally {
        this.release(key)
      }
    },
  }
}

// 全局请求锁实例
export const requestLock = createRequestLock()

/**
 * 带去抖的异步函数包装器
 * 防止快速点击导致的重复请求
 */
export function withDebounce<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  delay = 300
): T {
  let timer: number | null = null
  let pendingReject: ((reason: unknown) => void) | null = null

  return (async function (this: unknown, ...args: Parameters<T>) {
    // 取消之前的等待
    if (timer) {
      clearTimeout(timer)
      if (pendingReject) {
        pendingReject(new Error('Cancelled by newer request'))
      }
    }

    return new Promise((resolve, reject) => {
      pendingReject = reject

      timer = window.setTimeout(async () => {
        try {
          const result = await fn.apply(this, args)
          resolve(result)
        } catch (e) {
          reject(e)
        } finally {
          timer = null
          pendingReject = null
        }
      }, delay)
    })
  }) as T
}
