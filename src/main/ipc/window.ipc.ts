import { type BrowserWindow, ipcMain } from 'electron'
import { IPC_WINDOW } from '../../shared/ipc-channels'

export function registerWindowIpc(mainWindow: BrowserWindow): void {
  ipcMain.on(IPC_WINDOW.MINIMIZE, () => {
    mainWindow.minimize()
  })

  ipcMain.on(IPC_WINDOW.MAXIMIZE, () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  ipcMain.on(IPC_WINDOW.CLOSE, () => {
    mainWindow.close()
  })

  ipcMain.on(IPC_WINDOW.TOGGLE_FULLSCREEN, () => {
    mainWindow.setFullScreen(!mainWindow.isFullScreen())
  })
}
