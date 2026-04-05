# Architecture

## Overview

Stepify is an Electron application with a strict process separation:

```
┌─────────────────────────────────────────────────────┐
│                  Electron Shell                      │
│                                                     │
│  ┌──────────────────┐    ┌──────────────────────┐  │
│  │   Main Process   │    │  Renderer Process    │  │
│  │   (Node.js)      │◄──►│  (Svelte + Web APIs) │  │
│  │                  │IPC │                      │  │
│  │  - File system   │    │  - UI components     │  │
│  │  - Library scan  │    │  - Svelte stores     │  │
│  │  - Spotify auth  │    │  - Audio engine      │  │
│  │  - electron-store│    │  - Spotify SDK       │  │
│  └──────────────────┘    └──────────────────────┘  │
│           │                         │               │
│     Preload script                  │               │
│  (contextBridge bridge)             │               │
└─────────────────────────────────────────────────────┘
```

## Process Responsibilities

### Main Process (`src/main/`)

Runs in Node.js. Has full OS access but no DOM.

- `index.ts` — Creates the `BrowserWindow`, registers all IPC handlers
- `preload/index.ts` — Exposes a typed API to the renderer via `contextBridge`
- `services/libraryService.ts` — Scans directories, indexes tracks, persists to `electron-store`
- `services/settingsService.ts` — Persistent app settings
- `services/spotifyAuthService.ts` — PKCE OAuth flow, token management
- `ipc/` — One file per IPC domain (library, audio, spotify, settings, window)

### Renderer Process (`src/renderer/`)

Runs in Chromium. Has DOM access, Web Audio API, but no Node.js.

- `App.svelte` — Root component, bootstraps library and Spotify state on mount
- `stores/` — Svelte writable stores for all application state
- `services/audioEngine.ts` — Web Audio API playback engine
- `services/spotifyService.ts` — Renderer-side Spotify operations
- `components/` — Svelte UI components

### Shared (`src/shared/`)

Imported by both processes. Must contain only pure TypeScript — no Node.js or browser APIs.

- `types.ts` — All TypeScript interfaces and types
- `constants.ts` — Dance categories, BPM ranges, audio extensions
- `ipc-channels.ts` — Typed IPC channel names (strings)

## IPC Data Flow

```
Renderer (Svelte)
    │
    │  window.electronAPI.library.addDirectory()
    │
    ▼
Preload (contextBridge)
    │
    │  ipcRenderer.invoke('library:add-directory')
    │
    ▼
Main Process
    │
    │  dialog.showOpenDialog()
    │  libraryService.scanDirectory() → { tracks, newTrackIds }
    │  electron-store.set(tracks)
    │
    │  ipcMain.handle('library:add-directory', ...)
    │
    ▼
Return IpcResponse<{ tracks, newTrackIds }> to renderer
    │
    ▼
libraryActions.mergeTracksFromScan(tracks)  →  optional assign-folder-dance modal
    │  window.electronAPI.library.removeDirectory(path)  →  drops tracks under path
    │  window.electronAPI.library.removeTrack(trackId)    →  single track removal
```

## State Management

All UI state lives in Svelte stores (`src/renderer/src/stores/`):

| Store | Owns |
|-------|------|
| `player.store.ts` | Playback state, tempo, queue, `sourceDuration`, listener-time derived values |
| `library.store.ts` | Track list, library folders (`LibraryDirectory[]`), selected dance, search, import/remove; `trackListSort` + `sortTracksForListView` for header-driven ordering (`trackListSort.key === 'none'` preserves input order for the “rest” segment when manual ordering applies); `manualListOrderIds` for drag-reorder when shuffle is off; reorder sets `trackListSort` to `none` in the same update so column sort does not snap rows back; shuffle uses `shuffleQueueOrderIds` + weighted random (`weightedShuffleByPopularity`); `deferredListPopularityByTrackId` keeps list order/readout stable after **like/dislike on the currently playing** track until context changes (see `voteTrackPopularity`) |
| `spotify.store.ts` | Auth state, search results |
| `ui.store.ts` | Active panel, open modal, notifications |

Stores are the single source of truth. Components read from stores via `$store` syntax and write via action functions exported alongside stores.

## Audio Engine

See [audio-engine.md](audio-engine.md) for full details.

The `AudioEngine` class in the renderer:
1. Requests raw `ArrayBuffer` from the main process via IPC
2. Decodes it with `AudioContext.decodeAudioData()`
3. Plays back via `AudioBufferSourceNode`
4. Exposes `setTempo(rate)` for tempo adjustment
5. Emits `timeupdate` and `ended` events consumed by the player store

## Security Model

- `contextIsolation: true` — renderer cannot access Node.js globals
- `sandbox: false` — required for preload scripts with IPC
- `nodeIntegration: false` — no Node in renderer
- CSP in `index.html` restricts script sources to `self` and Spotify SDK only
- All file system operations happen in the main process only

## Module Aliases

| Alias | Resolves to |
|-------|-------------|
| `@shared/*` | `src/shared/*` |
| `@renderer/*` | `src/renderer/src/*` |
