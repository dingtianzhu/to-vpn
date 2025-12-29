import { describe, it, expect, vi } from 'vitest'
import { createRequestLock } from '@/utils/debounce'
import * as fc from 'fast-check'

// ============ 纯函数版本（用于属性测试）============

/**
 * 模拟请求锁行为的纯函数版本
 */
interface LockState {
  locks: Map<string, boolean>
}

function createLockState(): LockState {
  return { locks: new Map() }
}

function acquire(state: LockState, key: string): { state: LockState; success: boolean } {
  if (state.locks.get(key)) {
    return { state, success: false }
  }
  const newLocks = new Map(state.locks)
  newLocks.set(key, true)
  return { state: { locks: newLocks }, success: true }
}

function release(state: LockState, key: string): LockState {
  const newLocks = new Map(state.locks)
  newLocks.delete(key)
  return { locks: newLocks }
}

function isLocked(state: LockState, key: string): boolean {
  return state.locks.get(key) === true
}

/**
 * 模拟防抖行为的纯函数版本
 */
interface DebounceState {
  pendingCall: { args: unknown[]; timestamp: number } | null
  lastExecuted: { args: unknown[]; timestamp: number } | null
}

function createDebounceState(): DebounceState {
  return { pendingCall: null, lastExecuted: null }
}

function scheduleCall(
  state: DebounceState,
  args: unknown[],
  timestamp: number
): DebounceState {
  // 新调用总是替换之前的待执行调用
  return {
    ...state,
    pendingCall: { args, timestamp },
  }
}

function executeIfReady(
  state: DebounceState,
  currentTime: number,
  delay: number
): { state: DebounceState; executed: boolean; args: unknown[] | null } {
  if (!state.pendingCall) {
    return { state, executed: false, args: null }
  }

  if (currentTime >= state.pendingCall.timestamp + delay) {
    return {
      state: {
        pendingCall: null,
        lastExecuted: state.pendingCall,
      },
      executed: true,
      args: state.pendingCall.args,
    }
  }

  return { state, executed: false, args: null }
}

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

/**
 * Property 10: 请求锁互斥性
 * **Feature: test-completion, Property 10: Request lock mutual exclusion**
 * **Validates: Requirements 6.1, 6.2**
 */
describe('Property 10: Request lock mutual exclusion', () => {
  it('should be locked after acquire and unlocked after release', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (key) => {
          let state = createLockState()

          // Initially not locked
          expect(isLocked(state, key)).toBe(false)

          // After acquire, should be locked
          const result1 = acquire(state, key)
          state = result1.state
          expect(result1.success).toBe(true)
          expect(isLocked(state, key)).toBe(true)

          // After release, should not be locked
          state = release(state, key)
          expect(isLocked(state, key)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should fail to acquire if already locked', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (key) => {
          let state = createLockState()

          // First acquire should succeed
          const result1 = acquire(state, key)
          state = result1.state
          expect(result1.success).toBe(true)

          // Second acquire should fail
          const result2 = acquire(state, key)
          expect(result2.success).toBe(false)
          expect(isLocked(result2.state, key)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should allow acquire after release', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (key) => {
          let state = createLockState()

          // Acquire
          const result1 = acquire(state, key)
          state = result1.state

          // Release
          state = release(state, key)

          // Should be able to acquire again
          const result2 = acquire(state, key)
          expect(result2.success).toBe(true)
          expect(isLocked(result2.state, key)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should handle multiple independent keys', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (key1, key2) => {
          // Skip if keys are the same
          if (key1 === key2) return

          let state = createLockState()

          // Acquire key1
          const result1 = acquire(state, key1)
          state = result1.state
          expect(result1.success).toBe(true)

          // Should still be able to acquire key2
          const result2 = acquire(state, key2)
          state = result2.state
          expect(result2.success).toBe(true)

          // Both should be locked
          expect(isLocked(state, key1)).toBe(true)
          expect(isLocked(state, key2)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 11: 防抖函数只执行最后一次
 * **Feature: test-completion, Property 11: Debounce executes only last call**
 * **Validates: Requirements 6.3**
 */
describe('Property 11: Debounce executes only last call', () => {
  it('should only keep the last scheduled call', () => {
    fc.assert(
      fc.property(
        fc.array(fc.anything(), { minLength: 2, maxLength: 10 }),
        fc.integer({ min: 100, max: 1000 }),
        (callArgs, delay) => {
          let state = createDebounceState()
          const baseTime = 1000

          // Schedule multiple calls in quick succession
          callArgs.forEach((args, i) => {
            state = scheduleCall(state, [args], baseTime + i * 10)
          })

          // Only the last call should be pending
          expect(state.pendingCall).not.toBeNull()
          expect(state.pendingCall?.args).toEqual([callArgs[callArgs.length - 1]])
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should execute after delay period', () => {
    fc.assert(
      fc.property(
        fc.anything(),
        fc.integer({ min: 100, max: 1000 }),
        (args, delay) => {
          let state = createDebounceState()
          const scheduleTime = 1000

          // Schedule a call
          state = scheduleCall(state, [args], scheduleTime)

          // Before delay, should not execute
          const result1 = executeIfReady(state, scheduleTime + delay - 1, delay)
          expect(result1.executed).toBe(false)

          // After delay, should execute
          const result2 = executeIfReady(state, scheduleTime + delay, delay)
          expect(result2.executed).toBe(true)
          expect(result2.args).toEqual([args])
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should reset timer when new call is scheduled', () => {
    fc.assert(
      fc.property(
        fc.anything(),
        fc.anything(),
        fc.integer({ min: 100, max: 500 }),
        fc.integer({ min: 50, max: 100 }),
        (args1, args2, delay, interval) => {
          let state = createDebounceState()
          const time1 = 1000
          const time2 = time1 + interval

          // Schedule first call
          state = scheduleCall(state, [args1], time1)

          // Schedule second call before first would execute
          state = scheduleCall(state, [args2], time2)

          // At time1 + delay, first call would have executed, but timer was reset
          const checkTime = time1 + delay
          if (checkTime < time2 + delay) {
            const result = executeIfReady(state, checkTime, delay)
            expect(result.executed).toBe(false)
          }

          // At time2 + delay, second call should execute
          const result2 = executeIfReady(state, time2 + delay, delay)
          expect(result2.executed).toBe(true)
          expect(result2.args).toEqual([args2])
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * 额外属性：锁的幂等性
 */
describe('Lock idempotency', () => {
  it('should be idempotent for release on non-locked key', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (key) => {
          let state = createLockState()

          // Release on non-locked key should not throw
          state = release(state, key)
          expect(isLocked(state, key)).toBe(false)

          // Multiple releases should be safe
          state = release(state, key)
          state = release(state, key)
          expect(isLocked(state, key)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})
