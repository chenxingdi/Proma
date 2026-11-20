/** cua-driver check-update --json 输出解析（无 Electron 依赖，便于测试）。 */

import type { CuaDriverUpdateCheck } from '@proma/shared'

/** 解析 check-update --json 输出。失败返回 null，不抛错。 */
export function parseCheckUpdateOutput(raw: string): CuaDriverUpdateCheck | null {
  try {
    const data = JSON.parse(raw) as Partial<CuaDriverUpdateCheck>
    if (typeof data.current_version !== 'string' || typeof data.latest_version !== 'string') {
      return null
    }
    return {
      cache_hit: data.cache_hit ?? false,
      checked_at: data.checked_at ?? '',
      current_channel: data.current_channel ?? '',
      current_version: data.current_version,
      error: data.error ?? null,
      install_command: data.install_command ?? '',
      latest_version: data.latest_version,
      release_notes_url: data.release_notes_url ?? '',
      selected_channel: data.selected_channel ?? '',
      source: data.source ?? '',
      update_available: data.update_available ?? false,
    }
  } catch {
    return null
  }
}
