import {
  bpmDetectionTempoWindow,
  DANCE_IDS_LOWPASS_BPM_DETECT,
  pickPlausibleBpmFromRawForDance,
} from '@shared/track-bpm'
import type { DanceId } from '@shared/types'
import { guess } from 'web-audio-beat-detector'

const BPM_MIN = 60
const BPM_MAX = 220
const SAMPLE_WINDOW_SECONDS = 24
const MIN_SAMPLE_WINDOW_SECONDS = 12
const MIN_GAP_SECONDS = 6

/** Emphasize kick / body of the groove before peak-based tempo estimation. */
const SLOW_LATIN_LOWPASS_HZ = 190

function sliceAudioBuffer(
  renderContext: AudioContext,
  buffer: AudioBuffer,
  startSeconds: number,
  durationSeconds: number,
): AudioBuffer {
  const startFrame = Math.max(0, Math.floor(startSeconds * buffer.sampleRate))
  const lengthFrames = Math.max(0, Math.floor(durationSeconds * buffer.sampleRate))
  const endFrame = Math.min(buffer.length, startFrame + lengthFrames)
  const frames = Math.max(0, endFrame - startFrame)
  if (frames <= 0 || startFrame >= buffer.length) return buffer
  if (startFrame === 0 && frames >= buffer.length) return buffer

  const { numberOfChannels, sampleRate } = buffer
  const out = renderContext.createBuffer(numberOfChannels, frames, sampleRate)
  for (let c = 0; c < numberOfChannels; c++) {
    const slice = buffer.getChannelData(c).subarray(startFrame, endFrame)
    out.copyToChannel(new Float32Array(slice), c)
  }
  return out
}

function buildSampleStartTimes(totalSeconds: number, windowSeconds: number): number[] {
  if (!(totalSeconds > 0) || !(windowSeconds > 0)) return [0]
  if (totalSeconds <= windowSeconds + MIN_GAP_SECONDS) return [0]

  const usable = totalSeconds - windowSeconds
  let count = totalSeconds >= 140 ? 5 : totalSeconds >= 90 ? 4 : totalSeconds >= 55 ? 3 : 2
  const edgeInset = Math.min(usable * 0.12, 16)
  const span = Math.max(0, usable - edgeInset * 2)
  if (span <= 0) return [Math.max(0, usable / 2)]

  const minStep = 5
  while (count > 2 && span / Math.max(1, count - 1) < minStep) {
    count -= 1
  }

  const starts: number[] = []
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1)
    starts.push(edgeInset + span * t)
  }
  return starts
}

function medianRounded(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
}

function removeFirstEqual(arr: number[], value: number): number[] {
  const i = arr.indexOf(value)
  if (i < 0) return arr
  return [...arr.slice(0, i), ...arr.slice(i + 1)]
}

/** Prefer the tightest group of estimates; breaks ties toward lower BPM to resist double-time tails. */
function denseClusterMedian(values: number[], widthBpm = 16): number | null {
  if (values.length < 3) return null
  const sorted = [...values].sort((a, b) => a - b)
  let best: number[] = []
  let bestCount = 0
  let bestSpread = Number.POSITIVE_INFINITY

  for (let i = 0; i < sorted.length; i++) {
    const lo = sorted[i] ?? 0
    const hi = lo + widthBpm
    const inWin = values.filter((v) => v >= lo && v <= hi)
    if (inWin.length === 0) continue
    const spread = Math.max(...inWin) - Math.min(...inWin)
    const medWin = medianRounded(inWin)
    const medBest = best.length > 0 ? medianRounded(best) : Number.POSITIVE_INFINITY
    if (
      inWin.length > bestCount ||
      (inWin.length === bestCount && medWin < medBest) ||
      (inWin.length === bestCount && medWin === medBest && spread < bestSpread)
    ) {
      best = inWin
      bestCount = inWin.length
      bestSpread = spread
    }
  }

  const need = Math.max(3, Math.ceil(values.length * 0.45))
  return bestCount >= need ? medianRounded(best) : null
}

/** Drop up to two windows that disagree strongly with the provisional median. */
function deviationTrimmedMedian(values: number[]): number {
  let work = [...values]
  for (let pass = 0; pass < 2 && work.length >= 3; pass++) {
    const med = medianRounded(work)
    const floor = Math.max(10, Math.round(med * 0.1))
    const scored = work.map((v) => ({ v, d: Math.abs(v - med) }))
    scored.sort((a, b) => b.d - a.d)
    const top = scored[0]
    const second = scored[1]
    if (!top || top.d < floor) break
    if (second && top.d < second.d * 1.45 && top.d - second.d < 5) break
    work = removeFirstEqual(work, top.v)
  }
  return medianRounded(work.length > 0 ? work : values)
}

function aggregateSampleBpms(values: number[]): number {
  if (values.length === 0) return 0
  const cluster = denseClusterMedian(values)
  return cluster ?? deviationTrimmedMedian(values)
}

async function detectAcrossSamples(
  renderContext: AudioContext,
  buffer: AudioBuffer,
  starts: number[],
  windowSeconds: number,
  opts: {
    useLowpass: boolean
    tempoWindow?: { minTempo: number; maxTempo: number }
    loneDance?: DanceId
  },
): Promise<number[]> {
  const out: number[] = []
  for (const start of starts) {
    try {
      const rawSlice = sliceAudioBuffer(renderContext, buffer, start, windowSeconds)
      const analyzeBuffer = opts.useLowpass ? await preprocessSlowLatinPulse(rawSlice) : rawSlice
      const guessResult =
        opts.tempoWindow != null
          ? await guess(analyzeBuffer, opts.tempoWindow)
          : await guess(analyzeBuffer)
      const bpm = guessResult.bpm
      if (!Number.isFinite(bpm) || bpm <= 0) continue
      let rounded = Math.round(bpm)
      if (opts.loneDance !== undefined) {
        rounded = pickPlausibleBpmFromRawForDance(rounded, opts.loneDance)
      }
      if (rounded >= BPM_MIN && rounded <= BPM_MAX) {
        out.push(rounded)
      }
    } catch {
      // Skip bad/quiet slices; keep successful windows.
    }
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
    const tempoWindow = bpmDetectionTempoWindow(dances)
    const loneDance = dances?.length === 1 ? dances[0] : undefined
    const useLowpass = loneDance !== undefined && DANCE_IDS_LOWPASS_BPM_DETECT.includes(loneDance)
    const windowSeconds = Math.max(
      MIN_SAMPLE_WINDOW_SECONDS,
      Math.min(SAMPLE_WINDOW_SECONDS, buffer.duration),
    )
    const starts = buildSampleStartTimes(buffer.duration, windowSeconds)
    let detectedBpms = await detectAcrossSamples(renderContext, buffer, starts, windowSeconds, {
      useLowpass,
      tempoWindow,
      loneDance,
    })

    // Fallback 1: keep dance window but remove low-pass in case filtering lost sparse transients.
    if (detectedBpms.length === 0 && useLowpass) {
      detectedBpms = await detectAcrossSamples(renderContext, buffer, starts, windowSeconds, {
        useLowpass: false,
        tempoWindow,
        loneDance,
      })
    }

    // Fallback 2: remove dance tempo window to let detector recover from unusual arrangements.
    if (detectedBpms.length === 0 && tempoWindow != null) {
      detectedBpms = await detectAcrossSamples(renderContext, buffer, starts, windowSeconds, {
        useLowpass: false,
        loneDance,
      })
    }

    if (detectedBpms.length === 0) return null
    return aggregateSampleBpms(detectedBpms)
  } catch {
    return null
  }
}
