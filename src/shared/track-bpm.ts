import { DANCE_CATEGORIES_BY_ID } from './constants'
import type { DanceId, Track } from './types'

/** Widen competition BPM range slightly for `web-audio-beat-detector` tempo folding. */
const BPM_DETECT_ASSIGNMENT_PADDING = 8

/**
 * Slow Latin dances where syncopation / intermittent percussion often confuses peak-based BPM
 * detection; see `bpmDetector` low-pass preprocessing.
 */
export const DANCE_IDS_LOWPASS_BPM_DETECT: ReadonlyArray<DanceId> = ['rumba', 'samba']

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

/**
 * When exactly one dance is assigned, constrain beat-detector octave folding to that dance’s
 * tempo band so subdivision peaks (e.g. Rumba read as ~170 BPM) map toward the real pulse.
 */
export function bpmDetectionTempoWindow(
  dances: DanceId[] | undefined,
): { minTempo: number; maxTempo: number } | undefined {
  if (!dances || dances.length !== 1) return undefined
  const cat = DANCE_CATEGORIES_BY_ID[dances[0]]
  if (!cat) return undefined
  const [low, high] = cat.bpmRange
  return {
    minTempo: Math.max(60, low - BPM_DETECT_ASSIGNMENT_PADDING),
    maxTempo: Math.min(220, high + BPM_DETECT_ASSIGNMENT_PADDING),
  }
}

/**
 * If the detector returns a multiple of the true tempo (common with syncopated arrangements),
 * pick a candidate from simple integer ratios that falls in the dance competition range.
 */
export function pickPlausibleBpmFromRawForDance(raw: number, danceId: DanceId): number {
  const cat = DANCE_CATEGORIES_BY_ID[danceId]
  if (!cat || !Number.isFinite(raw) || raw <= 0) return Math.round(raw)

  const [low, high] = cat.bpmRange
  const mid = (low + high) / 2
  const inBand = (c: number) => c >= low - 2 && c <= high + 2

  const cands = new Set<number>()
  const add = (x: number) => {
    const r = Math.round(x)
    if (r >= 60 && r <= 220) cands.add(r)
  }
  add(raw)
  for (let d = 2; d <= 4; d++) add(raw / d)
  add(raw * 2)

  const bandHits = [...cands].filter(inBand)
  if (bandHits.length > 0) {
    return bandHits.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a))
  }

  // Double-time estimate slightly below the band (e.g. 85 vs ~98): snap into competition range
  if (raw > high * 1.35) {
    const half = Math.round(raw / 2)
    if (half >= low - 12 && half <= high + 8) {
      return Math.max(low, Math.min(high, half))
    }
  }

  return Math.round(raw)
}
