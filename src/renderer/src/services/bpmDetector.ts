import {
  bpmDetectionTempoWindow,
  DANCE_IDS_LOWPASS_BPM_DETECT,
  pickPlausibleBpmFromRawForDance,
} from '@shared/track-bpm'
import type { DanceId } from '@shared/types'
import { guess } from 'web-audio-beat-detector'

/** Limit analysis window so long tracks stay responsive (first portion is usually enough). */
const MAX_ANALYZE_SECONDS = 120
const BPM_MIN = 60
const BPM_MAX = 220

/** Emphasize kick / body of the groove before peak-based tempo estimation. */
const SLOW_LATIN_LOWPASS_HZ = 190

function sliceAudioBuffer(
  renderContext: AudioContext,
  buffer: AudioBuffer,
  maxSeconds: number,
): AudioBuffer {
  const maxFrames = Math.min(buffer.length, Math.floor(maxSeconds * buffer.sampleRate))
  if (maxFrames <= 0) return buffer
  if (maxFrames >= buffer.length) return buffer

  const { numberOfChannels, sampleRate } = buffer
  const out = renderContext.createBuffer(numberOfChannels, maxFrames, sampleRate)
  for (let c = 0; c < numberOfChannels; c++) {
    const slice = buffer.getChannelData(c).subarray(0, maxFrames)
    out.copyToChannel(new Float32Array(slice), c)
  }
  return out
}

async function preprocessSlowLatinPulse(buffer: AudioBuffer): Promise<AudioBuffer> {
  const { sampleRate, length: frames, numberOfChannels: ch } = buffer
  const offline = new OfflineAudioContext(1, frames, sampleRate)
  const mono = offline.createBuffer(1, frames, sampleRate)
  const dst = mono.getChannelData(0)
  if (ch === 1) {
    dst.set(buffer.getChannelData(0))
  } else {
    for (let i = 0; i < frames; i++) {
      let s = 0
      for (let c = 0; c < ch; c++) s += buffer.getChannelData(c)[i] ?? 0
      dst[i] = s / ch
    }
  }
  const src = offline.createBufferSource()
  src.buffer = mono
  const lp = offline.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = SLOW_LATIN_LOWPASS_HZ
  lp.Q.value = Math.SQRT1_2
  src.connect(lp)
  lp.connect(offline.destination)
  src.start(0)
  return offline.startRendering()
}

/**
 * Estimate tempo (BPM) from decoded PCM using web-audio-beat-detector (Web Audio + worker).
 * When the track has exactly one assigned dance, passes a matching `minTempo`/`maxTempo` so the
 * library folds intervals into the competition band (reduces double-time estimates on Rumba etc.).
 * Returns null if analysis fails or result is out of range.
 */
export async function detectBpmFromAudioBuffer(
  renderContext: AudioContext,
  buffer: AudioBuffer,
  dances?: DanceId[],
): Promise<number | null> {
  try {
    const slice = sliceAudioBuffer(renderContext, buffer, MAX_ANALYZE_SECONDS)
    const tempoWindow = bpmDetectionTempoWindow(dances)
    const loneDance = dances?.length === 1 ? dances[0] : undefined
    const useLowpass = loneDance !== undefined && DANCE_IDS_LOWPASS_BPM_DETECT.includes(loneDance)

    let analyzeBuffer = slice
    if (useLowpass) {
      analyzeBuffer = await preprocessSlowLatinPulse(slice)
    }

    const { bpm } =
      tempoWindow != null ? await guess(analyzeBuffer, tempoWindow) : await guess(analyzeBuffer)
    if (!Number.isFinite(bpm) || bpm <= 0) return null
    let rounded = Math.round(bpm)
    if (rounded < BPM_MIN || rounded > BPM_MAX) return null
    if (loneDance !== undefined) {
      rounded = pickPlausibleBpmFromRawForDance(rounded, loneDance)
    }
    if (rounded < BPM_MIN || rounded > BPM_MAX) return null
    return rounded
  } catch {
    return null
  }
}
