import { TEMPO_MAX_PERCENT, TEMPO_MIN_PERCENT } from '@shared/constants'
import { resolveTrackReferenceBpm, type TrackReferenceBpm } from '@shared/track-bpm'
import type { DanceId, PlaybackState, RepeatMode, Track } from '@shared/types'
import { derived, get, writable } from 'svelte/store'
import { libraryActions, libraryState } from './library.store'

function clearDeferIfPlaybackTrackChanged(
  prevId: string | null | undefined,
  nextId: string | null | undefined,
) {
  if (prevId !== nextId) {
    libraryActions.clearDeferredListPopularity()
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

const initialState: PlaybackState = {
  track: null,
  isPlaying: false,
  currentTime: 0,
  tempo: 1.0,
  volume: 0.8,
  muted: false,
  queue: [],
  queueIndex: -1,
  sourceDuration: 0,
  shuffle: false,
  repeatMode: 'off',
  playbackListDanceId: null,
  playbackListFolderPath: null,
}

export const playerState = writable<PlaybackState>(initialState)

// ─── Derived ──────────────────────────────────────────────────────────────────

export const currentTrack = derived(playerState, ($s) => $s.track)
export const isPlaying = derived(playerState, ($s) => $s.isPlaying)
export const currentTime = derived(playerState, ($s) => $s.currentTime)
export const volume = derived(playerState, ($s) => $s.volume)
export const queue = derived(playerState, ($s) => $s.queue)

/** Tempo as a percentage offset from 0: (rate - 1) * 100 */
export const tempoPercent = derived(playerState, ($s) => Math.round(($s.tempo - 1) * 100 * 10) / 10)

/** Reference BPM: file tags / library (incl. detected), or dance midpoint */
export const referenceBpmInfo = derived(
  [playerState, libraryState],
  ([$p, $l]): TrackReferenceBpm | null => {
    const t = $p.track
    if (!t) return null
    const lib = $l.tracks.find((x) => x.id === t.id)
    const merged = lib && typeof lib.bpm === 'number' && lib.bpm > 0 ? { ...t, bpm: lib.bpm } : t
    return resolveTrackReferenceBpm(merged)
  },
)

/** Adjusted BPM = reference × tempo */
export const adjustedBpm = derived([playerState, libraryState], ([$p, $l]) => {
  const t = $p.track
  if (!t) return null
  const lib = $l.tracks.find((x) => x.id === t.id)
  const merged = lib && typeof lib.bpm === 'number' && lib.bpm > 0 ? { ...t, bpm: lib.bpm } : t
  const ref = resolveTrackReferenceBpm(merged)
  if (!ref) return null
  return Math.round(ref.bpm * $p.tempo)
})

/** Wall-clock listening time: slower tempo = longer perceived duration */
export const listenerElapsed = derived(playerState, ($s) =>
  $s.tempo > 0 ? $s.currentTime / $s.tempo : 0,
)

export const listenerDuration = derived(playerState, ($s) =>
  $s.tempo > 0 && $s.sourceDuration > 0 ? $s.sourceDuration / $s.tempo : 0,
)

// ─── Actions ──────────────────────────────────────────────────────────────────

export const playerActions = {
  setTrack(track: Track) {
    const prev = get(playerState).track?.id
    clearDeferIfPlaybackTrackChanged(prev, track.id)
    playerState.update((s) => ({
      ...s,
      track,
      currentTime: 0,
      isPlaying: false,
      sourceDuration: track.duration > 0 ? track.duration : 0,
    }))
  },

  setSourceDuration(seconds: number) {
    if (!(seconds > 0)) return
    playerState.update((s) => ({ ...s, sourceDuration: seconds }))
  },

  play() {
    playerState.update((s) => ({ ...s, isPlaying: true }))
  },

  pause() {
    playerState.update((s) => ({ ...s, isPlaying: false }))
  },

  togglePlay() {
    playerState.update((s) => ({ ...s, isPlaying: !s.isPlaying }))
  },

  setCurrentTime(time: number) {
    playerState.update((s) => ({ ...s, currentTime: time }))
  },

  setTempo(rate: number) {
    const min = 1 + TEMPO_MIN_PERCENT / 100
    const max = 1 + TEMPO_MAX_PERCENT / 100
    const clamped = Math.max(min, Math.min(max, rate))
    playerState.update((s) => ({ ...s, tempo: clamped }))
  },

  setTempoByPercent(percent: number) {
    const clamped = Math.max(TEMPO_MIN_PERCENT, Math.min(TEMPO_MAX_PERCENT, percent))
    this.setTempo(1 + clamped / 100)
  },

  resetTempo() {
    playerState.update((s) => ({ ...s, tempo: 1.0 }))
  },

  setVolume(volume: number) {
    const clamped = Math.max(0, Math.min(1, volume))
    playerState.update((s) => ({
      ...s,
      volume: clamped,
      muted: clamped > 0 ? false : s.muted,
    }))
  },

  toggleMute() {
    playerState.update((s) => ({ ...s, muted: !s.muted }))
  },

  setQueue(
    tracks: Track[],
    startIndex = 0,
    listDanceId: DanceId | null = null,
    listFolderPath: string | null = null,
  ) {
    const s0 = get(playerState)
    const t = tracks[startIndex] ?? null
    clearDeferIfPlaybackTrackChanged(s0.track?.id, t?.id)
    playerState.update((s) => ({
      ...s,
      queue: tracks,
      queueIndex: startIndex,
      track: t,
      sourceDuration: t && t.duration > 0 ? t.duration : 0,
      playbackListDanceId: listFolderPath ? null : listDanceId,
      playbackListFolderPath: listFolderPath,
    }))
  },

  /** Same tracks as the current queue, new order; keeps the current track as `track` and fixes `queueIndex`. */
  reorderQueueByOrderedIds(orderedIds: string[]) {
    playerState.update((s) => {
      if (s.queue.length === 0 || s.queue.length !== orderedIds.length) return s
      const byId = new Map(s.queue.map((t) => [t.id, t]))
      const newQueue: Track[] = []
      for (const id of orderedIds) {
        const t = byId.get(id)
        if (!t) return s
        newQueue.push(t)
      }
      const curId = s.track?.id
      let newIndex = curId != null ? newQueue.findIndex((t) => t.id === curId) : s.queueIndex
      if (newIndex < 0) newIndex = s.queueIndex
      return { ...s, queue: newQueue, queueIndex: newIndex }
    })
  },

  toggleShuffle() {
    playerState.update((s) => ({ ...s, shuffle: !s.shuffle }))
  },

  setShuffle(on: boolean) {
    playerState.update((s) => (s.shuffle === on ? s : { ...s, shuffle: on }))
  },

  cycleRepeat() {
    const order: RepeatMode[] = ['off', 'all', 'one']
    playerState.update((s) => {
      const i = (order.indexOf(s.repeatMode) + 1) % order.length
      return {
        ...s,
        repeatMode: order[i] ?? 'off',
      }
    })
  },

  /** Manual next: not affected by repeat-one (that only applies at end of track). */
  skipToNextQueue(): boolean {
    const s = get(playerState)
    const q = s.queue
    if (q.length === 0) return false

    let nextIndex = s.queueIndex + 1
    if (nextIndex >= q.length) {
      if (s.repeatMode === 'all') nextIndex = 0
      else return false
    }

    const t = q[nextIndex]
    clearDeferIfPlaybackTrackChanged(s.track?.id, t.id)
    playerState.update((x) => ({
      ...x,
      queueIndex: nextIndex,
      track: t,
      currentTime: 0,
      sourceDuration: t.duration > 0 ? t.duration : 0,
    }))
    return true
  },

  /** Move to previous queue item (caller handles restart-current when time > 3s). */
  skipToPreviousQueue(): boolean {
    const s = get(playerState)
    const q = s.queue
    if (q.length === 0) return false

    let prevIndex = s.queueIndex - 1
    if (prevIndex < 0) {
      if (s.repeatMode === 'all') prevIndex = q.length - 1
      else return false
    }

    const t = q[prevIndex]
    clearDeferIfPlaybackTrackChanged(s.track?.id, t.id)
    playerState.update((x) => ({
      ...x,
      queueIndex: prevIndex,
      track: t,
      currentTime: 0,
      sourceDuration: t.duration > 0 ? t.duration : 0,
    }))
    return true
  },

  restartCurrentInPlace() {
    playerState.update((s) => ({ ...s, currentTime: 0 }))
  },

  /**
   * Advance when the current file ends. Returns whether playback should continue
   * (load current `track` from store — same or next).
   */
  handleTrackEnded(): 'stop' | 'play' {
    const state = get(playerState)
    const q = state.queue
    if (q.length === 0) {
      playerState.update((s) => ({ ...s, isPlaying: false, currentTime: 0 }))
      return 'stop'
    }

    if (state.repeatMode === 'one') {
      playerState.update((s) => ({ ...s, currentTime: 0 }))
      return 'play'
    }

    let nextIndex = state.queueIndex + 1

    if (nextIndex >= q.length) {
      if (state.repeatMode === 'all' && q.length > 0) {
        nextIndex = 0
      } else {
        playerState.update((s) => ({ ...s, isPlaying: false, currentTime: 0 }))
        return 'stop'
      }
    }

    const t = q[nextIndex]
    clearDeferIfPlaybackTrackChanged(state.track?.id, t.id)
    playerState.update((s) => ({
      ...s,
      queueIndex: nextIndex,
      track: t,
      currentTime: 0,
      sourceDuration: t.duration > 0 ? t.duration : 0,
    }))
    return 'play'
  },

  /** Merge BPM from file metadata (async); sync queue + library list */
  mergeCurrentTrackBpm(bpm: number, trackId: string) {
    if (!(bpm > 0)) return
    libraryActions.patchTrack(trackId, { bpm })
    playerState.update((s) => ({
      ...s,
      queue: s.queue.map((t) => (t.id === trackId ? { ...t, bpm } : t)),
      track: s.track?.id === trackId ? { ...s.track, bpm } : s.track,
    }))
  },

  /** Merge full track row from library (metadata / artwork updates). */
  mergeTrackFromLibrary(track: Track) {
    playerState.update((s) => ({
      ...s,
      queue: s.queue.map((t) => (t.id === track.id ? { ...t, ...track } : t)),
      track: s.track?.id === track.id ? { ...s.track, ...track } : s.track,
    }))
  },

  /** Remove BPM from queue/current track in memory (after library clear). */
  stripTrackBpm(trackId: string) {
    const strip = (t: Track): Track => {
      const next = { ...t }
      delete next.bpm
      return next
    }
    playerState.update((s) => ({
      ...s,
      queue: s.queue.map((t) => (t.id === trackId ? strip(t) : t)),
      track: s.track?.id === trackId ? strip(s.track) : s.track,
    }))
  },

  /** After one or more tracks were removed from the library (paths or IDs). */
  onLibraryRemovedTracks(trackIds: string[]) {
    if (trackIds.length === 0) return
    const remove = new Set(trackIds)
    playerState.update((s) => {
      if (s.track && remove.has(s.track.id)) {
        libraryActions.clearDeferredListPopularity()
        return {
          ...s,
          track: null,
          queue: [],
          queueIndex: -1,
          isPlaying: false,
          currentTime: 0,
          sourceDuration: 0,
          playbackListDanceId: null,
          playbackListFolderPath: null,
          muted: false,
        }
      }
      const newQueue = s.queue.filter((t) => !remove.has(t.id))
      if (newQueue.length === s.queue.length) return s
      const curId = s.track?.id
      if (!curId) return { ...s, queue: newQueue, queueIndex: -1 }
      const newIndex = newQueue.findIndex((t) => t.id === curId)
      if (newIndex < 0) return s
      return { ...s, queue: newQueue, queueIndex: newIndex }
    })
  },

  onLibraryRemovedTrack(trackId: string) {
    playerActions.onLibraryRemovedTracks([trackId])
  },
}
