/**
 * SerpAPI 设置服务
 *
 * 独立管理 SerpAPI 图片搜索凭据。密钥通过 Electron safeStorage 加密后写入
 * settings.json，渲染进程只能拿到「是否已配置」和脱敏后的尾部，不接触明文。
 */

import { safeStorage } from 'electron'
import type { SerpApiSettings, SerpApiSettingsUpdate } from '../../types'
import { getSettings, updateSettings } from './settings-service'

/** 环境变量后备，便于开发或企业环境不落盘密钥 */
const SERPAPI_KEY_ENV = 'PROMA_SERPAPI_KEY'

/** 渲染进程看到的脱敏配置 */
export interface PublicSerpApiSettings {
  configured: boolean
  keyHint: string
  environmentConfigured: boolean
}

function encryptSecret(value: string): string {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[SerpAPI] safeStorage 加密不可用，将以明文存储 API Key')
    return value
  }
  return safeStorage.encryptString(value).toString('base64')
}

function decryptSecret(value: string): string {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) return value
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch (error) {
    console.error('[SerpAPI] 解密 API Key 失败:', error)
    return ''
  }
}

function keyHintOf(apiKey: string): string {
  if (apiKey.length <= 4) return '••••'
  return `••••${apiKey.slice(-4)}`
}

/** 读取渲染进程可安全展示的设置（不含明文密钥） */
export function getPublicSerpApiSettings(env: Record<string, string | undefined> = process.env): PublicSerpApiSettings {
  const configured = Boolean((getSettings().serpApi?.apiKey ?? '').trim())
  const environmentConfigured = Boolean(env[SERPAPI_KEY_ENV]?.trim())
  return {
    configured,
    keyHint: configured ? keyHintOf(getSerpApiKey() ?? '') : '',
    environmentConfigured,
  }
}

/** 更新 SerpAPI 设置；apiKey 为空字符串表示清空已保存的密钥 */
export function updateSerpApiSettings(updates: SerpApiSettingsUpdate): PublicSerpApiSettings {
  const current: SerpApiSettings = getSettings().serpApi ?? { apiKey: '' }
  const next: SerpApiSettings = {
    ...current,
    ...updates,
    apiKey: updates.apiKey === undefined
      ? current.apiKey ?? ''
      : encryptSecret(updates.apiKey.trim()),
  }
  updateSettings({ serpApi: next })
  return getPublicSerpApiSettings()
}

/** 解析实际请求使用的密钥：优先用户配置，其次环境变量 */
export function getSerpApiKey(env: Record<string, string | undefined> = process.env): string | undefined {
  const stored = decryptSecret(getSettings().serpApi?.apiKey ?? '')
  if (stored) return stored
  return env[SERPAPI_KEY_ENV]?.trim() || undefined
}
