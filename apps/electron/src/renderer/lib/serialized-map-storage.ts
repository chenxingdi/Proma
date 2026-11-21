/**
 * 序列化 Map 的本地存储适配器。
 *
 * Jotai 默认的 JSON 序列化会把 Map 写成 `{}`，因此按会话保存的 Map 状态
 * 必须显式转成数组。解码时逐条校验并丢弃无法识别的旧数据，避免历史残留
 * 或手工改写过的 localStorage 让渲染进程直接崩溃。
 */

import { createJSONStorage } from 'jotai/utils'
import type { SyncStorage, SyncStringStorage } from 'jotai/vanilla/utils/atomWithStorage'

export interface SerializedMapStorageOptions<Value> {
  /** 把值转成可 JSON 序列化的形态；返回 undefined 表示该条目不应写入存储。 */
  encodeValue: (value: Value) => unknown
  /** 把存储中的原始值还原；返回 undefined 表示该条目不可用，直接丢弃。 */
  decodeValue: (raw: unknown) => Value | undefined
  /** 自定义底层字符串存储（如节流版 localStorage）；默认直接读写 localStorage。 */
  stringStorage?: SyncStringStorage
  /**
   * 某个条目的值不可持久化时，保留存储里上一次的可用值。
   *
   * 用于「当前分栏」这类暂时切到不可恢复视图的状态：用户切到浏览器网页时不应连带
   * 丢掉上次停在的静态分栏，重开应用仍应回到那次静态分栏。
   */
  preservePreviousWhenUndefined?: boolean
}

/** 创建按 key 保存、值为任意可序列化类型的 Map 存储。 */
export function createSerializedMapStorage<Value>({
  encodeValue,
  decodeValue,
  stringStorage,
  preservePreviousWhenUndefined = false,
}: SerializedMapStorageOptions<Value>): SyncStorage<Map<string, Value>> {
  const json = stringStorage
    ? createJSONStorage<Array<[string, unknown]>>(() => stringStorage)
    : createJSONStorage<Array<[string, unknown]>>()

  return {
    getItem(key, initialValue) {
      const raw = json.getItem(key, [])
      if (!Array.isArray(raw)) return initialValue
      const restored = new Map<string, Value>()
      for (const entry of raw) {
        if (!Array.isArray(entry) || entry.length < 2) continue
        const [entryKey, entryValue] = entry
        if (typeof entryKey !== 'string') continue
        const value = decodeValue(entryValue)
        if (value === undefined) continue
        restored.set(entryKey, value)
      }
      return restored
    },
    setItem(key, value) {
      const previous = preservePreviousWhenUndefined
        ? new Map<string, unknown>(json.getItem(key, []) as Array<[string, unknown]>)
        : null
      const entries: Array<[string, unknown]> = []
      for (const [entryKey, entryValue] of value) {
        const encoded = encodeValue(entryValue)
        if (encoded !== undefined) {
          entries.push([entryKey, encoded])
          continue
        }
        const retained = previous?.get(entryKey)
        if (retained !== undefined) entries.push([entryKey, retained])
      }
      json.setItem(key, entries)
    },
    removeItem(key) {
      json.removeItem(key)
    },
  }
}

/** 还原 `Record<string, boolean>` 形态的目录展开表；只接受真正的布尔值。 */
export function decodeBooleanRecord(raw: unknown): Map<string, boolean> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const restored = new Map<string, boolean>()
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'boolean') restored.set(key, value)
  }
  return restored
}

export interface JsonValueStorageOptions<Value> {
  /** 校验并规整读到的原始值；返回 undefined 表示数据不可用，回退到初始值。 */
  sanitize: (raw: unknown) => Value | undefined
  stringStorage?: SyncStringStorage
}

/** 把一个可 JSON 序列化的对象按 key 保存；读取时逐层校验，非法数据回退初始值。 */
export function createJsonValueStorage<Value>({
  sanitize,
  stringStorage,
}: JsonValueStorageOptions<Value>): SyncStorage<Value> {
  const json = stringStorage
    ? createJSONStorage<unknown>(() => stringStorage)
    : createJSONStorage<unknown>()

  return {
    getItem(key, initialValue) {
      const restored = sanitize(json.getItem(key, undefined))
      return restored === undefined ? initialValue : restored
    },
    setItem(key, value) {
      json.setItem(key, value)
    },
    removeItem(key) {
      json.removeItem(key)
    },
  }
}
