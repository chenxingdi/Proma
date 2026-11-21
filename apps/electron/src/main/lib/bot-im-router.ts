/**
 * IM 消息按 Bot 身份路由
 *
 * IM 消息进来时，先按 (platform, chatId) 查 Bot 绑定：
 * 命中则使用 Bot 的专属会话（身份提示由 sessionId 驱动的提示注入自动生效）；
 * 未命中返回 null，Bridge 保持原有 chatId → sessionId 路由。
 */

import type { AgentSessionMeta, BotIdentity, BotImPlatform } from '@proma/shared'
import type { createBotManager } from './bot-manager'
import type { BridgeChatBinding } from './bridge-command-handler'

type BotManager = ReturnType<typeof createBotManager>

interface BotImRouterDeps {
  bots: BotManager
  /** 确保 Bot 有专属会话，复用 bot-session-service 的幂等逻辑 */
  ensureSession: (bot: BotIdentity) => AgentSessionMeta
}

/**
 * 解析 IM 消息应走哪个 Bot 会话。
 * 未命中任何 Bot 绑定时返回 null，让调用方走原来的通用路由。
 */
export function createBotImRouter(deps: BotImRouterDeps) {
  function resolve(platform: BotImPlatform, chatId: string): BridgeChatBinding | null {
    const bot = deps.bots.findBotByImBinding(platform, chatId)
    if (!bot) return null
    const session = deps.ensureSession(bot)
    return {
      chatId,
      sessionId: session.id,
      workspaceId: session.workspaceId ?? '',
      channelId: session.channelId ?? bot.channelId ?? '',
      ...(session.modelId ?? bot.modelId ? { modelId: session.modelId ?? bot.modelId } : {}),
    }
  }

  return { resolve }
}
