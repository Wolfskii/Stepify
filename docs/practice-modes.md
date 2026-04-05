# Practice modes & competition simulation

## Finals (MVP)

- **Sidebar → Modes → Finals** opens the **main panel** (replaces the track list until **Close** / **Escape**).
- Flow: **count** (how many finals) → **configure** each final (Standard/Latin, subset of the five dances, minimum song length default 1:45, break seconds) → **playlist** (one random library track per dance slot that meets **duration ≥ minimum**, then **Break** rows between dances).
- **Apply lengths & breaks to all finals** / **Apply full setup to all finals** copy from the final you’re editing.
- **Randomize songs** picks new tracks per dance **without changing dance order or pauses**; if only one track qualifies, it can stay the same.
- **Not wired yet:** playback through this list, persistence, Rounds / custom mode / **Other** rows (still stubs).

## Intended direction (broader)

- Drag dances from the sidebar into a timeline; **Other** for time blocks and PA/ceremony audio.
- Full **competition simulation** in-app.

## Implementation

- Types: `FinalRoundConfig`, `FinalsPlaylistRow`, `FinalsFlow` in `src/shared/types.ts`.
- Logic: `src/renderer/src/utils/finalsPlaylist.ts` (build rows, randomize picks).
- State: `src/renderer/src/stores/finals.store.ts`.
- UI: `src/renderer/src/components/finals/FinalsPanel.svelte`; `AppShell` swaps main content when `finalsFlow !== null`.
- Reuse `DanceId` / `DANCE_CATEGORIES` order; do not hardcode BPM ranges outside `src/shared/constants.ts`.
