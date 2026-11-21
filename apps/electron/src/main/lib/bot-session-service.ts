/**
 * Bot 会话绑定服务
 *
 * 每个 Bot 独占一个 Agent 会话。ensureBotSession 幂等：
 * 已绑定且会话存在则复用，未绑定或绑定失效则新建并双向写回。
 * 会话操作通过依赖注入，便于测试用内存实现隔离。
 */

import type { AgentSessionMeta } from '@proma/shared'
import type { createBotManager } from './bot-manager'

type BotManager = ReturnType<typeof createBotManager>

interface SessionStore {
  createSession: (title: string | undefined, workspaceId: string | undefined) => AgentSessionMeta
  getSession: (id: string) => AgentSessionMeta | undefined
  updateSession: (id: string, updates: Partial<AgentSessionMeta>) => AgentSessionMeta
}

interface BotSessionDeps {
  bots: BotManager
  createSession: SessionStore['createSession']
  getSession: SessionStore['getSession']
  updateSession: SessionStore['updateSession']
}

/**
 * 确保 Bot 有一个有效的专属会话，返回该会话。
 * 幂等：重复调用不会重复创建会话。
 */
export function ensureBotSessionFor(bots: BotManager, deps: Omit<BotSessionDeps, 'bots'>, botId: string): AgentSessionMeta {
  const bot = bots.getBot(botId)
  if (!bot) throw new Error(`Bot 不存在: ${botId}`)

  if (bot.sessionId) {
    const existing = deps.getSession(bot.sessionId)
    if (existing) return existing
  }

  const session = deps.createSession(`Bot · ${bot.name}`, bot.workspaceId)
  deps.updateSession(session.id, { sourceBotId: bot.id })
  bots.updateBot(bot.id, { sessionId: session.id })
  return deps.getSession(session.id) ?? session
}

/**
 * 用主进程的真实会话管理器构造服务。
 */
export function createBotSessionService(deps: BotSessionDeps) {
  return {
    ensureBotSession: (botId: string) => ensureBotSessionFor(deps.bots, deps, botId),
  }
}
