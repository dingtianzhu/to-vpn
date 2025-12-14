import { describe, it, expect, vi } from 'vitest'
import { createRequestLock } from '@/utils/debounce'

// 只测试 requestLock，因为 debounce/throttle 依赖 window.setTimeout

describe('requestLock', () => {
  it('should acquire and release', () => {
    const lock = createRequestLock()
    
    expect(lock.isLocked('test')).toBe(false)
    
    lock.acquire('test')
    expect(lock.isLocked('test')).toBe(true)
    
    lock.release('test')
    expect(lock.isLocked('test')).toBe(false)
  })

  it('should execute withLock correctly', async () => {
    const lock = createRequestLock()
    const fn = vi.fn().mockResolvedValue('result')
    
    const result = await lock.withLock('test', fn)
    
    expect(fn).toHaveBeenCalled()
    expect(result).toBe('result')
    expect(lock.isLocked('test')).toBe(false)
  })

  it('should not execute if already locked', async () => {
    const lock = createRequestLock()
    const fn = vi.fn().mockResolvedValue('result')
    
    lock.acquire('test')
    const result = await lock.withLock('test', fn)
    
    expect(fn).not.toHaveBeenCalled()
    expect(result).toBeNull()
    
    lock.release('test')
  })

  it('should release lock even if function throws', async () => {
    const lock = createRequestLock()
    const fn = vi.fn().mockRejectedValue(new Error('test error'))
    
    await expect(lock.withLock('test', fn)).rejects.toThrow('test error')
    expect(lock.isLocked('test')).toBe(false)
  })
})
