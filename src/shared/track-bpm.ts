import { DANCE_CATEGORIES_BY_ID } from './constants'
import type { DanceId, Track } from './types'

export type TrackReferenceBpmSource = 'metadata' | 'dance-midpoint'

/** How we chose the reference BPM shown in the player (before tempo adjustment). */
export interface TrackReferenceBpm {
  bpm: number
  source: TrackReferenceBpmSource
}

/**
 * Resolve a reference BPM for UI and tempo math:
 * 1. Embedded tag (TBPM etc.) when present
 * 2. Otherwise midpoint of competition BPM range for the track’s assigned dance (at most one)
 */
export function resolveTrackReferenceBpm(
  track: Track | null | undefined,
): TrackReferenceBpm | null {
  if (!track) return null

  const rawBpm = track.bpm
  const bpmNum = typeof rawBpm === 'number' ? rawBpm : Number(rawBpm)
  if (Number.isFinite(bpmNum) && bpmNum > 0) {
    return { bpm: Math.round(bpmNum), source: 'metadata' }
  }

  const dances = track.dances ?? []
  if (dances.length === 0) return null

  const midpoints: number[] = []
  for (const id of dances) {
    const cat = DANCE_CATEGORIES_BY_ID[id as DanceId]
    if (cat) {
      midpoints.push((cat.bpmRange[0] + cat.bpmRange[1]) / 2)
    }
  }
  if (midpoints.length === 0) return null

  const avg = midpoints.reduce((a, b) => a + b, 0) / midpoints.length
  return { bpm: Math.round(avg), source: 'dance-midpoint' } // single dance: one midpoint
}
