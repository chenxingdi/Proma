/**
 * BotWorkspace — Bot 模式三栏工作台
 *
 * 布局：左侧 Bot 列表 | 中间选中 Bot 的对话区 | 右侧 Bot 配置面板。
 * - 每个 Bot 绑定一个专属 Agent 会话，中间对话区直接复用 AgentView。
 * - 视觉风格沿用 Proma 现有主题变量与 UI 原语，不引入新的设计语言。
 * - 右栏接已有能力：名称/角色/指令/模型走 Bot IPC；会话为只读展示；
 *   权限与连接器为只读概览，避免首版触碰尚未存在的后端契约。
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import {
  Bot as BotIcon,
  Plus,
  Trash2,
  Pencil,
  Search,
  X,
  Check,
  Settings2,
  MessageSquare,
  Plug,
  ShieldCheck,
  Loader2,
  PanelRightClose,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AgentView } from '@/components/agent'
import { botsAtom } from '@/atoms/bot-atoms'
import { channelsAtom } from '@/atoms/chat-atoms'
import { appModeAtom } from '@/atoms/app-mode'
import type { BotIdentity } from '@proma/shared'

/** 单个 Bot 的会话加载状态 */
interface BotSessionState {
  sessionId: string | null
  loading: boolean
}

/**
 * Bot 三栏工作台。
 */
export function BotWorkspace(): React.ReactElement {
  const bots = useAtomValue(botsAtom)
  const setBots = useSetAtom(botsAtom)
  const [, setAppMode] = useAtom(appModeAtom)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')
  const [editing, setEditing] = React.useState<BotIdentity | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [pendingDeletion, setPendingDeletion] = React.useState<BotIdentity | null>(null)
  const [rightPanelOpen, setRightPanelOpen] = React.useState(true)
  const [sessionState, setSessionState] = React.useState<BotSessionState>({ sessionId: null, loading: false })

  const refreshList = React.useCallback(async (): Promise<BotIdentity[]> => {
    try {
      const list = await window.electronAPI.listBots()
      setBots(list)
      return list
    } catch (error) {
      console.error('[Bot] 加载失败:', error)
      toast.error('加载 Bot 列表失败')
      return []
    }
  }, [setBots])

  React.useEffect(() => {
    void refreshList().then((list) => {
      setSelectedId((current) => current ?? list[0]?.id ?? null)
    })
  }, [refreshList])

  const selectedBot = bots.find((bot) => bot.id === selectedId) ?? null

  // 选中 Bot 变化时，确保其专属会话存在；中间对话区据此渲染 AgentView。
  React.useEffect(() => {
    if (!selectedBot) {
      setSessionState({ sessionId: null, loading: false })
      return
    }
    if (selectedBot.sessionId) {
      setSessionState({ sessionId: selectedBot.sessionId, loading: false })
      return
    }
    let cancelled = false
    setSessionState({ sessionId: null, loading: true })
    window.electronAPI.ensureBotSession(selectedBot.id)
      .then((sessionId) => {
        if (cancelled) return
        setSessionState({ sessionId, loading: false })
        setBots((prev) => prev.map((b) => (b.id === selectedBot.id ? { ...b, sessionId } : b)))
      })
      .catch((error: unknown) => {
        console.error('[Bot] 创建会话失败:', error)
        if (!cancelled) {
          setSessionState({ sessionId: null, loading: false })
          toast.error('创建 Bot 会话失败')
        }
      })
    return () => { cancelled = true }
  }, [selectedBot, setBots])

  const filteredBots = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return bots
    return bots.filter((bot) =>
      bot.name.toLowerCase().includes(needle)
      || (bot.role ?? '').toLowerCase().includes(needle),
    )
  }, [bots, query])

  const confirmDelete = async (): Promise<void> => {
    const bot = pendingDeletion
    if (!bot) return
    try {
      await window.electronAPI.deleteBot(bot.id)
      const list = await refreshList()
      if (selectedId === bot.id) {
        setSelectedId(list[0]?.id ?? null)
      }
      setPendingDeletion(null)
      toast.success('已删除 Bot')
    } catch (error) {
      console.error('[Bot] 删除失败:', error)
      toast.error('删除失败')
    }
  }

  const handleSaved = (saved: BotIdentity, isNew: boolean): void => {
    setBots((prev) => isNew ? [...prev, saved] : prev.map((b) => (b.id === saved.id ? saved : b)))
    setSelectedId(saved.id)
    setCreating(false)
    setEditing(null)
    toast.success(isNew ? '已创建 Bot' : '已更新 Bot')
  }

  return (
    <div className="titlebar-no-drag flex h-full min-h-0 w-full bg-content-area">
      {/* 左栏：Bot 列表 */}
      <div className="flex w-[240px] shrink-0 flex-col border-r border-border/60">
        <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
          <div className="flex items-center gap-1.5 px-1 text-sm font-semibold text-foreground">
            <BotIcon className="size-4" /> Bot
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setAppMode('agent')}
              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
              title="切换到 Agent 模式"
            >
              Agent
            </button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setCreating(true)} aria-label="新建 Bot">
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
        <div className="relative px-3 pb-2">
          <Search className="pointer-events-none absolute left-5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索 Bot"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-0.5 px-2 pb-3">
            {filteredBots.length === 0 ? (
              <div className="px-2 py-10 text-center text-xs text-muted-foreground">
                {bots.length === 0 ? '还没有 Bot，点击 + 创建' : '没有匹配的 Bot'}
              </div>
            ) : (
              filteredBots.map((bot) => (
                <button
                  key={bot.id}
                  type="button"
                  onClick={() => setSelectedId(bot.id)}
                  className={
                    'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors '
                    + (bot.id === selectedId
                      ? 'bg-foreground/[0.07] text-foreground'
                      : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground')
                  }
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <BotIcon className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs font-medium">{bot.name}</span>
                    {bot.role && <span className="truncate text-[11px] text-muted-foreground">{bot.role}</span>}
                  </span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
        <div className="flex items-center gap-1 border-t border-border/60 px-3 py-2">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setCreating(true)} aria-label="新建 Bot">
            <Plus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={!selectedBot}
            onClick={() => selectedBot && setEditing(selectedBot)}
            aria-label="编辑 Bot"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={!selectedBot}
            onClick={() => selectedBot && setPendingDeletion(selectedBot)}
            aria-label="删除 Bot"
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </div>

      {/* 中栏：选中 Bot 的对话区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!selectedBot ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BotIcon className="size-7" />
            </span>
            <div className="text-sm font-medium text-foreground">Bot 工作台</div>
            <div className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              左侧选择一个 Bot 开始对话，或新建一个 Bot 并配置它的身份、模型与连接方式。
            </div>
            <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1 size-4" />新建 Bot</Button>
          </div>
        ) : sessionState.loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <span className="text-xs">正在准备 {selectedBot.name} 的会话…</span>
          </div>
        ) : sessionState.sessionId ? (
          <AgentView sessionId={sessionState.sessionId} embedded />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <MessageSquare className="size-7" />
            <span className="text-xs">该 Bot 的会话暂不可用</span>
          </div>
        )}
      </div>

      {/* 右栏：Bot 配置 */}
      {rightPanelOpen && selectedBot && (
        <div className="flex w-[340px] shrink-0 flex-col border-l border-border/60">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Settings2 className="size-4" /> Bot 详情
            </div>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setRightPanelOpen(false)} aria-label="收起详情">
              <PanelRightClose className="size-4" />
            </Button>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <BotDetailPanel bot={selectedBot} onEdit={() => setEditing(selectedBot)} onSaved={handleSaved} />
          </ScrollArea>
        </div>
      )}
      {!rightPanelOpen && selectedBot && (
        <button
          type="button"
          onClick={() => setRightPanelOpen(true)}
          className="flex w-9 shrink-0 items-start justify-center border-l border-border/60 pt-3 text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          aria-label="展开详情"
        >
          <Settings2 className="size-4" />
        </button>
      )}

      {/* 新建 / 编辑表单弹窗 */}
      {(creating || editing) && (
        <BotFormDialog
          bot={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={handleSaved}
        />
      )}

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

/**
 * 右栏 Bot 详情面板。
 * 名称/角色/指令/模型直接内联编辑并保存；会话、权限、连接器为只读概览。
 */
function BotDetailPanel({
  bot,
  onEdit,
  onSaved,
}: {
  bot: BotIdentity
  onEdit: () => void
  onSaved: (saved: BotIdentity, isNew: boolean) => void
}): React.ReactElement {
  const channels = useAtomValue(channelsAtom)
  const [name, setName] = React.useState(bot.name)
  const [role, setRole] = React.useState(bot.role ?? '')
  const [instructions, setInstructions] = React.useState(bot.instructions ?? '')
  const [modelId, setModelId] = React.useState(bot.modelId ?? '')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setName(bot.name)
    setRole(bot.role ?? '')
    setInstructions(bot.instructions ?? '')
    setModelId(bot.modelId ?? '')
  }, [bot])

  const modelOptions = React.useMemo(
    () => channels.flatMap((channel) =>
      channel.models.map((model) => ({
        value: model.id,
        label: model.name || model.id,
        channelName: channel.name,
      })),
    ),
    [channels],
  )

  const handleSave = async (): Promise<void> => {
    if (!name.trim()) {
      toast.error('请填写 Bot 名称')
      return
    }
    setSaving(true)
    try {
      const updated = await window.electronAPI.updateBot({
        id: bot.id,
        name: name.trim(),
        role: role.trim() || undefined,
        instructions: instructions.trim() || undefined,
        modelId: modelId || undefined,
      })
      if (updated) onSaved(updated, false)
      else toast.error('Bot 不存在')
    } catch (error) {
      console.error('[Bot] 保存失败:', error)
      toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      {/* 身份概览 */}
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <BotIcon className="size-8" />
        </span>
        <div className="text-base font-semibold text-foreground">{bot.name}</div>
        {bot.role && <div className="text-xs text-muted-foreground">{bot.role}</div>}
      </div>

      {/* 基础配置 */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">基础配置</h3>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onEdit}>
            <Pencil className="mr-1 size-3" />完整编辑
          </Button>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bot-detail-name">名称</Label>
          <Input id="bot-detail-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bot-detail-role">角色</Label>
          <Input id="bot-detail-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="例如：研究助手" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bot-detail-instructions">身份与行为指令</Label>
          <Textarea
            id="bot-detail-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="描述这个 Bot 的身份、职责和工作方式"
            rows={4}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bot-detail-model">模型</Label>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger id="bot-detail-model">
              <SelectValue placeholder="使用默认模型" />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((option) => (
                <SelectItem key={`${option.channelName}-${option.value}`} value={option.value}>
                  {option.label} · {option.channelName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving} className="self-end">
          {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Check className="mr-1 size-4" />}
          保存
        </Button>
      </section>

      {/* 会话（只读） */}
      <section className="flex flex-col gap-2 border-t border-border/60 pt-4">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <MessageSquare className="size-3.5" /> 会话
        </h3>
        <div className="rounded-lg bg-foreground/[0.035] px-3 py-2 text-xs text-muted-foreground">
          {bot.sessionId ? bot.sessionId : '尚未创建专属会话'}
        </div>
      </section>

      {/* 权限（只读概览） */}
      <section className="flex flex-col gap-2 border-t border-border/60 pt-4">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="size-3.5" /> 权限
        </h3>
        <div className="rounded-lg bg-foreground/[0.035] px-3 py-2 text-xs text-muted-foreground">
          沿用所属 Agent 会话的工作区权限设置。
        </div>
      </section>

      {/* 连接器（只读概览） */}
      <section className="flex flex-col gap-2 border-t border-border/60 pt-4">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Plug className="size-3.5" /> 连接器
        </h3>
        {bot.imBinding ? (
          <div className="rounded-lg bg-foreground/[0.035] px-3 py-2 text-xs text-muted-foreground">
            IM 绑定：{bot.imBinding.platform} · {bot.imBinding.chatId}
          </div>
        ) : (
          <div className="rounded-lg bg-foreground/[0.035] px-3 py-2 text-xs text-muted-foreground">
            未绑定 IM 会话，可绑定后通过 IM 与该 Bot 对话。
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * 新建 / 编辑 Bot 表单弹窗（复用现有 Dialog 风格）。
 */
function BotFormDialog({
  bot,
  onClose,
  onSaved,
}: {
  bot: BotIdentity | null
  onClose: () => void
  onSaved: (saved: BotIdentity, isNew: boolean) => void
}): React.ReactElement {
  const [name, setName] = React.useState(bot?.name ?? '')
  const [role, setRole] = React.useState(bot?.role ?? '')
  const [instructions, setInstructions] = React.useState(bot?.instructions ?? '')
  const [workspaceId, setWorkspaceId] = React.useState(bot?.workspaceId ?? '')
  const [imChatId, setImChatId] = React.useState(bot?.imBinding?.chatId ?? '')
  const [saving, setSaving] = React.useState(false)

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!name.trim()) {
      toast.error('请填写 Bot 名称')
      return
    }
    setSaving(true)
    try {
      const base = {
        name: name.trim(),
        ...(role.trim() ? { role: role.trim() } : {}),
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        ...(workspaceId.trim() ? { workspaceId: workspaceId.trim() } : {}),
        ...(imChatId.trim()
          ? { imBinding: { platform: 'wechat' as const, chatId: imChatId.trim() } }
          : {}),
      }
      const saved = bot
        ? await window.electronAPI.updateBot({ id: bot.id, ...base })
        : await window.electronAPI.createBot(base)
      if (!saved) throw new Error('Bot 不存在')
      onSaved(saved, !bot)
    } catch (error) {
      console.error('[Bot] 保存失败:', error)
      toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onMouseDown={onClose}>
      <form
        onSubmit={handleSubmit}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[86vh] w-[520px] max-w-[92vw] flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-base font-semibold text-foreground">
            <BotIcon className="size-5" /> {bot ? '编辑 Bot' : '新建 Bot'}
          </div>
          <Button type="button" variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="关闭">
            <X className="size-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bot-form-name">名称</Label>
            <Input id="bot-form-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：Chief" autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bot-form-role">角色（可选）</Label>
            <Input id="bot-form-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="例如：Chief of Staff" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bot-form-instructions">身份与行为指令（可选）</Label>
          <Textarea
            id="bot-form-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="描述这个 Bot 的身份、职责和工作方式"
            rows={4}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bot-form-workspace">工作区 ID（可选）</Label>
            <Input id="bot-form-workspace" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} placeholder="留空使用默认工作区" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bot-form-im">微信 chatId（可选）</Label>
            <Input id="bot-form-im" value={imChatId} onChange={(e) => setImChatId(e.target.value)} placeholder="绑定后该会话消息走此 Bot" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Check className="mr-1 size-4" />}
            保存
          </Button>
        </div>
      </form>
    </div>
  )
}
