import { DANCE_CATEGORIES, DANCE_CATEGORIES_BY_ID } from '@shared/constants'
import type { DanceId, LibraryDirectory, Track } from '@shared/types'
import { derived, get, writable } from 'svelte/store'
import { uiActions } from './ui.store'

interface LibraryState {
  tracks: Track[]
  libraryDirectories: LibraryDirectory[]
  isScanning: boolean
  scanProgress: { current: number; total: number } | null
  selectedDanceId: DanceId | null
  searchQuery: string
  /** Multi-select in the track list (Ctrl/Cmd/Shift + click) */
  selectedTrackIds: string[]
  /** Anchor index in the current visible list for shift-range selection */
  selectionAnchorIndex: number | null
}

const initialState: LibraryState = {
  tracks: [],
  libraryDirectories: [],
  isScanning: false,
  scanProgress: null,
  selectedDanceId: null,
  searchQuery: '',
  selectedTrackIds: [],
  selectionAnchorIndex: null,
}

export const libraryState = writable<LibraryState>(initialState)

// ─── Derived ──────────────────────────────────────────────────────────────────

export const allTracks = derived(libraryState, ($s) => $s.tracks)

export const filteredTracks = derived(libraryState, ($s) => {
  let tracks = $s.tracks

  const danceId = $s.selectedDanceId
  if (danceId) {
    tracks = tracks.filter((t) => t.dances.includes(danceId))
  }

  if ($s.searchQuery.trim()) {
    const q = $s.searchQuery.toLowerCase()
    tracks = tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album?.toLowerCase().includes(q),
    )
  }

  return tracks
})

export const selectedDanceId = derived(libraryState, ($s) => $s.selectedDanceId)
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

// ─── Actions ──────────────────────────────────────────────────────────────────

export const libraryActions = {
  setTracks(tracks: Track[]) {
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
      libraryActions.mergeTracksFromScan(r.data.tracks)
      await libraryActions.refreshLibraryDirectories()
      const n = r.data.newTrackIds.length
      if (n > 0) {
        uiActions.openModal('assign-folder-dance', { folderTrackIds: r.data.newTrackIds })
        uiActions.notify(`Added ${n} new ${n === 1 ? 'track' : 'tracks'}`, 'success')
      } else {
        uiActions.notify('Folder is already fully indexed', 'info')
      }
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
    libraryState.update((s) => {
      if (s.selectedDanceId === danceId) {
        return {
          ...s,
          selectedTrackIds: [],
          selectionAnchorIndex: null,
        }
      }
      return {
        ...s,
        selectedDanceId: danceId,
        selectedTrackIds: [],
        selectionAnchorIndex: null,
      }
    })
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

  patchTrack(trackId: string, patch: Partial<Pick<Track, 'bpm' | 'duration'>>) {
    libraryState.update((s) => ({
      ...s,
      tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)),
    }))
  },
}
