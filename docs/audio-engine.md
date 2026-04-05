# Audio Engine

## Overview

The audio engine lives entirely in the renderer process (`src/renderer/src/services/audioEngine.ts`). It uses the **Web Audio API** — a low-level, high-performance audio graph available in Chromium.

The engine exposes a simple interface to the rest of the app:
- Load a track (local file or Spotify)
- Play, pause, stop, seek
- Set tempo (playback rate)
- Set volume
- Subscribe to time update and ended events

---

## Current Implementation (Stub)

The current implementation uses `AudioBufferSourceNode.playbackRate` to change tempo. This is fast and simple but **changes pitch along with tempo** (the "chipmunk effect" at higher speeds, "slow-motion voice" at lower speeds).

This is acceptable for initial development and testing but **must be upgraded** before release.

### Playback Flow

```
main process                        renderer process
─────────────                       ────────────────
libraryService                      AudioEngine.load(track)
  → reads file                          │
  → returns ArrayBuffer ──────────────► │
                                        │
                             AudioContext.decodeAudioData(buffer)
                                        │
                             AudioBufferSourceNode
                                        │
                             source.playbackRate.value = tempo
                                        │
                             GainNode (volume)
                                        │
                             AudioContext.destination (speakers)
```

---

## BPM detection and embedding

When a local file loads and **no BPM exists in tags** (and the library track has no stored BPM), Stepify:

1. Runs **`web-audio-beat-detector`** on the decoded `AudioBuffer` (first ~120s) in the renderer.
2. If a value in a plausible range (60–220) is returned:
   - **`.mp3`**: writes **TBPM** via **`node-id3`** (`update`, preserves other tags).
   - **`.flac`**: merges a **`BPM`** Vorbis comment via **`flac-tagger`**.
   - **Other formats** (e.g. `.m4a`, `.wav`): persists BPM in the **library store** only (no tag write yet).
3. Notifies the UI via the existing **`bpmFromFile`** event so the player and list stay in sync.

Re-scanning the library will then pick up embedded BPM through `music-metadata`.

---

## Planned: Pitch-Preserving Tempo (SoundTouch)

To achieve proper pitch-preserving time stretching (what professional DJ software does), replace the `AudioBufferSourceNode` with a **ScriptProcessorNode** backed by the `soundtouch-ts` library.

### Why SoundTouch?

SoundTouch implements **WSOLA** (Waveform Similarity-based Overlap-Add) time stretching. This separates tempo (speed) from pitch, allowing:
- Slow down 30%: music sounds slower, pitch unchanged
- Speed up 20%: music sounds faster, pitch unchanged

### Integration Plan

```typescript
import { SoundTouch, SimpleFilter, WebAudioBufferSource } from 'soundtouch-ts'

// In AudioEngine.play():
const context = this.ensureContext()
const bufferSize = 4096
const node = context.createScriptProcessor(bufferSize, 2, 2)

const soundTouch = new SoundTouch()
soundTouch.tempo = this._tempo  // 1.0 = normal

const source = new WebAudioBufferSource(this.audioBuffer!)
const filter = new SimpleFilter(source, soundTouch)

node.onaudioprocess = (e: AudioProcessingEvent) => {
  const left = e.outputBuffer.getChannelData(0)
  const right = e.outputBuffer.getChannelData(1)
  const interleaved = new Float32Array(bufferSize * 2)
  const framesExtracted = filter.extract(interleaved, bufferSize)
  if (framesExtracted === 0) this.emit('ended', undefined)
  for (let i = 0; i < framesExtracted; i++) {
    left[i] = interleaved[i * 2]
    right[i] = interleaved[i * 2 + 1]
  }
}

node.connect(this.gainNode!)
// Note: ScriptProcessorNode is deprecated in favour of AudioWorkletNode
// but is used here for simplicity. See the AudioWorklet migration note below.
```

### Setting Tempo

```typescript
setTempo(rate: number): void {
  this._tempo = rate
  if (this.soundTouch) {
    this.soundTouch.tempo = rate  // NOT playbackRate
  }
}
```

### AudioWorklet Migration (Future)

`ScriptProcessorNode` runs on the main thread and can cause UI jank. The correct long-term approach is an **AudioWorkletNode**:

1. Compile SoundTouch to WebAssembly
2. Load the WASM module inside an `AudioWorkletProcessor`
3. Communicate tempo changes via `MessagePort`

This is out of scope for the MVP but documented here for future contributors.

---

## Spotify Playback

Spotify tracks cannot be decoded as `ArrayBuffer` — they are DRM-protected. Playback uses the **Spotify Web Playback SDK** instead.

The SDK creates its own audio device. The `AudioEngine` delegates Spotify tracks to `spotifyService.playTrack()`.

The player store's `PlaybackState` remains the source of truth regardless of which backend is playing. Both backends must:
- Update `playerState.currentTime` on tick
- Emit an `ended` equivalent when the track finishes
- Respond to `play()`, `pause()`, `seek()` calls

---

## Event System

`AudioEngine` uses a lightweight typed event emitter:

```typescript
engine.on('timeupdate', (time: number) => {
  playerActions.setCurrentTime(time)
})

engine.on('ended', async () => {
  const outcome = playerActions.handleTrackEnded()
  if (outcome === 'play') {
    /* load current track from store and play */
  }
})

engine.on('loaded', () => {
  // ready to play
})

engine.on('error', (msg: string) => {
  uiActions.notify(msg, 'error')
})
```

Listeners are registered in `NowPlayingBar.svelte` via `onMount` and cleaned up via the returned unsubscribe function in `onDestroy`.

---

## Supported Formats

The library scanner accepts: `mp3`, `flac`, `wav`, `ogg`, `aac`, `m4a`, `opus`, `wma`.

The Web Audio API's `decodeAudioData` supports all formats that Chromium can decode, which includes all of the above. `wma` support may vary across platforms.
