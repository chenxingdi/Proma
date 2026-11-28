import * as React from 'react'
import { Eye, ImagePlus, ShieldCheck } from 'lucide-react'
import type { VisionRelaySettings as VisionRelaySettingsValue, WebImageSource } from '@/types/settings'
import { ModelSelector } from '@/components/chat/ModelSelector'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { SettingsCard, SettingsRow, SettingsSection, SettingsSelect } from './primitives'
import { SettingsSecretInput } from './primitives/SettingsSecretInput'

interface ServiceCredentialStatus {
  configured: boolean
  keyHint: string
  environmentConfigured: boolean
}

interface WebImageServiceSettings {
  tavily: ServiceCredentialStatus
  serpApi: ServiceCredentialStatus
}

const DEFAULT_CREDENTIAL_STATUS: ServiceCredentialStatus = {
  configured: false,
  keyHint: '',
  environmentConfigured: false,
}

const DEFAULT_SERVICE_SETTINGS: WebImageServiceSettings = {
  tavily: DEFAULT_CREDENTIAL_STATUS,
  serpApi: DEFAULT_CREDENTIAL_STATUS,
}

const DEFAULT_SETTINGS: VisionRelaySettingsValue = { enabled: false }

/** 为无视觉输入能力的 Agent 选择独立的视觉模型路由。 */
export function VisionRelaySettings(): React.ReactElement {
  const [settings, setSettings] = React.useState<VisionRelaySettingsValue>(DEFAULT_SETTINGS)
  const [saving, setSaving] = React.useState(false)
  const [serviceSettings, setServiceSettings] = React.useState<WebImageServiceSettings>(DEFAULT_SERVICE_SETTINGS)
  const [serviceKeyDraft, setServiceKeyDraft] = React.useState('')
  const [serviceSaving, setServiceSaving] = React.useState(false)
  const [serviceTesting, setServiceTesting] = React.useState(false)
  const [serviceMessage, setServiceMessage] = React.useState('')
  const [webImageSource, setWebImageSource] = React.useState<WebImageSource>('tavily')

  React.useEffect(() => {
    window.electronAPI.getSettings()
      .then((appSettings) => {
        setSettings(appSettings.visionRelay ?? DEFAULT_SETTINGS)
        setWebImageSource(appSettings.webImageSource === 'serpapi' ? 'serpapi' : 'tavily')
      })
      .catch(console.error)
    window.electronAPI.getWebImageServiceSettings()
      .then(setServiceSettings)
      .catch(console.error)
  }, [])

  const saveWebImageSource = async (source: WebImageSource): Promise<void> => {
    const previous = webImageSource
    setWebImageSource(source)
    setServiceKeyDraft('')
    setServiceMessage('')
    try {
      await window.electronAPI.updateSettings({ webImageSource: source })
    } catch (error) {
      console.error('[视觉助手设置] 图片来源服务保存失败:', error)
      setWebImageSource(previous)
    }
  }

  const saveServiceKey = async (): Promise<void> => {
    const apiKey = serviceKeyDraft.trim()
    if (!apiKey) return
    setServiceSaving(true)
    setServiceMessage('')
    try {
      const result = await window.electronAPI.updateWebImageServiceApiKey(webImageSource, apiKey)
      setServiceSettings(result)
      setServiceKeyDraft('')
      setServiceMessage('API Key 已保存')
    } catch (error) {
      console.error('[视觉助手设置] API Key 保存失败:', error)
      setServiceMessage('保存失败，请重试')
    } finally {
      setServiceSaving(false)
    }
  }

  const clearServiceKey = async (): Promise<void> => {
    setServiceSaving(true)
    setServiceMessage('')
    try {
      const result = await window.electronAPI.updateWebImageServiceApiKey(webImageSource, '')
      setServiceSettings(result)
      setServiceKeyDraft('')
      setServiceMessage('API Key 已清除')
    } catch (error) {
      console.error('[视觉助手设置] API Key 清除失败:', error)
      setServiceMessage('清除失败，请重试')
    } finally {
      setServiceSaving(false)
    }
  }

  const testServiceKey = async (): Promise<void> => {
    setServiceTesting(true)
    setServiceMessage('正在测试连接…')
    try {
      const draft = serviceKeyDraft.trim() || undefined
      const result = await window.electronAPI.testWebImageServiceApiKey(webImageSource, draft)
      setServiceMessage(result.message)
    } catch (error) {
      console.error('[视觉助手设置] API Key 测试失败:', error)
      setServiceMessage('测试失败，请检查网络或 API Key')
    } finally {
      setServiceTesting(false)
    }
  }

  const save = async (next: VisionRelaySettingsValue): Promise<void> => {
    const previous = settings
    setSettings(next)
    setSaving(true)
    try {
      await window.electronAPI.updateSettings({ visionRelay: next })
    } catch (error) {
      console.error('[视觉助手设置] 保存失败:', error)
      setSettings(previous)
    } finally {
      setSaving(false)
    }
  }

  const selectedModel = settings.channelId && settings.modelId
    ? { channelId: settings.channelId, modelId: settings.modelId }
    : null
  const configured = Boolean(selectedModel)
  const currentCredentials = webImageSource === 'serpapi' ? serviceSettings.serpApi : serviceSettings.tavily
  const serviceLabel = webImageSource === 'serpapi' ? 'SerpAPI' : 'Tavily'

  return (
    <div className="space-y-8">
      <SettingsSection
        title="视觉助手"
        description="为不支持原生视觉的 Agent（当前为 DeepSeek V4 Pro）接入独立视觉模型。图片不会发送给当前 DeepSeek 渠道。"
      >
        <SettingsCard>
          <SettingsRow
            label="启用视觉助手"
            icon={<Eye className="size-4 text-violet-500" />}
            description={configured
              ? 'Agent 在需要理解已授权图片时，会请求使用下方选择的视觉模型。'
              : '先选择一个支持图片输入的已配置模型。'}
          >
            <Switch
              checked={settings.enabled}
              disabled={saving || !configured}
              onCheckedChange={(enabled) => void save({ ...settings, enabled })}
            />
          </SettingsRow>
          <SettingsRow
            label="视觉模型"
            description="选择已有渠道中的视觉模型。Proma 继续复用该渠道加密保存的 API Key。"
          >
            <ModelSelector
              externalSelectedModel={selectedModel}
              excludedProviders={['openai-codex', 'github-copilot', 'xai']}
              showChannelInTrigger
              onModelSelect={(model) => void save({
                enabled: settings.enabled,
                channelId: model.channelId,
                modelId: model.modelId,
              })}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="图片搜索"
        description="选择联网结果自动配图使用的服务，并填写该服务的 API Key。Tavily 与 SerpAPI 共用同一套输入与测试流程。"
      >
        <SettingsCard>
          <SettingsSelect
            label="图片来源服务"
            description="Tavily 使用来源网页中实际提取的图片；SerpAPI 在检测到来源网页含图后按同一关键词补充图片。"
            value={webImageSource}
            onValueChange={(value) => void saveWebImageSource(value === 'serpapi' ? 'serpapi' : 'tavily')}
            options={[
              { value: 'tavily', label: 'Tavily' },
              { value: 'serpapi', label: 'SerpAPI' },
            ]}
          />
          <SettingsRow
            label={`${serviceLabel} API Key`}
            icon={<ImagePlus className="size-4 text-sky-500" />}
            description={currentCredentials.configured
              ? `已配置（${currentCredentials.keyHint}）；也可用下方输入框替换后重新测试。`
              : currentCredentials.environmentConfigured
                ? '已从环境变量读取密钥；也可在此填写并保存。'
                : `填写 ${serviceLabel} API Key 后保存并测试连接。`}
          />
          <SettingsSecretInput
            label={`${serviceLabel} API Key`}
            description={webImageSource === 'tavily'
              ? 'Tavily Key 用于联网搜索与来源网页图片提取；密钥保存在 Chat 工具凭据中。'
              : 'SerpAPI Key 由系统密钥链加密保存；只用于 serpapi.com 图片搜索。'}
            value={serviceKeyDraft}
            onChange={setServiceKeyDraft}
            placeholder={currentCredentials.configured ? '已保存；粘贴新 Key 可替换' : `输入 ${serviceLabel} API Key`}
            disabled={serviceSaving || serviceTesting}
          />
          {serviceMessage && (
            <div className="px-4 pb-1 text-[12px] text-muted-foreground">{serviceMessage}</div>
          )}
          <div className="flex items-center justify-end gap-2 px-4 pb-3">
            {currentCredentials.configured && (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                disabled={serviceSaving || serviceTesting}
                onClick={() => void clearServiceKey()}
                className="text-[12px] text-muted-foreground hover:text-destructive"
              >
                清除已保存密钥
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={serviceSaving || serviceTesting}
              onClick={() => void testServiceKey()}
            >
              {serviceTesting ? '测试中…' : '测试连接'}
            </Button>
            <Button
              size="sm"
              type="button"
              disabled={serviceSaving || serviceTesting || !serviceKeyDraft.trim()}
              onClick={() => void saveServiceKey()}
            >
              {serviceSaving ? '保存中…' : '保存密钥'}
            </Button>
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="隐私边界" description="视觉助手遵循最小外发原则。">
        <SettingsCard>
          <SettingsRow
            label="启用后自动使用视觉模型"
            icon={<ShieldCheck className="size-4 text-emerald-500" />}
            description="启用即授权 Agent 在需要时将当前会话或用户已附加目录中的 PNG、JPEG、GIF、WebP 图片，以及最多 1000 字符的视觉问题发送给所选模型；单张上限 10MB。视觉结果只会以文本 JSON 返回给 Agent。"
          />
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
