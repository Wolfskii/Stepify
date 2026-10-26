# Audio Engine

## Overview

The audio engine lives entirely in the renderer process (`src/renderer/src/services/audioEngine.ts`). It plays through a hidden `HTMLAudioElement` routed into the **Web Audio API** graph, so Chromium's media pipeline does the time stretching while Web Audio handles gain.

The engine exposes a simple interface to the rest of the app:
- Load a track (local file or Spotify)
- Play, pause, stop, seek
- Set tempo (pitch-preserving playback rate)
- Set volume
- Subscribe to time update and ended events

For local tracks, playback also applies **per-track loudness normalization** so songs stay in a similar perceived dB range during queues.

---

## Current Implementation

Tempo is set with `HTMLMediaElement.playbackRate` and `preservesPitch = true`. Chromium time-stretches the audio inside the media pipeline (WSOLA-style), so the tempo slider changes speed without the "chipmunk" or "slow-motion voice" effect. Because the stretching runs off the UI thread, Svelte work does not cause audible glitches.

Each local file is read once through IPC. The same bytes feed two consumers:

- A `Blob` URL, assigned to the media element for playback.
- `AudioContext.decodeAudioData`, which produces the `AudioBuffer` used for loudness estimation and BPM detection.

### Playback Flow

```
main process                        renderer process
─────────────                       ────────────────
libraryService                      AudioEngine.load(track)
  → reads file                          │
  → returns ArrayBuffer ──────────────► │
                                        ├─► new Blob → URL.createObjectURL → <audio>.src
                                        │
                                        ├─► AudioContext.decodeAudioData → AudioBuffer
                                        │       (loudness gain, BPM detection)
                                        │
                             MediaElementAudioSourceNode (one per context)
                                        │
                             <audio>.playbackRate = tempo, preservesPitch = true
                                        │
                             GainNode (volume × normalization × finals fade)
                                        │
                             AudioContext.destination (speakers)
```

### Trade-offs and upgrade path

- `preservesPitch` is built into Chromium and needs no extra dependency, which is why it replaced the unused `soundtouch-ts` path.
- Its quality at extreme ratios is not tuned for dance practice. The app's working range is the tempo slider limits (`TEMPO_MIN_PERCENT` / `TEMPO_MAX_PERCENT`, ±32%). If stretched artifacts are audible in that range, the upgrade path is a SoundTouch-based `AudioWorkletNode` (see below).
- The media element is one long-lived instance per engine. `createMediaElementSource` can only be called once per element, so the source node is created with the `AudioContext` and reused across loads.

### SoundTouch upgrade path (not implemented)

If built-in stretching is not good enough, the replacement is an **AudioWorkletNode** running SoundTouch compiled to WebAssembly:

1. Compile SoundTouch to WebAssembly.
2. Load the WASM module inside an `AudioWorkletProcessor`.
3. Send tempo changes to the processor over its `MessagePort`.

A `ScriptProcessorNode` version is not recommended: it runs on the main thread and causes UI jank.

---

## BPM detection and embedding

When a local file loads and the track still needs a **reliable** BPM (no usable embedded value / library value), Stepify:

1. Runs **`web-audio-beat-detector`** on sampled windows from the decoded `AudioBuffer` in the renderer.
   - **Embedded TBPM is skipped** when it is **implausible for the single assigned dance** (outside the competition-range band with padding); analysis runs instead so first playback matches “detect from file”.
   - Detection samples **up to five windows** across longer tracks; estimates are combined with a **tight-cluster preference** (typical agreement wins) and **deviation trimming** so one or two bad sections (silence, breakdowns) barely move the result.
   - If the track has **exactly one dance** assigned, detection uses that dance’s competition BPM range (with a small padding) as `minTempo` / `maxTempo` so the library **folds** beat intervals into the right octave instead of locking onto subdivisions (e.g. Rumba misread as ~170 BPM).
   - For **Rumba** and **Samba**, audio is **mono-summed and low-pass filtered** (~190 Hz) first so transient hi-hat / syncopation peaks disturb the estimate less.
   - A final **ratio pass** maps obvious double-time results (still outside the dance band) toward the competition range when safe.
2. If a value in a plausible range (60–220) is returned:
   - **`.mp3`**: writes **TBPM** via **`node-id3`** (`update`, preserves other tags).
   - **`.flac`**: merges a **`BPM`** Vorbis comment via **`flac-tagger`**.
   - **Other formats** (e.g. `.m4a`, `.wav`): persists BPM in the **library store** only (no tag write yet).
3. Notifies the UI via the existing **`bpmFromFile`** event so the player and list stay in sync.

Re-scanning the library will then pick up embedded BPM through `music-metadata`.

---

## Loudness normalization (local tracks)

When a local file is decoded, the renderer estimates its RMS loudness in dBFS from the decoded `AudioBuffer` and computes a per-track gain offset toward a target of **-18 dBFS**.

- Formula: `loudnessDb = 20 * log10(rms)`
- Compensation: `targetDb - loudnessDb`
- Safety clamp: **max boost +10 dB**, **max cut -12 dB**
- Applied at output gain together with the user volume and finals end-fade multiplier

This keeps playback level changes between songs more controlled without changing stored files on disk.

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

Queue auto-advance calls `play()` without a user gesture, so the main window sets `autoplayPolicy: 'no-user-gesture-required'` (`src/main/index.ts`).

---

## Supported Formats

The library scanner accepts: `mp3`, `flac`, `wav`, `ogg`, `aac`, `m4a`, `opus`, `wma`.

Playback goes through Chromium's media stack, and `decodeAudioData` is used for analysis. Both support everything Chromium can decode. `wma` support may vary across platforms.
