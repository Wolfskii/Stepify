import { randomUUID } from 'node:crypto'
import { basename, extname, normalize, sep } from 'node:path'
import Store from 'electron-store'
import fg from 'fast-glob'
import { SUPPORTED_AUDIO_GLOB } from '../../shared/constants'
import type { DanceId, Track } from '../../shared/types'
import { settingsService } from './settingsService'

interface LibraryStore {
  tracks: Record<string, Track>
}

const libraryStore = new Store<LibraryStore>({
  name: 'library',
  defaults: { tracks: {} },
})

function isFileUnderDirectory(filePath: string, dirPath: string): boolean {
  const f = normalize(filePath)
  const d = normalize(dirPath)
  const prefix = d.endsWith(sep) ? d : d + sep
  return f.startsWith(prefix)
}

/** Max embedded cover size to store as data URL in library JSON (bytes). */
const MAX_ARTWORK_BYTES = 200 * 1024

function embeddedArtworkDataUrl(common: {
  picture?: Array<{ format?: string; data?: Buffer }>
}): string | undefined {
  const pictures = common.picture
  if (!pictures?.length) return undefined
  const pic = pictures[0]
  if (!pic?.data?.length || pic.data.length > MAX_ARTWORK_BYTES) return undefined
  let mime = pic.format?.trim()
  if (!mime) mime = 'image/jpeg'
  if (!mime.startsWith('image/')) mime = `image/${mime}`
  return `data:${mime};base64,${pic.data.toString('base64')}`
}

export const libraryService = {
  // ─── Tracks ───────────────────────────────────────────────────────────────

  getAllTracks(): Track[] {
    return Object.values(libraryStore.get('tracks', {})).map((t) => this.ensureSingleDance(t))
  },

  getTracksByDance(danceId: DanceId): Track[] {
    return this.getAllTracks().filter((t) => t.dances.includes(danceId))
  },

  getTrackById(id: string): Track | undefined {
    return libraryStore.get('tracks', {})[id]
  },

  /** One dance per track: assign replaces; migrate legacy multi-tag rows. */
  ensureSingleDance(track: Track): Track {
    if (track.dances.length <= 1) return track
    const fixed: Track = { ...track, dances: [track.dances[0]] }
    this.upsertTrack(fixed)
    return fixed
  },

  upsertTrack(track: Track): void {
    const tracks = libraryStore.get('tracks', {})
    tracks[track.id] = track
    libraryStore.set('tracks', tracks)
  },

  assignDance(trackId: string, danceId: DanceId): boolean {
    const tracks = libraryStore.get('tracks', {})
    const track = tracks[trackId]
    if (!track) return false
    track.dances = [danceId]
    libraryStore.set('tracks', tracks)
    return true
  },

  unassignDance(trackId: string, danceId: DanceId): boolean {
    const tracks = libraryStore.get('tracks', {})
    const track = tracks[trackId]
    if (!track) return false
    track.dances = track.dances.filter((d) => d !== danceId)
    libraryStore.set('tracks', tracks)
    return true
  },

  setTrackBpm(trackId: string, bpm: number): boolean {
    const tracks = libraryStore.get('tracks', {})
    const track = tracks[trackId]
    if (!track) return false
    tracks[trackId] = { ...track, bpm: Math.round(bpm) }
    libraryStore.set('tracks', tracks)
    return true
  },

  clearTrackBpm(trackId: string): boolean {
    const tracks = libraryStore.get('tracks', {})
    const track = tracks[trackId]
    if (!track) return false
    const next: Track = { ...track }
    delete next.bpm
    tracks[trackId] = next
    libraryStore.set('tracks', tracks)
    return true
  },

  removeTrack(trackId: string): boolean {
    const tracks = libraryStore.get('tracks', {})
    if (!tracks[trackId]) return false
    delete tracks[trackId]
    libraryStore.set('tracks', tracks)
    return true
  },

  /** Remove every indexed track whose file path lies under `dirPath`. */
  removeTracksUnderDirectory(dirPath: string): string[] {
    const tracks = libraryStore.get('tracks', {})
    const removed: string[] = []
    for (const [id, t] of Object.entries(tracks)) {
      if (t.localPath && isFileUnderDirectory(t.localPath, dirPath)) {
        delete tracks[id]
        removed.push(id)
      }
    }
    libraryStore.set('tracks', tracks)
    return removed
  },

  // ─── Directory Scanning ───────────────────────────────────────────────────

  async scanDirectory(
    dirPath: string,
    onProgress?: (current: number, total: number) => void,
  ): Promise<{ tracks: Track[]; newTrackIds: string[] }> {
    const files = await fg(SUPPORTED_AUDIO_GLOB, {
      cwd: dirPath,
      absolute: true,
      caseSensitiveMatch: false,
    })

    const tracks: Track[] = []
    const newTrackIds: string[] = []
    const existing = libraryStore.get('tracks', {})

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i]
      onProgress?.(i + 1, files.length)

      // Skip if already indexed (path-based dedup)
      const alreadyIndexed = Object.values(existing).find((t) => t.localPath === filePath)
      if (alreadyIndexed) {
        tracks.push(this.ensureSingleDance(alreadyIndexed))
        continue
      }

      const track = await this.buildTrackFromFile(filePath)
      if (track) {
        this.upsertTrack(track)
        tracks.push(track)
        newTrackIds.push(track.id)
      }
    }

    return { tracks, newTrackIds }
  },

  async buildTrackFromFile(filePath: string): Promise<Track | null> {
    try {
      // Dynamic import to avoid bundling issues with native modules
      const { parseFile } = await import('music-metadata')
      const metadata = await parseFile(filePath, { duration: true })

      const { common, format } = metadata
      const fileName = basename(filePath, extname(filePath))

      const artworkUrl = embeddedArtworkDataUrl(common)

      return {
        id: randomUUID(),
        source: 'local',
        title: common.title ?? fileName,
        artist: common.artist ?? 'Unknown Artist',
        album: common.album,
        duration: format.duration ?? 0,
        bpm: common.bpm ?? undefined,
        dances: [],
        localPath: filePath,
        ...(artworkUrl ? { artworkUrl } : {}),
        tags: [],
        dateAdded: Date.now(),
      }
    } catch {
      return null
    }
  },

  /**
   * Re-scan every configured library folder (new files indexed, counts updated).
   * Returns the full persisted library and IDs created in this run.
   */
  async rescanAll(
    onProgress?: (current: number, total: number) => void,
  ): Promise<{ tracks: Track[]; newTrackIds: string[] }> {
    const dirs = settingsService.getLibraryDirectories()
    const allNewIds: string[] = []

    for (const dir of dirs) {
      const { tracks, newTrackIds } = await this.scanDirectory(dir.path, onProgress)
      allNewIds.push(...newTrackIds)

      settingsService.set({
        libraryDirectories: settingsService
          .getLibraryDirectories()
          .map((d) => (d.path === dir.path ? { ...d, trackCount: tracks.length } : d)),
      })
    }

    return {
      tracks: this.getAllTracks(),
      newTrackIds: [...new Set(allNewIds)],
    }
  },
}
