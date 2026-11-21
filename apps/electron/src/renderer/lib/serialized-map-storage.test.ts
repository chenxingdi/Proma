import { describe, expect, test } from 'bun:test'
import type { SyncStringStorage } from 'jotai/vanilla/utils/atomWithStorage'
import { createJsonValueStorage, createSerializedMapStorage, decodeBooleanRecord } from './serialized-map-storage'

/** 内存版 localStorage，用于验证读写行为而不依赖浏览器环境。 */
function createMemoryStorage(): SyncStringStorage & { snapshot: () => Map<string, string | null> } {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value) },
    removeItem: (key) => { store.delete(key) },
    snapshot: () => new Map(store),
  }
}

describe('JSON 值存储', () => {
  test('校验通过时读回原值，非法时回退初始值', () => {
    const storage = createMemoryStorage()
    const valueStorage = createJsonValueStorage<'split' | 'unified'>({
      stringStorage: storage,
      sanitize: (raw) => (raw === 'split' || raw === 'unified' ? raw : undefined),
    })
    valueStorage.setItem('view', 'split')
    expect(valueStorage.getItem('view', 'unified')).toBe('split')
    storage.setItem('view', JSON.stringify('unknown'))
    expect(valueStorage.getItem('view', 'unified')).toBe('unified')
  })
})

describe('序列化 Map 存储', () => {
  test('写出后能原样读回', () => {
    const storage = createMemoryStorage()
    const mapStorage = createSerializedMapStorage<number>({
      stringStorage: storage,
      encodeValue: (value) => value,
      decodeValue: (raw) => (typeof raw === 'number' ? raw : undefined),
    })
    const value = new Map<string, number>([['session-a', 120], ['session-b', 0]])
    mapStorage.setItem('scroll', value)
    expect(mapStorage.getItem('scroll', new Map())).toEqual(value)
  })

  test('Map 不会被写成空对象', () => {
    const storage = createMemoryStorage()
    const mapStorage = createSerializedMapStorage<number>({
      stringStorage: storage,
      encodeValue: (value) => value,
      decodeValue: (raw) => (typeof raw === 'number' ? raw : undefined),
    })
    mapStorage.setItem('scroll', new Map([['session-a', 42]]))
    const raw = storage.snapshot().get('scroll')
    expect(raw).toBeDefined()
    expect(JSON.parse(raw!)).toEqual([['session-a', 42]])
  })

  test('丢弃无法解码的条目与结构非法项', () => {
    const storage = createMemoryStorage()
    storage.setItem('scroll', JSON.stringify([
      ['session-a', 10],
      ['session-b', 'oops'],
      ['session-c'],
      [42, 1],
    ]))
    const mapStorage = createSerializedMapStorage<number>({
      stringStorage: storage,
      encodeValue: (value) => value,
      decodeValue: (raw) => (typeof raw === 'number' ? raw : undefined),
    })
    expect(mapStorage.getItem('scroll', new Map())).toEqual(new Map([['session-a', 10]]))
  })

  test('存储内容不是数组时回退到初始值', () => {
    const storage = createMemoryStorage()
    storage.setItem('expanded', JSON.stringify({ broken: true }))
    const mapStorage = createSerializedMapStorage<Map<string, boolean>>({
      stringStorage: storage,
      encodeValue: (value) => Object.fromEntries(value),
      decodeValue: decodeBooleanRecord,
    })
    const initial = new Map([['fallback', new Map([['/tmp', true]])]])
    expect(mapStorage.getItem('expanded', initial)).toBe(initial)
  })

  test('编码返回 undefined 的条目不会写入存储', () => {
    const storage = createMemoryStorage()
    const mapStorage = createSerializedMapStorage<string>({
      stringStorage: storage,
      encodeValue: (value) => (value === 'skip' ? undefined : value),
      decodeValue: (raw) => (typeof raw === 'string' ? raw : undefined),
    })
    mapStorage.setItem('tabs', new Map([['session-a', 'files'], ['session-b', 'skip']]))
    expect(JSON.parse(storage.snapshot().get('tabs')!)).toEqual([['session-a', 'files']])
  })

  test('不可持久化的条目保留存储中上一次的值', () => {
    const storage = createMemoryStorage()
    const mapStorage = createSerializedMapStorage<string>({
      stringStorage: storage,
      preservePreviousWhenUndefined: true,
      encodeValue: (value) => (value.startsWith('browser:') ? undefined : value),
      decodeValue: (raw) => (typeof raw === 'string' ? raw : undefined),
    })
    mapStorage.setItem('tabs', new Map([['session-a', 'changes'], ['session-b', 'files']]))
    // 用户切到浏览器网页：这次点击不该覆盖掉上次停在的静态分栏。
    mapStorage.setItem('tabs', new Map([['session-a', 'browser:tab-1'], ['session-b', 'browser:tab-2']]))
    expect(mapStorage.getItem('tabs', new Map())).toEqual(new Map([['session-a', 'changes'], ['session-b', 'files']]))
    // 新会话还没有历史值时不写入，避免留下空条目。
    mapStorage.setItem('tabs', new Map([['session-a', 'changes'], ['session-c', 'browser:tab-3']]))
    expect(mapStorage.getItem('tabs', new Map())).toEqual(new Map([['session-a', 'changes']]))
  })

  test('嵌套展开表保留每个目录的布尔值', () => {
    const storage = createMemoryStorage()
    const mapStorage = createSerializedMapStorage<Map<string, boolean>>({
      stringStorage: storage,
      encodeValue: (value) => Object.fromEntries(value),
      decodeValue: decodeBooleanRecord,
    })
    const value = new Map([['session-a\u0002files', new Map([['/repo/src', true], ['/repo/lib', false]])]])
    mapStorage.setItem('expanded', value)
    const restored = mapStorage.getItem('expanded', new Map())
    expect(restored.get('session-a\u0002files')).toEqual(new Map([['/repo/src', true], ['/repo/lib', false]]))
  })
})
