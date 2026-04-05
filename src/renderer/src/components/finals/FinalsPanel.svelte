<script lang="ts">
import { onDestroy, onMount } from 'svelte'
import { get } from 'svelte/store'
import { DANCE_CATEGORIES, DANCE_CATEGORIES_BY_ID } from '@shared/constants'
import { finalsActions, finalsState } from '../../stores/finals.store'
import { libraryState } from '../../stores/library.store'
import { formatDurationClock, parseMinSecParts } from '../../utils/finalsPlaylist'

$: f = $finalsState
$: round =
  f.flow === 'configure' && f.rounds[f.configureIndex] != null ? f.rounds[f.configureIndex] : null
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
  const st = get(finalsState)
  const r = st.rounds[st.configureIndex]
  if (!r) return
  const m = Number.parseInt(minStr, 10)
  const s = Number.parseInt(secStr, 10)
  finalsActions.updateRound(st.configureIndex, {
    danceDurationSec: parseMinSecParts(Number.isFinite(m) ? m : 0, Number.isFinite(s) ? s : 0),
  })
}

function setBreakSeconds(v: string) {
  const st = get(finalsState)
  if (!st.rounds[st.configureIndex]) return
  const n = Number.parseInt(v, 10)
  finalsActions.updateRound(st.configureIndex, {
    breakDurationSec: Number.isFinite(n) ? Math.max(0, Math.min(600, n)) : 0,
  })
}

function inputValue(e: Event): string {
  const t = e.currentTarget
  return t instanceof HTMLInputElement ? t.value : ''
}

function onFinalsCountInput(e: Event) {
  finalsActions.setFinalsCount(Number(inputValue(e)))
}

function onDanceMinInput(e: Event) {
  const st = get(finalsState)
  const sec = st.rounds[st.configureIndex]?.danceDurationSec ?? 0
  setDanceDurationFromInputs(inputValue(e), String(sec % 60))
}

function onDanceSecInput(e: Event) {
  const st = get(finalsState)
  const dur = st.rounds[st.configureIndex]?.danceDurationSec ?? 0
  setDanceDurationFromInputs(String(Math.floor(dur / 60)), inputValue(e))
}

function onBreakDurationInput(e: Event) {
  setBreakSeconds(inputValue(e))
}
</script>

<div class="finals-panel">
  <header class="finals-panel__head">
    <div class="finals-panel__head-text">
      <h1 class="finals-panel__title">
        {#if f.flow === 'count'}
          Finals setup
        {:else if f.flow === 'configure'}
          Final {f.configureIndex + 1} of {f.rounds.length}
        {:else}
          Finals playlist
        {/if}
      </h1>
      <p class="finals-panel__sub">
        {#if f.flow === 'count'}
          How many finals to simulate? You’ll set discipline, dances, timings, and breaks for each.
        {:else if f.flow === 'configure'}
          Choose Standard or Latin, which dances, minimum song length, and pause between dances.
        {:else}
          Random picks meet your minimum length per dance. Pauses are time blocks between dances.
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

  {#if f.flow === 'count'}
    <div class="finals-panel__body">
      <label class="finals-field">
        <span class="finals-field__label">Number of finals</span>
        <input
          class="finals-input"
          type="number"
          min="1"
          max="20"
          value={f.finalsCount}
          on:input={onFinalsCountInput}
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
  {:else if f.flow === 'configure' && round != null}
    <div class="finals-panel__body">
      <nav class="finals-jump" aria-label="Jump to final">
        {#each f.rounds as _, i}
          <button
            type="button"
            class="finals-jump__btn"
            class:finals-jump__btn--active={i === f.configureIndex}
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
            on:click={() => finalsActions.setRoundDiscipline(f.configureIndex, 'standard')}
          >
            Standard
          </button>
          <button
            type="button"
            class="finals-chip"
            class:finals-chip--on={round.discipline === 'latin'}
            on:click={() => finalsActions.setRoundDiscipline(f.configureIndex, 'latin')}
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
                on:change={() => finalsActions.toggleRoundDance(f.configureIndex, d.id)}
              />
              <span>{d.name}</span>
            </label>
          {/each}
        </div>
      </fieldset>

      {#key f.configureIndex}
        <div class="finals-times">
          <label class="finals-field">
            <span class="finals-field__label">Minimum song length (per dance)</span>
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
          on:click={() => finalsActions.applyTimesToAllFinals(f.configureIndex)}
        >
          Apply lengths &amp; breaks to all finals
        </button>
        <button
          type="button"
          class="finals-btn finals-btn--ghost"
          on:click={() => finalsActions.applyFullToAllFinals(f.configureIndex)}
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
          {f.configureIndex >= f.rounds.length - 1 ? 'Build playlist' : 'Next final'}
        </button>
      </div>
    </div>
  {:else if f.flow === 'list'}
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
      <ul class="finals-list" role="list">
        {#each f.playlist as row}
          {#if row.kind === 'track'}
            {@const tr = row.trackId
              ? $libraryState.tracks.find((t) => t.id === row.trackId)
              : undefined}
            <li class="finals-list__row finals-list__row--track">
              <span class="finals-list__badge" title="Final index">F{row.finalIndex + 1}</span>
              <span
                class="finals-list__dance"
                style="--dance-color: {DANCE_CATEGORIES_BY_ID[row.danceId]?.color ?? 'var(--color-text-muted)'}"
              >
                {DANCE_CATEGORIES_BY_ID[row.danceId]?.name ?? row.danceId}
              </span>
              {#if tr}
                <span class="finals-list__title truncate">{tr.title}</span>
                <span class="finals-list__meta">{formatDurationClock(tr.duration)}</span>
              {:else}
                <span class="finals-list__empty truncate">
                  {row.emptyReason ?? 'No matching track'}
                </span>
              {/if}
            </li>
          {:else}
            <li class="finals-list__row finals-list__row--pause">
              <span class="finals-list__badge" title="Final index">F{row.finalIndex + 1}</span>
              <span class="finals-list__pause-label">Break</span>
              <span class="finals-list__meta">{formatDurationClock(row.seconds)}</span>
            </li>
          {/if}
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .finals-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: var(--space-4);
    overflow: hidden;
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

  .finals-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-height: 0;
  }

  .finals-list__row {
    display: grid;
    grid-template-columns: 36px minmax(100px, 140px) 1fr auto;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-bg-overlay);
    font-size: 13px;
  }

  .finals-list__row--pause {
    grid-template-columns: 36px 1fr auto;
    border-style: dashed;
    border-width: 1px;
    border-color: var(--color-border);
    background: transparent;
  }

  .finals-list__badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
  }

  .finals-list__dance {
    font-weight: 600;
    color: var(--dance-color, var(--color-text-secondary));
  }

  .finals-list__title {
    color: var(--color-text-primary);
    font-weight: 500;
  }

  .finals-list__empty {
    color: var(--color-warning);
    font-style: italic;
  }

  .finals-list__pause-label {
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .finals-list__meta {
    font-variant-numeric: tabular-nums;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
</style>
