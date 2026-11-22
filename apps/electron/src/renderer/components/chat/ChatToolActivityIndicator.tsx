/**
 * ChatToolActivityIndicator - Chat 模式工具活动指示器
 *
 * 将 ChatToolActivity[] 的 start/result 事件合并后，聚合成一个可折叠的
 * "执行过程：N 次工具调用"摘要行（与 Agent 模式 ProcessBlockGroup 一致）。
 * 默认收起，点击展开才查看逐条工具；流式过程中实时展开，结束后自动折叠。
 */

import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import { ChatToolBlock } from './ChatToolBlock'
import type { ChatToolActivity } from '@proma/shared'
import { getToolIcon, getToolDisplayName } from '@/components/agent/tool-utils'
import { cn } from '@/lib/utils'

interface MergedActivity {
  toolCallId: string
  toolName: string
  done: boolean
  isError?: boolean
  result?: string
  input: Record<string, unknown>
}

const MAX_TOOL_ICONS = 4
const AUTO_COLLAPSE_SOUND_DELAY_MS = 900
const AUTO_COLLAPSE_COUNTDOWN_SECONDS = 3

export function ChatToolActivityIndicator({
  activities,
  isStreaming = false,
}: {
  activities: ChatToolActivity[]
  isStreaming?: boolean
}): React.ReactElement | null {
  const merged = React.useMemo(() => {
    const map = new Map<string, MergedActivity>()
    for (const a of activities) {
      const existing = map.get(a.toolCallId)
      if (a.type === 'start') {
        map.set(a.toolCallId, {
          toolCallId: a.toolCallId,
          toolName: a.toolName,
          done: false,
          input: a.input ?? existing?.input ?? {},
        })
      } else if (a.type === 'result') {
        map.set(a.toolCallId, {
          toolCallId: a.toolCallId,
          toolName: existing?.toolName ?? a.toolName,
          done: true,
          isError: a.isError,
          result: a.result,
          input: a.input ?? existing?.input ?? {},
        })
      }
    }
    return Array.from(map.values())
  }, [activities])

  const [expanded, setExpanded] = React.useState(false)
  const [countdown, setCountdown] = React.useState<number | null>(null)
  const userToggledRef = React.useRef(false)
  const wasStreamingRef = React.useRef(isStreaming)
  const timersRef = React.useRef<number[]>([])

  const clearTimers = React.useCallback(() => {
    for (const timer of timersRef.current) window.clearTimeout(timer)
    timersRef.current = []
  }, [])

  React.useEffect(() => {
    clearTimers()

    if (isStreaming) {
      setCountdown(null)
      if (!wasStreamingRef.current) userToggledRef.current = false
      wasStreamingRef.current = true
      if (!userToggledRef.current) setExpanded(true)
      return
    }

    const shouldAutoCollapse = wasStreamingRef.current && !userToggledRef.current
    wasStreamingRef.current = false

    if (!shouldAutoCollapse) {
      if (!userToggledRef.current) setExpanded(false)
      return
    }

    timersRef.current.push(window.setTimeout(() => {
      setCountdown(AUTO_COLLAPSE_COUNTDOWN_SECONDS)
      for (let second = AUTO_COLLAPSE_COUNTDOWN_SECONDS - 1; second >= 1; second--) {
        const elapsed = (AUTO_COLLAPSE_COUNTDOWN_SECONDS - second) * 1000
        timersRef.current.push(window.setTimeout(() => setCountdown(second), elapsed))
      }
      timersRef.current.push(window.setTimeout(() => {
        setCountdown(null)
        setExpanded(false)
      }, AUTO_COLLAPSE_COUNTDOWN_SECONDS * 1000))
    }, AUTO_COLLAPSE_SOUND_DELAY_MS))

    return clearTimers
  }, [clearTimers, isStreaming])

  const toolNames = React.useMemo(() => {
    const seen = new Set<string>()
    const names: string[] = []
    for (const item of merged) {
      if (seen.has(item.toolName)) continue
      seen.add(item.toolName)
      names.push(item.toolName)
    }
    return names
  }, [merged])

  const visibleToolNames = toolNames.slice(0, MAX_TOOL_ICONS)
  const hiddenToolCount = Math.max(0, toolNames.length - visibleToolNames.length)

  if (merged.length === 0) return null

  const toggle = (): void => {
    userToggledRef.current = true
    clearTimers()
    setCountdown(null)
    setExpanded((previous) => !previous)
  }

  return (
    <div className="space-y-1.5 mb-2">
      <button
        type="button"
        className="flex max-w-full items-center gap-2 py-0.5 text-left transition-opacity group hover:opacity-70"
        onClick={toggle}
      >
        <ChevronRight
          className={cn(
            'size-3 shrink-0 text-muted-foreground/40 transition-transform duration-150',
            expanded && 'rotate-90',
          )}
        />
        <span className="min-w-0 truncate text-[14px] text-muted-foreground">
          执行过程：{merged.length} 次工具调用
        </span>
        {countdown !== null && (
          <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground/50">
            （{countdown}）
          </span>
        )}
        {visibleToolNames.length > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-muted-foreground/60">
            {visibleToolNames.map((toolName) => {
              const ToolIcon = getToolIcon(toolName)
              return (
                <ToolIcon
                  key={toolName}
                  className="size-3.5"
                  aria-label={getToolDisplayName(toolName)}
                />
              )
            })}
            {hiddenToolCount > 0 && (
              <span className="text-[11px] tabular-nums text-muted-foreground/60">
                +{hiddenToolCount}
              </span>
            )}
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
          {merged.map((item, idx) => (
            <ChatToolBlock
              key={item.toolCallId}
              toolName={item.toolName}
              input={item.input}
              result={item.result}
              isError={item.isError}
              isCompleted={item.done}
              animate={isStreaming}
              index={idx}
            />
          ))}
        </div>
      )}
    </div>
  )
}
