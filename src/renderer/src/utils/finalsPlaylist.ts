import { DANCE_CATEGORIES } from '@shared/constants'
import type {
  DanceId,
  FinalRoundConfig,
  FinalsPlaylistRow,
  PlaybackQueueItem,
  Track,
} from '@shared/types'

/** Full player queue (tracks + breaks) from a finals playlist. */
export function buildFinalsPlaybackQueue(
  rows: readonly FinalsPlaylistRow[],
  tracks: readonly Track[],
): PlaybackQueueItem[] {
  const items: PlaybackQueueItem[] = []
  for (const row of rows) {
    if (row.kind === 'pause') {
      items.push({ kind: 'break', seconds: row.seconds, label: row.label ?? 'Break' })
      continue
    }
    if (row.trackId == null) continue
    const t = tracks.find((x) => x.id === row.trackId)
    if (!t) continue
    items.push({
      kind: 'track',
      track: t,
      capSec: row.playDurationSec > 0 ? row.playDurationSec : null,
    })
  }
  return items
}

/** Playback queue index for a playlist row (tracks + pauses); -1 if row is empty / missing track. */
export function playbackQueueIndexForPlaylistRow(
  rows: readonly FinalsPlaylistRow[],
  playlistIndex: number,
  tracks: readonly Track[],
): number {
  if (playlistIndex < 0 || playlistIndex >= rows.length) return -1
  let qi = 0
  for (let i = 0; i <= playlistIndex; i++) {
    const row = rows[i]
    if (row.kind === 'pause') {
      if (i === playlistIndex) return qi
      qi++
      continue
    }
    if (row.trackId == null) continue
    const t = tracks.find((x) => x.id === row.trackId)
    if (!t) continue
    if (i === playlistIndex) return qi
    qi++
  }
  return -1
}

/** Playlist row index for current playback queue index, or null. */
export function playlistRowIndexForQueueIndex(
  rows: readonly FinalsPlaylistRow[],
  tracks: readonly Track[],
  queueIndex: number,
): number | null {
  let qi = 0
  for (let pi = 0; pi < rows.length; pi++) {
    const row = rows[pi]
    if (row.kind === 'pause') {
      if (qi === queueIndex) return pi
      qi++
      continue
    }
    if (row.trackId == null) continue
    const t = tracks.find((x) => x.id === row.trackId)
    if (!t) continue
    if (qi === queueIndex) return pi
    qi++
  }
  return null
}

export function parseMinSecParts(minutes: number, seconds: number): number {
  const m = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0
  const s = Number.isFinite(seconds) ? Math.max(0, Math.min(59, Math.floor(seconds))) : 0
  return m * 60 + s
}

export function formatDurationClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export function candidatesForDance(
  tracks: readonly Track[],
  danceId: DanceId,
  minDurationSec: number,
): Track[] {
  return tracks.filter((t) => t.dances.includes(danceId) && t.duration >= minDurationSec)
}

function pickRandom<T>(arr: readonly T[]): T | undefined {
  if (arr.length === 0) return undefined
  return arr[Math.floor(Math.random() * arr.length)]
}

export function pickRandomTrackForSlot(
  tracks: readonly Track[],
  danceId: DanceId,
  minDurationSec: number,
  excludeTrackId?: string | null,
): { track: Track | null; emptyReason?: string } {
  let pool = candidatesForDance(tracks, danceId, minDurationSec)
  if (excludeTrackId && pool.length > 1) {
    const without = pool.filter((t) => t.id !== excludeTrackId)
    if (without.length > 0) pool = without
  }
  const t = pickRandom(pool)
  if (t) return { track: t }
  const tagged = tracks.filter((tr) => tr.dances.includes(danceId))
  if (tagged.length === 0) {
    return { track: null, emptyReason: 'No tracks tagged with this dance' }
  }
  return {
    track: null,
    emptyReason: `No track ≥ ${formatDurationClock(minDurationSec)} for this dance`,
  }
}

/** Competition order within each final; only selected dances appear. */
export function orderedDancesForRound(r: FinalRoundConfig): DanceId[] {
  return DANCE_CATEGORIES.filter((d) => d.style === r.discipline && r.danceIds.includes(d.id)).map(
    (d) => d.id,
  )
}

export function buildFinalsPlaylistRows(
  rounds: readonly FinalRoundConfig[],
  tracks: readonly Track[],
  gapBetweenFinalsSec: number,
): FinalsPlaylistRow[] {
  const rows: FinalsPlaylistRow[] = []
  const gap = Math.max(0, Math.floor(Number(gapBetweenFinalsSec)) || 0)
  for (let fi = 0; fi < rounds.length; fi++) {
    const r = rounds[fi]
    const ordered = orderedDancesForRound(r)
    for (let di = 0; di < ordered.length; di++) {
      const danceId = ordered[di]
      const { track, emptyReason } = pickRandomTrackForSlot(tracks, danceId, r.danceDurationSec)
      rows.push({
        kind: 'track',
        trackId: track?.id ?? null,
        danceId,
        finalIndex: fi,
        playDurationSec: r.danceDurationSec,
        emptyReason: track ? undefined : emptyReason,
      })
      if (di < ordered.length - 1 && r.breakDurationSec > 0) {
        rows.push({
          kind: 'pause',
          seconds: r.breakDurationSec,
          finalIndex: fi,
        })
      }
    }
    if (fi < rounds.length - 1 && gap > 0) {
      rows.push({
        kind: 'pause',
        seconds: gap,
        finalIndex: fi,
        label: 'Between finals',
      })
    }
  }
  return rows
}

export function randomizeFinalsTrackPicks(
  playlist: readonly FinalsPlaylistRow[],
  tracks: readonly Track[],
  rounds: readonly FinalRoundConfig[],
): FinalsPlaylistRow[] {
  return playlist.map((row) => {
    if (row.kind !== 'track') return row
    const cfg = rounds[row.finalIndex]
    if (!cfg) return row
    const { track, emptyReason } = pickRandomTrackForSlot(
      tracks,
      row.danceId,
      cfg.danceDurationSec,
      row.trackId,
    )
    return {
      kind: 'track',
      trackId: track?.id ?? null,
      danceId: row.danceId,
      finalIndex: row.finalIndex,
      playDurationSec: row.playDurationSec,
      emptyReason: track ? undefined : emptyReason,
    }
  })
}
