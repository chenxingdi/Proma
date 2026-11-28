/**
 * 图片来源服务的凭据管理
 *
 * Tavily 复用 Chat 联网工具凭据；SerpAPI 复用视觉助手中加密保存的密钥。
 * 渲染进程只看到脱敏状态；测试按钮使用草稿 Key 或已保存 Key 发起最小请求。
 */

import type { WebImageSource } from '../../types'
import { getChatToolsConfig, saveChatToolsConfig } from './chat-tool-config'
import { getFetchFn } from './proxy-fetch'
import { getEffectiveProxyUrl } from './proxy-settings-service'
import {
  getPublicSerpApiSettings,
  getSerpApiKey,
  updateSerpApiSettings,
} from './serpapi-settings-service'
import {
  resolveApiKey as resolveTavilyApiKey,
  WEB_SEARCH_API_KEY_ENV,
  WEB_TOOL_CREDENTIAL_ID,
  WEB_SEARCH_API_KEY_FIELD,
} from './chat-tools/web-tools'

export interface WebImageCredentialStatus {
  configured: boolean
  keyHint: string
  environmentConfigured: boolean
}

export interface WebImageServiceSettings {
  tavily: WebImageCredentialStatus
  serpApi: WebImageCredentialStatus
}

export interface WebImageServiceTestResult {
  success: boolean
  message: string
}

const SERPAPI_SEARCH_ENDPOINT = 'https://serpapi.com/search.json'
const TAVILY_SEARCH_ENDPOINT = 'https://api.tavily.com/search'
const TEST_TIMEOUT_MS = 15_000

/** 生成只显示尾号的提示，不向渲染进程暴露完整密钥。 */
export function keyHint(apiKey: string): string {
  const value = apiKey.trim()
  if (!value) return ''
  if (value.length <= 4) return '••••'
  return `••••${value.slice(-4)}`
}

/** 读取两个图片服务的脱敏状态。 */
export function getWebImageServiceSettings(): WebImageServiceSettings {
  const chatTools = getChatToolsConfig()
  const tavilyKey = resolveTavilyApiKey(chatTools.toolCredentials[WEB_TOOL_CREDENTIAL_ID])
  return {
    tavily: {
      configured: Boolean(tavilyKey),
      keyHint: tavilyKey ? keyHint(tavilyKey) : '',
      environmentConfigured: Boolean(process.env[WEB_SEARCH_API_KEY_ENV]?.trim()),
    },
    serpApi: getPublicSerpApiSettings(),
  }
}

/** 更新指定服务的 API Key；传空字符串表示清除。 */
export function updateWebImageServiceApiKey(
  source: WebImageSource,
  apiKey: string,
): WebImageServiceSettings {
  const value = apiKey.trim()
  if (source === 'serpapi') {
    updateSerpApiSettings({ apiKey: value })
  } else {
    const config = getChatToolsConfig()
    config.toolCredentials[WEB_TOOL_CREDENTIAL_ID] = {
      ...config.toolCredentials[WEB_TOOL_CREDENTIAL_ID],
      [WEB_SEARCH_API_KEY_FIELD]: value,
    }
    saveChatToolsConfig(config)
  }
  return getWebImageServiceSettings()
}

/** 测试指定服务的 API Key；优先测试草稿 Key，否则测试已保存/环境变量 Key。 */
export async function testWebImageServiceApiKey(
  source: WebImageSource,
  draftApiKey?: string,
): Promise<WebImageServiceTestResult> {
  const draft = draftApiKey?.trim() ?? ''
  const apiKey = source === 'serpapi'
    ? (draft || getSerpApiKey())
    : (draft || resolveTavilyApiKey(getChatToolsConfig().toolCredentials[WEB_TOOL_CREDENTIAL_ID]))

  if (!apiKey) {
    return { success: false, message: '请先填写或保存 API Key' }
  }

  try {
    const proxyUrl = await getEffectiveProxyUrl()
    const fetchFn = getFetchFn(proxyUrl)
    const response = source === 'serpapi'
      ? await fetchSerpApiTest(fetchFn, apiKey)
      : await fetchTavilyTest(fetchFn, apiKey)

    if (!response.ok) {
      return { success: false, message: `服务返回 HTTP ${response.status}` }
    }
    return {
      success: true,
      message: source === 'serpapi' ? 'SerpAPI 连接成功' : 'Tavily 连接成功',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, message: `连接失败：${message}` }
  }
}

async function fetchTavilyTest(fetchFn: typeof globalThis.fetch, apiKey: string): Promise<Response> {
  return fetchFn(TAVILY_SEARCH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query: 'connection test', max_results: 1, search_depth: 'basic' }),
    signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
  })
}

async function fetchSerpApiTest(fetchFn: typeof globalThis.fetch, apiKey: string): Promise<Response> {
  const url = new URL(SERPAPI_SEARCH_ENDPOINT)
  url.searchParams.set('engine', 'google_images')
  url.searchParams.set('q', 'connection test')
  url.searchParams.set('api_key', apiKey)
  return fetchFn(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
  })
}
