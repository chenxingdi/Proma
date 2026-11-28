/**
 * 联网搜索自动附带图片的触发规则
 *
 * 纯函数模块，不依赖 Electron、配置服务或网络，便于在测试中直接验证边界。
 */

import type { ToolCall, ToolResult } from '@proma/core'
import { WEB_SEARCH_TOOL_NAME } from './web-tools'
import { isSerpApiImageToolCall } from './serpapi-image-tool'

/** 从 WebSearch 格式化结果中取第一条来源标题，作为更贴近信息源的图片关键词。 */
function firstResultTitle(result: string): string | undefined {
  const match = result.match(/^\d+\.\s+(.+)$/m)
  const title = match?.[1]?.trim()
  if (!title || title === '（无标题）') return undefined
  return title
}

/**
 * 为成功的联网搜索自动生成图片搜索关键词。
 *
 * 触发条件收敛为：WebSearch 成功 + 图片工具开关打开 + SerpAPI Key 可用；
 * WebFetch 失败、用户没有打开图片搜索或没配 SerpAPI 时不触发。
 * 同一轮里模型已经显式调用过图片搜索时也不重复触发。
 */
export function resolveAutoImageQuery(
  toolCalls: readonly ToolCall[],
  results: readonly ToolResult[],
  imageToolEnabled: boolean,
  hasSerpApiKey: boolean,
): string | undefined {
  if (!imageToolEnabled || !hasSerpApiKey) return undefined
  if (toolCalls.some((tc) => isSerpApiImageToolCall(tc.name))) return undefined

  for (const tc of toolCalls) {
    if (tc.name !== WEB_SEARCH_TOOL_NAME) continue
    const result = results.find((r) => r.toolCallId === tc.id)
    if (!result || result.isError) continue
    const query = typeof tc.arguments.query === 'string' ? tc.arguments.query.trim() : ''
    const imageQuery = firstResultTitle(result.content) ?? query
    if (imageQuery) return imageQuery
  }
  return undefined
}

