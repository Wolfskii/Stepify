import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_AUDIO,
  IPC_LIBRARY,
  IPC_SETTINGS,
  IPC_SPOTIFY,
  IPC_WINDOW,
} from '../shared/ipc-channels'
import type {
  AppSettings,
  DanceId,
  IpcResponse,
  LibraryDirectory,
  SpotifyTrackResult,
  Track,
} from '../shared/types'

/**
 * The electronAPI object is exposed to the renderer on window.electronAPI.
 * All IPC communication must go through this bridge — the renderer has no
 * direct access to Node.js or Electron APIs.
 */
const api = {
  // ─── Library ──────────────────────────────────────────────────────────────

  library: {
    addDirectory: (): Promise<IpcResponse<{ tracks: Track[]; newTrackIds: string[] }>> =>
      ipcRenderer.invoke(IPC_LIBRARY.ADD_DIRECTORY),

    removeDirectory: (path: string): Promise<IpcResponse<{ removedTrackIds: string[] }>> =>
      ipcRenderer.invoke(IPC_LIBRARY.REMOVE_DIRECTORY, path),

    removeTrack: (trackId: string): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke(IPC_LIBRARY.REMOVE_TRACK, trackId),

    getDirectories: (): Promise<IpcResponse<LibraryDirectory[]>> =>
      ipcRenderer.invoke(IPC_LIBRARY.GET_DIRECTORIES),

    getTracks: (danceId?: DanceId): Promise<IpcResponse<Track[]>> =>
      ipcRenderer.invoke(IPC_LIBRARY.GET_TRACKS, danceId),

    assignDance: (trackId: string, danceId: DanceId): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke(IPC_LIBRARY.ASSIGN_DANCE, trackId, danceId),

    unassignDance: (trackId: string, danceId: DanceId): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke(IPC_LIBRARY.UNASSIGN_DANCE, trackId, danceId),

    rescan: (): Promise<IpcResponse<{ tracks: Track[]; newTrackIds: string[] }>> =>
      ipcRenderer.invoke(IPC_LIBRARY.RESCAN),

    saveDetectedBpm: (payload: {
      trackId: string
      filePath: string
      bpm: number
    }): Promise<IpcResponse<void>> => ipcRenderer.invoke(IPC_LIBRARY.SAVE_DETECTED_BPM, payload),

    setTrackBpm: (trackId: string, bpm: number): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke(IPC_LIBRARY.SET_TRACK_BPM, trackId, bpm),

    clearTrackBpm: (trackId: string): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke(IPC_LIBRARY.CLEAR_TRACK_BPM, trackId),

    onScanComplete: (callback: (payload: { tracks: Track[]; newTrackIds: string[] }) => void) => {
      ipcRenderer.on(IPC_LIBRARY.SCAN_COMPLETE, (_event, payload) => callback(payload))
    },

    onScanProgress: (callback: (progress: { current: number; total: number }) => void) => {
      ipcRenderer.on(IPC_LIBRARY.SCAN_PROGRESS, (_event, progress) => callback(progress))
    },
  },

  // ─── Audio ────────────────────────────────────────────────────────────────

  audio: {
    readFile: (filePath: string): Promise<IpcResponse<ArrayBuffer>> =>
      ipcRenderer.invoke(IPC_AUDIO.READ_FILE, filePath),

    getMetadata: (filePath: string): Promise<IpcResponse<{ bpm?: number; duration: number }>> =>
      ipcRenderer.invoke(IPC_AUDIO.GET_METADATA, filePath),
  },

  // ─── Spotify ──────────────────────────────────────────────────────────────

  spotify: {
    login: (): Promise<IpcResponse<void>> => ipcRenderer.invoke(IPC_SPOTIFY.LOGIN),

    logout: (): Promise<IpcResponse<void>> => ipcRenderer.invoke(IPC_SPOTIFY.LOGOUT),

    getAuthStatus: (): Promise<IpcResponse<{ isAuthenticated: boolean; displayName?: string }>> =>
      ipcRenderer.invoke(IPC_SPOTIFY.GET_AUTH_STATUS),

    search: (query: string): Promise<IpcResponse<SpotifyTrackResult[]>> =>
      ipcRenderer.invoke(IPC_SPOTIFY.SEARCH, query),

    getToken: (): Promise<IpcResponse<string>> => ipcRenderer.invoke(IPC_SPOTIFY.GET_TOKEN),

    onLoginComplete: (callback: (success: boolean) => void) => {
      ipcRenderer.on(IPC_SPOTIFY.LOGIN_COMPLETE, (_event, success) => callback(success))
    },
  },

  // ─── Settings ─────────────────────────────────────────────────────────────

  settings: {
    get: (): Promise<IpcResponse<AppSettings>> => ipcRenderer.invoke(IPC_SETTINGS.GET),

    set: (settings: Partial<AppSettings>): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke(IPC_SETTINGS.SET, settings),

    reset: (): Promise<IpcResponse<void>> => ipcRenderer.invoke(IPC_SETTINGS.RESET),
  },

  // ─── Window ───────────────────────────────────────────────────────────────

  window: {
    minimize: () => ipcRenderer.send(IPC_WINDOW.MINIMIZE),
    maximize: () => ipcRenderer.send(IPC_WINDOW.MAXIMIZE),
    close: () => ipcRenderer.send(IPC_WINDOW.CLOSE),
    toggleFullscreen: () => ipcRenderer.send(IPC_WINDOW.TOGGLE_FULLSCREEN),
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
