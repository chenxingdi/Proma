/**
 * Cua Driver 状态原子
 *
 * - 本地安装信息（版本/路径）由设置页「重新检测」刷新
 * - 更新状态订阅主进程推送；发现新版本即调用官方更新命令安装
 */

import { atom } from 'jotai'
import type { CuaDriverInfo, CuaDriverUpdateStatus } from '@proma/shared'

/** 本地 Cua Driver 安装信息 */
export const cuaDriverInfoAtom = atom<CuaDriverInfo | null>(null)

/** 是否正在重新检测本地安装信息 */
export const isCheckingCuaDriverAtom = atom(false)

/** Cua Driver 更新状态 atom */
export const cuaDriverStatusAtom = atom<CuaDriverUpdateStatus>({ status: 'idle' })

/** 是否正在更新（检查/安装） */
export const cuaDriverUpdatingAtom = atom((get) => {
  const { status } = get(cuaDriverStatusAtom)
  return status === 'checking' || status === 'installing'
})

/** 刷新本地安装信息。 */
export async function refreshCuaDriverInfo(): Promise<CuaDriverInfo> {
  const info = await window.electronAPI.getCuaDriverInfo()
  return info
}

/** 初始化状态订阅，返回清理函数。 */
export function initializeCuaDriverStatus(
  setStatus: (status: CuaDriverUpdateStatus) => void,
): () => void {
  const api = window.electronAPI
  if (!api?.getCuaDriverStatus) return () => {}

  api.getCuaDriverStatus().then(setStatus).catch(() => {})
  return api.onCuaDriverStatusChanged(setStatus)
}
