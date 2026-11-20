/**
 * ComputerUseSettings — Computer Use 设置页
 *
 * 展示 Cua Driver 安装状态、版本与路径，提供：
 * - 重新检测：刷新本地安装信息
 * - 检查更新：调用 cua-driver 官方更新命令（发现新版即更新）
 * - 让 Agent 检查配置：打开新 Agent 会话并预填排查提示词
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import {
  CheckCircle2,
  Monitor,
  RefreshCw,
  SearchCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  cuaDriverInfoAtom,
  cuaDriverStatusAtom,
  isCheckingCuaDriverAtom,
  refreshCuaDriverInfo,
} from '@/atoms/cua-driver'
import { agentPendingPromptAtom } from '@/atoms/agent-atoms'
import { useCreateSession } from '@/hooks/useCreateSession'

const CHECK_PROMPT =
  '请检查 Cua Driver 的安装、服务与系统权限状态，确认 Computer Use 是否可用，并协助解决发现的问题。'

/** 区块标题 */
function SectionTitle({ children }: { children: React.ReactNode }): React.ReactElement {
  return <h2 className="mb-3 text-base font-semibold text-foreground">{children}</h2>
}

/** 卡片容器 */
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }): React.ReactElement {
  return (
    <div className={`rounded-xl border border-border/60 bg-card ${className}`}>
      {children}
    </div>
  )
}

export function ComputerUseSettings(): React.ReactElement {
  const info = useAtomValue(cuaDriverInfoAtom)
  const setInfo = useSetAtom(cuaDriverInfoAtom)
  const isChecking = useAtomValue(isCheckingCuaDriverAtom)
  const setChecking = useSetAtom(isCheckingCuaDriverAtom)
  const updateStatus = useAtomValue(cuaDriverStatusAtom)
  const setPendingPrompt = useSetAtom(agentPendingPromptAtom)
  const { createAgent } = useCreateSession()

  const [updating, setUpdating] = React.useState(false)

  /** 重新检测：刷新本地安装信息。 */
  const handleRefresh = React.useCallback(async () => {
    setChecking(true)
    try {
      setInfo(await refreshCuaDriverInfo())
    } catch (error) {
      console.error('[Computer Use] 重新检测失败:', error)
      toast.error('重新检测失败')
    } finally {
      setChecking(false)
    }
  }, [setInfo, setChecking])

  // 首次进入时读取一次安装信息
  React.useEffect(() => {
    if (info === null) void handleRefresh()
  }, [info, handleRefresh])

  /** 检查更新：调用官方更新命令。 */
  const handleCheckUpdate = React.useCallback(async () => {
    setUpdating(true)
    try {
      const result = await window.electronAPI.checkAndUpdateCuaDriver()
      if (result.status === 'updated') {
        toast.success(result.message)
        await handleRefresh()
      } else if (result.status === 'not-available') {
        toast.success(result.message)
      } else if (result.status === 'error') {
        toast.error(result.message)
      }
    } catch (error) {
      console.error('[Computer Use] 检查更新失败:', error)
      toast.error('检查更新失败')
    } finally {
      setUpdating(false)
    }
  }, [handleRefresh])

  /** 让 Agent 检查配置：打开新会话并预填排查提示词。 */
  const handleAgentCheck = React.useCallback(async () => {
    const sessionId = await createAgent()
    if (!sessionId) {
      toast.error('创建 Agent 会话失败')
      return
    }
    setPendingPrompt({ sessionId, message: CHECK_PROMPT })
  }, [createAgent, setPendingPrompt])

  const installing = updating || updateStatus.status === 'checking' || updateStatus.status === 'installing'
  const versionLabel = info?.version
    ? `cua-driver ${info.version}`
    : '未检测到 Cua Driver'

  return (
    <div>
      {/* 标题区 */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Computer Use</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            让 Agent 看见并操作电脑，协助你完成跨应用任务。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isChecking}
          className="shrink-0"
        >
          <RefreshCw className={`mr-1.5 size-4 ${isChecking ? 'animate-spin' : ''}`} />
          重新检测
        </Button>
      </div>

      {/* 设备与 Driver */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>设备与 Driver</SectionTitle>
          <span className="text-sm text-muted-foreground">{info?.platform ?? ''}</span>
        </div>
        <Card>
          <div className="px-4 py-4">
            <div className="flex items-center gap-2">
              <Monitor className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Cua Driver</span>
              {info?.installed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3" />
                  已安装
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {info?.installed
                ? '已检测到 Cua Driver，无需重复安装。'
                : '尚未检测到 Cua Driver，请让 Agent 检查配置。'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              安装状态不代表服务已启动或系统权限已开启。
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border/60 px-4 py-3">
            <div className="min-w-0 text-sm text-muted-foreground">
              <span>当前版本 </span>
              <span className="font-medium text-foreground">{versionLabel}</span>
              {info?.path && <span className="ml-2 break-all">· {info.path}</span>}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCheckUpdate}
              disabled={installing}
              className="shrink-0"
            >
              <RefreshCw className={`mr-1.5 size-4 ${installing ? 'animate-spin' : ''}`} />
              {installing ? '检查中…' : '检查更新'}
            </Button>
          </div>
        </Card>
      </section>

      {/* 需要帮助 */}
      <section className="mb-8">
        <SectionTitle>需要帮助?</SectionTitle>
        <Card>
          <div className="flex items-center justify-between gap-4 px-4 py-4">
            <div>
              <div className="text-sm font-medium text-foreground">让 Agent 检查配置</div>
              <p className="mt-1 text-sm text-muted-foreground">
                检查现有安装、服务和权限，并协助解决问题。
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleAgentCheck} className="shrink-0">
              <SearchCheck className="mr-1.5 size-4" />
              开始检查
            </Button>
          </div>
        </Card>
      </section>

      {/* 配置后可以这样用 */}
      <section>
        <SectionTitle>配置后可以这样用</SectionTitle>
        <p className="mb-3 text-sm text-muted-foreground">直接在 Agent 会话中描述任务。</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card className="px-4 py-4">
            <div className="text-sm font-medium text-foreground">查看与整理</div>
            <p className="mt-1 text-sm text-muted-foreground">
              帮我看看微信里的新消息，整理待回复事项。
            </p>
          </Card>
          <Card className="px-4 py-4">
            <div className="text-sm font-medium text-foreground">操作前确认</div>
            <p className="mt-1 text-sm text-muted-foreground">
              帮我填写表单，提交前截图给我确认。
            </p>
          </Card>
        </div>
      </section>
    </div>
  )
}
