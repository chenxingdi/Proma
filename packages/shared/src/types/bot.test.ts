import { describe, expect, test } from 'bun:test'
import { BOT_IPC_CHANNELS } from './bot'

describe('BOT_IPC_CHANNELS', () => {
  test('Given Bot 工作台需要为 Bot 建立专属会话 When 读取通道常量 Then 存在 ENSURE_SESSION 通道', () => {
    expect(BOT_IPC_CHANNELS.ENSURE_SESSION).toBe('bot:ensure-session')
  })

  test('Given 全部 Bot 管理通道 When 检查取值 Then 互不重复', () => {
    const values = Object.values(BOT_IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })
})
