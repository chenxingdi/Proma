import { describe, expect, test } from 'bun:test'
import type { BotIdentity } from '@proma/shared'
import { buildBotIdentityPrompt } from './bot-prompt-service'

function bot(overrides: Partial<BotIdentity> = {}): BotIdentity {
  return {
    id: 'bot-1',
    name: '研究助手',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('bot-prompt-service', () => {
  test('Given 完整身份 When buildBotIdentityPrompt Then 包含名字、角色与指令', () => {
    const prompt = buildBotIdentityPrompt(bot({
      role: '研究员',
      instructions: '你是一名严谨的研究助手。',
    }))
    expect(prompt).toContain('研究助手')
    expect(prompt).toContain('研究员')
    expect(prompt).toContain('你是一名严谨的研究助手。')
  })

  test('Given 身份只有名字 When buildBotIdentityPrompt Then 不产生空字段段落', () => {
    const prompt = buildBotIdentityPrompt(bot())
    expect(prompt).toContain('研究助手')
    expect(prompt).not.toContain('undefined')
    expect(prompt).not.toContain('角色：')
  })

  test('Given 相同身份两次 When buildBotIdentityPrompt Then 结果逐字节相同', () => {
    const identity = bot({ role: '助手', instructions: '保持简洁。' })
    expect(buildBotIdentityPrompt(identity)).toBe(buildBotIdentityPrompt(identity))
  })

  test('Given 身份 When buildBotIdentityPrompt Then 声明这是持久 Bot 身份', () => {
    expect(buildBotIdentityPrompt(bot())).toContain('Bot')
  })
})
