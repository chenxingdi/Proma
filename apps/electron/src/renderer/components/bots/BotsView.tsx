/**
 * Bot 身份管理视图
 *
 * 由侧栏「Bot 管理」入口触发，全屏占据中间内容区。
 * - 顶部：标题与「+ 新建」按钮
 * - 列表：每个 Bot 的名称、角色、IM 绑定与会话状态
 * - 表单：创建/编辑 Bot 的名称、角色、指令、模型与 IM 绑定
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { Bot as BotIcon, Plus, Trash2, Pencil, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { activeViewAtom } from '@/atoms/active-view'
import {
  botsAtom,
  botFormAtom,
  botToDraft,
  createEmptyBotDraft,
  type BotDraft,
} from '@/atoms/bot-atoms'
import type { BotIdentity } from '@proma/shared'

/** 把草稿转成创建输入（去掉空字符串字段） */
function draftToCreateInput(draft: BotDraft) {
  return {
    name: draft.name.trim(),
    ...(draft.role.trim() ? { role: draft.role.trim() } : {}),
    ...(draft.instructions.trim() ? { instructions: draft.instructions.trim() } : {}),
    ...(draft.modelId.trim() ? { modelId: draft.modelId.trim() } : {}),
    ...(draft.channelId.trim() ? { channelId: draft.channelId.trim() } : {}),
    ...(draft.workspaceId.trim() ? { workspaceId: draft.workspaceId.trim() } : {}),
    ...(draft.imChatId.trim()
      ? { imBinding: { platform: draft.imPlatform, chatId: draft.imChatId.trim() } }
      : {}),
  }
}

function BotForm({ draft, onDone }: { draft: BotDraft; onDone: () => void }): React.ReactElement {
  const [form, setForm] = React.useState<BotDraft>(draft)
  const setBots = useSetAtom(botsAtom)
  const [saving, setSaving] = React.useState(false)

  const update = (patch: Partial<BotDraft>): void => setForm((prev) => ({ ...prev, ...patch }))

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!form.name.trim()) {
      toast.error('请填写 Bot 名称')
      return
    }
    setSaving(true)
    try {
      if (form.id) {
        const { id, ...patch } = form
        const input = {
          id,
          ...draftToCreateInput(form),
        }
        const updated = await window.electronAPI.updateBot(input)
        if (!updated) throw new Error('Bot 不存在')
        setBots((prev) => prev.map((b) => (b.id === id ? updated : b)))
        toast.success('已更新 Bot')
      } else {
        const created = await window.electronAPI.createBot(draftToCreateInput(form))
        setBots((prev) => [...prev, created])
        toast.success('已创建 Bot')
      }
      onDone()
    } catch (error) {
      console.error('[Bot] 保存失败:', error)
      toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl bg-foreground/[0.035] p-5 shadow-inner">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">{form.id ? '编辑 Bot' : '新建 Bot'}</div>
        <Button type="button" variant="ghost" size="icon" onClick={onDone} aria-label="关闭表单">
          <X className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bot-name">名称</Label>
          <Input id="bot-name" value={form.name} onChange={(e) => update({ name: e.target.value })} placeholder="例如：研究助手" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bot-role">角色（可选）</Label>
          <Input id="bot-role" value={form.role} onChange={(e) => update({ role: e.target.value })} placeholder="例如：研究员" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bot-instructions">身份与行为指令（可选）</Label>
        <Textarea id="bot-instructions" value={form.instructions} onChange={(e) => update({ instructions: e.target.value })} placeholder="描述这个 Bot 的身份、职责和工作方式" rows={4} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bot-channel">渠道 ID（可选）</Label>
          <Input id="bot-channel" value={form.channelId} onChange={(e) => update({ channelId: e.target.value })} placeholder="留空使用全局 Agent 渠道" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bot-model">模型 ID（可选）</Label>
          <Input id="bot-model" value={form.modelId} onChange={(e) => update({ modelId: e.target.value })} placeholder="留空使用默认模型" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bot-im-chat">IM 会话 chatId（可选）</Label>
          <Input id="bot-im-chat" value={form.imChatId} onChange={(e) => update({ imChatId: e.target.value })} placeholder="绑定后该 IM 会话的消息走此 Bot" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bot-workspace">工作区 ID（可选）</Label>
          <Input id="bot-workspace" value={form.workspaceId} onChange={(e) => update({ workspaceId: e.target.value })} placeholder="留空使用默认工作区" />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>取消</Button>
        <Button type="submit" disabled={saving}>
          {saving ? '保存中…' : <><Check className="mr-1 size-4" />保存</>}
        </Button>
      </div>
    </form>
  )
}

/** Bot 管理主视图，嵌在统一内容区 */
export function BotsView(): React.ReactElement {
  const bots = useAtomValue(botsAtom)
  const setBots = useSetAtom(botsAtom)
  const [form, setForm] = useAtom(botFormAtom)
  const setActiveView = useSetAtom(activeViewAtom)
  const [pendingDeletion, setPendingDeletion] = React.useState<BotIdentity | null>(null)

  const refreshList = React.useCallback(async (): Promise<void> => {
    try {
      const list = await window.electronAPI.listBots()
      setBots(list)
    } catch (error) {
      console.error('[Bot] 加载失败:', error)
      toast.error('加载 Bot 列表失败')
    }
  }, [setBots])

  React.useEffect(() => {
    void refreshList()
  }, [refreshList])

  const handleCreate = (): void => setForm({ open: true, draft: createEmptyBotDraft() })
  const handleEdit = (bot: BotIdentity): void => setForm({ open: true, draft: botToDraft(bot) })

  const confirmDelete = async (): Promise<void> => {
    const bot = pendingDeletion
    if (!bot) return
    try {
      await window.electronAPI.deleteBot(bot.id)
      await refreshList()
      setPendingDeletion(null)
      toast.success('已删除 Bot')
    } catch (error) {
      console.error('[Bot] 删除失败:', error)
      toast.error('删除失败')
    }
  }

  return (
    <div className="titlebar-no-drag flex h-full min-h-0 flex-col bg-content-area">
      <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-foreground">
            <BotIcon className="size-5" /> Bot 管理
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">管理长期 Bot 身份，并将其绑定到 IM 会话</div>
        </div>
        <Button onClick={handleCreate} size="sm"><Plus className="mr-1 size-4" />新建 Bot</Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {form.open && form.draft ? (
          <BotForm draft={form.draft} onDone={() => setForm({ open: false, draft: null })} />
        ) : bots.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <BotIcon className="size-10 text-muted-foreground/40" />
            <div className="text-sm font-medium text-foreground">还没有 Bot</div>
            <div className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              创建一个 Bot，设置身份与指令，再在微信等 IM 中把会话 chatId 绑定给它，即可用该身份持续对话。
            </div>
            <Button onClick={handleCreate} size="sm"><Plus className="mr-1 size-4" />新建 Bot</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {bots.map((bot) => (
              <div key={bot.id} className="group flex items-center gap-3 rounded-xl border border-border/50 bg-foreground/[0.02] px-4 py-3 transition-colors hover:bg-foreground/[0.04]">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BotIcon className="size-5" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{bot.name}</span>
                    {bot.role && <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground">{bot.role}</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {bot.imBinding
                      ? `IM: ${bot.imBinding.platform} · ${bot.imBinding.chatId}`
                      : '未绑定 IM 会话'}
                    {bot.sessionId ? ' · 已绑定会话' : ' · 尚无会话'}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(bot)} aria-label="编辑 Bot"><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setPendingDeletion(bot)} aria-label="删除 Bot"><Trash2 className="size-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border/50 px-6 py-3">
        <Button variant="ghost" size="sm" onClick={() => setActiveView('conversations')}>返回对话</Button>
      </div>

      <AlertDialog open={!!pendingDeletion} onOpenChange={(open) => !open && setPendingDeletion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 Bot</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除「{pendingDeletion?.name}」吗？其绑定的 Agent 会话不会被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
