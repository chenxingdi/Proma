/**
 * Chat 工具注册表
 *
 * 管理所有可用的 Chat 工具：
 * - 内置工具（联网搜索/抓取、Agent 模式推荐）
 * - 自定义工具（用户配置的 HTTP 工具）
 *
 * 提供统一接口获取启用的工具定义和系统提示词。
 */

import type { ToolDefinition, ToolParameterProperty } from '@proma/core'
import type { ChatToolInfo, ChatToolMeta } from '@proma/shared'
import { getChatToolsConfig } from './chat-tool-config'
import {
  AGENT_RECOMMEND_TOOL_META,
  AGENT_RECOMMEND_TOOL_DEFINITIONS,
  isAgentRecommendAvailable,
} from './chat-tools/agent-recommend-tool'
import {
  WEB_FETCH_TOOL_DEFINITIONS,
  WEB_FETCH_TOOL_NAME,
  WEB_FETCH_TOOL_PARAMS,
  WEB_SEARCH_TOOL_DEFINITIONS,
  WEB_SEARCH_TOOL_NAME,
  WEB_SEARCH_TOOL_PARAMS,
  WEB_TOOLS_SYSTEM_PROMPT_APPEND,
  WEB_TOOL_CREDENTIAL_ID,
  isWebToolsAvailable,
} from './chat-tools/web-tools'
import {
  SERPAPI_IMAGE_TOOL_DEFINITIONS,
  SERPAPI_IMAGE_TOOL_NAME,
  SERPAPI_IMAGE_TOOL_PARAMS,
  SERPAPI_IMAGE_SYSTEM_PROMPT_APPEND,
  SERPAPI_TOOL_CREDENTIAL_ID,
} from './chat-tools/serpapi-image-tool'
import { getSerpApiKey } from './serpapi-settings-service'

// ===== 内置工具注册 =====

/** 内置工具列表（元数据 + 获取 ToolDefinition 的方法） */
interface BuiltinToolEntry {
  meta: ChatToolMeta
  getDefinitions: () => ToolDefinition[]
  checkAvailable: (credentials?: Record<string, string>) => boolean
}

/**
 * 联网工具在工具列表里拆成两个条目展示，但它们共用一组定义与凭据，
 * 因此元数据里也指向同一个凭据来源。
 */
const WEB_SEARCH_META: ChatToolMeta = {
  id: WEB_SEARCH_TOOL_NAME,
  name: '联网搜索',
  description: '检索公开网络，返回标题、链接与摘要',
  params: WEB_SEARCH_TOOL_PARAMS,
  icon: 'Globe',
  category: 'builtin',
  executorType: 'builtin',
}

const WEB_FETCH_META: ChatToolMeta = {
  id: WEB_FETCH_TOOL_NAME,
  name: '读取网页',
  description: '抓取指定网址的正文内容',
  params: WEB_FETCH_TOOL_PARAMS,
  icon: 'FileText',
  category: 'builtin',
  executorType: 'builtin',
}

const SERPAPI_IMAGE_META: ChatToolMeta = {
  id: SERPAPI_IMAGE_TOOL_NAME,
  name: '图片搜索',
  description: '搜索公开图片，返回可展示的图片卡片与原图链接',
  params: SERPAPI_IMAGE_TOOL_PARAMS,
  icon: 'ImagePlus',
  category: 'builtin',
  executorType: 'builtin',
}

/** 所有内置工具 */
const BUILTIN_TOOLS: BuiltinToolEntry[] = [
  {
    meta: WEB_SEARCH_META,
    getDefinitions: () => WEB_SEARCH_TOOL_DEFINITIONS,
    checkAvailable: isWebToolsAvailable,
  },
  {
    meta: WEB_FETCH_META,
    getDefinitions: () => WEB_FETCH_TOOL_DEFINITIONS,
    checkAvailable: isWebToolsAvailable,
  },
  {
    meta: AGENT_RECOMMEND_TOOL_META,
    getDefinitions: () => AGENT_RECOMMEND_TOOL_DEFINITIONS,
    checkAvailable: isAgentRecommendAvailable,
  },
  {
    meta: SERPAPI_IMAGE_META,
    getDefinitions: () => SERPAPI_IMAGE_TOOL_DEFINITIONS,
    checkAvailable: () => Boolean(getSerpApiKey()),
  },
]

/** 联网工具的凭据来源（与工具 id 不同时在此登记） */
const CREDENTIAL_SOURCE_BY_TOOL_ID: Record<string, string> = {
  [WEB_SEARCH_TOOL_NAME]: WEB_TOOL_CREDENTIAL_ID,
  [WEB_FETCH_TOOL_NAME]: WEB_TOOL_CREDENTIAL_ID,
}

/** 该系统提示词只在任意联网工具启用时注入一次 */
const MERGED_SYSTEM_PROMPTS: Record<string, string> = {
  [WEB_TOOL_CREDENTIAL_ID]: WEB_TOOLS_SYSTEM_PROMPT_APPEND,
  [SERPAPI_TOOL_CREDENTIAL_ID]: SERPAPI_IMAGE_SYSTEM_PROMPT_APPEND,
}

// ===== 自定义工具转换 =====

/**
 * 将 ChatToolMeta 转换为 ToolDefinition（Provider API 格式）
 *
 * 将简化的 params 格式映射为 JSON Schema。
 */
function convertMetaToDefinition(meta: ChatToolMeta): ToolDefinition {
  const properties: Record<string, ToolParameterProperty> = {}
  const required: string[] = []

  for (const param of meta.params) {
    const prop: ToolParameterProperty = {
      type: param.type,
      description: param.description,
    }
    if (param.enum && param.enum.length > 0) {
      prop.enum = param.enum
    }
    properties[param.name] = prop

    if (param.required) {
      required.push(param.name)
    }
  }

  return {
    name: meta.id,
    description: meta.description,
    parameters: {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    },
  }
}

// ===== 公开接口 =====

/** 获取启用工具的返回结果 */
export interface EnabledToolsResult {
  /** 合并后的工具定义列表 */
  tools: ToolDefinition[] | undefined
  /** 合并后的系统提示词追加 */
  systemPromptAppend: string | undefined
}

/** 解析某个工具读取凭据时使用的配置键 */
function credentialSourceOf(toolId: string): string {
  return CREDENTIAL_SOURCE_BY_TOOL_ID[toolId] ?? toolId
}

/**
 * 获取当前启用的工具定义
 *
 * 根据前端传入的 enabledToolIds 和配置文件中的开关状态，
 * 返回最终要注入到 API 请求中的工具定义和系统提示词。
 *
 * @param enabledToolIds 前端传入的启用工具 ID 列表
 * @returns 合并后的工具定义和系统提示词
 */
export function getEnabledTools(enabledToolIds?: string[]): EnabledToolsResult {
  const config = getChatToolsConfig()

  const allDefinitions: ToolDefinition[] = []
  const systemPromptParts: string[] = []
  const injectedSystemPromptSources = new Set<string>()

  for (const entry of BUILTIN_TOOLS) {
    const toolId = entry.meta.id
    const state = config.toolStates[toolId]

    // 检查工具是否启用（前端开关 + 配置开关）
    const isEnabledByUser = enabledToolIds ? enabledToolIds.includes(toolId) : (state?.enabled ?? false)
    if (!isEnabledByUser) continue

    const credentialSource = credentialSourceOf(toolId)

    // 检查工具是否可用（凭据已配置）
    if (!entry.checkAvailable(config.toolCredentials[credentialSource])) continue

    allDefinitions.push(...entry.getDefinitions())

    // 共用凭据的多个工具只注入一次合并后的系统提示词
    if (injectedSystemPromptSources.has(credentialSource)) continue
    const mergedPrompt = MERGED_SYSTEM_PROMPTS[credentialSource]
    if (mergedPrompt) {
      systemPromptParts.push(mergedPrompt)
      injectedSystemPromptSources.add(credentialSource)
      continue
    }
    if (entry.meta.systemPromptAppend) {
      systemPromptParts.push(entry.meta.systemPromptAppend)
      injectedSystemPromptSources.add(credentialSource)
    }
  }

  // 自定义工具
  for (const customMeta of config.customTools) {
    const toolId = customMeta.id
    const isEnabledByUser = enabledToolIds
      ? enabledToolIds.includes(toolId)
      : (config.toolStates[toolId]?.enabled ?? false)
    if (!isEnabledByUser) continue

    // 自定义工具不需要凭据检查，httpConfig 即为配置
    allDefinitions.push(convertMetaToDefinition(customMeta))

    if (customMeta.systemPromptAppend) {
      systemPromptParts.push(customMeta.systemPromptAppend)
    }
  }

  return {
    tools: allDefinitions.length > 0 ? allDefinitions : undefined,
    systemPromptAppend: systemPromptParts.length > 0 ? systemPromptParts.join('\n') : undefined,
  }
}

/**
 * 获取所有工具信息（供前端展示）
 *
 * 返回所有内置 + 自定义工具的元数据、开关状态和可用性。
 */
export function getAllToolInfos(): ChatToolInfo[] {
  const config = getChatToolsConfig()
  const infos: ChatToolInfo[] = []

  // 内置工具
  for (const entry of BUILTIN_TOOLS) {
    const toolId = entry.meta.id
    const state = config.toolStates[toolId]

    infos.push({
      meta: entry.meta,
      enabled: state?.enabled ?? false,
      available: entry.checkAvailable(config.toolCredentials[credentialSourceOf(toolId)]),
    })
  }

  // 自定义工具
  for (const customMeta of config.customTools) {
    const state = config.toolStates[customMeta.id]

    infos.push({
      meta: customMeta,
      enabled: state?.enabled ?? false,
      available: !!customMeta.httpConfig,
    })
  }

  return infos
}
