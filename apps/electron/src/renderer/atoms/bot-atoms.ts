/**
 * Bot 身份状态管理
 *
 * - botsAtom：Bot 列表（由 Bot 视图从主进程加载）
 * - botFormAtom：创建/编辑表单的开关 + 草稿
 */

import { atom } from 'jotai'
import type { BotIdentity, BotImPlatform } from '@proma/shared'

/** 全部 Bot 列表 */
export const botsAtom = atom<BotIdentity[]>([])

/** Bot 创建/编辑草稿 */
export interface BotDraft {
  /** 编辑模式下的 Bot id；创建模式为空 */
  id?: string
  name: string
  role: string
  instructions: string
  modelId: string
  channelId: string
  workspaceId: string
  imPlatform: BotImPlatform
  imChatId: string
}

/** 表单视图状态（覆盖在中间内容区） */
export interface BotFormState {
  open: boolean
  draft: BotDraft | null
}

export const botFormAtom = atom<BotFormState>({
  open: false,
  draft: null,
})

/** 创建 Bot 时的空白草稿，IM 平台默认微信 */
export function createEmptyBotDraft(): BotDraft {
  return {
    name: '',
    role: '',
    instructions: '',
    modelId: '',
    channelId: '',
    workspaceId: '',
    imPlatform: 'wechat',
    imChatId: '',
  }
}

/** 把已有 Bot 转成编辑草稿 */
export function botToDraft(bot: BotIdentity): BotDraft {
  return {
    id: bot.id,
    name: bot.name,
    role: bot.role ?? '',
    instructions: bot.instructions ?? '',
    modelId: bot.modelId ?? '',
    channelId: bot.channelId ?? '',
    workspaceId: bot.workspaceId ?? '',
    imPlatform: bot.imBinding?.platform ?? 'wechat',
    imChatId: bot.imBinding?.chatId ?? '',
  }
}
