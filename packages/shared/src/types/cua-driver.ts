/**
 * Cua Driver 自动更新相关类型
 *
 * 更新完全委托给 cua-driver 自带命令：
 *   - 发现：cua-driver check-update --json [--no-cache]
 *   - 更新：cua-driver update --apply（官方安装器负责下载、Sigstore/SHA256 校验与原子替换）
 * Proma 只负责发起命令、解析结构化输出并展示状态，不自建下载或验签逻辑。
 */

/** cua-driver check-update --json 的输出 */
export interface CuaDriverUpdateCheck {
  cache_hit: boolean
  checked_at: string
  current_channel: string
  current_version: string
  error: string | null
  /** 官方给出的安装命令，如 irm https://cua.ai/driver/install.ps1 | iex */
  install_command: string
  latest_version: string
  release_notes_url: string
  selected_channel: string
  /** 更新源，如 github_releases */
  source: string
  update_available: boolean
}

/** 本地 Cua Driver 安装信息（用于设置页展示） */
export interface CuaDriverInfo {
  /** 是否检测到可执行文件 */
  installed: boolean
  /** 已安装版本，如 0.47.7；未检测到时为空 */
  version: string
  /** 可执行文件绝对路径；未检测到时为空 */
  path: string
  /** 当前平台，如 Windows */
  platform: string
}

/** Cua Driver 更新状态 */
export type CuaDriverUpdateStatus =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'installing'; version: string }
  | { status: 'updated'; version: string; previousVersion?: string }
  | { status: 'not-available'; version: string }
  | { status: 'error'; error: string }

/** check/update 的结构化结果，供 Agent 工具与 IPC 返回 */
export interface CuaDriverUpdateResult {
  status: CuaDriverUpdateStatus['status']
  version: string
  previousVersion?: string
  message: string
  /** 最近一次 check 的原始输出，便于诊断 */
  check?: CuaDriverUpdateCheck
}

/** Cua Driver IPC 通道 */
export const CUA_DRIVER_IPC_CHANNELS = {
  /** 触发检查并按需更新 */
  CHECK_AND_UPDATE: 'cua-driver:check-and-update',
  /** 仅检查，不安装 */
  CHECK: 'cua-driver:check',
  /** 获取本地安装信息（版本/路径/是否已装） */
  GET_INFO: 'cua-driver:get-info',
  /** 获取当前状态 */
  GET_STATUS: 'cua-driver:get-status',
  /** 状态变更事件（main → renderer） */
  ON_STATUS_CHANGED: 'cua-driver:status-changed',
} as const
