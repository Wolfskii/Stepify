import { type BrowserWindow, ipcMain } from 'electron'
import { IPC_SPOTIFY } from '../../shared/ipc-channels'
import type { IpcResponse, SpotifyTrackResult } from '../../shared/types'
import { settingsService } from '../services/settingsService'
import { spotifyAuthService } from '../services/spotifyAuthService'

export function registerSpotifyIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_SPOTIFY.LOGIN, async (): Promise<IpcResponse<void>> => {
    const settings = settingsService.get()
    const clientId = settings.spotifyClientId

    if (!clientId) {
      return {
        success: false,
        error: 'Spotify Client ID not configured. Set it in Settings.',
      }
    }

    const success = await spotifyAuthService.login(clientId)
    mainWindow.webContents.send(IPC_SPOTIFY.LOGIN_COMPLETE, success)
    return success ? { success: true } : { success: false, error: 'Login failed or was cancelled' }
  })

  ipcMain.handle(IPC_SPOTIFY.LOGOUT, async (): Promise<IpcResponse<void>> => {
    spotifyAuthService.logout()
    return { success: true }
  })

  ipcMain.handle(
    IPC_SPOTIFY.GET_AUTH_STATUS,
    async (): Promise<IpcResponse<{ isAuthenticated: boolean; displayName?: string }>> => {
      const isAuthenticated = spotifyAuthService.isAuthenticated()
      return {
        success: true,
        data: {
          isAuthenticated,
          displayName: undefined, // TODO: fetch from /me endpoint after auth
        },
      }
    },
  )

  ipcMain.handle(
    IPC_SPOTIFY.SEARCH,
    async (_event, query: string): Promise<IpcResponse<SpotifyTrackResult[]>> => {
      // TODO: implement actual Spotify search using the Web API
      // Requires a valid access token from spotifyAuthService.getCredentials()
      console.log('[Spotify] Search not yet implemented. Query:', query)
      return { success: true, data: [] }
    },
  )

  ipcMain.handle(IPC_SPOTIFY.GET_TOKEN, async (): Promise<IpcResponse<string>> => {
    const creds = spotifyAuthService.getCredentials()
    if (!creds) return { success: false, error: 'Not authenticated' }
    // TODO: refresh token if expired
    return { success: true, data: creds.accessToken }
  })
}
