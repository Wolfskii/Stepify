import { guess } from 'web-audio-beat-detector'

/** Limit analysis window so long tracks stay responsive (first portion is usually enough). */
const MAX_ANALYZE_SECONDS = 120
const BPM_MIN = 60
const BPM_MAX = 220

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

/**
 * Estimate tempo (BPM) from decoded PCM using web-audio-beat-detector (Web Audio + worker).
 * Returns null if analysis fails or result is out of range.
 */
export async function detectBpmFromAudioBuffer(
  renderContext: AudioContext,
  buffer: AudioBuffer,
): Promise<number | null> {
  try {
    const slice = sliceAudioBuffer(renderContext, buffer, MAX_ANALYZE_SECONDS)
    const { bpm } = await guess(slice)
    if (!Number.isFinite(bpm) || bpm <= 0) return null
    const rounded = Math.round(bpm)
    if (rounded < BPM_MIN || rounded > BPM_MAX) return null
    return rounded
  } catch {
    return null
  }
}
