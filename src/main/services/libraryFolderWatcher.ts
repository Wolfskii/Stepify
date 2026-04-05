import { sep } from 'node:path'
import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import chokidar from 'chokidar'
import { IPC_LIBRARY } from '../../shared/ipc-channels'
import { libraryService } from './libraryService'
import { settingsService } from './settingsService'

/** Coalesce bursts of filesystem events before scanning (copying albums, etc.). */
const DEBOUNCE_MS = 3500

let watcher: ReturnType<typeof chokidar.watch> | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let syncInFlight = false
let boundWindow: BrowserWindow | null = null
let willQuitHooked = false

function clearDebounce(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

async function runDebouncedSync(): Promise<void> {
  const win = boundWindow
  if (!win || win.isDestroyed()) return
  if (syncInFlight) return
  syncInFlight = true
  try {
    const { tracks, newTrackIds, removedTrackIds, changedTrackIds } =
      await libraryService.rescanAll()
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_LIBRARY.SCAN_COMPLETE, {
        tracks,
        newTrackIds,
        removedTrackIds,
        changedTrackIds,
      })
    }
  } finally {
    syncInFlight = false
  }
}

function scheduleSync(): void {
  clearDebounce()
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void runDebouncedSync()
  }, DEBOUNCE_MS)
}

export function stopLibraryFolderWatcher(): void {
  clearDebounce()
  if (watcher) {
    void watcher.close()
    watcher = null
  }
  boundWindow = null
}

/**
 * Watch library roots for adds/changes. Debounced full rescan — one pass per burst, not per file event.
 */
export function restartLibraryFolderWatcher(mainWindow: BrowserWindow): void {
  stopLibraryFolderWatcher()
  boundWindow = mainWindow

  if (!willQuitHooked) {
    willQuitHooked = true
    app.on('will-quit', stopLibraryFolderWatcher)
  }

  const dirs = settingsService.getLibraryDirectories().map((d) => d.path)
  if (dirs.length === 0) return

  watcher = chokidar.watch(dirs, {
    ignoreInitial: true,
    ignorePermissionErrors: true,
    awaitWriteFinish: { stabilityThreshold: 600, pollInterval: 200 },
    depth: 20,
    ignored: (p: string) => p.includes(`${sep}.`),
  })

  watcher.on('all', () => scheduleSync())
  watcher.on('error', () => {})
}
