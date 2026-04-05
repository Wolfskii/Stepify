import { type BrowserWindow, ipcMain } from 'electron'
import { IPC_WINDOW } from '../../shared/ipc-channels'

export function registerWindowIpc(mainWindow: BrowserWindow): void {
  const broadcastMaximized = (): void => {
    mainWindow.webContents.send(IPC_WINDOW.MAXIMIZED_CHANGED, mainWindow.isMaximized())
  }

  mainWindow.on('maximize', broadcastMaximized)
  mainWindow.on('unmaximize', broadcastMaximized)
  mainWindow.on('enter-full-screen', broadcastMaximized)
  mainWindow.on('leave-full-screen', broadcastMaximized)

  ipcMain.handle(IPC_WINDOW.GET_MAXIMIZED, () => mainWindow.isMaximized())

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
