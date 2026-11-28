/**
 * 联网结果自动配图的来源服务设置
 *
 * 默认值保持 Tavily，避免升级后改变现有用户行为。
 */

import type { WebImageSource } from '../../types'
import { getSettings, updateSettings } from './settings-service'

export const DEFAULT_WEB_IMAGE_SOURCE: WebImageSource = 'tavily'

/** 读取当前图片来源服务；未知值按默认值处理 */
export function getWebImageSource(): WebImageSource {
  return getSettings().webImageSource === 'serpapi' ? 'serpapi' : DEFAULT_WEB_IMAGE_SOURCE
}

/** 更新图片来源服务 */
export function updateWebImageSource(source: WebImageSource): WebImageSource {
  const next = source === 'serpapi' ? 'serpapi' : DEFAULT_WEB_IMAGE_SOURCE
  updateSettings({ webImageSource: next })
  return next
}
