/**
 * Chat 内置联网工具：WebSearch / WebFetch
 *
 * Chat 模式原本只有 Agent 模式推荐工具，遇到"查一下 / 看看这个网页"这类任务时
 * 只能建议用户切换到 Agent。这里补上最小的联网能力：
 * - WebSearch：检索公开网络，返回标题、链接与摘要
 * - WebFetch：抓取指定 URL 的正文（Markdown）
 *
 * 网络请求走调用方注入的 fetch（主进程会传入带全局代理的版本），
 * 便于统一受代理配置与超时控制。
 */

import type { ToolCall, ToolResult, ToolDefinition } from '@proma/core'
import type { ChatToolParam } from '@proma/shared'

/** 联网工具在 chat-tools.json 中的配置/凭据键（两个工具共用一份） */
export const WEB_TOOL_CREDENTIAL_ID = 'web-search'

/** Tavily 密钥在该凭据块中的字段名 */
export const WEB_SEARCH_API_KEY_FIELD = 'apiKey'

/** 环境变量后备，便于开发或企业环境不落盘密钥 */
export const WEB_SEARCH_API_KEY_ENV = 'PROMA_TAVILY_API_KEY'

const SEARCH_ENDPOINT = 'https://api.tavily.com/search'
const EXTRACT_ENDPOINT = 'https://api.tavily.com/extract'

const SEARCH_TIMEOUT_MS = 30_000
const EXTRACT_TIMEOUT_MS = 45_000

/** 交给模型的单次结果上限，避免一次工具结果吃掉整个上下文 */
const MAX_SEARCH_RESULTS = 8
const MAX_SNIPPET_CHARS = 600
const MAX_EXTRACT_CHARS = 20_000

// ===== 工具定义 =====

export const WEB_SEARCH_TOOL_NAME = 'WebSearch'
export const WEB_FETCH_TOOL_NAME = 'WebFetch'

const WEB_SEARCH_PARAMS: ChatToolParam[] = [
  { name: 'query', type: 'string', description: '搜索关键词，用目标页面会使用的措辞', required: true },
  { name: 'maxResults', type: 'number', description: `返回结果数量，1-${MAX_SEARCH_RESULTS}，默认 5` },
]

const WEB_FETCH_PARAMS: ChatToolParam[] = [
  { name: 'url', type: 'string', description: '要抓取正文的完整 URL', required: true },
  { name: 'query', type: 'string', description: '可选，用于在长页面中优先保留相关段落' },
]

export const WEB_SEARCH_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: WEB_SEARCH_TOOL_NAME,
    description: 'Search the public web and return result titles, URLs and snippets. Use it to find current information, verify facts, or locate the page worth reading.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query in the words the target page would use' },
        maxResults: { type: 'number', description: `Number of results, 1-${MAX_SEARCH_RESULTS}, default 5` },
      },
      required: ['query'],
    },
  },
]

export const WEB_FETCH_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: WEB_FETCH_TOOL_NAME,
    description: 'Fetch a web page and return its main text content in Markdown. Use it after WebSearch when you need to read the actual page rather than the snippet.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute URL to read' },
        query: { type: 'string', description: 'Optional query used to keep the relevant passages of a long page' },
      },
      required: ['url'],
    },
  },
]

/** 联网工具天然需要系统提示词，告诉模型可以联网并鼓励多源核实。 */
export const WEB_TOOLS_SYSTEM_PROMPT_APPEND = `
<web_tools>
你可以联网：WebSearch 检索公开网络，WebFetch 读取网页正文。

使用原则：
- 涉及时效性事实、具体数字、近期事件、陌生名词时先搜再答，不要凭记忆作答。
- 需要结论可靠时交叉核对两个以上来源，冲突时说明分歧而不是只挑一个。
- 拿到搜索结果后，关键结论要读原文（WebFetch）确认，不要只靠摘要下判断。
- 引用时给出可点击的链接。搜不到就说明搜不到，不要编造。
- 联网搜索成功后，系统会自动按同一关键词附带一组公开图片；不要为了图片重复调用图片搜索工具。
- 这类联网任务你自己完成，不要建议用户切换到 Agent 模式。
</web_tools>`

// ===== 可用性 =====

/**
 * 联网工具需要 Tavily 密钥：优先读 chat-tools.json 的凭据，其次读环境变量。
 * 密钥不从源码内置，避免把私有凭据写进仓库。
 *
 * @param credentials chat-tools.json 中该工具的凭据
 * @param env 环境变量表，测试时可注入
 */
export function isWebToolsAvailable(
  credentials?: Record<string, string>,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveApiKey(credentials, env) !== undefined
}

/** 解析实际使用的 Tavily 密钥 */
export function resolveApiKey(
  credentials?: Record<string, string>,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const configured = credentials?.[WEB_SEARCH_API_KEY_FIELD]?.trim()
  if (configured) return configured
  const fromEnv = env[WEB_SEARCH_API_KEY_ENV]?.trim()
  return fromEnv || undefined
}

// ===== 工具调用判定 =====

const WEB_TOOL_NAMES = new Set([WEB_SEARCH_TOOL_NAME, WEB_FETCH_TOOL_NAME])

export function isWebToolCall(toolName: string): boolean {
  return WEB_TOOL_NAMES.has(toolName)
}

// ===== 响应解析（纯函数，便于测试） =====

interface TavilySearchItem {
  title?: unknown
  url?: unknown
  content?: unknown
}

interface TavilyExtractItem {
  url?: unknown
  title?: unknown
  raw_content?: unknown
}

/**
 * 把 Tavily 搜索结果整理成紧凑的编号列表
 *
 * 模型读编号列表比读原始 JSON 更稳，也省 token。
 */
export function formatSearchResults(
  items: readonly TavilySearchItem[],
  maxResults = MAX_SEARCH_RESULTS,
): string {
  const limit = Math.max(1, Math.min(maxResults, MAX_SEARCH_RESULTS))
  const picked = items.slice(0, limit)
  if (picked.length === 0) return '没有找到相关结果。'

  return picked
    .map((item, index) => {
      const title = asText(item.title) || '（无标题）'
      const url = asText(item.url)
      const snippet = truncate(asText(item.content).replace(/\s+/g, ' '), MAX_SNIPPET_CHARS)
      const lines = [`${index + 1}. ${title}`]
      if (url) lines.push(`   ${url}`)
      if (snippet) lines.push(`   ${snippet}`)
      return lines.join('\n')
    })
    .join('\n\n')
}

/** 抽取 Tavily 抓取结果中的正文 */
export function formatExtractedPage(
  item: TavilyExtractItem | undefined,
  fallbackUrl: string,
  maxChars = MAX_EXTRACT_CHARS,
): string {
  const url = asText(item?.url) || fallbackUrl
  const title = asText(item?.title)
  const body = asText(item?.raw_content)

  if (!body.trim()) {
    return `抓取 ${url} 没有得到正文内容。可以换一个来源再试。`
  }

  const header = [`来源: ${url}`]
  if (title) header.push(`标题: ${title}`)

  return `${header.join('\n')}\n\n${truncate(body, maxChars)}`
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function truncate(text: string, max: number): string {
  const normalized = text.trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max)}\n…（内容已截断）`
}

function clampMaxResults(value: unknown, fallback = 5): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(Math.floor(parsed), MAX_SEARCH_RESULTS))
}

// ===== 执行 =====

export interface WebToolContext {
  /** 带代理能力的 fetch */
  fetchFn: typeof globalThis.fetch
  /** Tavily 密钥 */
  apiKey: string
}

/**
 * 执行联网工具调用
 *
 * 网络错误统一转成 isError 的工具结果，让模型能自行改走别的路径，
 * 而不是让整个流式请求失败。
 */
export async function executeWebTool(toolCall: ToolCall, context: WebToolContext): Promise<ToolResult> {
  try {
    if (toolCall.name === WEB_SEARCH_TOOL_NAME) {
      return await runWebSearch(toolCall, context)
    }
    if (toolCall.name === WEB_FETCH_TOOL_NAME) {
      return await runWebFetch(toolCall, context)
    }
    return {
      toolCallId: toolCall.id,
      content: `未知联网工具: ${toolCall.name}`,
      isError: true,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[Chat 联网工具] ${toolCall.name} 执行失败:`, error)
    return {
      toolCallId: toolCall.id,
      content: `${toolCall.name} 执行失败: ${message}`,
      isError: true,
    }
  }
}

async function runWebSearch(toolCall: ToolCall, context: WebToolContext): Promise<ToolResult> {
  const query = asText(toolCall.arguments.query).trim()
  if (!query) {
    return { toolCallId: toolCall.id, content: '参数缺失: query 必填', isError: true }
  }

  const maxResults = clampMaxResults(toolCall.arguments.maxResults)
  const response = await postTavily(
    SEARCH_ENDPOINT,
    {
      query,
      max_results: maxResults,
      search_depth: 'basic',
      include_answer: false,
      include_raw_content: false,
    },
    context,
    SEARCH_TIMEOUT_MS,
  )

  const results = Array.isArray(response.results) ? (response.results as TavilySearchItem[]) : []
  return {
    toolCallId: toolCall.id,
    content: formatSearchResults(results, maxResults),
  }
}

async function runWebFetch(toolCall: ToolCall, context: WebToolContext): Promise<ToolResult> {
  const url = asText(toolCall.arguments.url).trim()
  if (!url) {
    return { toolCallId: toolCall.id, content: '参数缺失: url 必填', isError: true }
  }

  const query = asText(toolCall.arguments.query).trim()
  const response = await postTavily(
    EXTRACT_ENDPOINT,
    {
      urls: [url],
      format: 'markdown',
      ...(query ? { query } : {}),
    },
    context,
    EXTRACT_TIMEOUT_MS,
  )

  const results = Array.isArray(response.results) ? (response.results as TavilyExtractItem[]) : []
  const failed = Array.isArray(response.failed_results) ? response.failed_results : []
  const first = results[0]

  if (!first && failed.length > 0) {
    const failure = failed[0] as { error?: unknown } | undefined
    const detail = asText(failure?.error) || '目标页面不可读'
    return {
      toolCallId: toolCall.id,
      content: `抓取 ${url} 失败: ${detail}`,
      isError: true,
    }
  }

  return {
    toolCallId: toolCall.id,
    content: formatExtractedPage(first, url),
  }
}

interface TavilyResponse {
  results?: unknown
  failed_results?: unknown
}

async function postTavily(
  endpoint: string,
  body: Record<string, unknown>,
  context: WebToolContext,
  timeoutMs: number,
): Promise<TavilyResponse> {
  const response = await context.fetchFn(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${context.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`)
  }

  return (await response.json()) as TavilyResponse
}

/** 元数据使用的参数定义 */
export const WEB_SEARCH_TOOL_PARAMS = WEB_SEARCH_PARAMS
export const WEB_FETCH_TOOL_PARAMS = WEB_FETCH_PARAMS
