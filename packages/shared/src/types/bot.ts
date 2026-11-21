/**
 * Bot 身份相关类型
 *
 * Bot 是绑定到 Agent 会话的持久身份，可通过 IM 收发消息。
 * 数据落盘在 ~/.proma/bots.json，由主进程 bot-manager 管理。
 */

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
