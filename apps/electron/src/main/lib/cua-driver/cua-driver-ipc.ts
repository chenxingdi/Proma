/** Cua Driver 更新 IPC 处理器 */

import { ipcMain } from 'electron'
import { CUA_DRIVER_IPC_CHANNELS } from '@proma/shared'
import type { CuaDriverUpdateStatus, CuaDriverUpdateResult, CuaDriverUpdateCheck, CuaDriverInfo } from '@proma/shared'
import {
  checkAndUpdateCuaDriver,
  checkCuaDriverUpdate,
  getCuaDriverInfo,
  getCuaDriverStatus,
} from './cua-driver-cli'

export function registerCuaDriverIpc(): void {
  ipcMain.handle(
    CUA_DRIVER_IPC_CHANNELS.CHECK_AND_UPDATE,
    async (): Promise<CuaDriverUpdateResult> => checkAndUpdateCuaDriver(true),
  )
  ipcMain.handle(
    CUA_DRIVER_IPC_CHANNELS.CHECK,
    async (): Promise<CuaDriverUpdateCheck> => checkCuaDriverUpdate(),
  )
  ipcMain.handle(
    CUA_DRIVER_IPC_CHANNELS.GET_STATUS,
    async (): Promise<CuaDriverUpdateStatus> => getCuaDriverStatus(),
  )
  ipcMain.handle(
    CUA_DRIVER_IPC_CHANNELS.GET_INFO,
    async (): Promise<CuaDriverInfo> => getCuaDriverInfo(),
  )
}
