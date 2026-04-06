<script lang="ts">
import { onDestroy, onMount, tick } from 'svelte'
import { get } from 'svelte/store'
import { resolveTrackReferenceBpm } from '@shared/track-bpm'
import { DANCE_CATEGORIES } from '@shared/constants'
import type { Track } from '@shared/types'
import { audioEngine } from '../../services/audioEngine'
import { activeFinalsSession, finalsActions, finalsFlow } from '../../stores/finals.store'
import { libraryState } from '../../stores/library.store'
import { isPlaying, isQueueBreakItem, playerActions, playerState } from '../../stores/player.store'
import {
  formatDurationClock,
  parseMinSecParts,
  playlistRowIndexForQueueIndex,
} from '../../utils/finalsPlaylist'

$: sess = $activeFinalsSession
$: flow = $finalsFlow
/** Playlist row index matching current player queue (reactive). */
$: currentPlaylistRowIndex = (() => {
  const s = sess
  const ps = $playerState
  if (!s || ps.playbackFinalsSessionId !== s.id) return null
  return playlistRowIndexForQueueIndex(s.playlist, $libraryState.tracks, ps.queueIndex)
})()

/** Drop stale :focus-visible on badge buttons after the queue advances (row outline follows `queueIndex`). */
function blurStaleFinalsPlaylistFocus() {
  const ae = document.activeElement
  if (!(ae instanceof HTMLElement)) return
  if (!ae.classList.contains('finals-badge-hit')) return
  const row = ae.closest('.finals-table--row')
  if (!(row instanceof HTMLElement)) return
  if (!row.classList.contains('finals-table--playing')) ae.blur()
}

let prevFinalsQueueIndex = -1
$: {
  const fid = $playerState.playbackFinalsSessionId
  const qi = $playerState.queueIndex
  if (fid == null) {
    prevFinalsQueueIndex = -1
  } else if (qi !== prevFinalsQueueIndex) {
    prevFinalsQueueIndex = qi
    void tick().then(blurStaleFinalsPlaylistFocus)
  }
}
$: round =
  flow === 'configure' && sess && sess.rounds[sess.configureIndex] != null
    ? sess.rounds[sess.configureIndex]
    : null
$: disciplineDances =
  round != null ? DANCE_CATEGORIES.filter((d) => d.style === round.discipline) : []

function onWinKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  const t = (e.target as HTMLElement)?.tagName
  if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return
  finalsActions.cancelToLibrary()
}

onMount(() => window.addEventListener('keydown', onWinKey))
onDestroy(() => window.removeEventListener('keydown', onWinKey))

function setDanceDurationFromInputs(minStr: string, secStr: string) {
  const s = get(activeFinalsSession)
  if (!s) return
  const r = s.rounds[s.configureIndex]
  if (!r) return
  const m = Number.parseInt(minStr, 10)
  const sec = Number.parseInt(secStr, 10)
  finalsActions.updateRound(s.configureIndex, {
    danceDurationSec: parseMinSecParts(Number.isFinite(m) ? m : 0, Number.isFinite(sec) ? sec : 0),
  })
}

function setBreakSeconds(v: string) {
  const s = get(activeFinalsSession)
  if (!s?.rounds[s.configureIndex]) return
  const n = Number.parseInt(v, 10)
  finalsActions.updateRound(s.configureIndex, {
    breakDurationSec: Number.isFinite(n) ? Math.max(0, Math.min(600, n)) : 0,
  })
}

function inputValue(e: Event): string {
  const t = e.currentTarget
  return t instanceof HTMLInputElement ? t.value : ''
}

function onFinalsCountInput(e: Event) {
  finalsActions.setFinalsCountForActive(Number(inputValue(e)))
}

function onDanceMinInput(e: Event) {
  const s = get(activeFinalsSession)
  const sec = s?.rounds[s.configureIndex]?.danceDurationSec ?? 0
  setDanceDurationFromInputs(inputValue(e), String(sec % 60))
}

function onDanceSecInput(e: Event) {
  const s = get(activeFinalsSession)
  const dur = s?.rounds[s.configureIndex]?.danceDurationSec ?? 0
  setDanceDurationFromInputs(String(Math.floor(dur / 60)), inputValue(e))
}

function onBreakDurationInput(e: Event) {
  setBreakSeconds(inputValue(e))
}

function onGapBetweenFinalsInput(e: Event) {
  const n = Number.parseInt(inputValue(e), 10)
  finalsActions.setGapBetweenFinalsForActive(Number.isFinite(n) ? n : 0)
}

function bpmCell(tr: Track | undefined): string {
  if (!tr) return '—'
  const r = resolveTrackReferenceBpm(tr)
  return r ? String(r.bpm) : '—'
}

function listRowIsCurrent(playlistIndex: number): boolean {
  return currentPlaylistRowIndex === playlistIndex
}

async function onBadgePointerDown(playlistIndex: number, e: PointerEvent) {
  e.stopPropagation()
  e.preventDefault()
  const s = get(activeFinalsSession)
  if (!s) return
  const same = currentPlaylistRowIndex === playlistIndex
  const playing = get(isPlaying)
  if (same && playing) {
    const p = get(playerState)
    if (isQueueBreakItem(p)) playerActions.pause()
    else {
      audioEngine.pause()
      playerActions.pause()
    }
    return
  }
  if (same && !playing) {
    const p = get(playerState)
    if (isQueueBreakItem(p)) playerActions.play()
    else {
      audioEngine.play()
      playerActions.play()
    }
    return
  }
  await finalsActions.playFromPlaylistRow(playlistIndex)
}

function onListRowDblClick(playlistIndex: number) {
  void finalsActions.playFromPlaylistRow(playlistIndex)
}
</script>

{#if !sess}
  <div class="finals-panel finals-panel--empty">
    <p class="finals-panel__empty-msg">Select a final in the sidebar.</p>
  </div>
{:else}
<div class="finals-panel">
  <header class="finals-panel__head">
    <div class="finals-panel__head-text">
      <h1 class="finals-panel__title">
        {#if flow === 'count'}
          Finals setup — {sess.label}
        {:else if flow === 'configure'}
          {sess.label}: round {sess.configureIndex + 1} of {sess.rounds.length}
        {:else}
          {sess.label} — playlist
        {/if}
      </h1>
      <p class="finals-panel__sub">
        {#if flow === 'count'}
          How many finals to simulate? You’ll set discipline, dances, timings, breaks between dances, and time between finals.
        {:else if flow === 'configure'}
          Choose Standard or Latin, which dances, song length per dance, pause between dances, and time between finals.
        {:else}
          Random picks are at least as long as your per-dance length; playback uses that length. Pauses are time blocks between dances and between finals.
        {/if}
      </p>
    </div>
    <button
      type="button"
      class="finals-panel__close"
      on:click={() => finalsActions.cancelToLibrary()}
    >
      Close
    </button>
  </header>

  {#if flow === 'count'}
    <div class="finals-panel__body">
      <label class="finals-field">
        <span class="finals-field__label">Number of finals</span>
        <input
          class="finals-input"
          type="number"
          min="1"
          max="20"
          value={sess.finalsCount}
          on:input={onFinalsCountInput}
        />
      </label>
      <label class="finals-field">
        <span class="finals-field__label">Time between finals (seconds)</span>
        <input
          class="finals-input finals-input--sm"
          type="number"
          min="0"
          max="600"
          value={sess.gapBetweenFinalsSec}
          on:input={onGapBetweenFinalsInput}
        />
      </label>
      <div class="finals-panel__actions">
        <button type="button" class="finals-btn" on:click={() => finalsActions.cancelToLibrary()}>
          Cancel
        </button>
        <button type="button" class="finals-btn finals-btn--primary" on:click={() => finalsActions.startConfigure()}>
          Continue
        </button>
      </div>
    </div>
  {:else if flow === 'configure' && round != null}
    <div class="finals-panel__body">
      <label class="finals-field finals-field--run-wide">
        <span class="finals-field__label">Time between finals (seconds)</span>
        <input
          class="finals-input finals-input--sm"
          type="number"
          min="0"
          max="600"
          value={sess.gapBetweenFinalsSec}
          on:input={onGapBetweenFinalsInput}
        />
      </label>
      <nav class="finals-jump" aria-label="Jump to final">
        {#each sess.rounds as _, i}
          <button
            type="button"
            class="finals-jump__btn"
            class:finals-jump__btn--active={i === sess.configureIndex}
            on:click={() => finalsActions.goConfigureRound(i)}
          >
            {i + 1}
          </button>
        {/each}
      </nav>

      <div class="finals-discipline">
        <span class="finals-field__label">Discipline</span>
        <div class="finals-discipline__btns">
          <button
            type="button"
            class="finals-chip"
            class:finals-chip--on={round.discipline === 'standard'}
            on:click={() => finalsActions.setRoundDiscipline(sess.configureIndex, 'standard')}
          >
            Standard
          </button>
          <button
            type="button"
            class="finals-chip"
            class:finals-chip--on={round.discipline === 'latin'}
            on:click={() => finalsActions.setRoundDiscipline(sess.configureIndex, 'latin')}
          >
            Latin
          </button>
        </div>
      </div>

      <fieldset class="finals-dances">
        <legend class="finals-field__label">Dances (competition order)</legend>
        <div class="finals-dances__grid">
          {#each disciplineDances as d}
            <label class="finals-check">
              <input
                type="checkbox"
                checked={round.danceIds.includes(d.id)}
                on:change={() => finalsActions.toggleRoundDance(sess.configureIndex, d.id)}
              />
              <span>{d.name}</span>
            </label>
          {/each}
        </div>
      </fieldset>

      {#key sess.configureIndex}
        <div class="finals-times">
          <label class="finals-field">
            <span class="finals-field__label">Song length per dance</span>
            <div class="finals-times__row">
              <input
                class="finals-input finals-input--sm"
                type="number"
                min="0"
                max="30"
                value={Math.floor(round.danceDurationSec / 60)}
                aria-label="Minutes"
                on:input={onDanceMinInput}
              />
              <span class="finals-times__sep">m</span>
              <input
                class="finals-input finals-input--sm"
                type="number"
                min="0"
                max="59"
                value={round.danceDurationSec % 60}
                aria-label="Seconds"
                on:input={onDanceSecInput}
              />
              <span class="finals-times__sep">s</span>
            </div>
          </label>
          <label class="finals-field">
            <span class="finals-field__label">Break between dances (seconds)</span>
            <!-- Use named handlers in script — `as` type assertions break Svelte markup parsing -->
            <input
              class="finals-input finals-input--sm"
              type="number"
              min="0"
              max="600"
              value={round.breakDurationSec}
              on:input={onBreakDurationInput}
            />
          </label>
        </div>
      {/key}

      <div class="finals-apply">
        <button
          type="button"
          class="finals-btn finals-btn--ghost"
          on:click={() => finalsActions.applyTimesToAllFinals(sess.configureIndex)}
        >
          Apply lengths &amp; breaks to all finals
        </button>
        <button
          type="button"
          class="finals-btn finals-btn--ghost"
          on:click={() => finalsActions.applyFullToAllFinals(sess.configureIndex)}
        >
          Apply full setup to all finals
        </button>
      </div>

      <div class="finals-panel__actions">
        <button type="button" class="finals-btn" on:click={() => finalsActions.configurePrev()}>
          Back
        </button>
        <button
          type="button"
          class="finals-btn finals-btn--primary"
          on:click={() => finalsActions.configureNextOrFinish()}
        >
          {sess.configureIndex >= sess.rounds.length - 1 ? 'Build playlist' : 'Next final'}
        </button>
      </div>
    </div>
  {:else if flow === 'list'}
    <div class="finals-panel__body finals-panel__body--list">
      <div class="finals-list-toolbar">
        <button
          type="button"
          class="finals-btn finals-btn--primary"
          on:click={() => finalsActions.randomizePlaylistTracks()}
        >
          Randomize songs
        </button>
        <button type="button" class="finals-btn" on:click={() => finalsActions.backToConfigure()}>
          Edit setup
        </button>
      </div>
      <div class="finals-table-wrap" role="grid" aria-label="Finals playlist">
        <div class="finals-table finals-table--head" role="row">
          <div class="finals-table__cell finals-table__cell--badge" role="columnheader"></div>
          <div class="finals-table__cell" role="columnheader">Title</div>
          <div class="finals-table__cell" role="columnheader">Artist</div>
          <div class="finals-table__cell finals-table__cell--num" role="columnheader">BPM</div>
          <div class="finals-table__cell finals-table__cell--num" role="columnheader">Length</div>
        </div>
        {#each sess.playlist as row, playlistIndex}
          {#if row.kind === 'track'}
            {@const tr = row.trackId
              ? $libraryState.tracks.find((t) => t.id === row.trackId)
              : undefined}
            <div
              role="row"
              class="finals-table finals-table--row finals-table--track"
              class:finals-table--playing={listRowIsCurrent(playlistIndex)}
              on:dblclick={() => onListRowDblClick(playlistIndex)}
            >
              <div class="finals-table__cell finals-table__cell--badge" role="gridcell">
                <button
                  type="button"
                  class="finals-badge-hit"
                  title={listRowIsCurrent(playlistIndex) && $isPlaying ? 'Pause' : 'Play from here'}
                  aria-label={listRowIsCurrent(playlistIndex) && $isPlaying ? 'Pause' : 'Play from here'}
                  on:pointerdown={(e) => onBadgePointerDown(playlistIndex, e)}
                >
                  <span class="finals-badge-hit__f">F{row.finalIndex + 1}</span>
                  <span class="finals-badge-hit__ico" aria-hidden="true">
                    {#if listRowIsCurrent(playlistIndex) && $isPlaying}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                      </svg>
                    {:else}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7L8 5z" />
                      </svg>
                    {/if}
                  </span>
                </button>
              </div>
              {#if tr}
                <div class="finals-table__cell truncate" role="gridcell" title={tr.title}>
                  {tr.title}
                </div>
                <div class="finals-table__cell truncate finals-table__cell--muted" role="gridcell">
                  {tr.artist || '—'}
                </div>
                <div class="finals-table__cell finals-table__cell--num" role="gridcell">
                  {bpmCell(tr)}
                </div>
                <div class="finals-table__cell finals-table__cell--num" role="gridcell">
                  {formatDurationClock(row.playDurationSec)}
                </div>
              {:else}
                <div
                  class="finals-table__cell finals-table__cell--empty truncate finals-table__cell--span-rest"
                  role="gridcell"
                >
                  {row.emptyReason ?? 'No matching track'}
                </div>
              {/if}
            </div>
          {:else}
            <div
              role="row"
              class="finals-table finals-table--row finals-table--pause"
              class:finals-table--playing={listRowIsCurrent(playlistIndex)}
              on:dblclick={() => onListRowDblClick(playlistIndex)}
            >
              <div class="finals-table__cell finals-table__cell--badge" role="gridcell">
                <button
                  type="button"
                  class="finals-badge-hit"
                  title={listRowIsCurrent(playlistIndex) && $isPlaying ? 'Pause' : 'Play from here'}
                  aria-label={listRowIsCurrent(playlistIndex) && $isPlaying ? 'Pause' : 'Play from here'}
                  on:pointerdown={(e) => onBadgePointerDown(playlistIndex, e)}
                >
                  <span class="finals-badge-hit__f">F{row.finalIndex + 1}</span>
                  <span class="finals-badge-hit__ico" aria-hidden="true">
                    {#if listRowIsCurrent(playlistIndex) && $isPlaying}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                      </svg>
                    {:else}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7L8 5z" />
                      </svg>
                    {/if}
                  </span>
                </button>
              </div>
              <div class="finals-table__cell" role="gridcell">{row.label ?? 'Break'}</div>
              <div class="finals-table__cell finals-table__cell--muted" role="gridcell">—</div>
              <div class="finals-table__cell finals-table__cell--num" role="gridcell">—</div>
              <div class="finals-table__cell finals-table__cell--num" role="gridcell">
                {formatDurationClock(row.seconds)}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</div>
{/if}

<style>
  .finals-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: var(--space-4);
    overflow: hidden;
  }

  .finals-panel--empty {
    justify-content: center;
    align-items: center;
  }

  .finals-panel__empty-msg {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 14px;
  }

  .finals-panel__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
    flex-shrink: 0;
  }

  .finals-panel__title {
    margin: 0 0 var(--space-1);
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .finals-panel__sub {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-secondary);
    max-width: 52ch;
    line-height: 1.45;
  }

  .finals-panel__close {
    flex-shrink: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary);
    transition:
      background var(--duration-fast),
      color var(--duration-fast);
  }

  .finals-panel__close:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }

  .finals-panel__body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    overflow-y: auto;
  }

  .finals-panel__body--list {
    gap: var(--space-3);
  }

  .finals-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .finals-field__label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .finals-field--run-wide {
    margin-bottom: var(--space-1);
  }

  .finals-input {
    max-width: 120px;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg-overlay);
    color: var(--color-text-primary);
    font-size: 14px;
  }

  .finals-input--sm {
    max-width: 72px;
  }

  .finals-panel__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .finals-btn {
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary);
    transition:
      background var(--duration-fast),
      color var(--duration-fast);
  }

  .finals-btn:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }

  .finals-btn--primary {
    background: var(--color-accent-muted);
    color: var(--color-accent);
  }

  .finals-btn--primary:hover {
    color: var(--color-accent-hover);
  }

  .finals-btn--ghost {
    font-weight: 500;
    font-size: 12px;
    text-align: left;
  }

  .finals-jump {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .finals-jump__btn {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary);
    transition:
      background var(--duration-fast),
      color var(--duration-fast);
  }

  .finals-jump__btn:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }

  .finals-jump__btn--active {
    background: var(--color-accent-muted);
    color: var(--color-accent);
  }

  .finals-discipline__btns {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .finals-chip {
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-full);
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
    transition:
      background var(--duration-fast),
      color var(--duration-fast),
      border-color var(--duration-fast);
  }

  .finals-chip:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }

  .finals-chip--on {
    border-color: var(--color-accent);
    background: var(--color-accent-muted);
    color: var(--color-accent);
  }

  .finals-dances {
    border: none;
    padding: 0;
    margin: 0;
  }

  .finals-dances__grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .finals-check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 14px;
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .finals-times__row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .finals-times__sep {
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .finals-apply {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border-subtle);
  }

  .finals-list-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .finals-table-wrap {
    overflow: auto;
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-right: var(--space-1);
  }

  .finals-table {
    display: grid;
    grid-template-columns: 52px minmax(120px, 1.4fr) minmax(100px, 1fr) 52px 56px;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-2) var(--space-3);
    font-size: 13px;
    border-radius: var(--radius-md);
  }

  .finals-table--head {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--color-bg-surface);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
    padding-top: var(--space-2);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .finals-table--row {
    background: var(--color-bg-overlay);
  }

  .finals-table--row:hover {
    background: var(--color-bg-elevated);
  }

  .finals-table--playing {
    outline: 1px solid var(--color-accent);
    outline-offset: -1px;
  }

  .finals-table--pause {
    border: 1px dashed var(--color-border);
    background: transparent;
  }

  .finals-table__cell--num {
    font-variant-numeric: tabular-nums;
    text-align: right;
    justify-self: end;
  }

  .finals-table__cell--muted {
    color: var(--color-text-secondary);
  }

  .finals-table__cell--empty {
    color: var(--color-warning);
    font-style: italic;
  }

  .finals-table__cell--span-rest {
    grid-column: 2 / -1;
  }

  .finals-badge-hit {
    position: relative;
    width: 44px;
    height: 32px;
    border: none;
    border-radius: var(--radius-md);
    background: var(--color-bg-base);
    color: var(--color-text-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background var(--duration-fast),
      color var(--duration-fast);
  }

  .finals-badge-hit:hover {
    background: var(--color-accent-muted);
    color: var(--color-accent);
  }

  .finals-badge-hit__ico {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity var(--duration-fast);
    background: var(--color-accent-muted);
    color: var(--color-accent);
    border-radius: var(--radius-md);
  }

  .finals-badge-hit:hover .finals-badge-hit__f {
    opacity: 0;
  }

  .finals-badge-hit:hover .finals-badge-hit__ico {
    opacity: 1;
  }

  .finals-badge-hit__f {
    transition: opacity var(--duration-fast);
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
</style>
