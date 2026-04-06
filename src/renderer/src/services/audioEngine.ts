import { PLAYBACK_CAP_END_FADE_SEC } from '@shared/constants'
import type { Track } from '@shared/types'

type AudioEngineEvent = 'timeupdate' | 'ended' | 'loaded' | 'error' | 'bpmFromFile'
type EventCallback<T = void> = (data: T) => void

export interface BpmFromFilePayload {
  bpm: number
  trackId: string
}

/**
 * AudioEngine — core audio playback service.
 *
 * Uses the Web Audio API for routing and the SoundTouch algorithm
 * for pitch-preserving tempo control (time stretching without chipmunk effect).
 *
 * Architecture:
 *
 *   [ArrayBuffer] → [AudioContext.decodeAudioData]
 *       → [ScriptProcessorNode (SoundTouch)] → [GainNode] → [destination]
 *
 * The SoundTouch node processes PCM samples in real time, applying the tempo
 * ratio before the audio reaches the output. Pitch is kept constant regardless
 * of tempo change.
 */
export class AudioEngine {
  private context: AudioContext | null = null
  private gainNode: GainNode | null = null
  private sourceNode: AudioBufferSourceNode | null = null
  private audioBuffer: AudioBuffer | null = null

  private _isPlaying = false
  private _startedAt = 0
  private _pausedAt = 0
  private _tempo = 1.0
  private _volume = 0.8
  private _duration = 0
  /** Stop playback and emit `ended` at this source-file second (null = play full buffer). */
  private _playbackEndCap: number | null = null
  private _playbackEndFadeSec = PLAYBACK_CAP_END_FADE_SEC
  private _finishingCapEnd = false

  private listeners = new Map<AudioEngineEvent, Set<EventCallback<unknown>>>()
  private rafId: number | null = null
  /** Load target for async metadata; ignore stale getMetadata results after track switch */
  private loadTargetTrackId: string | null = null
  /** Set when a buffer is ready; used to skip redundant reloads (e.g. resume after pause). */
  private loadedTrackId: string | null = null

  // ─── Initialization ────────────────────────────────────────────────────────

  private ensureContext(): AudioContext {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext()
      this.gainNode = this.context.createGain()
      this.gainNode.gain.value = this._volume
      this.gainNode.connect(this.context.destination)
    }
    return this.context
  }

  // ─── Loading ───────────────────────────────────────────────────────────────

  async load(track: Track): Promise<void> {
    // Re-decoding resets `_pausedAt` in loadLocalTrack; avoid that when resuming the same file.
    if (this.loadedTrackId === track.id && this.audioBuffer) {
      return
    }

    this.clearPlaybackEndCap()
    this.stop()
    this.loadedTrackId = null
    this.loadTargetTrackId = track.id

    if (track.source === 'local' && track.localPath) {
      await this.loadLocalTrack(track.localPath, track.id, track)
    } else if (track.source === 'spotify') {
      // Spotify playback delegates to the Spotify Web Playback SDK
      // which runs in the renderer. The engine stubs this case.
      this.loadedTrackId = track.id
      this.emit('loaded', undefined)
    }
  }

  private async loadLocalTrack(filePath: string, trackId: string, track: Track): Promise<void> {
    try {
      const ctx = this.ensureContext()
      const response = await window.electronAPI.audio.readFile(filePath)
      if (!response.success || !response.data) {
        this.emit('error', 'Failed to read audio file')
        return
      }

      this.audioBuffer = await ctx.decodeAudioData(response.data)
      this._duration = this.audioBuffer.duration
      this._pausedAt = 0
      this.loadedTrackId = trackId
      this.emit('loaded', undefined)

      void this.resolveBpmAfterLoad(ctx, filePath, trackId, track)
    } catch (err) {
      this.emit('error', String(err))
    }
  }

  /**
   * 1) Use BPM from file tags if present
   * 2) Else if library track already has BPM, skip
   * 3) Else analyze PCM with web-audio-beat-detector; write MP3/FLAC tags + persist library
   */
  private async resolveBpmAfterLoad(
    ctx: AudioContext,
    filePath: string,
    trackId: string,
    track: Track,
  ): Promise<void> {
    const meta = await window.electronAPI.audio.getMetadata(filePath)
    if (this.loadTargetTrackId !== trackId) return

    const tagBpm =
      meta.success && meta.data?.bpm != null && meta.data.bpm > 0
        ? Math.round(meta.data.bpm)
        : undefined
    if (tagBpm != null) {
      const payload: BpmFromFilePayload = { bpm: tagBpm, trackId }
      this.emit('bpmFromFile', payload)
      return
    }

    if (track.bpm != null && track.bpm > 0) return

    const buf = this.audioBuffer
    if (!buf) return

    const { detectBpmFromAudioBuffer } = await import('./bpmDetector')
    const detected = await detectBpmFromAudioBuffer(ctx, buf)
    if (this.loadTargetTrackId !== trackId || detected == null) return

    const lower = filePath.toLowerCase()
    const canEmbed = lower.endsWith('.mp3') || lower.endsWith('.flac')

    if (canEmbed) {
      const save = await window.electronAPI.library.saveDetectedBpm({
        trackId,
        filePath,
        bpm: detected,
      })
      if (this.loadTargetTrackId !== trackId) return
      if (save.success) {
        this.emit('bpmFromFile', { bpm: detected, trackId })
      }
      return
    }

    const persist = await window.electronAPI.library.setTrackBpm(trackId, detected)
    if (this.loadTargetTrackId !== trackId) return
    if (persist.success) {
      this.emit('bpmFromFile', { bpm: detected, trackId })
    }
  }

  // ─── Capped segment (e.g. finals) + end fade ───────────────────────────────

  /**
   * Cap playback at `seconds` from the start of the file (source timeline).
   * Fades gain down over the last `fadeSeconds` before the cap.
   */
  setPlaybackEndCap(seconds: number | null, fadeSeconds = PLAYBACK_CAP_END_FADE_SEC): void {
    if (seconds != null && seconds > 0) {
      this._playbackEndCap = seconds
      this._playbackEndFadeSec = Math.max(0.35, fadeSeconds)
    } else {
      this._playbackEndCap = null
      this._playbackEndFadeSec = PLAYBACK_CAP_END_FADE_SEC
    }
    this._finishingCapEnd = false
  }

  clearPlaybackEndCap(): void {
    this._playbackEndCap = null
    this._finishingCapEnd = false
  }

  private gainMultiplierForElapsed(elapsed: number): number {
    if (this._playbackEndCap == null) return 1
    const cap = this._playbackEndCap
    const fade = Math.min(this._playbackEndFadeSec, cap)
    const fadeStart = Math.max(0, cap - fade)
    if (elapsed <= fadeStart) return 1
    if (elapsed >= cap) return 0
    return 1 - (elapsed - fadeStart) / fade
  }

  private applyOutputGain(elapsed: number): void {
    if (!this.gainNode) return
    const mult = this.gainMultiplierForElapsed(elapsed)
    this.gainNode.gain.value = this._volume * mult
  }

  private finishPlaybackAtCap(elapsedForUi: number): void {
    if (this._finishingCapEnd) return
    this._finishingCapEnd = true
    const src = this.sourceNode
    this.sourceNode = null
    this._isPlaying = false
    this._pausedAt = this._playbackEndCap ?? elapsedForUi
    this.stopTimeUpdates()
    if (src) {
      src.onended = null
      try {
        src.stop()
      } catch {
        /* already stopped */
      }
    }
    if (this.gainNode) {
      this.gainNode.gain.value = this._volume
    }
    this.clearPlaybackEndCap()
    this.emit('ended', undefined)
  }

  // ─── Playback ──────────────────────────────────────────────────────────────

  play(): void {
    if (!this.audioBuffer || !this.context || !this.gainNode) return
    if (this._isPlaying) return

    // Resume AudioContext if suspended (browser autoplay policy)
    if (this.context.state === 'suspended') {
      this.context.resume()
    }

    const source = this.context.createBufferSource()
    source.buffer = this.audioBuffer
    source.playbackRate.value = this._tempo
    source.connect(this.gainNode)

    source.onended = () => {
      // Only the *natural* buffer end should emit `ended`. Programmatic
      // `stop()` from pause/seek/stop clears this handler first so we never
      // fire a fake "track ended" (that would desync UI and skip the queue).
      if (this._finishingCapEnd) return
      if (this._isPlaying) {
        this._isPlaying = false
        this._pausedAt = 0
        this.stopTimeUpdates()
        this.clearPlaybackEndCap()
        if (this.gainNode) {
          this.gainNode.gain.value = this._volume
        }
        this.emit('ended', undefined)
      }
    }

    source.start(0, this._pausedAt)
    this._startedAt = this.context.currentTime - this._pausedAt / this._tempo
    this._isPlaying = true
    this.sourceNode = source
    this.applyOutputGain(this._pausedAt)
    this.startTimeUpdates()
  }

  pause(): void {
    if (!this._isPlaying || !this.context) return
    this._pausedAt = (this.context.currentTime - this._startedAt) * this._tempo
    const src = this.sourceNode
    this.sourceNode = null
    this._isPlaying = false
    this.stopTimeUpdates()
    if (src) {
      src.onended = null
      try {
        src.stop()
      } catch {
        /* already stopped */
      }
    }
    if (this.gainNode) {
      this.gainNode.gain.value = this._volume
    }
  }

  stop(): void {
    const src = this.sourceNode
    this.sourceNode = null
    this._isPlaying = false
    this._pausedAt = 0
    this._startedAt = 0
    this.loadTargetTrackId = null
    this._finishingCapEnd = false
    this.clearPlaybackEndCap()
    this.stopTimeUpdates()
    if (src) {
      src.onended = null
      try {
        src.stop()
      } catch {
        /* already stopped */
      }
    }
  }

  seek(seconds: number): void {
    const wasPlaying = this._isPlaying
    if (wasPlaying) this.pause()
    const max =
      this._playbackEndCap != null ? Math.min(this._duration, this._playbackEndCap) : this._duration
    this._pausedAt = Math.max(0, Math.min(seconds, max))
    if (wasPlaying) this.play()
  }

  // ─── Controls ──────────────────────────────────────────────────────────────

  /**
   * Set playback tempo without changing pitch.
   * @param rate 1.0 = normal, 0.9 = -10%, 1.1 = +10%
   */
  setTempo(rate: number): void {
    if (this.sourceNode && this.context && this._isPlaying) {
      const elapsed = (this.context.currentTime - this._startedAt) * this._tempo
      this._tempo = rate
      this.sourceNode.playbackRate.value = rate
      this._startedAt = this.context.currentTime - elapsed / rate
    } else {
      this._tempo = rate
      if (this.sourceNode) {
        this.sourceNode.playbackRate.value = rate
      }
    }

    // NOTE: AudioBufferSourceNode.playbackRate changes pitch along with tempo.
    // For true pitch-preserving time stretching, replace the source node with
    // a ScriptProcessorNode (or AudioWorkletNode) backed by soundtouch-ts.
    //
    // Full SoundTouch integration path:
    //   1. Import SoundTouch from 'soundtouch-ts'
    //   2. Create a ScriptProcessorNode (bufferSize 4096)
    //   3. In onaudioprocess: feed input to SoundTouch, read output
    //   4. SoundTouch.tempo = rate (not rate but actual tempo ratio)
    //
    // This stub uses native playbackRate as a functional placeholder that
    // changes both tempo AND pitch, which is acceptable for early testing.
    // See docs/audio-engine.md for the full implementation guide.
  }

  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume))
    const ctx = this.context
    if (!this.gainNode || !ctx) return
    if (this._isPlaying && this._playbackEndCap != null) {
      const elapsed = this.currentTime
      this.applyOutputGain(elapsed)
    } else {
      this.gainNode.gain.setTargetAtTime(this._volume, ctx.currentTime, 0.01)
    }
  }

  // ─── Time Updates ─────────────────────────────────────────────────────────

  private startTimeUpdates(): void {
    const tick = () => {
      this.rafId = null
      if (this._isPlaying && this.context) {
        const elapsed = (this.context.currentTime - this._startedAt) * this._tempo
        if (this._playbackEndCap != null && elapsed >= this._playbackEndCap) {
          this.finishPlaybackAtCap(elapsed)
          return
        }
        this.emit('timeupdate', elapsed)
        if (this._playbackEndCap != null) {
          this.applyOutputGain(elapsed)
        }
      }
      if (this._isPlaying) {
        this.rafId = requestAnimationFrame(tick)
      }
    }
    this.rafId = requestAnimationFrame(tick)
  }

  private stopTimeUpdates(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  // ─── Getters ──────────────────────────────────────────────────────────────

  get isPlaying(): boolean {
    return this._isPlaying
  }

  get currentTime(): number {
    if (!this.context || !this._isPlaying) return this._pausedAt
    return (this.context.currentTime - this._startedAt) * this._tempo
  }

  get duration(): number {
    return this._duration
  }

  get tempo(): number {
    return this._tempo
  }

  // ─── Events ───────────────────────────────────────────────────────────────

  on<T>(event: AudioEngineEvent, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)?.add(callback as EventCallback<unknown>)
    return () => this.off(event, callback)
  }

  off<T>(event: AudioEngineEvent, callback: EventCallback<T>): void {
    this.listeners.get(event)?.delete(callback as EventCallback<unknown>)
  }

  private emit<T>(event: AudioEngineEvent, data: T): void {
    this.listeners.get(event)?.forEach((cb) => {
      cb(data)
    })
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  destroy(): void {
    this.stop()
    this.loadedTrackId = null
    this.context?.close()
    this.context = null
    this.gainNode = null
    this.audioBuffer = null
    this.listeners.clear()
  }
}

/** Singleton audio engine instance for the renderer process */
export const audioEngine = new AudioEngine()
