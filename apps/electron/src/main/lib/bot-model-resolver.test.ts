import { describe, expect, test } from 'bun:test'
import { resolveBotModelOverride } from './bot-model-resolver'

/** 测试用的服务商列表：两家服务商，各有启用/禁用模型 */
const channels = [
  {
    id: 'ch-deepseek',
    enabled: true,
    models: [
      { id: 'ds-reasoner', enabled: true },
      { id: 'ds-disabled', enabled: false },
    ],
  },
  {
    id: 'ch-openai',
    enabled: true,
    models: [
      { id: 'gpt-5', enabled: true },
      { id: 'gpt-4', enabled: true },
    ],
  },
  {
    id: 'ch-disabled',
    enabled: false,
    models: [{ id: 'some-model', enabled: true }],
  },
]

const current = { channelId: 'ch-conversation', modelId: 'conversation-model' }

describe('resolveBotModelOverride - Bot 模型覆盖解析', () => {
  test('Given Bot 配置了有效的服务商与模型 When 解析 Then 返回覆盖值且无错误', () => {
    const result = resolveBotModelOverride(
      current,
      { channelId: 'ch-deepseek', modelId: 'ds-reasoner' },
      channels,
    )

    expect(result).toEqual({ channelId: 'ch-deepseek', modelId: 'ds-reasoner' })
    expect(result.error).toBeUndefined()
  })

  test('Given Bot 未定义 When 解析 Then 返回会话原值且无错误', () => {
    const result = resolveBotModelOverride(current, undefined, channels)

    expect(result).toEqual(current)
    expect(result.error).toBeUndefined()
  })

  test('Given Bot 未配置模型 When 解析 Then 返回会话原值且无错误', () => {
    const noChannel = resolveBotModelOverride(current, { modelId: 'ds-reasoner' }, channels)
    const noModel = resolveBotModelOverride(current, { channelId: 'ch-deepseek' }, channels)
    const empty = resolveBotModelOverride(current, { channelId: '', modelId: '' }, channels)

    expect(noChannel).toEqual(current)
    expect(noModel).toEqual(current)
    expect(empty).toEqual(current)
    expect(noChannel.error).toBeUndefined()
    expect(noModel.error).toBeUndefined()
    expect(empty.error).toBeUndefined()
  })

  test('Given Bot 配置的服务商不存在或已禁用 When 解析 Then 返回会话原值并提示服务商不可用', () => {
    const missing = resolveBotModelOverride(
      current,
      { channelId: 'ch-missing', modelId: 'ds-reasoner' },
      channels,
    )
    const disabled = resolveBotModelOverride(
      current,
      { channelId: 'ch-disabled', modelId: 'some-model' },
      channels,
    )

    expect(missing).toEqual({ ...current, error: 'Bot 配置的服务商已不可用，请重新选择' })
    expect(disabled).toEqual({ ...current, error: 'Bot 配置的服务商已不可用，请重新选择' })
  })

  test('Given Bot 配置的模型在服务商下被禁用或不存在 When 解析 Then 返回会话原值并提示模型不可用', () => {
    const disabledModel = resolveBotModelOverride(
      current,
      { channelId: 'ch-deepseek', modelId: 'ds-disabled' },
      channels,
    )
    const missingModel = resolveBotModelOverride(
      current,
      { channelId: 'ch-deepseek', modelId: 'no-such-model' },
      channels,
    )

    expect(disabledModel).toEqual({ ...current, error: 'Bot 配置的模型已不可用，请重新选择' })
    expect(missingModel).toEqual({ ...current, error: 'Bot 配置的模型已不可用，请重新选择' })
  })

  test('Given Bot 配置的模型属于另一家服务商 When 解析 Then 拒绝跨渠道模型并提示不可用', () => {
    // gpt-5 是 ch-openai 的模型，但 Bot 配置的服务商是 ch-deepseek
    const result = resolveBotModelOverride(
      current,
      { channelId: 'ch-deepseek', modelId: 'gpt-5' },
      channels,
    )

    expect(result).toEqual({ ...current, error: 'Bot 配置的模型已不可用，请重新选择' })
  })
})
