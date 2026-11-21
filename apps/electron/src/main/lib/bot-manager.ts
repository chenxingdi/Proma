/**
 * Bot 身份注册表管理器
 *
 * 管理 ~/.proma/bots.json 的读写。Bot 是绑定到 Agent 会话的持久身份。
 * 采用可注入文件路径，便于测试用临时目录隔离，绝不触碰真实用户数据。
 */

import { randomUUID } from 'node:crypto'
import { readJsonFileSafe, writeJsonFileAtomic } from './safe-file'
import { getBotsPath } from './config-paths'
import type {
  BotsIndex,
  BotIdentity,
  BotImPlatform,
  CreateBotInput,
  UpdateBotInput,
} from '@proma/shared'

const INDEX_VERSION = 1

function emptyIndex(): BotsIndex {
  return { version: INDEX_VERSION, bots: [] }
}

/**
 * 创建一个 Bot 管理器实例。
 * filePath 通常由 getBotsPath() 提供，测试时传入临时路径。
 */
export function createBotManager(filePath: string = getBotsPath()) {
  function readIndex(): BotsIndex {
    const data = readJsonFileSafe<BotsIndex>(filePath)
    if (!data || !Array.isArray(data.bots)) return emptyIndex()
    return { version: INDEX_VERSION, bots: data.bots.filter(isBotIdentity) }
  }

  function writeIndex(index: BotsIndex): void {
    writeJsonFileAtomic(filePath, index)
  }

  function listBots(): BotIdentity[] {
    return readIndex().bots
  }

  function getBot(id: string): BotIdentity | undefined {
    return readIndex().bots.find((bot) => bot.id === id)
  }

  function createBot(input: CreateBotInput): BotIdentity {
    const now = Date.now()
    const bot: BotIdentity = {
      id: randomUUID(),
      name: input.name,
      createdAt: now,
      updatedAt: now,
      ...(input.role ? { role: input.role } : {}),
      ...(input.instructions ? { instructions: input.instructions } : {}),
      ...(input.modelId ? { modelId: input.modelId } : {}),
      ...(input.channelId ? { channelId: input.channelId } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.imBinding ? { imBinding: input.imBinding } : {}),
    }
    const index = readIndex()
    index.bots.push(bot)
    writeIndex(index)
    return bot
  }

  function updateBot(id: string, patch: UpdateBotInput): BotIdentity | null {
    const index = readIndex()
    const target = index.bots.find((bot) => bot.id === id)
    if (!target) return null

    const merged: BotIdentity = {
      ...target,
      ...patch,
      id: target.id,
      createdAt: target.createdAt,
      updatedAt: Date.now(),
    }
    index.bots = index.bots.map((bot) => (bot.id === id ? merged : bot))
    writeIndex(index)
    return merged
  }

  function deleteBot(id: string): boolean {
    const index = readIndex()
    const before = index.bots.length
    index.bots = index.bots.filter((bot) => bot.id !== id)
    if (index.bots.length === before) return false
    writeIndex(index)
    return true
  }

  function findBotByImBinding(platform: BotImPlatform, chatId: string): BotIdentity | undefined {
    return readIndex().bots.find(
      (bot) => bot.imBinding?.platform === platform && bot.imBinding.chatId === chatId,
    )
  }

  function findBotBySessionId(sessionId: string): BotIdentity | undefined {
    return readIndex().bots.find((bot) => bot.sessionId === sessionId)
  }

  return { listBots, getBot, createBot, updateBot, deleteBot, findBotByImBinding, findBotBySessionId }
}

function isBotIdentity(value: unknown): value is BotIdentity {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string'
    && typeof record.name === 'string'
    && typeof record.createdAt === 'number'
    && typeof record.updatedAt === 'number'
}
