import { PLAYBACK_CAP_END_FADE_SEC } from '@shared/constants'
import { assignedDanceDisagreesWithTaggedBpm } from '@shared/track-bpm'
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
 *   [file bytes] → Blob URL → <audio> (playbackRate + preservesPitch)
 *       → [MediaElementAudioSourceNode] → [GainNode] → [destination]
 *
 * Tempo uses Chromium's built-in WSOLA time stretcher (`preservesPitch`), which runs in the
 * media pipeline rather than on the UI thread — a main-thread ScriptProcessor would glitch
 * whenever the Svelte UI is busy. The same bytes are also decoded to an `AudioBuffer` for
 * loudness normalization and BPM detection. See docs/audio-engine.md.
 */
export class AudioEngine {
  private static readonly TARGET_TRACK_LOUDNESS_DBFS = -18
  private static readonly NORMALIZATION_MAX_BOOST_DB = 10
  private static readonly NORMALIZATION_MAX_CUT_DB = 12
  private static readonly NORMALIZATION_SAMPLE_STRIDE = 256

  private context: AudioContext | null = null
  private gainNode: GainNode | null = null
  /** One element for the app's lifetime: `createMediaElementSource` may only be called once per element. */
  private media: HTMLAudioElement | null = null
  private mediaUrl: string | null = null
  private audioBuffer: AudioBuffer | null = null

  private _isPlaying = false
  /** Source-file position to resume from while paused / before the first play. */
  private _pausedAt = 0
  private _tempo = 1.0
  private _volume = 0.8
  /** Per-track loudness compensation (1 = unchanged). */
  private _trackNormalizationGain = 1
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
      this.gainNode.gain.value = this.baseOutputGain
      this.gainNode.connect(this.context.destination)
      this.context.createMediaElementSource(this.ensureMedia()).connect(this.gainNode)
    }
    return this.context
  }

  private ensureMedia(): HTMLAudioElement {
    if (this.media) return this.media
    const media = new Audio()
    media.preload = 'auto'
    media.preservesPitch = true
    media.addEventListener('ended', () => this.handleMediaEnded())
    media.addEventListener('error', () => {
      if (media.src) this.emit('error', 'Could not play this audio file')
    })
    this.media = media
    return media
  }

  private releaseMediaSource(): void {
    if (this.media) {
      this.media.pause()
      this.media.removeAttribute('src')
      this.media.load()
    }
    if (this.mediaUrl) {
      URL.revokeObjectURL(this.mediaUrl)
      this.mediaUrl = null
    }
  }

  // ─── Loading ───────────────────────────────────────────────────────────────

  async load(track: Track): Promise<void> {
    // Re-decoding resets `_pausedAt` in loadLocalTrack; avoid that when resuming the same file.
    if (this.loadedTrackId === track.id && this.audioBuffer) {
      return
    }

    this.clearPlaybackEndCap()
    this.stop()
    this.releaseMediaSource()
    this.audioBuffer = null
    this._trackNormalizationGain = 1
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

      if (this.loadTargetTrackId !== trackId) return

      // Blob copies the bytes; decodeAudioData detaches the ArrayBuffer it is given.
      const url = URL.createObjectURL(new Blob([response.data]))
      const buffer = await ctx.decodeAudioData(response.data)
      if (this.loadTargetTrackId !== trackId) {
        URL.revokeObjectURL(url)
        return
      }

      const media = this.ensureMedia()
      this.mediaUrl = url
      media.src = url
      media.defaultPlaybackRate = this._tempo
      media.playbackRate = this._tempo

      this.audioBuffer = buffer
      this._trackNormalizationGain = this.computeTrackNormalizationGain(buffer)
      this._duration = buffer.duration
      this._pausedAt = 0
      this.applyBaseGain()
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
    if (tagBpm != null && !assignedDanceDisagreesWithTaggedBpm(tagBpm, track.dances)) {
      const payload: BpmFromFilePayload = { bpm: tagBpm, trackId }
      this.emit('bpmFromFile', payload)
      return
    }

    if (
      track.bpm != null &&
      track.bpm > 0 &&
      !assignedDanceDisagreesWithTaggedBpm(track.bpm, track.dances)
    ) {
      return
    }

    const buf = this.audioBuffer
    if (!buf) return

    const { detectBpmFromAudioBuffer } = await import('./bpmDetector')
    const detected = await detectBpmFromAudioBuffer(ctx, buf, track.dances)
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
    this.gainNode.gain.value = this.baseOutputGain * mult
  }

  private get baseOutputGain(): number {
    return this._volume * this._trackNormalizationGain
  }

  private computeTrackNormalizationGain(buffer: AudioBuffer): number {
    const channels = buffer.numberOfChannels
    const frames = buffer.length
    if (channels <= 0 || frames <= 0) return 1

    let sumSquares = 0
    let sampleCount = 0
    const stride = AudioEngine.NORMALIZATION_SAMPLE_STRIDE

    for (let ch = 0; ch < channels; ch += 1) {
      const data = buffer.getChannelData(ch)
      for (let i = 0; i < data.length; i += stride) {
        const x = data[i] ?? 0
        sumSquares += x * x
        sampleCount += 1
      }
    }

    if (sampleCount === 0) return 1
    const rms = Math.sqrt(sumSquares / sampleCount)
    if (!(rms > 0)) return 1

    const loudnessDb = 20 * Math.log10(rms)
    const deltaDbRaw = AudioEngine.TARGET_TRACK_LOUDNESS_DBFS - loudnessDb
    const deltaDb = Math.max(
      -AudioEngine.NORMALIZATION_MAX_CUT_DB,
      Math.min(AudioEngine.NORMALIZATION_MAX_BOOST_DB, deltaDbRaw),
    )

    const gain = 10 ** (deltaDb / 20)
    if (!Number.isFinite(gain) || gain <= 0) return 1
    return gain
  }

  private finishPlaybackAtCap(): void {
    if (this._finishingCapEnd) return
    this._finishingCapEnd = true
    this._isPlaying = false
    this._pausedAt = this._playbackEndCap ?? this.mediaPosition
    this.stopTimeUpdates()
    this.media?.pause()
    this.applyBaseGain()
    this.clearPlaybackEndCap()
    this.emit('ended', undefined)
  }

  /** Only the natural end of the file reaches here; pause/seek/stop never fire `ended`. */
  private handleMediaEnded(): void {
    if (this._finishingCapEnd || !this._isPlaying) return
    this._isPlaying = false
    this._pausedAt = 0
    this.stopTimeUpdates()
    this.clearPlaybackEndCap()
    this.applyBaseGain()
    this.emit('ended', undefined)
  }

  private get hasLocalMedia(): boolean {
    return this.audioBuffer != null && this.mediaUrl != null
  }

  private get mediaPosition(): number {
    return this.media?.currentTime ?? 0
  }

  private applyBaseGain(): void {
    if (this.gainNode) this.gainNode.gain.value = this.baseOutputGain
  }

  // ─── Playback ──────────────────────────────────────────────────────────────

  play(): void {
    const media = this.media
    if (!this.hasLocalMedia || !this.context || !media) return
    if (this._isPlaying) return

    // Resume AudioContext if suspended (browser autoplay policy)
    if (this.context.state === 'suspended') {
      void this.context.resume()
    }

    if (Math.abs(media.currentTime - this._pausedAt) > 0.01) {
      media.currentTime = this._pausedAt
    }
    media.playbackRate = this._tempo
    this._isPlaying = true
    this.applyOutputGain(this._pausedAt)
    media.play().catch((err: unknown) => {
      // A newer load/pause interrupting this play() is expected, not a failure.
      if (err instanceof DOMException && err.name === 'AbortError') return
      this._isPlaying = false
      this.stopTimeUpdates()
      this.emit('error', `Playback failed: ${String(err)}`)
    })
    this.startTimeUpdates()
  }

  pause(): void {
    if (!this._isPlaying) return
    this._isPlaying = false
    this._pausedAt = this.mediaPosition
    this.stopTimeUpdates()
    this.media?.pause()
    this.applyBaseGain()
  }

  stop(): void {
    this._isPlaying = false
    this._pausedAt = 0
    this.loadTargetTrackId = null
    this._finishingCapEnd = false
    this.clearPlaybackEndCap()
    this.stopTimeUpdates()
    if (this.media) {
      this.media.pause()
      if (this.media.src) this.media.currentTime = 0
    }
  }

  seek(seconds: number): void {
    const max =
      this._playbackEndCap != null ? Math.min(this._duration, this._playbackEndCap) : this._duration
    this._pausedAt = Math.max(0, Math.min(seconds, max))
    if (this.media && this.hasLocalMedia) {
      this.media.currentTime = this._pausedAt
    }
    if (this._isPlaying) this.applyOutputGain(this._pausedAt)
  }

  // ─── Controls ──────────────────────────────────────────────────────────────

  /**
   * Set playback tempo without changing pitch (`preservesPitch` on the media element).
   * @param rate 1.0 = normal, 0.9 = -10%, 1.1 = +10%
   */
  setTempo(rate: number): void {
    this._tempo = rate
    if (this.media) {
      // `defaultPlaybackRate` survives the next `src` change; `playbackRate` applies now.
      this.media.defaultPlaybackRate = rate
      this.media.playbackRate = rate
    }
  }

  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume))
    const ctx = this.context
    if (!this.gainNode || !ctx) return
    if (this._isPlaying && this._playbackEndCap != null) {
      const elapsed = this.currentTime
      this.applyOutputGain(elapsed)
    } else {
      this.gainNode.gain.setTargetAtTime(this.baseOutputGain, ctx.currentTime, 0.01)
    }
  }

  // ─── Time Updates ─────────────────────────────────────────────────────────

  private startTimeUpdates(): void {
    const tick = () => {
      this.rafId = null
      if (this._isPlaying) {
        const elapsed = this.mediaPosition
        if (this._playbackEndCap != null && elapsed >= this._playbackEndCap) {
          this.finishPlaybackAtCap()
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
    return this._isPlaying ? this.mediaPosition : this._pausedAt
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
    this.releaseMediaSource()
    this.loadedTrackId = null
    this.context?.close()
    this.context = null
    this.gainNode = null
    // The element stays bound to the closed context's source node, so a fresh one is needed.
    this.media = null
    this.audioBuffer = null
    this.listeners.clear()
  }
}

/** Singleton audio engine instance for the renderer process */
export const audioEngine = new AudioEngine()
