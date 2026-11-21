import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readJsonFileSafe } from './safe-file'
import type { BotsIndex } from '@proma/shared'
import { createBotManager } from './bot-manager'

let tempDir: string | null = null

function makeManager(): ReturnType<typeof createBotManager> {
  if (!tempDir) tempDir = mkdtempSync(join(tmpdir(), 'proma-bots-'))
  return createBotManager(join(tempDir, 'bots.json'))
}

afterEach(() => {
  if (!tempDir) return
  rmSync(tempDir, { recursive: true, force: true })
  tempDir = null
})

describe('bot-manager', () => {
  test('Given 没有 bots.json When listBots Then 返回空列表', () => {
    expect(makeManager().listBots()).toEqual([])
  })

  test('Given 有效输入 When createBot Then 落盘并能 listBots 读回', () => {
    const manager = makeManager()
    const bot = manager.createBot({
      name: '研究助手',
      role: '研究员',
      instructions: '你是一名严谨的研究助手。',
    })

    expect(bot.id).toBeTruthy()
    expect(bot.name).toBe('研究助手')
    expect(bot.createdAt).toBeGreaterThan(0)
    expect(manager.listBots()).toEqual([bot])

    const disk = readJsonFileSafe<BotsIndex>(join(tempDir!, 'bots.json'))
    expect(disk?.version).toBe(1)
    expect(disk?.bots).toEqual([bot])
  })

  test('Given 已存在的 Bot When updateBot Then 只更新传入字段并刷新 updatedAt', () => {
    const manager = makeManager()
    const bot = manager.createBot({ name: '旧名', instructions: '旧指令' })
    const updated = manager.updateBot(bot.id, { name: '新名' })

    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('新名')
    expect(updated!.instructions).toBe('旧指令')
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(bot.updatedAt)
    expect(manager.getBot(bot.id)?.name).toBe('新名')
  })

  test('Given 不存在的 Bot When updateBot / deleteBot Then 返回 null / false', () => {
    const manager = makeManager()
    expect(manager.updateBot('missing', { name: 'x' })).toBeNull()
    expect(manager.deleteBot('missing')).toBe(false)
  })

  test('Given 两个 Bot When deleteBot Then 只移除目标', () => {
    const manager = makeManager()
    const a = manager.createBot({ name: 'A' })
    manager.createBot({ name: 'B' })

    expect(manager.deleteBot(a.id)).toBe(true)
    expect(manager.listBots().map((item) => item.name)).toEqual(['B'])
  })

  test('Given Bot 绑定了 IM When findBotByImBinding Then 精确命中，未命中返回 undefined', () => {
    const manager = makeManager()
    const bot = manager.createBot({
      name: '微信助手',
      imBinding: { platform: 'wechat', chatId: 'chat-123' },
    })

    expect(manager.findBotByImBinding('wechat', 'chat-123')?.id).toBe(bot.id)
    expect(manager.findBotByImBinding('wechat', 'other-chat')).toBeUndefined()
    expect(manager.findBotByImBinding('feishu', 'chat-123')).toBeUndefined()
  })

  test('Given Bot 绑定了会话 When findBotBySessionId Then 命中，未绑定返回 undefined', () => {
    const manager = makeManager()
    const bot = manager.createBot({ name: '会话助手' })
    expect(manager.findBotBySessionId(bot.id)).toBeUndefined()

    manager.updateBot(bot.id, { sessionId: 'agent-session-123' })
    expect(manager.findBotBySessionId('agent-session-123')?.id).toBe(bot.id)
    expect(manager.findBotBySessionId('other-session')).toBeUndefined()
  })

  test('Given 两个绑定不同 conversationId 的 Bot When findBotByConversationId Then 精确命中，其他 id 未命中', () => {
    const manager = makeManager()
    const chatBot = manager.createBot({ name: '会话 Bot', conversationId: 'chat-abc' })
    manager.createBot({ name: '另一个 Bot', conversationId: 'chat-def' })
    manager.createBot({ name: '未绑定 Bot' })

    expect(chatBot.conversationId).toBe('chat-abc')
    expect(manager.findBotByConversationId('chat-abc')?.id).toBe(chatBot.id)
    expect(manager.findBotByConversationId('chat-def')?.name).toBe('另一个 Bot')
    expect(manager.findBotByConversationId('chat-missing')).toBeUndefined()
  })

  test('Given 会话 Bot 与 Agent 会话 Bot When findBotByConversationId Then 不与 sessionId 混淆', () => {
    const manager = makeManager()
    const bot = manager.createBot({ name: '混合 Bot', conversationId: 'chat-1' })
    manager.updateBot(bot.id, { sessionId: 'agent-session-1' })

    expect(manager.findBotByConversationId('chat-1')?.id).toBe(bot.id)
    expect(manager.findBotByConversationId('agent-session-1')).toBeUndefined()
  })

  test('Given 绑定 conversationId 的 Bot When REMOVE 路径 deleteBot Then 只移除目标且查找不再命中', () => {
    const manager = makeManager()
    const target = manager.createBot({ name: '目标 Bot', conversationId: 'chat-remove' })
    manager.createBot({ name: '保留 Bot', conversationId: 'chat-keep' })

    const found = manager.findBotByConversationId('chat-remove')
    expect(found?.id).toBe(target.id)
    expect(manager.deleteBot(found!.id)).toBe(true)
    expect(manager.findBotByConversationId('chat-remove')).toBeUndefined()
    expect(manager.findBotByConversationId('chat-keep')?.name).toBe('保留 Bot')
    expect(manager.listBots().map((item) => item.name)).toEqual(['保留 Bot'])
  })

  test('Given 损坏的 bots.json When 读取 Then 视为空并且不抛错', () => {
    if (!tempDir) tempDir = mkdtempSync(join(tmpdir(), 'proma-bots-'))
    const path = join(tempDir, 'bots.json')
    require('node:fs').writeFileSync(path, '{ broken json', 'utf-8')

    const manager = createBotManager(path)
    expect(manager.listBots()).toEqual([])
  })
})
