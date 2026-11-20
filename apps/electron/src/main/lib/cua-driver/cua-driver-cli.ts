/**
 * Cua Driver 官方更新命令封装
 *
 * 发现与更新完全交给 cua-driver 自带命令，Proma 不自建下载/验签：
 *   - check-update --json：自动发现新版本（默认 20h 缓存，可用 --no-cache 强制）
 *   - update --apply：官方安装器下载并安装，内含 Sigstore + SHA256SUMS 校验
 *
 * 通过 CUA_DRIVER_RS_REQUIRE_SIGNATURE=1 强制签名校验；镜像源可通过
 * CUA_DRIVER_RS_DOWNLOAD_BASE_URL 配置（当前走官方 cua.ai / GitHub Releases）。
 */

import { existsSync } from 'node:fs'
import { homedir, platform as osPlatform } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import type {
  CuaDriverInfo,
  CuaDriverUpdateCheck,
  CuaDriverUpdateResult,
  CuaDriverUpdateStatus,
} from '@proma/shared'
import { CUA_DRIVER_IPC_CHANNELS } from '@proma/shared'
import { execFileAsync } from '../async-command'
import { parseCheckUpdateOutput } from './cua-driver-parse'

let currentStatus: CuaDriverUpdateStatus = { status: 'idle' }
let inFlight: Promise<CuaDriverUpdateResult> | null = null
/** 成功检查后的一段时间内，自动发现不再重复请求 GitHub。 */
let lastCheckedAt = 0
const CHECK_THROTTLE_MS = 10 * 60 * 1000

/** 强制官方安装器校验 Sigstore bundle + SHA256SUMS + 每个二进制哈希。 */
function signedEnv(): NodeJS.ProcessEnv {
  return { ...process.env, CUA_DRIVER_RS_REQUIRE_SIGNATURE: '1' }
}

/**
 * 发现 cua-driver 可执行文件。
 * 顺序：PATH（where/which）→ 官方已知安装目录（~/.cua-driver/packages/current/<exe>）。
 */
export function resolveCuaDriverExecutable(): string | null {
  const exe = osPlatform() === 'win32' ? 'cua-driver.exe' : 'cua-driver'
  const candidates = [
    join(homedir(), '.cua-driver', 'packages', 'current', exe),
    join(homedir(), '.cua-driver', 'bin', exe),
  ]
  if (osPlatform() === 'darwin') {
    candidates.push(`/usr/local/bin/${exe}`, `/opt/homebrew/bin/${exe}`)
  } else if (osPlatform() === 'linux') {
    candidates.push(`/usr/local/bin/${exe}`)
  }
  return candidates.find((candidate) => existsSync(candidate)) ?? exe
}

/** 平台展示名。 */
function platformLabel(): string {
  switch (osPlatform()) {
    case 'win32': return 'Windows'
    case 'darwin': return 'macOS'
    case 'linux': return 'Linux'
    default: return osPlatform()
  }
}

/** 读取本地 Cua Driver 安装信息（版本 + 路径），供设置页展示。 */
export async function getCuaDriverInfo(): Promise<CuaDriverInfo> {
  const exe = resolveCuaDriverExecutable()
  if (!exe || !existsSync(exe)) {
    return { installed: false, version: '', path: '', platform: platformLabel() }
  }
  let version = ''
  try {
    const { stdout } = await execFileAsync(exe, ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
      env: signedEnv(),
    })
    const match = stdout.match(/(\d+\.\d+\.\d+)/)
    version = match?.[1] ?? ''
  } catch (error) {
    console.warn('[Cua Driver] 读取版本失败:', error)
  }
  return { installed: true, version, path: exe, platform: platformLabel() }
}

/** 调用官方 check-update --json。 */
export async function checkCuaDriverUpdate(options?: { noCache?: boolean }): Promise<CuaDriverUpdateCheck> {
  const bin = resolveCuaDriverExecutable()
  const args = ['check-update', '--json']
  if (options?.noCache) args.push('--no-cache')
  const { stdout } = await execFileAsync(bin, args, {
    encoding: 'utf-8',
    timeout: 30_000,
    env: signedEnv(),
  })
  const parsed = parseCheckUpdateOutput(stdout)
  if (!parsed) throw new Error(`无法解析 cua-driver check-update 输出：${stdout.slice(0, 200)}`)
  return parsed
}

function setStatus(status: CuaDriverUpdateStatus): void {
  currentStatus = status
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(CUA_DRIVER_IPC_CHANNELS.ON_STATUS_CHANGED, status)
    }
  }
}

export function getCuaDriverStatus(): CuaDriverUpdateStatus {
  return currentStatus
}

/**
 * 发现即更新：检查到新版本就调用官方 update --apply 安装。
 * 并发调用共享同一个 Promise，避免重复安装。
 */
export function checkAndUpdateCuaDriver(force = false): Promise<CuaDriverUpdateResult> {
  if (inFlight) return inFlight
  if (!force && Date.now() - lastCheckedAt < CHECK_THROTTLE_MS) {
    return Promise.resolve({
      status: currentStatus.status,
      version: currentStatus.status === 'idle' ? '' : ('version' in currentStatus ? currentStatus.version : ''),
      message: '近期已完成检查，跳过重复检查',
    })
  }
  inFlight = doCheckAndUpdate()
    .then((result) => { lastCheckedAt = Date.now(); return result })
    .finally(() => { inFlight = null })
  return inFlight
}

async function doCheckAndUpdate(): Promise<CuaDriverUpdateResult> {
  try {
    setStatus({ status: 'checking' })
    const check = await checkCuaDriverUpdate({ noCache: true })

    if (!check.update_available) {
      setStatus({ status: 'not-available', version: check.current_version })
      return {
        status: 'not-available',
        version: check.current_version,
        message: `Cua Driver 已是最新版本 ${check.current_version}`,
        check,
      }
    }

    setStatus({ status: 'installing', version: check.latest_version })
    const bin = resolveCuaDriverExecutable()
    const { stdout, stderr } = await execFileAsync(bin, ['update', '--apply', '--json'], {
      encoding: 'utf-8',
      timeout: 5 * 60_000,
      env: signedEnv(),
    })
    console.log('[Cua Driver] 官方安装器输出:', stdout.trim() || stderr.trim())

    setStatus({ status: 'updated', version: check.latest_version, previousVersion: check.current_version })
    return {
      status: 'updated',
      version: check.latest_version,
      previousVersion: check.current_version,
      message: `Cua Driver 已从 ${check.current_version} 更新到 ${check.latest_version}（官方安装器，已强制签名校验）`,
      check,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[Cua Driver] 更新失败:', error)
    setStatus({ status: 'error', error: message })
    return { status: 'error', version: '', message }
  }
}
