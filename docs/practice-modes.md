# Practice modes & competition simulation

## Finals (MVP)

- **Sidebar → Modes → Finals** expands a **nested list** of saved runs (**Final 1**, …) plus **+** on the Finals row. Click a run to open the **finals panel** in main content; **All Tracks**, a **dance**, or a **folder** switches main content back to the track list **without** closing the final — playback keeps going until you start playback from the library (which clears the finals queue origin). **Close** / **Escape** deselects the run (main area returns to the library). Remove a run with the **×** on its row (stops playback if that run was playing).
- Saved finals are **persisted** in app settings (`finalsSessions` on `AppSettings`) and survive restarts until removed.
- Flow per run: **count** (**Finals name** editable, default `Final N`; how many finals; **time between finals** default 60s) → **configure** (name still editable at top; Standard/Latin, subset of the five dances, **song length per dance** default 1:45, **break between dances** default 20s) → **playlist** (one random library track per dance slot that is **at least that long on disk**, then **Break** rows between dances and a **Between finals** section—**Break** as the row title—after each final except the last). The UI shows that **per-dance length** as the slot duration (not the file’s full length).
- **Apply lengths & breaks to all finals** / **Apply full setup to all finals** copy from the final you’re editing.
- **Randomize songs** picks new tracks per dance **without changing dance order or pauses**; if only one track qualifies, it can stay the same.
- **Playback** uses `PlaybackQueueItem[]` in `player.store`: each **track** has an optional **segment cap**; **break** rows advance the queue with **wall-clock** timing (tempo does **not** stretch breaks). The now-playing bar shows breaks like a track; capped tracks **fade out** at the segment end (`PLAYBACK_CAP_END_FADE_SEC` in `src/shared/constants.ts`). **Double-click** a playlist row (or use the **F#** hover control) to play from that row onward.
- Opening a finals run from the sidebar sets **All Tracks** context (`selectDance(null)`). Browsing **dance** / **folder** after that is normal; finals can stay selected in the sidebar while the track list shows.
- **Not wired yet:** Rounds / custom mode / **Other** rows (still stubs).

## Intended direction (broader)

- Drag dances from the sidebar into a timeline; **Other** for time blocks and PA/ceremony audio.
- Full **competition simulation** in-app.

## Implementation

- Types: `FinalRoundConfig`, `FinalsPlaylistRow`, `FinalsFlow`, `FinalsPersistedSession`, `PlaybackQueueItem`, `PlaybackState` in `src/shared/types.ts`.
- Logic: `src/renderer/src/utils/finalsPlaylist.ts` (build playlist rows, **full playback queue** with breaks, index mapping).
- State: `src/renderer/src/stores/finals.store.ts` (sessions, `activeSessionId`, `finalsMainVisible`); `src/renderer/src/stores/player.store.ts` (queue items, `playbackFinalsSessionId`).
- UI: `src/renderer/src/components/finals/FinalsPanel.svelte`; `Sidebar.svelte` / `DanceCategoryItem.svelte` call `hideFinalsMainPanel` on library nav; `AppShell` shows `FinalsPanel` when `finalsFlow != null && finalsMainPanelOpen`.
- Reuse `DanceId` / `DANCE_CATEGORIES` order; do not hardcode BPM ranges outside `src/shared/constants.ts`.
