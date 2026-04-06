import { TEMPO_MAX_PERCENT, TEMPO_MIN_PERCENT } from '@shared/constants'
import { resolveTrackReferenceBpm, type TrackReferenceBpm } from '@shared/track-bpm'
import type { DanceId, PlaybackQueueItem, PlaybackState, RepeatMode, Track } from '@shared/types'
import { derived, get, writable } from 'svelte/store'
import { audioEngine } from '../services/audioEngine'
import { libraryActions, libraryState } from './library.store'

export function currentQueueItem(s: PlaybackState): PlaybackQueueItem | undefined {
  return s.queue[s.queueIndex]
}

export function isQueueBreakItem(s: PlaybackState): boolean {
  return currentQueueItem(s)?.kind === 'break'
}

export function queueTrackIdsInOrder(p: PlaybackState): string[] {
  return p.queue
    .filter((i): i is Extract<PlaybackQueueItem, { kind: 'track' }> => i.kind === 'track')
    .map((i) => i.track.id)
}

/** Seconds to play from file start for queue item `index`, or full file when `null`. */
export function playbackCapForQueueIndex(s: PlaybackState, index: number): number | null {
  if (index < 0 || index >= s.queue.length) return null
  const item = s.queue[index]
  if (item.kind !== 'track') return null
  const c = item.capSec
  return typeof c === 'number' && c > 0 ? c : null
}

export function playbackCapForCurrent(s: PlaybackState): number | null {
  return playbackCapForQueueIndex(s, s.queueIndex)
}

/** Keep engine segment cap in sync with queue (tracks only). */
export function syncAudioEnginePlaybackCap(): void {
  if (isQueueBreakItem(get(playerState))) {
    audioEngine.setPlaybackEndCap(null)
    return
  }
  audioEngine.setPlaybackEndCap(playbackCapForCurrent(get(playerState)))
}

function clearDeferIfPlaybackTrackChanged(
  prevId: string | null | undefined,
  nextId: string | null | undefined,
) {
  if (prevId !== nextId) {
    libraryActions.clearDeferredListPopularity()
  }
}

function stateSliceForQueueIndex(s: PlaybackState, idx: number): Partial<PlaybackState> {
  const item = s.queue[idx]
  if (!item) {
    return {
      queueIndex: idx,
      track: null,
      currentTime: 0,
      sourceDuration: 0,
    }
  }
  if (item.kind === 'break') {
    return {
      queueIndex: idx,
      track: null,
      currentTime: 0,
      sourceDuration: item.seconds,
    }
  }
  return {
    queueIndex: idx,
    track: item.track,
    currentTime: 0,
    sourceDuration: item.track.duration > 0 ? item.track.duration : 0,
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
  playbackFinalsSessionId: null,
}

export const playerState = writable<PlaybackState>(initialState)

export const currentBreakLabel = derived(playerState, ($s) => {
  const it = currentQueueItem($s)
  return it?.kind === 'break' ? (it.label ?? 'Break') : null
})

// ─── Derived ──────────────────────────────────────────────────────────────────

export const currentTrack = derived(playerState, ($s) => $s.track)
export const isPlaying = derived(playerState, ($s) => $s.isPlaying)
export const currentTime = derived(playerState, ($s) => $s.currentTime)
export const volume = derived(playerState, ($s) => $s.volume)
export const queue = derived(playerState, ($s) => $s.queue)
export const isPlaybackBreak = derived(playerState, ($s) => isQueueBreakItem($s))

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

/** Wall-clock listening time: tracks divide by tempo; breaks use raw elapsed. */
export const listenerElapsed = derived(playerState, ($s) => {
  if (isQueueBreakItem($s)) return $s.currentTime
  return $s.tempo > 0 ? $s.currentTime / $s.tempo : 0
})

/** File / break duration shown in UI / seek bar (tracks: capped by segment when set). */
export const displaySourceDuration = derived(playerState, ($s) => {
  if (isQueueBreakItem($s)) return $s.sourceDuration
  const file = $s.sourceDuration > 0 ? $s.sourceDuration : ($s.track?.duration ?? 0)
  const cap = playbackCapForCurrent($s)
  if (cap == null) return file
  if (file > 0) return Math.min(file, cap)
  return cap
})

export const listenerDuration = derived(playerState, ($s) => {
  if (isQueueBreakItem($s)) {
    return $s.sourceDuration > 0 ? $s.sourceDuration : 0
  }
  if (!($s.tempo > 0)) return 0
  const file = $s.sourceDuration > 0 ? $s.sourceDuration : ($s.track?.duration ?? 0)
  const cap = playbackCapForCurrent($s)
  const eff = cap != null ? (file > 0 ? Math.min(file, cap) : cap) : file
  if (!(eff > 0)) return 0
  return eff / $s.tempo
})

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
    playbackCaps?: (number | null)[] | null,
  ) {
    const s0 = get(playerState)
    const items: PlaybackQueueItem[] = tracks.map((t, i) => {
      const c = playbackCaps?.[i]
      const capSec = typeof c === 'number' && c > 0 ? c : null
      return { kind: 'track' as const, track: t, capSec }
    })
    const t = tracks[startIndex] ?? null
    clearDeferIfPlaybackTrackChanged(s0.track?.id, t?.id)
    playerState.update((s) => ({
      ...s,
      queue: items,
      queueIndex: startIndex,
      track: t,
      sourceDuration: t && t.duration > 0 ? t.duration : 0,
      currentTime: 0,
      playbackListDanceId: listFolderPath ? null : listDanceId,
      playbackListFolderPath: listFolderPath,
      playbackFinalsSessionId: null,
    }))
  },

  setFinalsQueue(items: PlaybackQueueItem[], startIndex: number, finalsSessionId: string) {
    const s0 = get(playerState)
    const item = items[startIndex]
    const t = item?.kind === 'track' ? item.track : null
    clearDeferIfPlaybackTrackChanged(s0.track?.id, t?.id)
    playerState.update((s) => ({
      ...s,
      queue: items,
      queueIndex: startIndex,
      ...stateSliceForQueueIndex({ ...s, queue: items, queueIndex: startIndex }, startIndex),
      playbackListDanceId: null,
      playbackListFolderPath: null,
      playbackFinalsSessionId: finalsSessionId,
    }))
  },

  clearFinalsPlaybackOrigin() {
    playerState.update((s) =>
      s.playbackFinalsSessionId == null ? s : { ...s, playbackFinalsSessionId: null },
    )
  },

  stopAndClearQueue() {
    playerState.update((s) => ({
      ...s,
      track: null,
      queue: [],
      queueIndex: -1,
      currentTime: 0,
      sourceDuration: 0,
      isPlaying: false,
      playbackListDanceId: null,
      playbackListFolderPath: null,
      playbackFinalsSessionId: null,
    }))
  },

  /** Same tracks as the current queue, new order; keeps the current track as `track` and fixes `queueIndex`. */
  reorderQueueByOrderedIds(orderedIds: string[]) {
    playerState.update((s) => {
      const trackItems = s.queue.filter(
        (i): i is Extract<PlaybackQueueItem, { kind: 'track' }> => i.kind === 'track',
      )
      if (trackItems.length === 0 || trackItems.length !== orderedIds.length) return s
      const capById = new Map(trackItems.map((it) => [it.track.id, it.capSec]))
      const byId = new Map(trackItems.map((it) => [it.track.id, it.track]))
      const newQueue: PlaybackQueueItem[] = []
      for (const id of orderedIds) {
        const t = byId.get(id)
        if (!t) return s
        newQueue.push({
          kind: 'track',
          track: t,
          capSec: capById.get(id) ?? null,
        })
      }
      const curId = s.track?.id
      let newIndex = curId != null ? orderedIds.indexOf(curId) : s.queueIndex
      if (newIndex < 0) newIndex = s.queueIndex
      const next = { ...s, queue: newQueue, queueIndex: newIndex }
      return { ...next, ...stateSliceForQueueIndex(next, newIndex) }
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

  skipToNextQueue(): boolean {
    const s = get(playerState)
    const q = s.queue
    if (q.length === 0) return false

    let nextIndex = s.queueIndex + 1
    if (nextIndex >= q.length) {
      if (s.repeatMode === 'all') nextIndex = 0
      else return false
    }

    const nextItem = q[nextIndex]
    const nextTrack = nextItem?.kind === 'track' ? nextItem.track : null
    clearDeferIfPlaybackTrackChanged(s.track?.id, nextTrack?.id)
    playerState.update((x) => ({
      ...x,
      ...stateSliceForQueueIndex(x, nextIndex),
    }))
    return true
  },

  skipToPreviousQueue(): boolean {
    const s = get(playerState)
    const q = s.queue
    if (q.length === 0) return false

    let prevIndex = s.queueIndex - 1
    if (prevIndex < 0) {
      if (s.repeatMode === 'all') prevIndex = q.length - 1
      else return false
    }

    const prevItem = q[prevIndex]
    const prevTrack = prevItem?.kind === 'track' ? prevItem.track : null
    clearDeferIfPlaybackTrackChanged(s.track?.id, prevTrack?.id)
    playerState.update((x) => ({
      ...x,
      ...stateSliceForQueueIndex(x, prevIndex),
    }))
    return true
  },

  restartCurrentInPlace() {
    playerState.update((s) => ({ ...s, currentTime: 0 }))
  },

  /**
   * Advance when the current segment ends (track via audio engine, break via timer).
   */
  handleTrackEnded(): 'stop' | 'play' {
    const state = get(playerState)
    const q = state.queue
    if (q.length === 0) {
      playerState.update((s) => ({ ...s, isPlaying: false, currentTime: 0 }))
      return 'stop'
    }

    const cur = currentQueueItem(state)
    if (state.repeatMode === 'one' && cur?.kind === 'track') {
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

    const nextItem = q[nextIndex]
    const nextTrack = nextItem?.kind === 'track' ? nextItem.track : null
    clearDeferIfPlaybackTrackChanged(state.track?.id, nextTrack?.id)
    playerState.update((s) => ({
      ...s,
      ...stateSliceForQueueIndex(s, nextIndex),
    }))
    return 'play'
  },

  mergeCurrentTrackBpm(bpm: number, trackId: string) {
    if (!(bpm > 0)) return
    libraryActions.patchTrack(trackId, { bpm })
    playerState.update((s) => ({
      ...s,
      queue: s.queue.map((it) =>
        it.kind === 'track' && it.track.id === trackId
          ? { ...it, track: { ...it.track, bpm } }
          : it,
      ),
      track: s.track?.id === trackId ? { ...s.track, bpm } : s.track,
    }))
  },

  mergeTrackFromLibrary(track: Track) {
    playerState.update((s) => ({
      ...s,
      queue: s.queue.map((it) =>
        it.kind === 'track' && it.track.id === track.id
          ? { ...it, track: { ...it.track, ...track } }
          : it,
      ),
      track: s.track?.id === track.id ? { ...s.track, ...track } : s.track,
    }))
  },

  stripTrackBpm(trackId: string) {
    const strip = (t: Track): Track => {
      const next = { ...t }
      delete next.bpm
      return next
    }
    playerState.update((s) => ({
      ...s,
      queue: s.queue.map((it) =>
        it.kind === 'track' && it.track.id === trackId ? { ...it, track: strip(it.track) } : it,
      ),
      track: s.track?.id === trackId ? strip(s.track) : s.track,
    }))
  },

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
          playbackFinalsSessionId: null,
          muted: false,
        }
      }
      const pairs = s.queue.map((it) => {
        if (it.kind !== 'track') return { it, drop: false }
        return { it, drop: remove.has(it.track.id) }
      })
      const kept = pairs.filter((p) => !p.drop).map((p) => p.it)
      if (kept.length === s.queue.length) return s
      const curId = s.track?.id
      if (!curId) {
        return { ...s, queue: kept, queueIndex: -1, track: null, sourceDuration: 0, currentTime: 0 }
      }
      const newIndex = kept.findIndex((it) => it.kind === 'track' && it.track.id === curId)
      if (newIndex < 0) {
        libraryActions.clearDeferredListPopularity()
        return {
          ...s,
          queue: kept,
          queueIndex: -1,
          track: null,
          isPlaying: false,
          currentTime: 0,
          sourceDuration: 0,
          playbackFinalsSessionId: null,
        }
      }
      const next = { ...s, queue: kept, queueIndex: newIndex }
      return { ...next, ...stateSliceForQueueIndex(next, newIndex) }
    })
  },

  onLibraryRemovedTrack(trackId: string) {
    playerActions.onLibraryRemovedTracks([trackId])
  },
}
