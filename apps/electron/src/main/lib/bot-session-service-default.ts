/**
 * Bot 会话服务的默认实现
 *
 * 直接对接 bot-manager 与 agent-session-manager，供 IM Bridge 等主进程调用方使用。
 * 与纯逻辑 bot-session-service 分离，避免单元测试加载 Electron。
 */

import {
  createAgentSession,
  getAgentSessionMeta,
  updateAgentSessionMeta,
} from './agent-session-manager'
import { createBotManager } from './bot-manager'
import { createBotSessionService } from './bot-session-service'

/**
 * 主进程默认实现：bot 注册表读 ~/.proma/bots.json，会话走真实 Agent 会话管理器。
 */
export function createDefaultBotSessionService() {
  return createBotSessionService({
    bots: createBotManager(),
    createSession: (title, workspaceId) => createAgentSession(title, undefined, workspaceId),
    getSession: (id) => getAgentSessionMeta(id),
    updateSession: (id, updates) => updateAgentSessionMeta(id, updates),
  })
}
