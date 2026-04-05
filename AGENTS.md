# AGENTS.md — Stepify

This file contains instructions for AI coding agents working in this repository.

---

## Project Summary

**Stepify** is a cross-platform desktop music player for ballroom and latin dancers. Built with Electron + Svelte + TypeScript. The key differentiator is a tactile, physical-feeling tempo slider that adjusts playback speed while preserving pitch — essential for dance practice.

---

## Domain Knowledge (READ THIS FIRST)

### Ballroom Dancing — Critical Context

There are two disciplines:

**Standard**: Slow Waltz, Tango, Viennese Waltz, Foxtrot, Quickstep
**Latin**: Cha Cha, Samba, Rumba, Paso Doble, Jive

BPM ranges (competition standard):

| Dance | BPM |
|-------|-----|
| Cha Cha | 120–128 |
| Samba | 96–104 |
| Rumba | 96–100 |
| Paso Doble | 112–124 |
| Jive | 152–176 |
| Slow Waltz | 84–90 |
| Tango | 112–120 |
| Viennese Waltz | 174–180 |
| Foxtrot | 112–120 |
| Quickstep | 196–208 |

**Rounds**: A competition event has multiple rounds (preliminary → semi-final → final). A **final** has 6 couples, all 5 dances danced back-to-back (~90 seconds each).

**Tempo control is critical**: Dancers practice at 70–80% tempo to build technique, then increase to 100%. Pitch must be preserved when changing tempo — the "chipmunk effect" is unacceptable.

See `docs/ballroom-context.md` for full context.

---

## Architecture Overview

```
Electron Main Process (Node.js)
├── Services: libraryService, settingsService, spotifyAuthService
└── IPC handlers: library.ipc, audio.ipc, spotify.ipc, settings.ipc, window.ipc

Preload Script (contextBridge)
└── Exposes window.electronAPI to renderer

Renderer Process (Svelte + Web APIs)
├── Stores: player.store, library.store, spotify.store, ui.store
├── Services: audioEngine, spotifyService
└── Components: Sidebar, TrackList, PlayerSidebar, NowPlayingBar, TempoSlider, ...

Shared (no runtime, pure types/constants)
└── types.ts, constants.ts, ipc-channels.ts
```

**Key rule**: The renderer has no Node.js access. All file system operations, Spotify auth, and persistence go through IPC to the main process.

**Module aliases**: `@shared/*` → `src/shared/`, `@renderer/*` → `src/renderer/src/`

---

## Coding Standards

### TypeScript
- Strict mode everywhere (`strict: true` in tsconfig)
- No `any` without a comment explaining why
- All IPC payloads must be typed — use `IpcResponse<T>` from `@shared/types`
- Prefer `interface` for object shapes, `type` for unions/primitives

### Svelte
- One component per file. No inline logic that belongs in a store.
- Stores are the single source of truth. Components only call action functions — they don't mutate store state directly.
- Use typed event dispatchers: `createEventDispatcher<{ event: PayloadType }>()`
- All `on:` handlers that could run without user gesture must handle async gracefully

### Naming
- Files: `camelCase.ts`, `PascalCase.svelte`, `camelCase.store.ts`, `camelCase.ipc.ts`
- IPC handlers: `domain:verb` format (e.g. `library:add-directory`)
- Svelte stores: export both the store and an actions object (`playerState` + `playerActions`)
- CSS: BEM-inspired, scoped to component. Use `--color-*`, `--space-*` tokens, never hardcode

### Comments
- Don't explain what the code does. Explain _why_ it does it when non-obvious.
- All `TODO` comments must reference the docs file with the implementation plan.
- Mark stub implementations clearly: `// TODO: see docs/spotify-integration.md`

---

## File Locations

| What | Where |
|------|-------|
| Shared types | `src/shared/types.ts` |
| Dance constants | `src/shared/constants.ts` |
| IPC channel names | `src/shared/ipc-channels.ts` |
| Main entry | `src/main/index.ts` |
| Preload bridge | `src/preload/index.ts` |
| Audio engine | `src/renderer/src/services/audioEngine.ts` |
| Player store | `src/renderer/src/stores/player.store.ts` |
| Tempo slider | `src/renderer/src/components/player/TempoSlider.svelte` |
| Tempo/BPM right panel | `src/renderer/src/components/player/PlayerSidebar.svelte` |
| Bottom now playing bar | `src/renderer/src/components/player/NowPlayingBar.svelte` |
| Global CSS/tokens | `src/renderer/src/styles/global.css` |
| Library IPC | `src/main/ipc/library.ipc.ts` |
| BPM reference helper | `src/shared/track-bpm.ts` |
| Assign-dance modals | `src/renderer/src/components/modals/` |

---

## Documentation maintenance

After **any** user-visible feature, IPC change, or meaningful behavior change, update the docs that humans and agents rely on:

1. **`README.md`** — Feature list / setup if affected.
2. **`docs/`** — At least `architecture.md` for IPC/process flow; `ui-ux.md` for interactions; add or touch other topic files as relevant (`audio-engine.md`, `ballroom-context.md`, etc.).
3. **`AGENTS.md`** and **`copilot-instructions.md`** — File locations, patterns, or guardrails that changed.

Keep edits proportional: one-line fixes do not require rewriting every doc.

---

## What NOT to Do

- Do not add npm packages for things the Web API or Node.js stdlib already provides
- Do not use `ipcRenderer` directly in components — only through `window.electronAPI`
- Do not hardcode colors, spacing, or font sizes in Svelte `<style>` blocks — use CSS tokens
- Do not add SQLite or any database — `electron-store` is the persistence layer for MVP
- Do not add a state management library (Zustand, Redux, etc.) — Svelte stores are sufficient
- Do not break the strict process isolation — renderer never does file I/O directly

---

## Adding a New Feature

1. Define types in `src/shared/types.ts`
2. Add IPC channel constants to `src/shared/ipc-channels.ts`
3. Implement the service in `src/main/services/`
4. Add IPC handler in `src/main/ipc/`
5. Expose via preload in `src/preload/index.ts`
6. Add store state and actions in `src/renderer/src/stores/`
7. Implement the UI in `src/renderer/src/components/`
8. Update relevant docs (see **Documentation maintenance** above)

---

## Learned User Preferences

- Prefer documenting and using root `Taskfile.yml` (go-task) commands such as `task dev` and `task build`; npm scripts in `package.json` remain the underlying implementation.
- Library organization UX: bulk-assign local tracks to dances via multi-select (click, Ctrl/Cmd+toggle, Shift+range) and dragging onto sidebar dance categories, in addition to single-track assign flows; optional bulk dance when adding a folder; remove folders (and their tracks) or single local tracks from the library without deleting files on disk.
- Library playback UX: treat the visible track list as tied to where the queue was started—show the current track as “playing” only when the active filter matches that source (e.g. Samba vs All Tracks), not in every view that happens to list the same file.
- Track list: for the playing row, only the title uses the accent color; the artist line stays normal secondary text.
- Sidebar library: do not show per-dance track counts; indicate which dance (or All Tracks) owns the active queue with a playback-source marker (e.g. speaker), similar to Spotify.
- Every sidebar click on a dance or All Tracks clears multi-selection, even when the filter does not change.
- Track metadata identification: prefill manual catalog search from the filename and any existing artist metadata, with a reset back to that default after edits; keep explicit manual search when automatic matching is poor.
- Metadata catalog search: merge provider results (e.g. Apple/iTunes-style and Spotify) into one list ordered by match quality—ranking should reorder hits, not discard valid results that score lower.

## Learned Workspace Facts

- Tempo slider limits are ±32% via `TEMPO_MIN_PERCENT` and `TEMPO_MAX_PERCENT` in `src/shared/constants.ts` (supersedes older ±20% examples where they conflict).
- npm package `soundtouch-ts` is published under 1.x only; use e.g. `^1.1.1`, not `^0.1.0`, or `npm install` fails with `ETARGET`.
- Main process imports `@electron-toolkit/utils` from `src/main/index.ts`; it must stay listed in `package.json` dependencies.
- Renderer Content Security Policy must include `worker-src 'self' blob:` when using `web-audio-beat-detector`, which loads workers from `blob:` URLs.
- Automatic BPM uses `web-audio-beat-detector` on decoded audio; writing back to files is supported for MP3 (`node-id3`, TBPM) and FLAC (`flac-tagger`, BPM comment); other formats store detected BPM in the library persistence layer only.
- Lint and format use **Biome** (`npm run lint`, `npm run lint:fix`, `biome.json`). For `.svelte` files, Biome disables `noUnusedImports` / organize-imports in script blocks because symbols may be used only in the template.
- TypeScript in Svelte (`<script lang="ts">`) requires `svelte-preprocess` wired in the Vite Svelte plugin; overly strict `noUnusedLocals` during Svelte preprocessing can strip imports used only in templates—this repo configures the preprocessor to avoid that class of failure.
- Player readouts: BPM uses `referenceBpmInfo` / `adjustedBpm` from **both** `playerState.track` and `libraryState.tracks` (by id) so values set or detected after load are not stale; seek labels use **listener (wall-clock) time** at the current tempo (`currentTime/tempo`, `sourceDuration/tempo`), with `PlaybackState.sourceDuration` from the track and refreshed when the decoded buffer loads.
- `PlayerState.playbackListDanceId` (`DanceId | null`, `null` = All Tracks) records which sidebar list context started the current queue; `TrackItem` and sidebar components compare it to the active filter so “now playing” and queue actions stay scoped to that context.
- `NowPlayingBar` seek control uses a layered track gradient (played portion, optional hover preview segment toward the pointer, dim remainder); the range thumb is shown on shell hover, while scrubbing, or when the control has keyboard focus (`:focus-visible`).
- Do not open Electron DevTools automatically on app startup, including when running `task dev` / `npm run dev`.
- When the user applies metadata from a catalog match, rename the local audio file on disk to `Artist - Title` when the rename pipeline supports that track and path.
