import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentSessionMeta } from '@proma/shared'
import { createBotManager } from './bot-manager'
import { createBotSessionService } from './bot-session-service'

let tempDir: string | null = null

function setup() {
  if (!tempDir) tempDir = mkdtempSync(join(tmpdir(), 'proma-bot-session-'))
  const bots = createBotManager(join(tempDir, 'bots.json'))
  const created: AgentSessionMeta[] = []
  let counter = 0
  const service = createBotSessionService({
    bots,
    createSession: (title, workspaceId) => {
      const meta: AgentSessionMeta = {
        id: `session-${++counter}`,
        title: title ?? 'Bot 会话',
        workspaceId,
        createdAt: 1,
        updatedAt: 1,
      }
      created.push(meta)
      return meta
    },
    getSession: (id) => created.find((item) => item.id === id),
    updateSession: (id, updates) => {
      const meta = created.find((item) => item.id === id)!
      Object.assign(meta, updates)
      return meta
    },
  })
  return { bots, service, created }
}

afterEach(() => {
  if (!tempDir) return
  rmSync(tempDir, { recursive: true, force: true })
  tempDir = null
})

describe('bot-session-service', () => {
  test('Given 无会话的 Bot When ensureBotSession Then 创建会话并双向绑定', () => {
    const { bots, service, created } = setup()
    const bot = bots.createBot({ name: '研究助手', workspaceId: 'ws-1' })

    const session = service.ensureBotSession(bot.id)

    expect(session.workspaceId).toBe('ws-1')
    expect(session.sourceBotId).toBe(bot.id)
    expect(created).toHaveLength(1)
    expect(bots.getBot(bot.id)?.sessionId).toBe(session.id)
  })

  test('Given 已绑定的 Bot When ensureBotSession 再次调用 Then 复用同一会话不重复创建', () => {
    const { bots, service, created } = setup()
    const bot = bots.createBot({ name: '研究助手' })

    const first = service.ensureBotSession(bot.id)
    const second = service.ensureBotSession(bot.id)

    expect(second.id).toBe(first.id)
    expect(created).toHaveLength(1)
  })

  test('Given 绑定指向已不存在的会话 When ensureBotSession Then 重新创建并覆盖绑定', () => {
    const { bots, service, created } = setup()
    const bot = bots.createBot({ name: '研究助手' })
    const first = service.ensureBotSession(bot.id)
    const index = bots.getBot(bot.id)!
    bots.updateBot(bot.id, { sessionId: 'deleted-session' })
    created.splice(created.indexOf(first), 1)

    const second = service.ensureBotSession(bot.id)

    expect(second.id).not.toBe(first.id)
    expect(bots.getBot(bot.id)?.sessionId).toBe(second.id)
    expect(index.sessionId).toBeDefined()
  })

  test('Given 不存在的 Bot When ensureBotSession Then 抛出明确错误', () => {
    const { service } = setup()
    expect(() => service.ensureBotSession('missing')).toThrow(/Bot 不存在/)
  })
})
