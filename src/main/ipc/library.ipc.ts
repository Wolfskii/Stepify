import { type BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC_LIBRARY } from '../../shared/ipc-channels'
import type {
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
import { searchTrackMetadataOnline } from '../services/metadataSearchService'
import { writeBpmToAudioFile } from '../services/metadataBpmWriter'
import { settingsService } from '../services/settingsService'

export function registerLibraryIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle(
    IPC_LIBRARY.ADD_DIRECTORY,
    async (): Promise<IpcResponse<LibraryDiskSyncPayload>> => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'multiSelections'],
        title: 'Add Music Directory',
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'No directory selected' }
      }

      const allTracks: Track[] = []
      const allNewIds: string[] = []
      const allRemovedIds: string[] = []
      const allChangedIds: string[] = []

      for (const dirPath of result.filePaths) {
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
            .map((d) => (d.path === dirPath ? { ...d, trackCount: tracks.length } : d)),
        })
      }

      const newTrackIds = [...new Set(allNewIds)]
      const removedTrackIds = [...new Set(allRemovedIds)]
      const changedTrackIds = [...new Set(allChangedIds)]

      restartLibraryFolderWatcher(mainWindow)

      return {
        success: true,
        data: { tracks: allTracks, newTrackIds, removedTrackIds, changedTrackIds },
      }
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
    async (
      _event,
      dirPath: string,
      danceId: DanceId | null,
    ): Promise<IpcResponse<void>> => {
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

  ipcMain.handle(
    IPC_LIBRARY.RESCAN,
    async (): Promise<IpcResponse<LibraryDiskSyncPayload>> => {
      const data = await libraryService.rescanAll((current, total) => {
        mainWindow.webContents.send(IPC_LIBRARY.SCAN_PROGRESS, { current, total })
      })
      return { success: true, data }
    },
  )

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
    async (
      _event,
      payload: UpdateTrackMetadataPayload,
    ): Promise<IpcResponse<Track>> => {
      const r = await libraryService.applyTrackMetadata(payload.trackId, payload)
      if (!r.ok || !r.track) {
        return { success: false, error: r.error ?? 'Update failed' }
      }
      return { success: true, data: r.track }
    },
  )

  restartLibraryFolderWatcher(mainWindow)
}
