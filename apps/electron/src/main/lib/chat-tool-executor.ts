/**
 * Chat 工具统一执行器
 *
 * 统一分发工具调用到对应的执行模块。
 * 替代 chat-service.ts 中硬编码的 if/else 分支。
 */

import type { ToolCall, ToolResult } from '@proma/core'
import type { WebContents } from 'electron'
import { CHAT_IPC_CHANNELS } from '@proma/shared'
import { isCustomHttpToolCall, executeHttpTool } from './chat-tools/http-tool-executor'
import { isAgentRecommendToolCall, executeAgentRecommendTool } from './chat-tools/agent-recommend-tool'
import {
  executeWebTool,
  isWebToolCall,
  resolveApiKey,
  WEB_TOOL_CREDENTIAL_ID,
} from './chat-tools/web-tools'
import { getChatToolsConfig } from './chat-tool-config'
import { getFetchFn } from './proxy-fetch'
import { getEffectiveProxyUrl } from './proxy-settings-service'

/** 工具执行上下文 */
export interface ToolExecutionContext {
  /** webContents 用于推送工具活动事件 */
  webContents: WebContents
  /** 对话 ID */
  conversationId: string
}

/** 联网工具共用的请求环境（每次批量执行只解析一次） */
interface WebToolRuntime {
  fetchFn: typeof globalThis.fetch
  apiKey: string
}

/**
 * 解析联网工具的请求环境
 *
 * 代理配置和密钥都属于边界输入，在这里统一读取一次，
 * 内部执行只消费已解析好的 fetch 与密钥。
 */
async function resolveWebToolRuntime(): Promise<WebToolRuntime> {
  const proxyUrl = await getEffectiveProxyUrl()
  const credentials = getChatToolsConfig().toolCredentials[WEB_TOOL_CREDENTIAL_ID]
  const apiKey = resolveApiKey(credentials)
  if (!apiKey) throw new Error('联网工具缺少 API Key')
  return { fetchFn: getFetchFn(proxyUrl), apiKey }
}

/**
 * 执行工具调用列表
 *
 * 依次执行每个工具调用，推送活动事件给前端，返回所有结果。
 *
 * @param toolCalls 模型返回的工具调用列表
 * @param context 执行上下文
 * @returns 工具执行结果列表
 */
export async function executeToolCalls(
  toolCalls: ToolCall[],
  context: ToolExecutionContext,
): Promise<ToolResult[]> {
  const results: ToolResult[] = []
  // 只有真的出现联网工具调用时才解析代理与密钥，避免普通对话产生额外开销
  let webRuntime: Promise<WebToolRuntime> | undefined
  const getWebRuntime = (): Promise<WebToolRuntime> => {
    webRuntime ??= resolveWebToolRuntime()
    return webRuntime
  }

  for (const tc of toolCalls) {
    let result: ToolResult

    if (isAgentRecommendToolCall(tc.name)) {
      result = await executeAgentRecommendTool(tc)
    } else if (isWebToolCall(tc.name)) {
      // 代理或密钥解析失败时只让这次工具调用失败，不中断整轮对话
      try {
        const runtime = await getWebRuntime()
        result = await executeWebTool(tc, runtime)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        result = { toolCallId: tc.id, content: `${tc.name} 未执行: ${message}`, isError: true }
      }
    } else if (isCustomHttpToolCall(tc.name)) {
      const config = getChatToolsConfig()
      const meta = config.customTools.find((t) => t.id === tc.name)
      result = meta
        ? await executeHttpTool(tc, meta)
        : { toolCallId: tc.id, content: `自定义工具未找到: ${tc.name}`, isError: true }
    } else {
      // 未知工具
      console.warn(`[Chat 工具执行器] 未知工具: ${tc.name}`)
      result = {
        toolCallId: tc.id,
        content: `未知工具: ${tc.name}`,
        isError: true,
      }
    }

    results.push(result)

    // 推送工具结果事件给前端
    context.webContents.send(CHAT_IPC_CHANNELS.STREAM_TOOL_ACTIVITY, {
      conversationId: context.conversationId,
      activity: {
        type: 'result',
        toolName: tc.name,
        toolCallId: tc.id,
        result: result.content,
        isError: result.isError,
        input: tc.arguments,
        images: result.images,
      },
    })
  }

  return results
}
