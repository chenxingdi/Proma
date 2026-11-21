import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentSessionMeta } from '@proma/shared'
import { createBotManager } from './bot-manager'
import { createBotImRouter } from './bot-im-router'

let tempDir: string | null = null

function setup() {
  if (!tempDir) tempDir = mkdtempSync(join(tmpdir(), 'proma-bot-router-'))
  const bots = createBotManager(join(tempDir, 'bots.json'))
  const sessions = new Map<string, AgentSessionMeta>()
  let counter = 0
  const router = createBotImRouter({
    bots,
    ensureSession: (bot) => {
      if (bot.sessionId && sessions.has(bot.sessionId)) return sessions.get(bot.sessionId)!
      const session: AgentSessionMeta = {
        id: `session-${++counter}`,
        title: `Bot · ${bot.name}`,
        workspaceId: bot.workspaceId,
        channelId: bot.channelId,
        modelId: bot.modelId,
        sourceBotId: bot.id,
        createdAt: 1,
        updatedAt: 1,
      }
      sessions.set(session.id, session)
      bots.updateBot(bot.id, { sessionId: session.id })
      return session
    },
  })
  return { bots, router, sessions }
}

afterEach(() => {
  if (!tempDir) return
  rmSync(tempDir, { recursive: true, force: true })
  tempDir = null
})

describe('bot-im-router', () => {
  test('Given 微信 chatId 绑定了 Bot When resolve Then 返回 Bot 会话绑定', () => {
    const { bots, router, sessions } = setup()
    const bot = bots.createBot({
      name: '微信助手',
      workspaceId: 'ws-1',
      imBinding: { platform: 'wechat', chatId: 'chat-123' },
    })

    const result = router.resolve('wechat', 'chat-123')

    expect(result).not.toBeNull()
    expect(result!.sessionId).toMatch(/^session-/)
    const session = sessions.get(result!.sessionId)
    expect(session?.sourceBotId).toBe(bot.id)
    expect(result!.workspaceId).toBe('ws-1')
  })

  test('Given 未绑定的 chatId When resolve Then 返回 null 走原路由', () => {
    const { router } = setup()
    expect(router.resolve('wechat', 'unknown-chat')).toBeNull()
  })

  test('Given 平台不匹配 When resolve Then 返回 null', () => {
    const { bots, router } = setup()
    bots.createBot({ name: '微信助手', imBinding: { platform: 'wechat', chatId: 'chat-1' } })
    expect(router.resolve('feishu', 'chat-1')).toBeNull()
  })

  test('Given 同一 Bot 收到第二条消息 When resolve Then 复用同一会话', () => {
    const { bots, router } = setup()
    bots.createBot({ name: '助手', imBinding: { platform: 'wechat', chatId: 'chat-1' } })

    const first = router.resolve('wechat', 'chat-1')
    const second = router.resolve('wechat', 'chat-1')

    expect(first!.sessionId).toBe(second!.sessionId)
    expect(router.resolve('wechat', 'chat-1')!.sessionId).toBe(first!.sessionId)
  })
})
