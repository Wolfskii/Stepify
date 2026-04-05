import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { basename, extname, normalize, sep } from 'node:path'
import Store from 'electron-store'
import fg from 'fast-glob'
import { SUPPORTED_AUDIO_GLOB } from '../../shared/constants'
import type { DanceId, Track, UpdateTrackMetadataPayload } from '../../shared/types'
import {
  buildArtistTitleBasename,
  renameFileCarefully,
  resolveRenamedAudioPath,
} from './audioFilenameRename'
import {
  type PicturePayload,
  parseDataUrlImage,
  writeAudioFileMetadata,
} from './metadataFileWriter'
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

/** Stable key for comparing disk paths (Windows: case-insensitive). */
function localPathKey(filePath: string): string {
  const n = normalize(filePath)
  return process.platform === 'win32' ? n.toLowerCase() : n
}

function libraryDirEntryForPath(dirPath: string) {
  const key = localPathKey(dirPath)
  return settingsService.getLibraryDirectories().find((d) => localPathKey(d.path) === key)
}

/** Rename on-disk file to `Artist - Title.ext` in the same folder; returns new absolute path. */
async function renameLocalAudioToArtistTitle(
  oldPath: string,
  artist: string,
  title: string,
): Promise<{ newPath: string } | { error: string }> {
  const extRaw = extname(oldPath)
  if (!extRaw) return { newPath: oldPath }
  const ext = extRaw.toLowerCase()
  try {
    const base = buildArtistTitleBasename(artist, title)
    const target = await resolveRenamedAudioPath(oldPath, base, ext)
    await renameFileCarefully(oldPath, target)
    return { newPath: target }
  } catch (e) {
    return { error: String(e) }
  }
}

function trackLibraryFieldsChanged(before: Track, after: Track): boolean {
  return (
    before.title !== after.title ||
    before.artist !== after.artist ||
    before.album !== after.album ||
    before.duration !== after.duration ||
    before.bpm !== after.bpm ||
    before.artworkUrl !== after.artworkUrl ||
    before.localPath !== after.localPath ||
    before.missingEmbeddedTitle !== after.missingEmbeddedTitle ||
    before.missingEmbeddedArtist !== after.missingEmbeddedArtist ||
    before.missingEmbeddedArt !== after.missingEmbeddedArt
  )
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
  ): Promise<{
    tracks: Track[]
    newTrackIds: string[]
    removedTrackIds: string[]
    changedTrackIds: string[]
  }> {
    const files = await fg(SUPPORTED_AUDIO_GLOB, {
      cwd: dirPath,
      absolute: true,
      caseSensitiveMatch: false,
    })

    const fileKeySet = new Set(files.map((f) => localPathKey(f)))
    const storeTracks = libraryStore.get('tracks', {})
    const removedTrackIds: string[] = []
    for (const [id, t] of Object.entries(storeTracks)) {
      if (!t.localPath) continue
      if (!isFileUnderDirectory(t.localPath, dirPath)) continue
      if (!fileKeySet.has(localPathKey(t.localPath))) {
        removedTrackIds.push(id)
      }
    }
    if (removedTrackIds.length > 0) {
      const next = { ...storeTracks }
      for (const id of removedTrackIds) {
        delete next[id]
      }
      libraryStore.set('tracks', next)
    }

    const tracks: Track[] = []
    const newTrackIds: string[] = []
    const changedTrackIds: string[] = []
    const existing = libraryStore.get('tracks', {})
    const dirMeta = libraryDirEntryForPath(dirPath)

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i]
      onProgress?.(i + 1, files.length)

      let mtime: number
      try {
        const st = await stat(filePath)
        mtime = Math.trunc(st.mtimeMs)
      } catch {
        continue
      }

      const alreadyIndexed = Object.values(existing).find(
        (t) => t.localPath && localPathKey(t.localPath) === localPathKey(filePath),
      )
      if (alreadyIndexed) {
        if (alreadyIndexed.fileMtimeMs === mtime) {
          tracks.push(this.ensureSingleDance(alreadyIndexed))
          continue
        }
        const merged = await this.rehydrateLocalTrackFromFile(alreadyIndexed, filePath)
        if (!merged) continue
        merged.fileMtimeMs = mtime
        if (trackLibraryFieldsChanged(alreadyIndexed, merged)) {
          changedTrackIds.push(merged.id)
        }
        this.upsertTrack(merged)
        tracks.push(merged)
        continue
      }

      const track = await this.buildTrackFromFile(filePath)
      if (track) {
        track.fileMtimeMs = mtime
        if (dirMeta?.defaultDanceId) {
          track.dances = [dirMeta.defaultDanceId]
        }
        this.upsertTrack(track)
        tracks.push(track)
        newTrackIds.push(track.id)
      }
    }

    return { tracks, newTrackIds, removedTrackIds, changedTrackIds }
  },

  async buildTrackFromFile(filePath: string): Promise<Track | null> {
    try {
      // Dynamic import to avoid bundling issues with native modules
      const { parseFile } = await import('music-metadata')
      const metadata = await parseFile(filePath, { duration: true })

      const { common, format } = metadata
      const fileName = basename(filePath, extname(filePath))

      const artworkUrl = embeddedArtworkDataUrl(common)
      const rawArtist =
        common.artist ??
        (Array.isArray(common.artists) && common.artists.length > 0
          ? common.artists.join(', ')
          : '')
      const hasTitle = Boolean(common.title?.trim())
      const hasArtist = Boolean(String(rawArtist).trim())

      return {
        id: randomUUID(),
        source: 'local',
        title: common.title?.trim() ? common.title.trim() : fileName,
        artist: hasArtist ? String(rawArtist).trim() : 'Unknown Artist',
        album: common.album,
        duration: format.duration ?? 0,
        bpm: common.bpm ?? undefined,
        dances: [],
        localPath: filePath,
        artworkUrl,
        tags: [],
        dateAdded: Date.now(),
        missingEmbeddedTitle: !hasTitle,
        missingEmbeddedArtist: !hasArtist,
        missingEmbeddedArt: !artworkUrl,
      }
    } catch {
      return null
    }
  },

  async rehydrateLocalTrackFromFile(
    existing: Track,
    canonicalPath?: string,
  ): Promise<Track | null> {
    const pathToRead = canonicalPath ?? existing.localPath
    if (!pathToRead) return null
    const fresh = await this.buildTrackFromFile(pathToRead)
    if (!fresh) return null
    const fileBpm =
      fresh.bpm != null && Number.isFinite(fresh.bpm) && fresh.bpm > 0
        ? Math.round(fresh.bpm)
        : undefined
    const bpm = fileBpm ?? existing.bpm
    return {
      ...fresh,
      id: existing.id,
      dances: existing.dances,
      dateAdded: existing.dateAdded,
      tags: existing.tags ?? fresh.tags,
      bpm,
      localPath: canonicalPath ?? fresh.localPath,
    }
  },

  async applyTrackMetadata(
    trackId: string,
    input: UpdateTrackMetadataPayload,
  ): Promise<{ ok: boolean; error?: string; track?: Track }> {
    const track = this.getTrackById(trackId)
    if (!track) return { ok: false, error: 'Track not found' }

    const title = input.title.trim()
    const artist = input.artist.trim()
    if (!title || !artist) return { ok: false, error: 'Title and artist are required' }

    const album = input.album?.trim() || undefined

    let picture: PicturePayload | undefined
    if (input.coverImageUrl?.trim()) {
      try {
        const res = await fetch(input.coverImageUrl.trim(), {
          headers: { 'User-Agent': 'StepifyDesktop/1.0' },
        })
        if (!res.ok) return { ok: false, error: `Cover download failed (${res.status})` }
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length === 0) return { ok: false, error: 'Empty cover image' }
        const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
        picture = { buffer: buf, mime }
      } catch (e) {
        return { ok: false, error: `Cover: ${String(e)}` }
      }
    } else if (input.coverDataUrl?.trim()) {
      const p = parseDataUrlImage(input.coverDataUrl.trim())
      if (!p) return { ok: false, error: 'Invalid cover image data' }
      picture = p
    }

    if (track.source === 'spotify') {
      let artworkUrl = track.artworkUrl
      if (input.coverImageUrl?.trim()) {
        artworkUrl = input.coverImageUrl.trim()
      } else if (picture) {
        if (picture.buffer.length <= MAX_ARTWORK_BYTES) {
          artworkUrl = `data:${picture.mime};base64,${picture.buffer.toString('base64')}`
        }
      }
      const updated: Track = {
        ...track,
        title,
        artist,
        album: album ?? track.album,
        ...(artworkUrl ? { artworkUrl } : {}),
      }
      delete updated.missingEmbeddedTitle
      delete updated.missingEmbeddedArtist
      delete updated.missingEmbeddedArt
      this.upsertTrack(updated)
      return { ok: true, track: updated }
    }

    if (!track.localPath) {
      return { ok: false, error: 'Local file path missing' }
    }

    const ext = extname(track.localPath).toLowerCase()

    if (ext === '.mp3' || ext === '.flac') {
      try {
        await writeAudioFileMetadata(track.localPath, {
          title,
          artist,
          album,
          ...(picture ? { picture } : {}),
        })
      } catch (e) {
        return { ok: false, error: String(e) }
      }

      const renamed = await renameLocalAudioToArtistTitle(track.localPath, artist, title)
      if ('error' in renamed) {
        return { ok: false, error: renamed.error }
      }
      const newPath = renamed.newPath

      const interim: Track = {
        ...track,
        localPath: newPath,
        title,
        artist,
        album: album ?? track.album,
        missingEmbeddedTitle: false,
        missingEmbeddedArtist: false,
        missingEmbeddedArt: track.missingEmbeddedArt,
      }
      this.upsertTrack(interim)

      const re = await this.rehydrateLocalTrackFromFile(interim, newPath)
      if (!re) return { ok: false, error: 'Could not re-read audio file' }
      const merged: Track = {
        ...re,
        missingEmbeddedTitle: false,
        missingEmbeddedArtist: false,
        missingEmbeddedArt: !re.artworkUrl,
      }
      this.upsertTrack(merged)
      return { ok: true, track: merged }
    }

    const renamedOther = await renameLocalAudioToArtistTitle(track.localPath, artist, title)
    if ('error' in renamedOther) {
      return { ok: false, error: renamedOther.error }
    }
    const newPathOther = renamedOther.newPath

    let artworkUrl = track.artworkUrl
    if (picture) {
      if (picture.buffer.length <= MAX_ARTWORK_BYTES) {
        artworkUrl = `data:${picture.mime};base64,${picture.buffer.toString('base64')}`
      } else if (input.coverImageUrl?.trim()) {
        artworkUrl = input.coverImageUrl.trim()
      }
    } else if (input.coverImageUrl?.trim()) {
      artworkUrl = input.coverImageUrl.trim()
    }

    const merged: Track = {
      ...track,
      localPath: newPathOther,
      title,
      artist,
      album: album ?? track.album,
      ...(artworkUrl ? { artworkUrl } : {}),
      missingEmbeddedTitle: false,
      missingEmbeddedArtist: false,
      missingEmbeddedArt: !artworkUrl,
    }
    this.upsertTrack(merged)
    return { ok: true, track: merged }
  },

  /**
   * Re-scan every configured library folder (new files indexed, counts updated).
   * Returns the full persisted library and IDs created in this run.
   */
  async rescanAll(
    onProgress?: (current: number, total: number) => void,
  ): Promise<{
    tracks: Track[]
    newTrackIds: string[]
    removedTrackIds: string[]
    changedTrackIds: string[]
  }> {
    const dirs = settingsService.getLibraryDirectories()
    const allNewIds: string[] = []
    const allRemovedIds: string[] = []
    const allChangedIds: string[] = []

    for (const dir of dirs) {
      const { tracks, newTrackIds, removedTrackIds, changedTrackIds } = await this.scanDirectory(
        dir.path,
        onProgress,
      )
      allNewIds.push(...newTrackIds)
      allRemovedIds.push(...removedTrackIds)
      allChangedIds.push(...changedTrackIds)

      settingsService.set({
        libraryDirectories: settingsService
          .getLibraryDirectories()
          .map((d) => (d.path === dir.path ? { ...d, trackCount: tracks.length } : d)),
      })
    }

    return {
      tracks: this.getAllTracks(),
      newTrackIds: [...new Set(allNewIds)],
      removedTrackIds: [...new Set(allRemovedIds)],
      changedTrackIds: [...new Set(allChangedIds)],
    }
  },
}
