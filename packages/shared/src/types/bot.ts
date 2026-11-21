/**
 * Bot 身份相关类型
 *
 * Bot 是绑定到 Agent 会话的持久身份，可通过 IM 收发消息。
 * 数据落盘在 ~/.proma/bots.json，由主进程 bot-manager 管理。
 */

import type { ConversationMeta } from './chat'

/** IM 平台类型，与现有 Bridge 平台保持一致 */
export type BotImPlatform = 'wechat' | 'feishu' | 'dingtalk' | 'slack'

/** Bot 与某个 IM 会话的绑定 */
export interface BotImBinding {
  platform: BotImPlatform
  chatId: string
}

/** 一个 Bot 的持久身份记录 */
export interface BotIdentity {
  /** Bot 的持久 id，randomUUID 生成 */
  id: string
  /** 显示名称 */
  name: string
  /** 角色标签，例如「研究助手」 */
  role?: string
  /** 身份与行为指令，注入 system prompt */
  instructions?: string
  modelId?: string
  channelId?: string
  /** 绑定的 Agent 工作区 id */
  workspaceId?: string
  /** 绑定的 Agent 会话 id，首版一个 Bot 一个会话 */
  sessionId?: string
  /** 绑定的 Chat 会话 id，与 sessionId 分属不同 id 空间 */
  conversationId?: string
  /** 绑定的 IM 会话 */
  imBinding?: BotImBinding
  createdAt: number
  updatedAt: number
}

/** bots.json 的索引结构 */
export interface BotsIndex {
  version: number
  bots: BotIdentity[]
}

/** 新建 Bot 时的输入 */
export interface CreateBotInput {
  name: string
  role?: string
  instructions?: string
  modelId?: string
  channelId?: string
  workspaceId?: string
  /** 新建时绑定的 Chat 会话 id */
  conversationId?: string
  imBinding?: BotImBinding
}

/** 更新 Bot 时的输入，仅允许改这些字段 */
export interface UpdateBotInput {
  name?: string
  role?: string
  instructions?: string
  modelId?: string
  channelId?: string
  workspaceId?: string
  sessionId?: string
  imBinding?: BotImBinding
}

/** 主进程 IPC 更新入参：在 UpdateBotInput 基础上带目标 Bot id */
export interface UpdateBotIpcInput extends UpdateBotInput {
  id: string
}

/** 新建 Bot 并同时创建其绑定会话的输入（会话由主进程生成，取消不留空会话） */
export interface CreateBotWithConversationInput {
  name: string
  role?: string
  instructions?: string
  channelId?: string
  modelId?: string
}

/** 原子创建 Bot + 会话的返回值 */
export interface CreatedBotWithConversation {
  conversation: ConversationMeta
  bot: BotIdentity
}

/** 恢复会话 Bot 三通道 IPC 常量（客户端 ↔ 主进程） */
export const BOT_IPC_CHANNELS = {
  /** 列出全部 Bot（renderer 据此建立 conversationId → Bot 映射） */
  LIST: 'bot:list',
  /** 保存会话 Bot：存在则更新，不存在则创建，返回 BotIdentity */
  SAVE_FOR_CONVERSATION: 'bot:save-for-conversation',
  /** 移除会话 Bot：按 conversationId 删除，返回是否删除成功 */
  REMOVE_FOR_CONVERSATION: 'bot:remove-for-conversation',
  /** 原子创建 Bot 与其绑定会话：保存时一次创建，返回会话与 Bot；绑定失败回滚会话 */
  CREATE_WITH_CONVERSATION: 'bot:create-with-conversation',
} as const
