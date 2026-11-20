/**
 * Cua Driver 更新结果判定（纯函数，无 Electron 依赖，便于单元测试）。
 *
 * 背景：官方安装器 `update --apply` 可能已经完成二进制替换，但因陈旧 daemon
 * 等副作用返回非零退出码。此时必须以磁盘实际版本为准，避免把“已装好”误报为失败。
 */

export interface InstallOutcome {
  updated: boolean
  version: string
  previousVersion?: string
  /** daemon 可能仍是旧协议，需要重启（安装器报错但已装新版本时为 true） */
  daemonRestartNeeded: boolean
  message: string
}

export interface ResolveInstallOutcomeParams {
  targetVersion: string
  currentVersion: string
  installedVersion: string
  installerError?: string
  installerSucceeded: boolean
}

/**
 * 简单 SemVer 三段比较：a>b 返回正数，相等返回 0，a<b 返回负数。
 * 无法解析时返回 0（视为相等），避免误判版本变化。
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.match(/(\d+)\.(\d+)\.(\d+)/)
  const pb = b.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!pa || !pb) return 0
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i])
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * 根据目标版本与磁盘实际版本判定更新结果。
 * - 实际版本已达到目标（含更高）→ 视为更新成功；若安装器报错则提示需重启 daemon。
 * - 安装器成功但未读到更高版本 → 仍按成功处理，使用目标版本，避免误报。
 * - 安装器报错且版本未变 → 视为失败，返回安装器原始错误。
 */
export function resolveInstallOutcome(params: ResolveInstallOutcomeParams): InstallOutcome {
  const { targetVersion, currentVersion, installedVersion, installerError, installerSucceeded } = params
  const reachedTarget = !!installedVersion && compareVersions(installedVersion, targetVersion) >= 0

  if (reachedTarget) {
    const daemonRestartNeeded = !installerSucceeded
    const note = daemonRestartNeeded
      ? '；安装器报告旧 daemon 未退出，请重启 daemon 后使用（cua-driver stop && cua-driver autostart kick）'
      : ''
    return {
      updated: true,
      version: installedVersion || targetVersion,
      previousVersion: currentVersion,
      daemonRestartNeeded,
      message: `Cua Driver 已从 ${currentVersion} 更新到 ${installedVersion || targetVersion}（官方安装器，已强制签名校验）${note}`,
    }
  }

  if (installerSucceeded) {
    return {
      updated: true,
      version: targetVersion,
      previousVersion: currentVersion,
      daemonRestartNeeded: false,
      message: `Cua Driver 更新命令已执行完成（目标 ${targetVersion}，官方安装器，已强制签名校验）`,
    }
  }

  return {
    updated: false,
    version: '',
    previousVersion: currentVersion,
    daemonRestartNeeded: false,
    message: installerError || 'Cua Driver 更新失败',
  }
}
