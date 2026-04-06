import type { Track } from '@shared/types'
import { detectBpmFromAudioBuffer } from './bpmDetector'

const MANUAL_BPM_MIN = 30
const MANUAL_BPM_MAX = 400

async function persistBpmToLibrary(
  trackId: string,
  filePath: string,
  bpm: number,
): Promise<boolean> {
  const lower = filePath.toLowerCase()
  const canEmbed = lower.endsWith('.mp3') || lower.endsWith('.flac')
  if (canEmbed) {
    const r = await window.electronAPI.library.saveDetectedBpm({ trackId, filePath, bpm })
    return r.success
  }
  const r = await window.electronAPI.library.setTrackBpm(trackId, bpm)
  return r.success
}

/**
 * Resolve BPM for a local file: metadata tags first (unless forceDetect), else PCM analysis.
 * Persists to library (and embeds in MP3/FLAC when applicable).
 */
export async function resolveBpmForLocalTrack(
  track: Track,
  options: { forceDetect?: boolean } = {},
): Promise<number | null> {
  if (track.source !== 'local' || !track.localPath) return null

  const ctx = new AudioContext()
  try {
    const read = await window.electronAPI.audio.readFile(track.localPath)
    if (!read.success || !read.data) return null

    const buffer = await ctx.decodeAudioData(read.data.slice(0))

    if (!options.forceDetect) {
      const meta = await window.electronAPI.audio.getMetadata(track.localPath)
      const tagBpm =
        meta.success && meta.data?.bpm != null && meta.data.bpm > 0
          ? Math.round(meta.data.bpm)
          : undefined
      if (tagBpm != null) {
        const needsLibrary = !(track.bpm != null && track.bpm > 0)
        if (needsLibrary) {
          await window.electronAPI.library.setTrackBpm(track.id, tagBpm)
        }
        return tagBpm
      }
      if (track.bpm != null && track.bpm > 0) return track.bpm
    }

    const detected = await detectBpmFromAudioBuffer(ctx, buffer, track.dances)
    if (detected == null) return null

    const ok = await persistBpmToLibrary(track.id, track.localPath, detected)
    return ok ? detected : null
  } catch {
    return null
  } finally {
    await ctx.close().catch(() => {})
  }
}

/** Persist a user-entered BPM (library + embedded tags for MP3/FLAC when applicable). */
export async function persistManualBpm(track: Track, bpm: number): Promise<boolean> {
  const rounded = Math.round(bpm)
  if (!Number.isFinite(rounded) || rounded < MANUAL_BPM_MIN || rounded > MANUAL_BPM_MAX) {
    return false
  }
  if (track.source === 'local' && track.localPath) {
    return persistBpmToLibrary(track.id, track.localPath, rounded)
  }
  const r = await window.electronAPI.library.setTrackBpm(track.id, rounded)
  return r.success
}
