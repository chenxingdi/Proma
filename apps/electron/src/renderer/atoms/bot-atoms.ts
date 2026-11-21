/**
 * 会话 Bot 状态
 *
 * conversationBotMapAtom 是 renderer 侧 conversationId → Bot 映射的唯一状态源，
 * 由 LeftSidebar 首次挂载时调用 listBots() 填充，保存/删除时增量更新。
 */

import { atom } from 'jotai'
import type { BotIdentity } from '@proma/shared'

/** Chat 会话 id → 绑定的 Bot 身份 */
export const conversationBotMapAtom = atom<Record<string, BotIdentity>>({})
