import { ipcMain } from 'electron'
import { IPC_SETTINGS } from '../../shared/ipc-channels'
import type { AppSettings, IpcResponse } from '../../shared/types'
import { settingsService } from '../services/settingsService'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC_SETTINGS.GET, async (): Promise<IpcResponse<AppSettings>> => {
    return { success: true, data: settingsService.get() }
  })

  ipcMain.handle(
    IPC_SETTINGS.SET,
    async (_event, partial: Partial<AppSettings>): Promise<IpcResponse<void>> => {
      settingsService.set(partial)
      return { success: true }
    },
  )

  ipcMain.handle(IPC_SETTINGS.RESET, async (): Promise<IpcResponse<void>> => {
    settingsService.reset()
    return { success: true }
  })
}
