import { stat } from 'node:fs/promises'
import path from 'node:path'
import { type BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IPC_LIBRARY } from '../../shared/ipc-channels'
import type {
  AddLibraryPathsResult,
  DanceId,
  IpcResponse,
  LibraryDirectory,
  LibraryDiskSyncPayload,
  MetadataSearchHit,
  Track,
  UpdateTrackMetadataPayload,
} from '../../shared/types'
import { restartLibraryFolderWatcher } from '../services/libraryFolderWatcher'
import { libraryService } from '../services/libraryService'
import { writeBpmToAudioFile } from '../services/metadataBpmWriter'
import { searchTrackMetadataOnline } from '../services/metadataSearchService'
import { settingsService } from '../services/settingsService'

function normalizeLibraryDirKey(dirPath: string): string {
  const resolved = path.resolve(dirPath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/**
 * Resolve, validate, dedupe, skip existing roots, then scan new folders (dialog or drag-drop).
 */
async function processAddedLibraryPaths(
  mainWindow: BrowserWindow,
  rawPaths: string[],
): Promise<AddLibraryPathsResult> {
  const alreadyAddedPaths: string[] = []
  const invalidPaths: string[] = []
  const toScan: string[] = []

  const existing = settingsService.getLibraryDirectories()
  const existingKeys = new Set(existing.map((d) => normalizeLibraryDirKey(d.path)))
  const seenInBatch = new Set<string>()

  const uniqueRaw = [...new Set(rawPaths.map((p) => p.trim()).filter(Boolean))]

  for (const raw of uniqueRaw) {
    const resolved = path.resolve(raw)
    const key = normalizeLibraryDirKey(resolved)
    if (seenInBatch.has(key)) continue
    seenInBatch.add(key)

    try {
      const st = await stat(resolved)
      if (!st.isDirectory()) {
        invalidPaths.push(resolved)
        continue
      }
    } catch {
      invalidPaths.push(resolved)
      continue
    }

    if (existingKeys.has(key)) {
      alreadyAddedPaths.push(resolved)
      continue
    }

    existingKeys.add(key)
    toScan.push(resolved)
  }

  const allTracks: Track[] = []
  const allNewIds: string[] = []
  const allRemovedIds: string[] = []
  const allChangedIds: string[] = []

  for (const dirPath of toScan) {
    settingsService.addLibraryDirectory({
      path: dirPath,
      dateAdded: Date.now(),
      trackCount: 0,
    })

    const { tracks, newTrackIds, removedTrackIds, changedTrackIds } =
      await libraryService.scanDirectory(dirPath, (current, total) => {
        mainWindow.webContents.send(IPC_LIBRARY.SCAN_PROGRESS, { current, total })
      })

    allTracks.push(...tracks)
    allNewIds.push(...newTrackIds)
    allRemovedIds.push(...removedTrackIds)
    allChangedIds.push(...changedTrackIds)

    settingsService.set({
      libraryDirectories: settingsService
        .getLibraryDirectories()
        .map((d) =>
          normalizeLibraryDirKey(d.path) === normalizeLibraryDirKey(dirPath)
            ? { ...d, trackCount: tracks.length }
            : d,
        ),
    })
  }

  restartLibraryFolderWatcher(mainWindow)

  return {
    tracks: allTracks,
    newTrackIds: [...new Set(allNewIds)],
    removedTrackIds: [...new Set(allRemovedIds)],
    changedTrackIds: [...new Set(allChangedIds)],
    alreadyAddedPaths,
    invalidPaths,
    newlyAddedRootPaths: [...toScan],
  }
}

export function registerLibraryIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle(
    IPC_LIBRARY.ADD_DIRECTORY,
    async (): Promise<IpcResponse<AddLibraryPathsResult>> => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'multiSelections'],
        title: 'Add Music Directory',
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'No directory selected' }
      }

      const data = await processAddedLibraryPaths(mainWindow, result.filePaths)
      return { success: true, data }
    },
  )

  ipcMain.handle(
    IPC_LIBRARY.ADD_DIRECTORY_PATHS,
    async (_event, paths: unknown): Promise<IpcResponse<AddLibraryPathsResult>> => {
      if (!Array.isArray(paths) || paths.some((p) => typeof p !== 'string')) {
        return { success: false, error: 'Expected an array of path strings' }
      }
      if (paths.length === 0) {
        return { success: false, error: 'No paths provided' }
      }
      const data = await processAddedLibraryPaths(mainWindow, paths as string[])
      return { success: true, data }
    },
  )

  ipcMain.handle(
    IPC_LIBRARY.REMOVE_DIRECTORY,
    async (_event, path: string): Promise<IpcResponse<{ removedTrackIds: string[] }>> => {
      const removedTrackIds = libraryService.removeTracksUnderDirectory(path)
      settingsService.removeLibraryDirectory(path)
      restartLibraryFolderWatcher(mainWindow)
      return { success: true, data: { removedTrackIds } }
    },
  )

  ipcMain.handle(
    IPC_LIBRARY.REMOVE_TRACK,
    async (_event, trackId: string): Promise<IpcResponse<void>> => {
      const ok = libraryService.removeTrack(trackId)
      return ok ? { success: true } : { success: false, error: 'Track not found' }
    },
  )

  ipcMain.handle(
    IPC_LIBRARY.GET_DIRECTORIES,
    async (): Promise<IpcResponse<LibraryDirectory[]>> => {
      const dirs = settingsService.getLibraryDirectories()
      return { success: true, data: dirs }
    },
  )

  ipcMain.handle(
    IPC_LIBRARY.SET_FOLDER_DEFAULT_DANCE,
    async (_event, dirPath: string, danceId: DanceId | null): Promise<IpcResponse<void>> => {
      const ok = settingsService.setLibraryFolderDefaultDance(dirPath, danceId)
      return ok ? { success: true } : { success: false, error: 'Folder not found' }
    },
  )

  ipcMain.handle(
    IPC_LIBRARY.GET_TRACKS,
    async (_event, danceId?: DanceId): Promise<IpcResponse<Track[]>> => {
      const tracks = danceId
        ? libraryService.getTracksByDance(danceId)
        : libraryService.getAllTracks()
      return { success: true, data: tracks }
    },
  )

  ipcMain.handle(
    IPC_LIBRARY.ASSIGN_DANCE,
    async (_event, trackId: string, danceId: DanceId): Promise<IpcResponse<void>> => {
      const ok = libraryService.assignDance(trackId, danceId)
      return ok ? { success: true } : { success: false, error: 'Track not found' }
    },
  )

  ipcMain.handle(
    IPC_LIBRARY.UNASSIGN_DANCE,
    async (_event, trackId: string, danceId: DanceId): Promise<IpcResponse<void>> => {
      const ok = libraryService.unassignDance(trackId, danceId)
      return ok ? { success: true } : { success: false, error: 'Track not found' }
    },
  )

  ipcMain.handle(IPC_LIBRARY.RESCAN, async (): Promise<IpcResponse<LibraryDiskSyncPayload>> => {
    const data = await libraryService.rescanAll((current, total) => {
      mainWindow.webContents.send(IPC_LIBRARY.SCAN_PROGRESS, { current, total })
    })
    return { success: true, data }
  })

  ipcMain.handle(
    IPC_LIBRARY.SAVE_DETECTED_BPM,
    async (
      _event,
      payload: { trackId: string; filePath: string; bpm: number },
    ): Promise<IpcResponse<void>> => {
      try {
        const track = libraryService.getTrackById(payload.trackId)
        if (!track?.localPath || track.localPath !== payload.filePath) {
          return { success: false, error: 'Track or path mismatch' }
        }
        if (!(payload.bpm > 0)) {
          return { success: false, error: 'Invalid BPM' }
        }
        await writeBpmToAudioFile(payload.filePath, payload.bpm)
        libraryService.setTrackBpm(payload.trackId, payload.bpm)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_LIBRARY.SET_TRACK_BPM,
    async (_event, trackId: string, bpm: number): Promise<IpcResponse<void>> => {
      const ok = libraryService.setTrackBpm(trackId, bpm)
      return ok ? { success: true } : { success: false, error: 'Track not found' }
    },
  )

  ipcMain.handle(
    IPC_LIBRARY.CLEAR_TRACK_BPM,
    async (_event, trackId: string): Promise<IpcResponse<void>> => {
      const ok = libraryService.clearTrackBpm(trackId)
      return ok ? { success: true } : { success: false, error: 'Track not found' }
    },
  )

  ipcMain.handle(
    IPC_LIBRARY.SEARCH_TRACK_METADATA,
    async (_event, query: string): Promise<IpcResponse<MetadataSearchHit[]>> => {
      try {
        const data = await searchTrackMetadataOnline(query)
        return { success: true, data }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_LIBRARY.UPDATE_TRACK_METADATA,
    async (_event, payload: UpdateTrackMetadataPayload): Promise<IpcResponse<Track>> => {
      const r = await libraryService.applyTrackMetadata(payload.trackId, payload)
      if (!r.ok || !r.track) {
        return { success: false, error: r.error ?? 'Update failed' }
      }
      return { success: true, data: r.track }
    },
  )

  ipcMain.handle(
    IPC_LIBRARY.OPEN_LIBRARY_FOLDER,
    async (_event, dirPath: string): Promise<IpcResponse<void>> => {
      const trimmed = dirPath?.trim()
      if (!trimmed) return { success: false, error: 'No folder path' }
      const resolved = path.resolve(trimmed)
      const known = settingsService
        .getLibraryDirectories()
        .some((d) => normalizeLibraryDirKey(d.path) === normalizeLibraryDirKey(resolved))
      if (!known) return { success: false, error: 'Not a registered library folder' }
      try {
        const st = await stat(resolved)
        if (!st.isDirectory()) return { success: false, error: 'Path is not a folder' }
      } catch {
        return { success: false, error: 'Folder not found' }
      }
      const err = await shell.openPath(resolved)
      if (err) return { success: false, error: err }
      return { success: true }
    },
  )

  restartLibraryFolderWatcher(mainWindow)
}
