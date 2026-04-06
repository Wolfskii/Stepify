# Copilot Instructions — Stepify

Quick reference for GitHub Copilot completions in this repository.

---

## Stack

- Electron 30 + Svelte 4 + TypeScript (strict)
- electron-vite for building
- No React, no Vue, no Next.js
- No Tailwind, no CSS frameworks — CSS custom properties only

---

## File Naming

| Type | Convention | Example |
|------|-----------|---------|
| Svelte component | PascalCase.svelte | `TempoSlider.svelte` |
| TypeScript module | camelCase.ts | `audioEngine.ts` |
| Svelte store | camelCase.store.ts | `player.store.ts` |
| IPC handler | camelCase.ipc.ts | `library.ipc.ts` |
| Main service | camelCase.service.ts OR camelCase.ts | `libraryService.ts` |

---

## Imports

```typescript
// Shared types (works in both main and renderer)
import type { Track, DanceId } from '@shared/types'
import { DANCE_CATEGORIES } from '@shared/constants'
import { IPC_LIBRARY } from '@shared/ipc-channels'

// Renderer-only
import { playerActions } from '@renderer/stores/player.store'
```

---

## IPC Pattern

**Main process handler:**
```typescript
ipcMain.handle(IPC_LIBRARY.GET_TRACKS, async (_event, danceId?: DanceId): Promise<IpcResponse<Track[]>> => {
  const tracks = libraryService.getTracksByDance(danceId)
  return { success: true, data: tracks }
})
```

**Preload bridge:**
```typescript
getTracks: (danceId?: DanceId): Promise<IpcResponse<Track[]>> =>
  ipcRenderer.invoke(IPC_LIBRARY.GET_TRACKS, danceId),
```

**Renderer call:**
```typescript
const result = await window.electronAPI.library.getTracks(danceId)
if (result.success && result.data) { libraryActions.setTracks(result.data) }
```

---

## Store Pattern

```typescript
// stores/example.store.ts
import { writable, derived } from 'svelte/store'

interface ExampleState { value: string }
const initialState: ExampleState = { value: '' }

export const exampleState = writable<ExampleState>(initialState)
export const value = derived(exampleState, ($s) => $s.value)

export const exampleActions = {
  setValue(v: string) {
    exampleState.update((s) => ({ ...s, value: v }))
  }
}
```

---

## CSS Rules

- Use `var(--color-bg-surface)` not `#1a1a22`
- Use `var(--space-4)` not `16px`
- Use `var(--radius-md)` not `8px`
- Use `var(--duration-fast)` not `120ms`
- Scoped styles only — no global selectors in Svelte `<style>`

---

## Dance Domain

```typescript
type DanceId =
  | 'cha-cha' | 'samba' | 'rumba' | 'paso-doble' | 'jive'          // Latin
  | 'slow-waltz' | 'tango' | 'viennese-waltz' | 'foxtrot' | 'quickstep'  // Standard

// Tempo: playback rate (not BPM)
// 1.0 = 100% normal speed
// 0.9 = -10% (slow down)
// 1.1 = +10% (speed up)
// Adjusted BPM = originalBpm * tempo
```

---

## Audio Engine

```typescript
import { audioEngine } from '@renderer/services/audioEngine'

await audioEngine.load(track)
audioEngine.play()
audioEngine.pause()
audioEngine.seek(30)           // seconds
audioEngine.setTempo(0.95)     // -5%
audioEngine.setVolume(0.8)     // 0.0–1.0
// Local tracks are normalized on load to a target loudness (-18 dBFS),
// with bounded compensation (+10 dB max boost / -12 dB max cut).

audioEngine.on('timeupdate', (time: number) => { ... })
audioEngine.on('ended', () => { ... })
```

---

## Key Constraints

- Renderer has NO Node.js access — file I/O via `window.electronAPI` only
- No raw IPC strings — always use `IPC_*` constants from `@shared/ipc-channels`
- No hardcoded colors or spacing — use CSS tokens
- No `any` in TypeScript without explanatory comment
- Spotify features are stubs — mark with `// TODO: see docs/spotify-integration.md`
- Sidebar **Finals** uses nested persisted sessions (`finals.store` + settings `finalsSessions`) and `FinalsPanel`; `finalsMainVisible` controls whether main content shows the finals panel vs `TrackList` (`AppShell`). Library nav calls `finalsActions.hideFinalsMainPanel()`. Player queue may include **break** items. **Rounds**, **New custom mode…**, **Other** rows are stubs — `// TODO: see docs/practice-modes.md`. Sidebar footer: **Add folder** + **Settings** (cog); settings panel is a stub (toast) until implemented — `docs/ui-ux.md`

---

## Documentation (required after features)

When you add or change behavior, IPC, or user-visible flows, update **in the same change** (as appropriate):

- `README.md` (features / setup)
- `docs/architecture.md`, `docs/ui-ux.md`, and any other `docs/*.md` the feature touches
- `AGENTS.md` and this `copilot-instructions.md` if patterns, file locations, or constraints changed

See **Documentation maintenance** in `AGENTS.md` for the full checklist.
