/**
 * BotConfigDialog - 会话 Bot 轻量配置面板
 *
 * 新建 Bot（同时创建其专属会话），或把一个 chat 会话转为 Bot / 编辑已有 Bot：
 * 填写名称/角色/指令后保存。新建模式保存时才原子创建会话与 Bot，取消不留空会话；
 * 已有 Bot 可在此删除以解除绑定。启用后该会话将获得 Bot 持久身份与完整工具集。
 * 可选配置服务商与模型：两级联动，模型下拉只列所选服务商下的已启用模型；
 * 留空表示使用会话自身的默认服务商与模型。
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import type { BotIdentity, Channel, CreatedBotWithConversation } from '@proma/shared'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { channelsAtom } from '@/atoms/chat-atoms'
import { buildModelOptions } from '@/components/chat/ModelSelector'

/** Radix Select 不允许空字符串作为 Item 值，用哨兵表示「使用默认」。 */
const DEFAULT_SENTINEL = '__default__'

interface BotConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 为空即新建模式：保存时原子创建会话与 Bot；有值则为既有会话的编辑模式 */
  conversationId?: string
  initialBot?: BotIdentity
  /** 编辑模式保存/删除成功回调；bot 为 null 表示已删除绑定 */
  onSaved?: (bot: BotIdentity | null) => void
  /** 新建模式创建成功回调，返回新建的会话与 Bot */
  onCreated?: (result: CreatedBotWithConversation) => void
}

export function BotConfigDialog({
  open,
  onOpenChange,
  conversationId,
  initialBot,
  onSaved,
  onCreated,
}: BotConfigDialogProps): React.ReactElement {
  /** 新建模式标记：无 conversationId 时保存走原子创建接口 */
  const isCreateMode = !conversationId
  const channels = useAtomValue(channelsAtom)
  const setChannels = useSetAtom(channelsAtom)
  const [name, setName] = React.useState('')
  const [role, setRole] = React.useState('')
  const [instructions, setInstructions] = React.useState('')
  const [channelId, setChannelId] = React.useState('')
  const [modelId, setModelId] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)

  const enabledChannels = React.useMemo(() => channels.filter((c) => c.enabled), [channels])
  const modelOptions = React.useMemo(
    () => buildModelOptions(channels, channelId || undefined)
      .map((o) => ({ value: o.modelId, label: o.modelName })),
    [channels, channelId],
  )
  // 服务商被清空或切换后，若当前模型不在新列表中则重置，避免保存失效组合
  const effectiveModelId = modelOptions.some((o) => o.value === modelId) ? modelId : ''

  // 每次打开时用当前 Bot 身份回填表单，取消后不残留上次输入；同时刷新渠道列表
  React.useEffect(() => {
    if (!open) return
    setName(initialBot?.name ?? '')
    setRole(initialBot?.role ?? '')
    setInstructions(initialBot?.instructions ?? '')
    setChannelId(initialBot?.channelId ?? '')
    setModelId(initialBot?.modelId ?? '')
    window.electronAPI.listChannels().then(setChannels).catch((error: unknown) => {
      console.error('[会话 Bot] 刷新服务商列表失败:', error)
    })
  }, [open, initialBot, setChannels])

  const handleSave = async (): Promise<void> => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('名称不能为空')
      return
    }
    setSaving(true)
    try {
      if (isCreateMode) {
        const result = await window.electronAPI.createBotWithConversation({
          name: trimmedName,
          role: role.trim(),
          instructions: instructions.trim(),
          channelId: channelId || undefined,
          modelId: effectiveModelId || undefined,
        })
        toast.success('Bot 已创建')
        onCreated?.(result)
        onOpenChange(false)
        return
      }
      // 编辑模式由调用方保证 conversationId 存在；此处守卫兼作类型收窄
      if (!conversationId) return
      const bot = await window.electronAPI.saveBotForConversation({
        conversationId,
        name: trimmedName,
        role: role.trim(),
        instructions: instructions.trim(),
        channelId: channelId || undefined,
        modelId: effectiveModelId || undefined,
      })
      toast.success(initialBot ? 'Bot 已更新' : '已把该对话转为 Bot')
      onSaved?.(bot)
      onOpenChange(false)
    } catch (error) {
      console.error('[会话 Bot] 保存失败:', error)
      toast.error('保存 Bot 失败')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (): Promise<void> => {
    // 新建模式没有可删除的会话绑定，直接忽略
    if (isCreateMode || !conversationId) return
    setRemoving(true)
    try {
      await window.electronAPI.removeBotForConversation(conversationId)
      toast.success('已关闭该对话的 Bot')
      onSaved?.(null)
      onOpenChange(false)
    } catch (error) {
      console.error('[会话 Bot] 删除失败:', error)
      toast.error('删除 Bot 失败')
    } finally {
      setRemoving(false)
    }
  }

  const busy = saving || removing

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isCreateMode ? '新建 Bot' : (initialBot ? '编辑对话 Bot' : '把对话转为 Bot')}</DialogTitle>
          <DialogDescription>
            {isCreateMode
              ? '创建一个新 Bot 及其专属对话：填写身份信息后保存，才会真正创建会话并绑定 Bot；取消不会产生空对话。如需固定模型，先选择服务商，再选择该服务商下的已启用模型。'
              : '为该对话设置持久身份。启用后，该对话将使用 Bot 身份并启用完整工具集；可随时编辑或关闭。如需固定模型，先选择服务商，再从该服务商的已启用模型中选择；留空则沿用会话默认。'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <label htmlFor="bot-name" className="text-xs text-muted-foreground">名称 <span className="text-destructive">*</span></label>
            <Input
              id="bot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：研究助手"
              maxLength={100}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="bot-role" className="text-xs text-muted-foreground">角色（可选）</label>
            <Input
              id="bot-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="例如：严谨的研究员"
              maxLength={100}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="bot-instructions" className="text-xs text-muted-foreground">指令（可选）</label>
            <Textarea
              id="bot-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="描述这个 Bot 的身份与行为方式，会注入到系统提示词中。"
              rows={4}
              disabled={busy}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="bot-channel" className="text-xs text-muted-foreground">服务商（可选）</label>
              <Select
                value={channelId || DEFAULT_SENTINEL}
                onValueChange={(value) => {
                  setChannelId(value === DEFAULT_SENTINEL ? '' : value)
                  setModelId('')
                }}
                disabled={busy}
              >
                <SelectTrigger id="bot-channel" className="h-9 text-sm">
                  <SelectValue placeholder="使用默认服务商" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_SENTINEL}>使用默认服务商</SelectItem>
                  {enabledChannels.map((channel: Channel) => (
                    <SelectItem key={channel.id} value={channel.id}>{channel.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="bot-model" className="text-xs text-muted-foreground">模型（可选）</label>
              <Select
                value={effectiveModelId || DEFAULT_SENTINEL}
                onValueChange={(value) => setModelId(value === DEFAULT_SENTINEL ? '' : value)}
                disabled={busy || !channelId}
              >
                <SelectTrigger id="bot-model" className="h-9 text-sm">
                  <SelectValue placeholder="使用默认模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_SENTINEL}>使用默认模型</SelectItem>
                  {modelOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          {!isCreateMode && initialBot && (
            <Button
              variant="destructive"
              onClick={() => void handleRemove()}
              disabled={busy}
            >
              {removing ? '删除中...' : '删除'}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>取消</Button>
          <Button onClick={() => void handleSave()} disabled={busy}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
