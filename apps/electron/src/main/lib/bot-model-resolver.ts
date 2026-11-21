/**
 * Bot 模型覆盖解析器
 *
 * 会话绑定 Bot 后，若 Bot 显式配置了服务商 + 模型，则发消息时用该配置
 * 覆盖会话自身的 channelId / modelId。未配置或配置失效时回退到会话原值。
 * 本模块为纯函数，不依赖时间与 Electron 环境，便于单测。
 */

/** Bot 模型覆盖的解析结果 */
export interface BotModelOverride {
  /** 最终生效的服务商 id */
  channelId: string
  /** 最终生效的模型 id */
  modelId: string
  /** 配置失效时的用户可读原因；存在时调用方应中止发送 */
  error?: string
}

/**
 * 解析 Bot 的模型覆盖配置
 *
 * - Bot 未定义，或未同时配置 channelId / modelId：返回会话原值，不报错。
 * - Bot 配置了服务商 + 模型：校验服务商与模型均已启用且匹配，成功则返回覆盖值。
 * - 服务商不可用 / 模型不可用：返回会话原值并附带错误提示。
 *
 * @param current 会话自身的 channelId / modelId
 * @param bot 会话绑定的 Bot（可能未配置模型）
 * @param channels 当前已配置的服务商列表
 */
export function resolveBotModelOverride(
  current: { channelId: string; modelId: string },
  bot: { channelId?: string; modelId?: string } | undefined,
  channels: Array<{ id: string; enabled: boolean; models: Array<{ id: string; enabled: boolean }> }>,
): BotModelOverride {
  if (!bot?.channelId || !bot.modelId) {
    return { ...current }
  }

  const channel = channels.find((c) => c.id === bot.channelId && c.enabled)
  if (!channel) {
    return { ...current, error: 'Bot 配置的服务商已不可用，请重新选择' }
  }

  const model = channel.models.find((m) => m.id === bot.modelId && m.enabled)
  if (!model) {
    return { ...current, error: 'Bot 配置的模型已不可用，请重新选择' }
  }

  return { channelId: bot.channelId, modelId: bot.modelId }
}
