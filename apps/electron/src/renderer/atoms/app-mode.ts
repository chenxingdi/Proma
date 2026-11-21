/**
 * App Mode Atom - 应用模式状态
 *
 * - chat: 会话槽位。用户可见层已由 Bot 工作台接管（见 AppShell / BotWorkspace）。
 * - agent: Agent 模式（原 Flow）
 *
 * 说明：Bot 复用原 chat 槽位而非新增联合成员，避免触碰散落各处的
 * AppMode 穷举分支；在界面上 chat 即 Bot 工作台。
 */

import { atomWithStorage } from 'jotai/utils'

export type AppMode = 'chat' | 'agent'

/** App 模式，自动持久化到 localStorage；默认进入 Bot 工作台 */
export const appModeAtom = atomWithStorage<AppMode>('proma-app-mode', 'chat')
