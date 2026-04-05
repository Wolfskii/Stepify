// Re-export all shared types for use in the renderer

export * from '@shared/constants'
export * from '@shared/types'

// ─── Renderer-only types ──────────────────────────────────────────────────────

/** Extends Window with the typed Electron API bridge injected by preload */
declare global {
  interface Window {
    electronAPI: import('../../../preload/index').ElectronAPI
  }
}
