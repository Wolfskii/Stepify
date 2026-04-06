import { DANCE_CATEGORIES, DANCE_CATEGORIES_BY_ID } from '@shared/constants'
import type {
  AddLibraryPathsResult,
  DanceId,
  LibraryDirectory,
  LibraryDiskSyncPayload,
  PlaybackState,
  Track,
  TrackListSort,
  TrackListSortKey,
} from '@shared/types'
import { derived, get, writable } from 'svelte/store'
import { resolveBpmForLocalTrack } from '../services/bpmAnalysis'
import { trackNeedsMetadataEnrichment } from '../utils/metadataQuery'
import {
  DEFAULT_TRACK_LIST_SORT,
  filterTracksForListView,
  pathsEqualLibrary,
  reorderVisibleIds,
  sortTracksForListView,
  trackFileUnderLibraryFolder,
  weightedShuffleByPopularity,
} from '../utils/trackListFilter'
import { logTrackReorder } from '../utils/trackReorderDebug'
import { uiActions } from './ui.store'

interface LibraryState {
  tracks: Track[]
  libraryDirectories: LibraryDirectory[]
  isScanning: boolean
  scanProgress: { current: number; total: number } | null
  selectedDanceId: DanceId | null
  /** Library root path when browsing tracks from one folder (mutually exclusive with dance filter). */
  selectedFolderPath: string | null
  searchQuery: string
  /** Multi-select in the track list (Ctrl/Cmd/Shift + click) */
  selectedTrackIds: string[]
  /** Anchor index in the current visible list for shift-range selection */
  selectionAnchorIndex: number | null
  /**
   * When shuffle is on, list order follows this id sequence (same filters as when shuffle was toggled).
   */
  shuffleQueueOrderIds: string[] | null
  /** Filters that must match the sidebar for `shuffleQueueOrderIds` to apply to the list. */
  shuffleDisplayContext: {
    danceId: DanceId | null
    folderPath: string | null
    searchQuery: string
  } | null
  /**
   * List sort + row popularity readout use this score when set; persisted `Track.popularityScore` stays updated.
   * Used when liking or disliking the **currently playing** track so the list does not resort mid-session (avoids queue/order surprises).
   */
  deferredListPopularityByTrackId: Record<string, number>
  /** User-chosen column sort (shuffle list order overrides until a sort header is used). */
  trackListSort: TrackListSort
  /**
   * When set (and context matches the sidebar), list order follows this sequence instead of column sort.
   * Cleared when changing sort, filter, or turning shuffle on.
   */
  manualListOrderIds: string[] | null
  manualListDisplayContext: {
    danceId: DanceId | null
    folderPath: string | null
    searchQuery: string
  } | null
}

const initialState: LibraryState = {
  tracks: [],
  libraryDirectories: [],
  isScanning: false,
  scanProgress: null,
  selectedDanceId: null,
  selectedFolderPath: null,
  searchQuery: '',
  selectedTrackIds: [],
  selectionAnchorIndex: null,
  shuffleQueueOrderIds: null,
  shuffleDisplayContext: null,
  deferredListPopularityByTrackId: {},
  trackListSort: { ...DEFAULT_TRACK_LIST_SORT },
  manualListOrderIds: null,
  manualListDisplayContext: null,
}

export const libraryState = writable<LibraryState>(initialState)

// ─── Derived ──────────────────────────────────────────────────────────────────

export const allTracks = derived(libraryState, ($s) => $s.tracks)

function shuffleDisplayApplies(s: LibraryState): boolean {
  const ctx = s.shuffleDisplayContext
  if (!ctx || !s.shuffleQueueOrderIds?.length) return false
  if (!pathsEqualLibrary(s.selectedFolderPath, ctx.folderPath)) return false
  if (s.selectedDanceId !== ctx.danceId) return false
  return s.searchQuery === ctx.searchQuery
}

function manualDisplayApplies(s: LibraryState): boolean {
  const ctx = s.manualListDisplayContext
  if (!ctx || !s.manualListOrderIds?.length) return false
  if (!pathsEqualLibrary(s.selectedFolderPath, ctx.folderPath)) return false
  if (s.selectedDanceId !== ctx.danceId) return false
  return s.searchQuery === ctx.searchQuery
}

/** Single source for filtered list row order (shuffle, manual, or column sort). */
function computeVisibleTracks(s: LibraryState): Track[] {
  const tracks = filterTracksForListView(s.tracks, {
    folderPath: s.selectedFolderPath,
    danceId: s.selectedDanceId,
    searchQuery: s.searchQuery,
  })

  if (shuffleDisplayApplies(s)) {
    const order = s.shuffleQueueOrderIds
    if (!order?.length) {
      return sortTracksForListView(tracks, s.trackListSort, s.deferredListPopularityByTrackId)
    }
    const map = new Map(order.map((id, i) => [id, i]))
    return [...tracks].sort((a, b) => {
      const ia = map.get(a.id)
      const ib = map.get(b.id)
      const na = ia === undefined ? 1_000_000 : ia
      const nb = ib === undefined ? 1_000_000 : ib
      return na - nb
    })
  }

  if (manualDisplayApplies(s) && s.manualListOrderIds) {
    const map = new Map(s.manualListOrderIds.map((id, i) => [id, i]))
    const inManual = tracks.filter((t) => map.has(t.id))
    inManual.sort((a, b) => (map.get(a.id) ?? 0) - (map.get(b.id) ?? 0))
    const rest = tracks.filter((t) => !map.has(t.id))
    const sortedRest = sortTracksForListView(
      rest,
      s.trackListSort,
      s.deferredListPopularityByTrackId,
    )
    return [...inManual, ...sortedRest]
  }

  // sort.key === 'none' means "custom row order" — only meaningful when manual/shuffle applies.
  // In other views fall back to the default sort so the list isn't unsorted.
  const effectiveSort = s.trackListSort.key === 'none' ? DEFAULT_TRACK_LIST_SORT : s.trackListSort
  return sortTracksForListView(tracks, effectiveSort, s.deferredListPopularityByTrackId)
}

export const filteredTracks = derived(libraryState, ($s) => computeVisibleTracks($s))

/** True while shuffle order drives the list (column-sort carets hidden). */
export const shuffleListDisplayActive = derived(libraryState, ($s) => shuffleDisplayApplies($s))

/** True while manual drag-order applies to the current filter (carets off — not column-sorted). */
export const manualListOrderDisplayActive = derived(libraryState, ($s) => manualDisplayApplies($s))

export const trackListSort = derived(libraryState, ($s) => $s.trackListSort)

export const selectedDanceId = derived(libraryState, ($s) => $s.selectedDanceId)
export const selectedFolderPath = derived(libraryState, ($s) => $s.selectedFolderPath)
export const isScanning = derived(libraryState, ($s) => $s.isScanning)
export const scanProgress = derived(libraryState, ($s) => $s.scanProgress)

/** Track counts per dance category */
export const trackCountsByDance = derived(libraryState, ($s) => {
  const counts: Record<string, number> = {}
  for (const dance of DANCE_CATEGORIES) {
    counts[dance.id] = $s.tracks.filter((t) => t.dances.includes(dance.id as DanceId)).length
  }
  return counts
})

export const selectedTrackIds = derived(libraryState, ($s) => $s.selectedTrackIds)

export const libraryDirectories = derived(libraryState, ($s) => $s.libraryDirectories)

async function clearShuffleListOrdering(): Promise<void> {
  libraryState.update((s) => ({
    ...s,
    shuffleQueueOrderIds: null,
    shuffleDisplayContext: null,
  }))
  const { playerActions } = await import('./player.store')
  playerActions.setShuffle(false)
}

function clearManualListOrdering() {
  libraryState.update((s) =>
    s.manualListOrderIds == null && s.manualListDisplayContext == null
      ? s
      : { ...s, manualListOrderIds: null, manualListDisplayContext: null },
  )
}

function playbackListContextMatchesSidebar(l: LibraryState, p: PlaybackState): boolean {
  const dance = l.selectedDanceId
  const folder = l.selectedFolderPath
  const pd = p.playbackListDanceId
  const pf = p.playbackListFolderPath
  if (dance != null && folder == null) {
    return pd === dance && pf == null
  }
  if (folder != null && dance == null) {
    return pd == null && pf != null && pathsEqualLibrary(folder, pf)
  }
  if (dance == null && folder == null) {
    return pd == null && pf == null
  }
  return false
}

function visibleFilterSetMatchesQueue(l: LibraryState, p: PlaybackState): boolean {
  const qIds = p.queue
    .filter((i): i is { kind: 'track'; track: Track } => i.kind === 'track')
    .map((i) => i.track.id)
  if (qIds.length === 0) return false
  const visible = filterTracksForListView(l.tracks, {
    folderPath: l.selectedFolderPath,
    danceId: l.selectedDanceId,
    searchQuery: l.searchQuery,
  })
  if (visible.length !== qIds.length) return false
  const vs = new Set(visible.map((t) => t.id))
  for (const id of qIds) {
    if (!vs.has(id)) return false
  }
  return true
}

function folderBasenamesForMessage(paths: string[], maxShow = 3): string {
  const names = paths.map((p) => {
    const s = p.replace(/\\/g, '/').replace(/\/$/, '')
    const i = s.lastIndexOf('/')
    return i >= 0 ? s.slice(i + 1) || s : s
  })
  if (names.length <= maxShow) return names.join(', ')
  return `${names.slice(0, maxShow).join(', ')} (+${names.length - maxShow} more)`
}

async function applyAddLibraryScan(data: AddLibraryPathsResult): Promise<void> {
  const { playerActions } = await import('./player.store')
  const removed = data.removedTrackIds ?? []
  if (removed.length > 0) {
    libraryActions.removeTracksFromState(removed)
    playerActions.onLibraryRemovedTracks(removed)
  }
  libraryActions.mergeTracksFromScan(data.tracks)
  await libraryActions.refreshLibraryDirectories()
  for (const id of data.changedTrackIds ?? []) {
    const t = get(libraryState).tracks.find((x) => x.id === id)
    if (t) playerActions.mergeTrackFromLibrary(t)
  }
  const n = data.newTrackIds.length
  const touched = n > 0 || removed.length > 0 || (data.changedTrackIds?.length ?? 0) > 0
  if (n > 0) {
    uiActions.notify(`Added ${n} new ${n === 1 ? 'track' : 'tracks'}`, 'success')
    const idSet = new Set(data.newTrackIds)
    const incomplete = data.tracks
      .filter((t) => idSet.has(t.id))
      .filter(trackNeedsMetadataEnrichment)
      .map((t) => t.id)
    if (incomplete.length > 0) {
      uiActions.openModal('track-metadata', {
        metadataQueue: incomplete,
        metadataWizardTotal: incomplete.length,
        metadataAfterAssign: data.newTrackIds,
      })
    } else {
      const needDance = data.tracks
        .filter((t) => idSet.has(t.id) && t.dances.length === 0)
        .map((t) => t.id)
      if (needDance.length > 0) {
        uiActions.openModal('assign-folder-dance', { folderTrackIds: needDance })
      }
      void libraryActions.fillMissingBpmForTrackIds(data.newTrackIds)
    }
  } else if (!touched) {
    uiActions.notify('Folder is already fully indexed', 'info')
  }
}

async function handleAddLibraryPathsResponse(data: AddLibraryPathsResult): Promise<void> {
  if (data.alreadyAddedPaths.length > 0) {
    uiActions.notify(
      `Already in library: ${folderBasenamesForMessage(data.alreadyAddedPaths)}`,
      'warning',
    )
  }
  if (data.invalidPaths.length > 0) {
    uiActions.notify(
      `Not a folder (skipped): ${folderBasenamesForMessage(data.invalidPaths)}`,
      'warning',
    )
  }
  if (data.newlyAddedRootPaths.length === 0) return
  await applyAddLibraryScan(data)
}

// ─── Actions ──────────────────────────────────────────────────────────────────

function defaultDirectionForSortKey(key: TrackListSortKey): 'asc' | 'desc' {
  if (key === 'none') return 'asc'
  return key === 'popularity' ? 'desc' : 'asc'
}

export const libraryActions = {
  resetTrackListSort() {
    libraryState.update((s) => ({
      ...s,
      trackListSort: { ...DEFAULT_TRACK_LIST_SORT },
    }))
  },

  async toggleTrackListSort(key: TrackListSortKey): Promise<void> {
    if (key === 'none') return
    if (key === 'dance' && get(libraryState).selectedDanceId != null) return
    await clearShuffleListOrdering()
    clearManualListOrdering()
    libraryState.update((s) => {
      const cur = s.trackListSort
      const next =
        cur.key === key
          ? {
              key,
              direction: cur.direction === 'asc' ? ('desc' as const) : ('asc' as const),
            }
          : { key, direction: defaultDirectionForSortKey(key) }
      return { ...s, trackListSort: next }
    })
  },

  clearDeferredListPopularity() {
    libraryState.update((s) =>
      Object.keys(s.deferredListPopularityByTrackId).length === 0
        ? s
        : { ...s, deferredListPopularityByTrackId: {} },
    )
  },

  setTracks(tracks: Track[]) {
    libraryActions.clearDeferredListPopularity()
    libraryActions.resetTrackListSort()
    clearManualListOrdering()
    libraryState.update((s) => ({ ...s, tracks }))
  },

  addTracks(newTracks: Track[]) {
    libraryState.update((s) => {
      const existingIds = new Set(s.tracks.map((t) => t.id))
      const unique = newTracks.filter((t) => !existingIds.has(t.id))
      return { ...s, tracks: [...s.tracks, ...unique] }
    })
  },

  /** Upsert tracks by id (scan / refresh). */
  mergeTracksFromScan(tracks: Track[]) {
    libraryState.update((s) => {
      const map = new Map(s.tracks.map((t) => [t.id, t]))
      for (const t of tracks) {
        map.set(t.id, t)
      }
      return { ...s, tracks: Array.from(map.values()) }
    })
  },

  setLibraryDirectories(dirs: LibraryDirectory[]) {
    libraryState.update((s) => ({ ...s, libraryDirectories: dirs }))
  },

  async refreshLibraryDirectories() {
    const r = await window.electronAPI.library.getDirectories()
    if (r.success && r.data) {
      libraryActions.setLibraryDirectories(r.data)
    }
  },

  removeTracksFromState(trackIds: string[]) {
    if (trackIds.length === 0) return
    const remove = new Set(trackIds)
    libraryState.update((s) => ({
      ...s,
      tracks: s.tracks.filter((t) => !remove.has(t.id)),
      selectedTrackIds: s.selectedTrackIds.filter((id) => !remove.has(id)),
    }))
  },

  /** Returns removed track IDs (empty if failed). */
  async removeLibraryFolder(path: string): Promise<string[]> {
    const r = await window.electronAPI.library.removeDirectory(path)
    if (!r.success || !r.data) {
      uiActions.notify(r.error ?? 'Could not remove folder', 'error')
      return []
    }
    const ids = r.data.removedTrackIds
    libraryActions.removeTracksFromState(ids)
    libraryState.update((s) => {
      if (!s.selectedFolderPath) return s
      const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
      if (norm(s.selectedFolderPath).toLowerCase() !== norm(path).toLowerCase()) return s
      return { ...s, selectedFolderPath: null }
    })
    await libraryActions.refreshLibraryDirectories()
    uiActions.notify('Folder removed from library', 'success')
    return ids
  },

  async removeTrackFromLibrary(trackId: string) {
    const r = await window.electronAPI.library.removeTrack(trackId)
    if (!r.success) {
      uiActions.notify(r.error ?? 'Could not remove track', 'error')
      return false
    }
    libraryActions.removeTracksFromState([trackId])
    uiActions.notify('Track removed from library', 'success')
    return true
  },

  /** Dialog → scan → merge tracks; optional bulk-dance modal for new files only */
  async pickAddMusicFolder() {
    libraryActions.setScanning(true)
    try {
      const r = await window.electronAPI.library.addDirectory()
      if (!r.success || !r.data) {
        if (r.error && r.error !== 'No directory selected') {
          uiActions.notify(r.error, 'error')
        }
        return
      }
      await handleAddLibraryPathsResponse(r.data)
    } finally {
      libraryActions.setScanning(false)
      libraryActions.setScanProgress(null)
    }
  },

  /** OS drag-and-drop of one or more folders onto the library list (Electron). */
  async addMusicFoldersFromDroppedPaths(paths: string[]) {
    const unique = [...new Set(paths.map((p) => p.trim()).filter(Boolean))]
    if (unique.length === 0) return
    libraryActions.setScanning(true)
    try {
      const r = await window.electronAPI.library.addDirectoryFromPaths(unique)
      if (!r.success || !r.data) {
        uiActions.notify(r.error ?? 'Could not add folders', 'error')
        return
      }
      await handleAddLibraryPathsResponse(r.data)
    } finally {
      libraryActions.setScanning(false)
      libraryActions.setScanProgress(null)
    }
  },

  setScanning(isScanning: boolean) {
    libraryState.update((s) => ({ ...s, isScanning }))
  },

  setScanProgress(progress: { current: number; total: number } | null) {
    libraryState.update((s) => ({ ...s, scanProgress: progress }))
  },

  selectDance(danceId: DanceId | null) {
    const prev = get(libraryState)
    const sameDanceReselect = danceId !== null && prev.selectedDanceId === danceId

    libraryState.update((s) => {
      if (danceId !== null && s.selectedDanceId === danceId) {
        return {
          ...s,
          selectedTrackIds: [],
          selectionAnchorIndex: null,
        }
      }
      return {
        ...s,
        selectedDanceId: danceId,
        selectedFolderPath: null,
        selectedTrackIds: [],
        selectionAnchorIndex: null,
      }
    })

    if (!sameDanceReselect) {
      libraryActions.clearDeferredListPopularity()
    }
  },

  /** Browse tracks under one library root (same as All Tracks columns, including Dance). */
  selectFolder(path: string | null) {
    libraryState.update((s) => {
      const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
      const same =
        path != null &&
        s.selectedFolderPath != null &&
        norm(path).toLowerCase() === norm(s.selectedFolderPath).toLowerCase()
      if (same) {
        return {
          ...s,
          selectedFolderPath: null,
          selectedTrackIds: [],
          selectionAnchorIndex: null,
        }
      }
      return {
        ...s,
        selectedFolderPath: path,
        selectedDanceId: null,
        selectedTrackIds: [],
        selectionAnchorIndex: null,
      }
    })
    libraryActions.clearDeferredListPopularity()
  },

  clearTrackSelection() {
    libraryState.update((s) => ({
      ...s,
      selectedTrackIds: [],
      selectionAnchorIndex: null,
    }))
  },

  /**
   * Row click for selection. Skips when target is inside a button (play / assign).
   * Shift: range from anchor. Ctrl/Cmd: toggle. Plain: single select.
   */
  handleTrackRowClick(trackId: string, index: number, visibleTracks: Track[], e: MouseEvent) {
    const t = e.target as HTMLElement | null
    if (t?.closest('button')) return

    libraryState.update((s) => {
      if (e.shiftKey && s.selectionAnchorIndex != null) {
        const a = Math.min(s.selectionAnchorIndex, index)
        const b = Math.max(s.selectionAnchorIndex, index)
        const ids = visibleTracks.slice(a, b + 1).map((tr) => tr.id)
        return { ...s, selectedTrackIds: ids }
      }
      if (e.ctrlKey || e.metaKey) {
        const set = new Set(s.selectedTrackIds)
        if (set.has(trackId)) set.delete(trackId)
        else set.add(trackId)
        return {
          ...s,
          selectedTrackIds: [...set],
          selectionAnchorIndex: index,
        }
      }
      return {
        ...s,
        selectedTrackIds: [trackId],
        selectionAnchorIndex: index,
      }
    })
  },

  async applyFolderDefaultDance(path: string, danceId: DanceId) {
    const r = await window.electronAPI.library.setFolderDefaultDance(path, danceId)
    if (!r.success) {
      uiActions.notify(r.error ?? 'Could not save folder default', 'error')
      return
    }
    await libraryActions.refreshLibraryDirectories()
    const inFolder = get(libraryState).tracks.filter(
      (t) => t.localPath && trackFileUnderLibraryFolder(t.localPath, path),
    )
    const ids = inFolder.filter((t) => t.dances.length === 0).map((t) => t.id)
    if (ids.length > 0) {
      await libraryActions.assignDanceToTracks(ids, danceId)
    } else {
      const name = DANCE_CATEGORIES_BY_ID[danceId]?.name ?? danceId
      const msg =
        inFolder.length === 0
          ? `Folder default is “${name}”. It will apply when you add tracks to this folder.`
          : `Folder default is “${name}”. Every track here already has a dance; new files will use this default.`
      uiActions.notify(msg, 'info')
    }
  },

  async clearFolderDefaultDance(path: string) {
    const r = await window.electronAPI.library.setFolderDefaultDance(path, null)
    if (!r.success) {
      uiActions.notify(r.error ?? 'Could not update folder', 'error')
      return
    }
    await libraryActions.refreshLibraryDirectories()
    uiActions.notify('Automatic dance assignment is off for this folder.', 'info')
  },

  async assignDanceToTracks(trackIds: string[], danceId: DanceId) {
    if (trackIds.length === 0) return
    let okCount = 0
    for (const id of trackIds) {
      const r = await window.electronAPI.library.assignDance(id, danceId)
      if (r.success) {
        libraryActions.updateTrackDance(id, danceId, true)
        okCount++
      }
    }
    libraryActions.clearTrackSelection()
    const name = DANCE_CATEGORIES_BY_ID[danceId]?.name ?? danceId
    if (okCount === 0) {
      uiActions.notify('Could not assign tracks', 'warning')
    } else if (okCount === 1) {
      uiActions.notify(`Set dance to ${name}`, 'success')
    } else {
      uiActions.notify(`Set dance to ${name} for ${okCount} tracks`, 'success')
    }
  },

  async unassignTracksFromDance(trackIds: string[], danceId: DanceId) {
    if (trackIds.length === 0) return
    let ok = 0
    for (const id of trackIds) {
      const r = await window.electronAPI.library.unassignDance(id, danceId)
      if (r.success) {
        libraryActions.updateTrackDance(id, danceId, false)
        ok++
      }
    }
    libraryActions.clearTrackSelection()
    const name = DANCE_CATEGORIES_BY_ID[danceId]?.name ?? danceId
    if (ok === 0) {
      uiActions.notify('Could not remove from dance', 'warning')
    } else {
      uiActions.notify(
        ok === 1 ? `Removed from ${name}` : `Removed ${ok} tracks from ${name}`,
        'success',
      )
    }
  },

  /** Delete / Backspace: dance view → remove from that dance; All Tracks → clear dance tags only (remove folders in sidebar to drop tracks). */
  async applyDeleteToSelection() {
    const s = get(libraryState)
    const ids = s.selectedTrackIds
    if (ids.length === 0) return
    const tag =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement)?.tagName : ''
    if (tag === 'INPUT' || tag === 'TEXTAREA') return

    if (s.selectedDanceId != null) {
      await libraryActions.unassignTracksFromDance(ids, s.selectedDanceId)
      return
    }

    await libraryActions.clearDanceTagsFromTrackIds(ids)
  },

  /** All Tracks: clear primary dance tag from each selected track (grouped by dance for IPC). */
  async clearDanceTagsFromTrackIds(ids: string[]) {
    if (ids.length === 0) return
    const s = get(libraryState)
    const byDance = new Map<DanceId, string[]>()
    for (const id of ids) {
      const t = s.tracks.find((x) => x.id === id)
      const d = t?.dances[0]
      if (d) {
        const arr = byDance.get(d) ?? []
        arr.push(id)
        byDance.set(d, arr)
      }
    }
    if (byDance.size === 0) {
      uiActions.notify(
        'To remove tracks from Stepify, remove their folder from the library in the sidebar.',
        'info',
      )
      return
    }
    let totalOk = 0
    for (const [danceId, trackIds] of byDance) {
      for (const id of trackIds) {
        const r = await window.electronAPI.library.unassignDance(id, danceId)
        if (r.success) {
          libraryActions.updateTrackDance(id, danceId, false)
          totalOk++
        }
      }
    }
    libraryActions.clearTrackSelection()
    if (totalOk === 0) {
      uiActions.notify('Could not clear dance tags', 'warning')
    } else {
      uiActions.notify(
        totalOk === 1 ? 'Dance tag cleared' : `Dance tags cleared from ${totalOk} tracks`,
        'success',
      )
    }
  },

  setSearchQuery(query: string) {
    const prev = get(libraryState)
    if (prev.searchQuery !== query) {
      libraryActions.clearDeferredListPopularity()
    }
    libraryState.update((s) => ({ ...s, searchQuery: query }))
  },

  updateTrackDance(trackId: string, danceId: DanceId, assigned: boolean) {
    libraryState.update((s) => ({
      ...s,
      tracks: s.tracks.map((t) => {
        if (t.id !== trackId) return t
        if (assigned) {
          return { ...t, dances: [danceId] }
        }
        return { ...t, dances: t.dances.filter((d) => d !== danceId) }
      }),
    }))
  },

  patchTrack(trackId: string, patch: Partial<Pick<Track, 'bpm' | 'duration' | 'popularityScore'>>) {
    libraryState.update((s) => ({
      ...s,
      tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)),
    }))
  },

  /**
   * Reorder rows in the current sidebar view (manual order when shuffle is off, else shuffle order).
   * If playback was started from this same list, updates the player queue to match.
   */
  reorderVisibleTracks(fromIndex: number, toIndex: number) {
    logTrackReorder('reorderVisibleTracks called', { fromIndex, toIndex })
    if (fromIndex === toIndex) {
      logTrackReorder('reorder abort: fromIndex === toIndex')
      return
    }
    const l = get(libraryState)
    logTrackReorder('pre-reorder library snapshot', {
      trackListSort: l.trackListSort,
      manualDisplayApplies: manualDisplayApplies(l),
      shuffleDisplayApplies: shuffleDisplayApplies(l),
      selectedDanceId: l.selectedDanceId,
      selectedFolderPath: l.selectedFolderPath,
      searchQuery: l.searchQuery,
      manualListOrderIdsLen: l.manualListOrderIds?.length ?? 0,
      shuffleQueueOrderIdsLen: l.shuffleQueueOrderIds?.length ?? 0,
    })
    const ordered = computeVisibleTracks(l)
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= ordered.length || toIndex >= ordered.length) {
      logTrackReorder('reorder abort: index out of range', {
        orderedLength: ordered.length,
        fromIndex,
        toIndex,
      })
      return
    }
    const ids = ordered.map((t) => t.id)
    const nextIds = reorderVisibleIds(ids, fromIndex, toIndex)
    const ctx = {
      danceId: l.selectedDanceId,
      folderPath: l.selectedFolderPath,
      searchQuery: l.searchQuery,
    }
    const sortNone: TrackListSort = { key: 'none', direction: 'asc' }
    if (shuffleDisplayApplies(l)) {
      logTrackReorder('reorder path: shuffle list branch')
      libraryState.update((s) => {
        if (!shuffleDisplayApplies(s)) {
          logTrackReorder('shuffle branch NO-OP inside update', {
            hasShuffleCtx: s.shuffleDisplayContext != null,
            shuffleQueueOrderIdsLen: s.shuffleQueueOrderIds?.length ?? 0,
            selectedDanceId: s.selectedDanceId,
            ctxDanceId: s.shuffleDisplayContext?.danceId ?? null,
          })
          return s
        }
        return { ...s, shuffleQueueOrderIds: nextIds, trackListSort: sortNone }
      })
    } else {
      logTrackReorder('reorder path: manual list branch', {
        nextIdsLen: nextIds.length,
        movedId: ids[fromIndex],
        beforeTitles: ordered.map((t) => t.title).slice(0, 12),
      })
      // Apply sort reset + manual order in one update so nothing re-sorts between ticks.
      libraryState.update((s) => ({
        ...s,
        manualListOrderIds: nextIds,
        manualListDisplayContext: ctx,
        trackListSort: sortNone,
      }))
    }
    const after = get(libraryState)
    logTrackReorder('post-reorder library snapshot', {
      trackListSort: after.trackListSort,
      manualDisplayApplies: manualDisplayApplies(after),
      shuffleDisplayApplies: shuffleDisplayApplies(after),
      manualListOrderIdsLen: after.manualListOrderIds?.length ?? 0,
      visibleFirstTitles: computeVisibleTracks(after)
        .slice(0, 12)
        .map((t) => t.title),
    })
    void import('./player.store').then(({ playerActions, playerState }) => {
      const p = get(playerState)
      const lib = get(libraryState)
      if (!playbackListContextMatchesSidebar(lib, p)) return
      if (!visibleFilterSetMatchesQueue(lib, p)) return
      playerActions.reorderQueueByOrderedIds(nextIds)
    })
  },

  /** Rebuild queue + list order from shuffle / popularity (Now Playing bar). */
  async toggleShufflePlayback() {
    const { playerActions, playerState } = await import('./player.store')
    const p = get(playerState)
    const l = get(libraryState)

    if (p.playbackFinalsSessionId != null) {
      uiActions.notify('Shuffle applies to library lists only', 'info')
      return
    }

    const visible = filterTracksForListView(l.tracks, {
      folderPath: p.playbackListFolderPath,
      danceId: p.playbackListFolderPath ? null : p.playbackListDanceId,
      searchQuery: l.searchQuery,
    })

    const byId = new Map(l.tracks.map((t) => [t.id, t]))
    const merged = visible.map((t) => byId.get(t.id) ?? t)

    if (merged.length === 0) {
      uiActions.notify('Nothing to play in this list', 'info')
      return
    }

    const listDanceId = p.playbackListFolderPath ? null : p.playbackListDanceId
    const listFolderPath = p.playbackListFolderPath

    const defer = l.deferredListPopularityByTrackId

    if (p.shuffle) {
      const sorted = sortTracksForListView(merged, l.trackListSort, defer)
      const cur = p.track
      const idx = cur ? sorted.findIndex((t) => t.id === cur.id) : 0
      const start = idx >= 0 ? idx : 0
      libraryState.update((s) => ({
        ...s,
        shuffleQueueOrderIds: null,
        shuffleDisplayContext: null,
        manualListOrderIds: null,
        manualListDisplayContext: null,
      }))
      playerActions.setShuffle(false)
      playerActions.setQueue(sorted, start, listDanceId, listFolderPath)
      return
    }

    const cur = p.track
    let queue: Track[]
    if (cur && merged.some((t) => t.id === cur.id)) {
      const rest = merged.filter((t) => t.id !== cur.id)
      const enrichedCur = byId.get(cur.id) ?? cur
      queue = [enrichedCur, ...weightedShuffleByPopularity(rest, defer)]
    } else {
      queue = weightedShuffleByPopularity([...merged], defer)
    }

    const curIdx = cur ? queue.findIndex((t) => t.id === cur.id) : 0
    const start = curIdx >= 0 ? curIdx : 0

    const shuffleDisplayContext = {
      danceId: listDanceId,
      folderPath: listFolderPath,
      searchQuery: l.searchQuery,
    }

    libraryState.update((s) => ({
      ...s,
      manualListOrderIds: null,
      manualListDisplayContext: null,
      shuffleQueueOrderIds: queue.map((t) => t.id),
      shuffleDisplayContext,
    }))
    playerActions.setShuffle(true)
    playerActions.setQueue(queue, start, listDanceId, listFolderPath)
  },

  async voteTrackPopularity(trackId: string, delta: 1 | -1): Promise<boolean> {
    const before = get(libraryState).tracks.find((x) => x.id === trackId)
    if (!before) {
      uiActions.notify('Track not found', 'warning')
      return false
    }

    const r = await window.electronAPI.library.adjustTrackPopularity(trackId, delta)
    if (!r.success || !r.data) {
      uiActions.notify(r.error ?? 'Could not save like/dislike', 'warning')
      return false
    }
    const t = r.data

    const { playerActions, playerState } = await import('./player.store')
    const playingId = get(playerState).track?.id

    libraryState.update((s) => {
      const defer = { ...s.deferredListPopularityByTrackId }
      if (playingId === trackId) {
        const prevListScore = defer[trackId] ?? before.popularityScore ?? 0
        defer[trackId] = prevListScore
      } else {
        delete defer[trackId]
      }
      return {
        ...s,
        tracks: s.tracks.map((x) => (x.id === t.id ? t : x)),
        deferredListPopularityByTrackId: defer,
      }
    })
    playerActions.mergeTrackFromLibrary(t)
    return true
  },

  clearTrackBpmInState(trackId: string) {
    libraryState.update((s) => ({
      ...s,
      tracks: s.tracks.map((t) => {
        if (t.id !== trackId) return t
        const next = { ...t }
        delete next.bpm
        return next
      }),
    }))
  },

  /**
   * After importing tracks, detect BPM for local files that have none (tags + analysis).
   * Runs in the background; does not block the UI.
   */
  async fillMissingBpmForTrackIds(trackIds: string[], options: { silentBpmToast?: boolean } = {}) {
    const s = get(libraryState)
    const toAnalyze = trackIds
      .map((id) => s.tracks.find((t) => t.id === id))
      .filter((t): t is Track => !!t)
      .filter((t) => t.source === 'local' && t.localPath && !(t.bpm != null && t.bpm > 0))

    if (toAnalyze.length === 0) return

    let ok = 0
    const { playerActions } = await import('./player.store')

    for (const track of toAnalyze) {
      const bpm = await resolveBpmForLocalTrack(track, { forceDetect: false })
      if (bpm != null) {
        playerActions.mergeCurrentTrackBpm(bpm, track.id)
        ok++
      }
    }

    if (ok > 0 && !options.silentBpmToast) {
      uiActions.notify(
        ok === 1 ? 'Filled in BPM for 1 new track' : `Filled in BPM for ${ok} new tracks`,
        'success',
      )
    }
  },

  /**
   * Apply a disk rescan result from main (startup sync, folder watcher, or manual rescan).
   */
  async applyDiskSyncFromMain(
    data: LibraryDiskSyncPayload,
    source: 'startup' | 'file-watcher' | 'manual-rescan',
  ) {
    const { playerActions } = await import('./player.store')
    const removed = data.removedTrackIds
    if (removed.length > 0) {
      libraryActions.removeTracksFromState(removed)
      playerActions.onLibraryRemovedTracks(removed)
    }
    libraryActions.mergeTracksFromScan(data.tracks)
    libraryActions.clearDeferredListPopularity()
    await libraryActions.refreshLibraryDirectories()
    for (const id of data.changedTrackIds ?? []) {
      const t = get(libraryState).tracks.find((x) => x.id === id)
      if (t) playerActions.mergeTrackFromLibrary(t)
    }

    const newTrackIds = data.newTrackIds
    const n = newTrackIds.length
    if (n === 0) return

    const idSet = new Set(newTrackIds)
    const newTracks = data.tracks.filter((t) => idSet.has(t.id))
    const incompleteMeta = newTracks.filter(trackNeedsMetadataEnrichment).map((t) => t.id)

    if (incompleteMeta.length > 0) {
      uiActions.openModal('track-metadata', {
        metadataQueue: incompleteMeta,
        metadataWizardTotal: incompleteMeta.length,
        metadataAfterAssign: newTrackIds,
      })
      if (source === 'startup') {
        uiActions.notify(
          n === 1
            ? 'Found 1 new track in library folders'
            : `Found ${n} new tracks in library folders`,
          'success',
        )
      } else if (source === 'file-watcher') {
        uiActions.notify(
          n === 1
            ? '1 new track added from a library folder'
            : `${n} new tracks added from library folders`,
          'success',
        )
      }
      return
    }

    const needAssign = newTracks.filter((t) => t.dances.length === 0).map((t) => t.id)
    if (source !== 'file-watcher' && needAssign.length > 0) {
      uiActions.openModal('assign-folder-dance', { folderTrackIds: needAssign })
    }

    const silentBpm = source === 'file-watcher' || source === 'startup'
    void libraryActions.fillMissingBpmForTrackIds(newTrackIds, { silentBpmToast: silentBpm })

    if (source === 'startup') {
      uiActions.notify(
        n === 1
          ? 'Found 1 new track in library folders'
          : `Found ${n} new tracks in library folders`,
        'success',
      )
    } else if (source === 'file-watcher') {
      uiActions.notify(
        n === 1
          ? '1 new track added from a library folder'
          : `${n} new tracks added from library folders`,
        'success',
      )
    }
  },

  async syncTrackFromMain(track: Track) {
    libraryState.update((s) => ({
      ...s,
      tracks: s.tracks.map((t) => (t.id === track.id ? { ...t, ...track } : t)),
    }))
    const { playerActions } = await import('./player.store')
    playerActions.mergeTrackFromLibrary(track)
  },

  /** After metadata wizard: BPM pass + bulk dance assign for newly added folder tracks. */
  async afterMetadataWizardComplete(trackIds: string[]) {
    if (trackIds.length === 0) return
    void libraryActions.fillMissingBpmForTrackIds(trackIds)
    const need = get(libraryState)
      .tracks.filter((t) => trackIds.includes(t.id) && t.dances.length === 0)
      .map((t) => t.id)
    if (need.length > 0) {
      uiActions.openModal('assign-folder-dance', { folderTrackIds: need })
    }
  },
}
