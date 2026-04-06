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
| Samba | 100–104 |
| Rumba | 100–108 |
| Paso Doble | 120–124 |
| Jive | 168–176 |
| Slow Waltz | 84–90 |
| Tango | 124–132 |
| Viennese Waltz | 174–180 |
| Foxtrot | 112–120 |
| Quickstep | 200–208 |

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
| Library sidebar shell | `src/renderer/src/components/sidebar/Sidebar.svelte` |
| Collapsible sidebar section | `src/renderer/src/components/sidebar/SidebarCollapsibleGroup.svelte` |
| Practice modes | `docs/practice-modes.md` |
| Finals builder state | `src/renderer/src/stores/finals.store.ts` |
| Finals playlist helpers | `src/renderer/src/utils/finalsPlaylist.ts` |
| Finals main-panel UI | `src/renderer/src/components/finals/FinalsPanel.svelte` |

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
- Library organization UX: bulk-assign local tracks to dances via multi-select (click, Ctrl/Cmd+toggle, Shift+range) and dragging **title/artist text** onto sidebar dance categories; **reorder** by dragging the row except **play**, **cover art**, **BPM**, and **dance** controls. **Sidebar Latin/Standard**: drag dance rows to reorder within the section; **document-capture** drop + `danceListReorderDragSession` mirror track-list reorder (Chromium `getData` quirks); gap preview via `computeDanceReorderPreviewOffset` (`danceListReorderUi.ts`). Optional bulk dance when adding a folder; remove folders (and their tracks) or single local tracks from the library without deleting files on disk. **Shuffle** uses weighted randomness with a mild popularity bias (`weightedShuffleByPopularity` in `trackListFilter.ts`). Reorder updates the player queue when playback was started from that same filtered list. **Custom row order** (manual reorder) **persists** across dance/folder/search view switches for the view it was created in (`manualListDisplayContext`); it is **cleared** by clicking a **sort column header**, toggling **shuffle**, or **restarting the app** (in-memory).
- Library playback UX: treat the visible track list as tied to where the queue was started—show the current track as “playing” only when the active filter matches that source (e.g. Samba vs All Tracks), not in every view that happens to list the same file.
- Track list: for the playing row, only the title uses the accent color; the artist line stays normal secondary text.
- Sidebar library: do not show per-dance track counts; indicate which dance (or All Tracks) owns the active queue with a playback-source marker (e.g. speaker), similar to Spotify. **Latin**, **Standard**, **Modes**, **Other**, and **Folders** use the same **collapsible** header pattern; **Folders** and **Other** start **collapsed**. **Finals** under **Modes** is a **nested** list of persisted runs (`finalsSessions` in settings); **All Tracks** / dance / folder clicks call `finalsActions.hideFinalsMainPanel()` so the track list shows while a final can stay selected and keep playing until library `setQueue` clears `playbackFinalsSessionId`. **Rounds**, **New custom mode…**, and **Other** rows remain stubs (`docs/practice-modes.md`). **Finals** built playlist (`FinalsPanel.svelte`): **past** rows/sections use ~1s opacity fade; **playing** row shows EQ/hourglass on row hover and **pause** only when the pointer is on the control (or `:focus-visible`) via `mouseenter`/`leave` + class `finals-pl__play-btn--pause-reveal`. Footer: **Add folder** + **Settings** (cog; app settings panel stub — toast for now). Player queue may mix **tracks** and **break** segments (`PlaybackQueueItem` in `types.ts`).
- Every sidebar click on a dance or All Tracks clears multi-selection, even when the filter does not change.
- Track metadata identification: prefill manual catalog search from the filename and any existing artist metadata, with a reset back to that default after edits; keep explicit manual search when automatic matching is poor.
- Metadata catalog search: merge provider results (e.g. Apple/iTunes-style and Spotify) into one list ordered by match quality—ranking should reorder hits, not discard valid results that score lower.
- Track list columns: meta strip order is **duration, BPM, popularity, dance** (right-pinned); **dance uses fixed `--tracklist-meta-dance-col`** so each row’s meta grid has the same width (each row is its own grid—`max-content` on that column caused per-row shifting). **`.track-item__meta` / `.track-list__meta-cols` use `width: max-content` and `justify-self: end`** on the outer cell. **Column headers live inside the scroll container** (sticky) with `scrollbar-gutter: stable`; **only `.track-list__rows` applies horizontal padding**—`.track-list__cols` uses vertical padding only so the header grid isn’t double-inset vs `.track-item` rows. Within the meta grid, **BPM and Dance** stay left-aligned with their headers; **duration and popularity** are **centered** under the clock and thumb headers. **Sortable headers** (`libraryActions.toggleTrackListSort`): title, duration, BPM, popularity, dance—toggle asc/desc; header labels and meta icons stay **neutral** (same column-label styling as other headers—no accent “active” state). **Carets** show only while a real column sort applies (`trackListSort.key` not `'none'`) and shuffle list order is **not** driving the list (`shuffleListDisplayActive`). **Drag reorder** sets `trackListSort` to `{ key: 'none', ... }` together with `manualListOrderIds` / `shuffleQueueOrderIds` so column sort does not override the new row order; **clicking any sort header** clears manual order and applies that column again. **Duration/popularity** headers lay out icon and caret **in one row** (caret to the right of the icon). **no dance sort** when `selectedDanceId` is set (icon-only column). Sorting clears shuffle list order (`clearShuffleListOrdering`). In a **single-dance filter** view, omit the dance name column and show only the **dance icon** (no full badge chrome) for changing dance.
- **Toasts / transient notifications**: anchor at the **top** of the app shell (title bar region), not the bottom over transport controls.
- **Now Playing bar**: **like** before **dislike**; **repeat** uses accent for **on** vs **on + hovered**. **Shuffle** stays **neutral** when on (not accent): it applies to the **playing list** or the **in-view list** if idle—**on** vs **on + hovered** still reads via text token step (`--color-text-secondary` → `--color-text-primary`).

## Learned Workspace Facts

- Tempo slider limits are ±32% via `TEMPO_MIN_PERCENT` and `TEMPO_MAX_PERCENT` in `src/shared/constants.ts` (supersedes older ±20% examples where they conflict).
- `soundtouch-ts` is 1.x only on npm (e.g. `^1.1.1`, not `^0.1.0` — `ETARGET` otherwise); main imports `@electron-toolkit/utils` from `src/main/index.ts` — keep it in `package.json` dependencies.
- Renderer Content Security Policy must include `worker-src 'self' blob:` when using `web-audio-beat-detector`, which loads workers from `blob:` URLs.
- Automatic BPM uses `web-audio-beat-detector` on decoded audio; writing back to files is supported for MP3 (`node-id3`, TBPM) and FLAC (`flac-tagger`, BPM comment); other formats store detected BPM in the library persistence layer only. When exactly **one** dance is assigned, detection passes that dance’s BPM band as tempo bounds; **Rumba/Samba** also use a low-passed mono pass before analysis to reduce syncopation-driven double-time errors. Up to **five** temporal samples are aggregated (cluster + outlier resistance); **TBPM that clashes with the assigned dance** is ignored so first play does not stick to a wrong file tag.
- Lint/format: **Biome** (`npm run lint`, `npm run lint:fix`, `biome.json`); in `.svelte` scripts Biome relaxes unused-import/organize rules when symbols are template-only. TypeScript in Svelte needs `svelte-preprocess` on the Vite plugin; strict unused stripping can remove template-only imports — this repo’s preprocessor avoids that.
- Player readouts: BPM uses `referenceBpmInfo` / `adjustedBpm` from **both** `playerState.track` and `libraryState.tracks` (by id) so values set or detected after load are not stale; seek labels use **listener (wall-clock) time** at the current tempo (`currentTime/tempo`, `sourceDuration/tempo`), with `PlaybackState.sourceDuration` from the track and refreshed when the decoded buffer loads.
- `PlayerState.playbackListDanceId` (`DanceId | null`, `null` = All Tracks) records which sidebar list context started the current queue; `TrackItem` and sidebar components compare it to the active filter so “now playing” and queue actions stay scoped to that context.
- Track **popularity** (`Track.popularityScore`, like +1 / dislike −1) drives default list order and **weighted shuffle** (higher scores tend earlier); main enforces a **10 minute per-track cooldown** on `library:adjust-track-popularity`, with the Now Playing bar mirroring the lock in UI. **Liking or disliking the currently playing track** still persists the new score, but **`libraryState.deferredListPopularityByTrackId`** keeps list sort + row readout on the pre-vote score until the current track changes, the list filter/search changes, folder/dance selection, or disk sync—so the visible list order does not jump and reshuffle what “next” means mid-queue.
- `NowPlayingBar` seek control uses a layered track gradient (played portion, optional hover preview segment toward the pointer, dim remainder); the range thumb is shown on shell hover, while scrubbing, or when the control has keyboard focus (`:focus-visible`).
- Local playback applies per-track loudness normalization in `audioEngine`: estimate RMS dBFS from the decoded `AudioBuffer`, target `-18 dBFS`, clamp compensation to `+10/-12 dB`, and apply as a gain multiplier combined with user volume.
- Do not open Electron DevTools automatically on app startup (`task dev` / `npm run dev`). In **development** (`!app.isPackaged` / `is.dev` from `@electron-toolkit/utils`), toggle DevTools with **F12** (`optimizer.watchWindowShortcuts`) or **Ctrl+Shift+P** (Cmd+Shift+P on macOS) on the main window; neither shortcut is registered in production builds.
- **Track list row reorder (HTML5 DnD in Electron):** handle **`dragover`/`drop` in capture phase on `document`** for reliability. On **drop**, use the **insert index from the last `dragover`** (e.g. `reorderOverIndex`)—**not** `elementFromPoint` at the pointer, because the drag image and row gaps often hit the list container. **`dataTransfer.types` can be empty** during drag in Electron; keep **`fromIndex` (and pending state) in a session**, not only the transfer payload. When **`trackListSort.key === 'none'`** after a reorder but **manual order does not apply** to the current view, **`computeVisibleTracks`** should **fall back to default list sort** so the list is not left unsorted.
- When the user applies metadata from a catalog match, rename the local audio file on disk to `Artist - Title` when the rename pipeline supports that track and path.
