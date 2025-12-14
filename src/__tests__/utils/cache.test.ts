import { describe, it, expect, beforeEach } from 'vitest'
import { cache } from '@/utils/cache'

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
