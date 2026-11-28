/**
 * Chat 内置图片工具：SerpApiImageSearch
 *
 * 通过 SerpAPI 的 Google Images 引擎按关键词检索公开图片。返回结果以紧凑编号列表
 * 交给模型，并把图片 URL 作为 tool activity 的结构化数据交给渲染进程展示图片卡片。
 *
 * 网络请求走调用方注入的 fetch（主进程会传入带全局代理的版本），便于统一受代理
 * 配置与超时控制。API Key 由 serpapi-settings-service 从加密配置中解密，不进入工具参数。
 */

import type { ToolCall, ToolResult, ToolDefinition } from '@proma/core'
import type { ChatToolParam, WebImageResult } from '@proma/shared'

/** SerpAPI 图片工具在 chat-tools.json 中的配置/凭据键 */
export const SERPAPI_TOOL_CREDENTIAL_ID = 'serpapi-image'

export const SERPAPI_IMAGE_TOOL_NAME = 'SerpApiImageSearch'

const SEARCH_ENDPOINT = 'https://serpapi.com/search.json'
const SEARCH_TIMEOUT_MS = 30_000

/** 交给模型的单次结果上限，避免一次工具结果吃掉整个上下文 */
const MAX_IMAGE_RESULTS = 6
const MAX_TITLE_CHARS = 120

const SERPAPI_IMAGE_PARAMS: ChatToolParam[] = [
  { name: 'query', type: 'string', description: '要搜索的图片关键词，使用目标图片会使用的措辞', required: true },
  { name: 'limit', type: 'number', description: `返回图片数量，1-${MAX_IMAGE_RESULTS}，默认 4` },
]

export const SERPAPI_IMAGE_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: SERPAPI_IMAGE_TOOL_NAME,
    description: 'Search Google Images for public pictures and return image URLs with titles and source pages. Use when the user asks for pictures, photos, illustrations, logos, or visual references. Returns image metadata; the UI renders the pictures as a gallery.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Image search query in the words the target page would use' },
        limit: { type: 'number', description: `Number of images, 1-${MAX_IMAGE_RESULTS}, default 4` },
      },
      required: ['query'],
    },
  },
]

export const SERPAPI_IMAGE_TOOL_PARAMS = SERPAPI_IMAGE_PARAMS

/** 工具启用时注入的系统提示词：让模型知道如何请求图片以及结果如何呈现。 */
export const SERPAPI_IMAGE_SYSTEM_PROMPT_APPEND = `
<image_search_tool>
你可以用 SerpApiImageSearch 检索公开图片。用户要求图片、照片、插画、logo 或视觉参考时主动使用，不要用文字描述代替，也不要建议切换到 Agent 模式。

返回结果中的 thumbnailUrl 会在对话里以图片卡片展示；originalUrl 是原图地址，link 是来源页面。回答时简要说明图片主题，并注明图片来自公开网络搜索、版权归原作者所有。
</image_search_tool>`

export function isSerpApiImageToolCall(toolName: string): boolean {
  return toolName === SERPAPI_IMAGE_TOOL_NAME
}

interface SerpApiImageItem {
  title?: unknown
  thumbnail?: unknown
  original?: unknown
  link?: unknown
  source?: unknown
  unsafe?: unknown
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/** 纯函数：从 SerpAPI 响应中提取可展示的图片，过滤无 URL 与不安全标记的结果。 */
export function parseSerpApiImages(payload: unknown, limit = MAX_IMAGE_RESULTS): WebImageResult[] {
  if (!payload || typeof payload !== 'object') return []
  const entries = (payload as { images_results?: unknown }).images_results
  if (!Array.isArray(entries)) return []

  const max = Math.max(1, Math.min(Math.trunc(limit) || MAX_IMAGE_RESULTS, MAX_IMAGE_RESULTS))
  const results: WebImageResult[] = []
  for (const entry of entries) {
    if (results.length >= max) break
    if (!entry || typeof entry !== 'object') continue
    const item = entry as SerpApiImageItem
    if (item.unsafe === true) continue
    const originalUrl = asText(item.original)
    const thumbnailUrl = asText(item.thumbnail) || originalUrl
    if (!thumbnailUrl && !originalUrl) continue
    results.push({
      title: truncate(asText(item.title) || '（无标题）', MAX_TITLE_CHARS),
      thumbnailUrl,
      originalUrl,
      link: asText(item.link),
      source: asText(item.source),
    })
  }
  return results
}

/** 纯函数：把图片整理成给模型读的紧凑编号列表。 */
export function formatImageResults(images: readonly WebImageResult[]): string {
  if (images.length === 0) return '没有找到相关图片。'
  return images
    .map((image, index) => {
      const lines = [`${index + 1}. ${image.title}`]
      if (image.source) lines.push(`   来源: ${image.source}`)
      if (image.originalUrl) lines.push(`   原图: ${image.originalUrl}`)
      if (image.link) lines.push(`   页面: ${image.link}`)
      return lines.join('\n')
    })
    .join('\n\n')
}

/** 执行 SerpAPI Google Images 搜索。 */
export async function executeSerpApiImageSearch(
  toolCall: ToolCall,
  options: { apiKey: string; fetchFn: typeof globalThis.fetch; signal?: AbortSignal },
): Promise<ToolResult> {
  const input = (toolCall.arguments ?? {}) as { query?: unknown; limit?: unknown }
  const query = typeof input.query === 'string' ? input.query.trim() : ''
  if (!query) {
    return { toolCallId: toolCall.id, content: 'SerpApiImageSearch 未执行: 缺少 query 参数', isError: true }
  }

  const limit = typeof input.limit === 'number' && Number.isFinite(input.limit)
    ? input.limit
    : MAX_IMAGE_RESULTS
  const url = new URL(SEARCH_ENDPOINT)
  url.searchParams.set('engine', 'google_images')
  url.searchParams.set('q', query)
  url.searchParams.set('api_key', options.apiKey)
  // 优先请求 SerpAPI 缓存缩略图，减少源站直链失效导致的空白卡片。
  url.searchParams.set('ijn', '0')

  try {
    const response = await options.fetchFn(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options.signal ?? AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`SerpAPI 返回 ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`)
    }
    const payload: unknown = await response.json()
    if (payload && typeof payload === 'object' && 'error' in payload) {
      const error = (payload as { error?: unknown }).error
      throw new Error(typeof error === 'string' ? error : 'SerpAPI 请求失败')
    }
    const images = parseSerpApiImages(payload, limit)
    return {
      toolCallId: toolCall.id,
      content: formatImageResults(images),
      isError: false,
      images,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      toolCallId: toolCall.id,
      content: `SerpApiImageSearch 未执行: ${message}`,
      isError: true,
    }
  }
}
