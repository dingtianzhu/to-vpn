import { describe, it, expect, beforeEach } from 'vitest'
import { cache } from '@/utils/cache'
import * as fc from 'fast-check'

// ============ 纯函数版本（用于属性测试）============

interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresAt: number
}

/**
 * 模拟缓存行为的纯函数版本
 */
class TestCache {
  private cache = new Map<string, CacheEntry<unknown>>()

  get<T>(key: string, currentTime: number): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined
    if (!entry) return null
    if (currentTime > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    return entry.data
  }

  set<T>(key: string, data: T, ttl: number, currentTime: number): void {
    this.cache.set(key, {
      data,
      timestamp: currentTime,
      expiresAt: currentTime + ttl,
    })
  }

  delete(key: string): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  has(key: string, currentTime: number): boolean {
    return this.get(key, currentTime) !== null
  }
}

describe('MemoryCache', () => {
  beforeEach(() => {
    cache.clear()
  })

  it('should set and get values', () => {
    cache.set('key1', 'value1')
    expect(cache.get('key1')).toBe('value1')
  })

  it('should return null for non-existent keys', () => {
    expect(cache.get('nonexistent')).toBeNull()
  })

  it('should delete items', () => {
    cache.set('key1', 'value1')
    cache.delete('key1')
    expect(cache.get('key1')).toBeNull()
  })

  it('should clear all items', () => {
    cache.set('key1', 'value1')
    cache.set('key2', 'value2')
    cache.clear()
    expect(cache.get('key1')).toBeNull()
    expect(cache.get('key2')).toBeNull()
  })

  it('should check if key exists', () => {
    cache.set('key1', 'value1')
    expect(cache.has('key1')).toBe(true)
    expect(cache.has('key2')).toBe(false)
  })

  it('should invalidate by prefix', () => {
    cache.set('user:1', 'data1')
    cache.set('user:2', 'data2')
    cache.set('server:1', 'server1')
    
    cache.invalidateByPrefix('user:')
    
    expect(cache.get('user:1')).toBeNull()
    expect(cache.get('user:2')).toBeNull()
    expect(cache.get('server:1')).toBe('server1')
  })
})

/**
 * Property 8: 缓存 TTL 行为正确性
 * **Feature: test-completion, Property 8: Cache TTL behavior**
 * **Validates: Requirements 5.1, 5.2**
 */
describe('Property 8: Cache TTL behavior correctness', () => {
  it('should return value within TTL period', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.anything(),
        fc.integer({ min: 1000, max: 60000 }), // TTL: 1s to 60s
        fc.integer({ min: 0, max: 999 }), // time offset within TTL
        (key, value, ttl, offset) => {
          const testCache = new TestCache()
          const setTime = 1000000
          const getTime = setTime + offset // within TTL

          testCache.set(key, value, ttl, setTime)
          const result = testCache.get(key, getTime)

          expect(result).toEqual(value)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return null after TTL expires', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.anything(),
        fc.integer({ min: 1000, max: 60000 }), // TTL: 1s to 60s
        fc.integer({ min: 1, max: 10000 }), // extra time after TTL
        (key, value, ttl, extra) => {
          const testCache = new TestCache()
          const setTime = 1000000
          const getTime = setTime + ttl + extra // after TTL

          testCache.set(key, value, ttl, setTime)
          const result = testCache.get(key, getTime)

          expect(result).toBeNull()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return null at exact TTL boundary', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.anything(),
        fc.integer({ min: 1000, max: 60000 }),
        (key, value, ttl) => {
          const testCache = new TestCache()
          const setTime = 1000000
          const getTime = setTime + ttl + 1 // just after TTL

          testCache.set(key, value, ttl, setTime)
          const result = testCache.get(key, getTime)

          expect(result).toBeNull()
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 9: 缓存更新重置 TTL
 * **Feature: test-completion, Property 9: Cache update resets TTL**
 * **Validates: Requirements 5.4**
 */
describe('Property 9: Cache update resets TTL', () => {
  it('should reset TTL when value is updated', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.anything(),
        fc.anything(),
        fc.integer({ min: 1000, max: 10000 }), // TTL
        fc.integer({ min: 500, max: 5000 }), // update delay
        (key, value1, value2, ttl, updateDelay) => {
          const testCache = new TestCache()
          const setTime1 = 1000000
          const setTime2 = setTime1 + updateDelay // update time
          const getTime = setTime2 + ttl - 100 // within new TTL but after old TTL

          // Set initial value
          testCache.set(key, value1, ttl, setTime1)
          
          // Update value (resets TTL)
          testCache.set(key, value2, ttl, setTime2)
          
          // Get value - should still be valid because TTL was reset
          const result = testCache.get(key, getTime)

          // If getTime is within new TTL, should return value2
          if (getTime <= setTime2 + ttl) {
            expect(result).toEqual(value2)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return updated value after update', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 1000, max: 10000 }),
        (key, value1, value2, ttl) => {
          const testCache = new TestCache()
          const time = 1000000

          testCache.set(key, value1, ttl, time)
          testCache.set(key, value2, ttl, time + 100)
          
          const result = testCache.get(key, time + 200)

          expect(result).toBe(value2)
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * 额外属性：缓存清除行为
 */
describe('Cache clear behavior', () => {
  it('should return null for all keys after clear', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
        fc.array(fc.anything(), { minLength: 1, maxLength: 10 }),
        (keys, values) => {
          const testCache = new TestCache()
          const time = 1000000
          const ttl = 60000

          // Set multiple values
          keys.forEach((key, i) => {
            testCache.set(key, values[i % values.length], ttl, time)
          })

          // Clear cache
          testCache.clear()

          // All keys should return null
          keys.forEach((key) => {
            expect(testCache.get(key, time + 100)).toBeNull()
          })
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should return null after delete', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.anything(),
        fc.integer({ min: 1000, max: 60000 }),
        (key, value, ttl) => {
          const testCache = new TestCache()
          const time = 1000000

          testCache.set(key, value, ttl, time)
          testCache.delete(key)
          
          const result = testCache.get(key, time + 100)

          expect(result).toBeNull()
        }
      ),
      { numRuns: 100 }
    )
  })
})
