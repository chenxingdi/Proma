/**
 * 带节流的 localStorage 包装。
 *
 * 文件树展开和滚动位置都是高频写入的状态：滚动时每 120ms 就会落一次盘，
 * 直接写 localStorage 会在滚动期间同步序列化整张表。这里把写入合并到
 * 一次延迟任务里，读取仍然同步走 localStorage，关闭窗口前再补一次 flush。
 */

import type { SyncStringStorage } from 'jotai/vanilla/utils/atomWithStorage'

export interface DebouncedStorageOptions {
  /** 合并窗口，默认 400ms。 */
  delayMs?: number
  /** 测试注入用；默认使用 window.localStorage。 */
  base?: SyncStringStorage
}

/** 创建延迟写入的字符串存储；同一 key 的连续写入只保留最后一次。 */
export function createDebouncedStringStorage({ delayMs = 400, base }: DebouncedStorageOptions = {}): SyncStringStorage {
  const getBase = (): SyncStringStorage => base ?? window.localStorage
  const pending = new Map<string, string | null>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let flushed = false

  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (pending.size === 0) return
    const storage = getBase()
    for (const [key, value] of pending) {
      try {
        if (value === null) storage.removeItem(key)
        else storage.setItem(key, value)
      } catch {
        // 存储被禁用或超过配额时放弃这次写入，内存中的状态仍然可用。
      }
    }
    pending.clear()
  }

  const schedule = (): void => {
    if (timer !== null) return
    timer = setTimeout(flush, delayMs)
  }

  if (!flushed) {
    flushed = true
    // 只在浏览器环境注册卸载补写；测试注入 base 时不需要监听 window。
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', flush)
      window.addEventListener('beforeunload', flush)
    }
  }

  return {
    getItem(key) {
      const queued = pending.get(key)
      if (queued !== undefined) return queued
      try {
        return getBase().getItem(key)
      } catch {
        return null
      }
    },
    setItem(key, value) {
      pending.set(key, value)
      schedule()
    },
    removeItem(key) {
      pending.set(key, null)
      schedule()
    },
  }
}
