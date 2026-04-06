<script lang="ts">
import { onDestroy, onMount, tick } from 'svelte'
import { get } from 'svelte/store'
import { resolveTrackReferenceBpm } from '@shared/track-bpm'
import { DANCE_CATEGORIES, DANCE_CATEGORIES_BY_ID } from '@shared/constants'
import type { FinalsPlaylistRow, Track } from '@shared/types'
import { audioEngine } from '../../services/audioEngine'
import { activeFinalsSession, finalsActions, finalsFlow } from '../../stores/finals.store'
import { libraryState } from '../../stores/library.store'
import { uiActions } from '../../stores/ui.store'
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

/** Drop stale :focus-visible on play buttons after the queue advances. */
function blurStaleFinalsPlaylistFocus() {
  const ae = document.activeElement
  if (!(ae instanceof HTMLElement)) return
  if (!ae.classList.contains('finals-pl__play-btn')) return
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

/** Real pointer on pause control — :hover on opacity-0 controls is unreliable (later rows / breaks). */
let finalsPlaylistPausePointerHover = false
let prevPlaylistRowForPauseHover: number | null = null
$: {
  const cur = currentPlaylistRowIndex
  if (cur !== prevPlaylistRowForPauseHover) {
    prevPlaylistRowForPauseHover = cur
    finalsPlaylistPausePointerHover = false
  }
}
$: if (!$isPlaying) finalsPlaylistPausePointerHover = false

function onFinalsPlayPausePointerEnter(rowPlaying: boolean) {
  if (rowPlaying) finalsPlaylistPausePointerHover = true
}

function onFinalsPlayPausePointerLeave() {
  finalsPlaylistPausePointerHover = false
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

function onFinalLabelInput(e: Event) {
  finalsActions.setLabelForActive(inputValue(e))
}

function openFinalsTrackMetadata(trackId: string, e: MouseEvent) {
  e.stopPropagation()
  uiActions.openModal('track-metadata', { trackId })
}

function bpmCell(tr: Track | undefined): string {
  if (!tr) return '—'
  const r = resolveTrackReferenceBpm(tr)
  return r ? String(r.bpm) : '—'
}

function listRowIsCurrent(playlistIndex: number): boolean {
  return currentPlaylistRowIndex === playlistIndex
}

/** Pause row title; between-finals uses the section heading for context, so the row label is “Break”. */
function finalsPauseRowTitle(row: FinalsPlaylistRow): string {
  if (row.kind !== 'pause') return ''
  if (row.label === 'Between finals') return 'Break'
  return row.label ?? 'Break'
}

/** 1-based dance slot # within the same final (tracks only; pauses are not numbered). */
function slotIndexWithinFinal(playlist: readonly FinalsPlaylistRow[], index: number): number {
  const row = playlist[index]
  if (!row || row.kind !== 'track') return 0
  const fi = row.finalIndex
  let n = 0
  for (let i = 0; i <= index; i++) {
    const r = playlist[i]
    if (r.finalIndex === fi && r.kind === 'track') n += 1
  }
  return n
}

type FinalsPlaylistEntry = { row: FinalsPlaylistRow; playlistIndex: number }

/** Contiguous playlist slices per simulated final (for bordered group UI). */
function playlistGroupedByFinal(playlist: readonly FinalsPlaylistRow[]): {
  finalIndex: number
  entries: FinalsPlaylistEntry[]
}[] {
  const groups: { finalIndex: number; entries: FinalsPlaylistEntry[] }[] = []
  for (let i = 0; i < playlist.length; i++) {
    const row = playlist[i]
    let g = groups[groups.length - 1]
    if (!g || g.finalIndex !== row.finalIndex) {
      g = { finalIndex: row.finalIndex, entries: [] }
      groups.push(g)
    }
    g.entries.push({ row, playlistIndex: i })
  }
  return groups
}

type FinalsPlaylistUiSegment =
  | { kind: 'final'; finalIndex: number; entries: FinalsPlaylistEntry[] }
  | { kind: 'between-finals'; entry: FinalsPlaylistEntry }

/** Splits trailing “Between finals” pauses into their own segment (separate bordered UI block). */
function playlistSegmentsForUi(playlist: readonly FinalsPlaylistRow[]): FinalsPlaylistUiSegment[] {
  const groups = playlistGroupedByFinal(playlist)
  const segments: FinalsPlaylistUiSegment[] = []
  for (const g of groups) {
    const entries = [...g.entries]
    const last = entries[entries.length - 1]
    if (last?.row.kind === 'pause' && last.row.label === 'Between finals') {
      entries.pop()
      segments.push({ kind: 'final', finalIndex: g.finalIndex, entries })
      segments.push({ kind: 'between-finals', entry: last })
    } else {
      segments.push({ kind: 'final', finalIndex: g.finalIndex, entries })
    }
  }
  return segments
}

function finalsSegmentKey(seg: FinalsPlaylistUiSegment): string {
  if (seg.kind === 'final') return `final-${seg.finalIndex}`
  return `between-${seg.entry.playlistIndex}`
}

/** Entire segment (final box or between-finals) is before the current queue position. */
function finalsSegmentIsPast(seg: FinalsPlaylistUiSegment, cur: number | null): boolean {
  if (cur == null) return false
  if (seg.kind === 'final') {
    if (seg.entries.length === 0) return false
    let max = -1
    for (const e of seg.entries) {
      if (e.playlistIndex > max) max = e.playlistIndex
    }
    return max < cur
  }
  return seg.entry.playlistIndex < cur
}

/** Row is before current item; skip if the whole segment is already dimmed as a unit. */
function finalsPlaylistRowLooksPast(
  playlistIndex: number,
  cur: number | null,
  seg: FinalsPlaylistUiSegment,
): boolean {
  if (cur == null || playlistIndex >= cur) return false
  if (finalsSegmentIsPast(seg, cur)) return false
  return true
}

/** Extra space before a new final block (after “Between finals” or when that row is omitted). */
function finalGapBeforePlaylistRow(playlist: readonly FinalsPlaylistRow[], index: number): boolean {
  if (index <= 0) return false
  const row = playlist[index]
  const prev = playlist[index - 1]
  if (row.kind === 'pause' && row.label === 'Between finals') return true
  if (row.finalIndex > prev.finalIndex) {
    if (prev.kind === 'pause' && prev.label === 'Between finals') return false
    return true
  }
  return false
}

async function onFinalsPlayClick(playlistIndex: number, e: MouseEvent) {
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
      <label class="finals-field finals-field--name">
        <span class="finals-field__label">Finals name</span>
        <input
          class="finals-input finals-input--name"
          type="text"
          maxlength="80"
          autocomplete="off"
          value={sess.label}
          aria-label="Finals name"
          on:input={onFinalLabelInput}
        />
      </label>
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
      <label class="finals-field finals-field--name">
        <span class="finals-field__label">Finals name</span>
        <input
          class="finals-input finals-input--name"
          type="text"
          maxlength="80"
          autocomplete="off"
          value={sess.label}
          aria-label="Finals name"
          on:input={onFinalLabelInput}
        />
      </label>
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
      <div class="finals-table-wrap" role="region" aria-label="Finals playlist">
        {#each playlistSegmentsForUi(sess.playlist) as seg (finalsSegmentKey(seg))}
          {#if seg.kind === 'final'}
          {@const segPast = finalsSegmentIsPast(seg, currentPlaylistRowIndex)}
          <section
            class="finals-pl__final-section"
            class:finals-pl__final-section--first={seg.finalIndex === 0}
            class:finals-pl__final-section--past={segPast}
            aria-labelledby="finals-pl-final-title-{sess.id}-{seg.finalIndex}"
          >
            <h2 class="finals-pl__final-heading" id="finals-pl-final-title-{sess.id}-{seg.finalIndex}">
              Final {seg.finalIndex + 1}
            </h2>
            <div
              class="finals-pl__final-block"
              role="grid"
              aria-label="Final {seg.finalIndex + 1} playlist"
            >
              <div class="finals-table finals-table--head" role="row">
                <div role="columnheader" class="finals-pl__col finals-pl__col--index">#</div>
                <div role="columnheader" class="finals-pl__col finals-pl__col--title-block">Title</div>
                <div class="finals-pl__meta-cols" role="presentation">
                  <div role="columnheader" class="finals-pl__col finals-pl__col--time" aria-label="Duration">
                    <svg
                      class="finals-pl__time-icon"
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.35" />
                      <path
                        d="M8 4.75V8h3.25"
                        stroke="currentColor"
                        stroke-width="1.35"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </div>
                  <div role="columnheader" class="finals-pl__col finals-pl__col--bpm">BPM</div>
                  <div
                    role="columnheader"
                    class="finals-pl__col finals-pl__col--popularity"
                    title="Likes minus dislikes"
                    aria-label="Popularity"
                  >
                    <svg
                      class="finals-pl__popularity-icon"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
                      />
                    </svg>
                  </div>
                  <div role="columnheader" class="finals-pl__col finals-pl__col--dance">Dance</div>
                </div>
              </div>
              {#each seg.entries as { row, playlistIndex } (playlistIndex)}
          {#if row.kind === 'track'}
            {@const tr = row.trackId
              ? $libraryState.tracks.find((t) => t.id === row.trackId)
              : undefined}
            {@const danceMeta = DANCE_CATEGORIES_BY_ID[row.danceId]}
            {@const popScore = tr
              ? ($libraryState.deferredListPopularityByTrackId[tr.id] ?? tr.popularityScore ?? 0)
              : 0}
            {@const rowPlaying = listRowIsCurrent(playlistIndex) && $isPlaying}
            {@const slotNum = slotIndexWithinFinal(sess.playlist, playlistIndex)}
            <div
              role="row"
              class="finals-table finals-table--row finals-table--track"
              class:finals-table--final-gap={finalGapBeforePlaylistRow(sess.playlist, playlistIndex)}
              class:finals-table--playing={listRowIsCurrent(playlistIndex)}
              class:finals-table--past={finalsPlaylistRowLooksPast(
                playlistIndex,
                currentPlaylistRowIndex,
                seg,
              )}
              on:dblclick={() => onListRowDblClick(playlistIndex)}
            >
              <div class="finals-pl__index" role="gridcell">
                <div class="finals-pl__index-main">
                  {#if !rowPlaying}
                    <span class="finals-pl__num">{slotNum}</span>
                  {/if}
                  <button
                    type="button"
                    class="finals-pl__play-btn"
                    class:finals-pl__play-btn--playing={rowPlaying}
                    class:finals-pl__play-btn--pause-reveal={rowPlaying &&
                      finalsPlaylistPausePointerHover}
                    title={rowPlaying ? 'Pause' : 'Play from here'}
                    aria-label={rowPlaying ? 'Pause' : 'Play from here'}
                    on:mouseenter={() => onFinalsPlayPausePointerEnter(rowPlaying)}
                    on:mouseleave={onFinalsPlayPausePointerLeave}
                    on:click={(e) => onFinalsPlayClick(playlistIndex, e)}
                  >
                    {#if rowPlaying}
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                        <rect x="1" y="1" width="3.5" height="10" rx="1" />
                        <rect x="7.5" y="1" width="3.5" height="10" rx="1" />
                      </svg>
                    {:else}
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                        <path d="M2 1.5L10.5 6L2 10.5V1.5Z" />
                      </svg>
                    {/if}
                  </button>
                  {#if rowPlaying}
                    <div class="finals-pl__equalizer" aria-hidden="true">
                      <span class="finals-pl__eq-bar finals-pl__eq-bar--a"></span>
                      <span class="finals-pl__eq-bar finals-pl__eq-bar--b"></span>
                      <span class="finals-pl__eq-bar finals-pl__eq-bar--c"></span>
                      <span class="finals-pl__eq-bar finals-pl__eq-bar--d"></span>
                    </div>
                  {/if}
                </div>
              </div>
              {#if tr}
                <div class="finals-pl__title-group" role="gridcell">
                  <div class="finals-track-cell">
                    <button
                      type="button"
                      class="finals-track-cell__art"
                      title="Edit artwork and track details"
                      aria-label="Edit artwork and details for {tr.title}"
                      on:click={(e) => openFinalsTrackMetadata(tr.id, e)}
                    >
                      {#if tr.artworkUrl}
                        <img
                          src={tr.artworkUrl}
                          alt=""
                          width="40"
                          height="40"
                          loading="lazy"
                          decoding="async"
                        />
                      {:else}
                        <div class="finals-track-cell__art-ph" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M9 18V5l12-2v13"
                              stroke="currentColor"
                              stroke-width="1.5"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                            <circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.5" />
                            <circle cx="18" cy="16" r="3" stroke="currentColor" stroke-width="1.5" />
                          </svg>
                        </div>
                      {/if}
                    </button>
                    <div class="finals-track-cell__info">
                      <span
                        class="finals-track-cell__title truncate"
                        class:finals-track-cell__title--playing={listRowIsCurrent(playlistIndex)}
                        title={tr.title}
                      >
                        {tr.title}
                      </span>
                      <span class="finals-track-cell__artist truncate" title={tr.artist || undefined}>
                        {tr.artist || '—'}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="finals-pl__meta" role="gridcell">
                  <div class="finals-pl__duration">
                    {formatDurationClock(row.playDurationSec)}
                  </div>
                  <div class="finals-pl__bpm">{bpmCell(tr)}</div>
                  <div
                    class="finals-pl__popularity"
                    class:finals-pl__popularity--up={popScore > 0}
                    class:finals-pl__popularity--down={popScore < 0}
                    class:finals-pl__popularity--zero={popScore === 0}
                    title="Popularity: likes minus dislikes"
                  >
                    {#if popScore > 0}
                      <span class="finals-pl__popularity-num">{popScore}</span>
                      <svg
                        class="finals-pl__popularity-thumb"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
                        />
                      </svg>
                    {:else if popScore < 0}
                      <span class="finals-pl__popularity-num">{Math.abs(popScore)}</span>
                      <svg
                        class="finals-pl__popularity-thumb"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"
                        />
                      </svg>
                    {:else}
                      <span class="finals-pl__popularity-num finals-pl__popularity-num--zero">0</span>
                      <svg
                        class="finals-pl__popularity-thumb finals-pl__popularity-thumb--neutral"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
                        />
                      </svg>
                    {/if}
                  </div>
                  <div class="finals-pl__dance-wrap">
                    <span
                      class="finals-pl__dance-badge truncate"
                      style={danceMeta ? `--dance-color: ${danceMeta.color}` : undefined}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        class="finals-pl__dance-ico"
                        aria-hidden="true"
                      >
                        <path
                          d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"
                          stroke="currentColor"
                          stroke-width="1.75"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                        <circle cx="7" cy="7" r="1.25" fill="currentColor" />
                      </svg>
                      <span class="finals-pl__dance-name truncate">{danceMeta?.name ?? '—'}</span>
                    </span>
                  </div>
                </div>
              {:else}
                <div class="finals-pl__title-group" role="gridcell">
                  <div class="finals-track-cell">
                    <div class="finals-track-cell__art finals-track-cell__art--readonly" aria-hidden="true">
                      <div class="finals-track-cell__art-ph">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M9 18V5l12-2v13"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                          <circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.5" />
                          <circle cx="18" cy="16" r="3" stroke="currentColor" stroke-width="1.5" />
                        </svg>
                      </div>
                    </div>
                    <div class="finals-track-cell__info">
                      <span class="finals-track-cell__title finals-table__cell--empty truncate">
                        {row.emptyReason ?? 'No matching track'}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="finals-pl__meta" role="gridcell">
                  <div class="finals-pl__duration">—</div>
                  <div class="finals-pl__bpm">—</div>
                  <div class="finals-pl__popularity finals-pl__popularity--zero">—</div>
                  <div class="finals-pl__dance-wrap">
                    <span
                      class="finals-pl__dance-badge truncate"
                      style={danceMeta ? `--dance-color: ${danceMeta.color}` : undefined}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        class="finals-pl__dance-ico"
                        aria-hidden="true"
                      >
                        <path
                          d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"
                          stroke="currentColor"
                          stroke-width="1.75"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                        <circle cx="7" cy="7" r="1.25" fill="currentColor" />
                      </svg>
                      <span class="finals-pl__dance-name truncate">{danceMeta?.name ?? '—'}</span>
                    </span>
                  </div>
                </div>
              {/if}
            </div>
          {:else}
            {@const rowPlaying = listRowIsCurrent(playlistIndex) && $isPlaying}
            <div
              role="row"
              class="finals-table finals-table--row finals-table--pause"
              class:finals-table--final-gap={finalGapBeforePlaylistRow(sess.playlist, playlistIndex)}
              class:finals-table--playing={listRowIsCurrent(playlistIndex)}
              class:finals-table--past={finalsPlaylistRowLooksPast(
                playlistIndex,
                currentPlaylistRowIndex,
                seg,
              )}
              on:dblclick={() => onListRowDblClick(playlistIndex)}
            >
              <div class="finals-pl__index" role="gridcell">
                <div class="finals-pl__index-main">
                  <button
                    type="button"
                    class="finals-pl__play-btn"
                    class:finals-pl__play-btn--playing={rowPlaying}
                    class:finals-pl__play-btn--pause-reveal={rowPlaying &&
                      finalsPlaylistPausePointerHover}
                    title={rowPlaying ? 'Pause' : 'Play from here'}
                    aria-label={rowPlaying ? 'Pause' : 'Play from here'}
                    on:mouseenter={() => onFinalsPlayPausePointerEnter(rowPlaying)}
                    on:mouseleave={onFinalsPlayPausePointerLeave}
                    on:click={(e) => onFinalsPlayClick(playlistIndex, e)}
                  >
                    {#if rowPlaying}
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                        <rect x="1" y="1" width="3.5" height="10" rx="1" />
                        <rect x="7.5" y="1" width="3.5" height="10" rx="1" />
                      </svg>
                    {:else}
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                        <path d="M2 1.5L10.5 6L2 10.5V1.5Z" />
                      </svg>
                    {/if}
                  </button>
                  {#if rowPlaying}
                    <div class="finals-pl__break-indicator" aria-hidden="true">
                      <svg class="finals-pl__break-indicator__svg" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M7.2 6.15L12 10.55l4.8-4.4H7.2z"
                          fill="currentColor"
                          opacity="0.2"
                        />
                        <path
                          d="M7.2 17.85h9.6L12 13.45l-4.8 4.4z"
                          fill="currentColor"
                          opacity="0.14"
                        />
                        <path
                          d="M5.75 5.5h12.5M5.75 5.5L12 12l6.25-6.5M5.75 18.5h12.5M5.75 18.5L12 12l6.25 6.5"
                          stroke="currentColor"
                          stroke-width="1.35"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                        <circle cx="12" cy="12" r="1.2" fill="currentColor" opacity="0.35" />
                      </svg>
                    </div>
                  {/if}
                </div>
              </div>
              <div class="finals-pl__title-group" role="gridcell">
                <div class="finals-track-cell finals-track-cell--pause">
                  <div class="finals-track-cell__art finals-track-cell__art--pause" aria-hidden="true">
                    <svg
                      class="finals-track-cell__hourglass"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M7.2 6.15L12 10.55l4.8-4.4H7.2z"
                        fill="currentColor"
                        opacity="0.13"
                      />
                      <path
                        d="M7.2 17.85h9.6L12 13.45l-4.8 4.4z"
                        fill="currentColor"
                        opacity="0.09"
                      />
                      <path
                        d="M5.75 5.5h12.5M5.75 5.5L12 12l6.25-6.5M5.75 18.5h12.5M5.75 18.5L12 12l6.25 6.5"
                        stroke="currentColor"
                        stroke-width="1.35"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                      <circle cx="12" cy="12" r="1.2" fill="currentColor" opacity="0.32" />
                    </svg>
                  </div>
                  <div class="finals-track-cell__info">
                    <span
                      class="finals-track-cell__title"
                      class:finals-track-cell__title--playing={listRowIsCurrent(playlistIndex)}
                    >
                      {finalsPauseRowTitle(row)}
                    </span>
                    <span class="finals-track-cell__artist">Time block</span>
                  </div>
                </div>
              </div>
              <div class="finals-pl__meta" role="gridcell">
                <div class="finals-pl__duration">{formatDurationClock(row.seconds)}</div>
                <div class="finals-pl__bpm" aria-hidden="true"></div>
                <div class="finals-pl__popularity" aria-hidden="true"></div>
                <div class="finals-pl__dance-wrap">
                  <span class="finals-pl__dance-badge finals-pl__dance-badge--time-block">
                    <svg
                      class="finals-pl__dance-clock"
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.35" />
                      <path
                        d="M8 4.75V8h3.25"
                        stroke="currentColor"
                        stroke-width="1.35"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                    <span class="finals-pl__dance-name">Time block</span>
                  </span>
                </div>
              </div>
            </div>
          {/if}
            {/each}
            </div>
          </section>
          {:else}
          {@const segPastBetween = finalsSegmentIsPast(seg, currentPlaylistRowIndex)}
          <section
            class="finals-pl__final-section finals-pl__between-finals-section"
            class:finals-pl__final-section--past={segPastBetween}
            aria-labelledby="finals-pl-between-title-{sess.id}-{seg.entry.playlistIndex}"
          >
            <h2
              class="finals-pl__final-heading"
              id="finals-pl-between-title-{sess.id}-{seg.entry.playlistIndex}"
            >
              Between finals
            </h2>
            <div
              class="finals-pl__final-block"
              role="grid"
              aria-label="Between finals time block"
            >
              <div class="finals-table finals-table--head" role="row">
                <div role="columnheader" class="finals-pl__col finals-pl__col--index">#</div>
                <div role="columnheader" class="finals-pl__col finals-pl__col--title-block">Title</div>
                <div class="finals-pl__meta-cols" role="presentation">
                  <div role="columnheader" class="finals-pl__col finals-pl__col--time" aria-label="Duration">
                    <svg
                      class="finals-pl__time-icon"
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.35" />
                      <path
                        d="M8 4.75V8h3.25"
                        stroke="currentColor"
                        stroke-width="1.35"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </div>
                  <div role="columnheader" class="finals-pl__col finals-pl__col--bpm">BPM</div>
                  <div
                    role="columnheader"
                    class="finals-pl__col finals-pl__col--popularity"
                    title="Likes minus dislikes"
                    aria-label="Popularity"
                  >
                    <svg
                      class="finals-pl__popularity-icon"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
                      />
                    </svg>
                  </div>
                  <div role="columnheader" class="finals-pl__col finals-pl__col--dance">Dance</div>
                </div>
              </div>
              {#each [seg.entry] as { row, playlistIndex } (playlistIndex)}
                {#if row.kind === 'pause'}
                {@const rowPlaying = listRowIsCurrent(playlistIndex) && $isPlaying}
                <div
                  role="row"
                  class="finals-table finals-table--row finals-table--pause"
                  class:finals-table--playing={listRowIsCurrent(playlistIndex)}
                  class:finals-table--past={finalsPlaylistRowLooksPast(
                    playlistIndex,
                    currentPlaylistRowIndex,
                    seg,
                  )}
                  on:dblclick={() => onListRowDblClick(playlistIndex)}
                >
                  <div class="finals-pl__index" role="gridcell">
                    <div class="finals-pl__index-main">
                      <button
                        type="button"
                        class="finals-pl__play-btn"
                        class:finals-pl__play-btn--playing={rowPlaying}
                        class:finals-pl__play-btn--pause-reveal={rowPlaying &&
                          finalsPlaylistPausePointerHover}
                        title={rowPlaying ? 'Pause' : 'Play from here'}
                        aria-label={rowPlaying ? 'Pause' : 'Play from here'}
                        on:mouseenter={() => onFinalsPlayPausePointerEnter(rowPlaying)}
                        on:mouseleave={onFinalsPlayPausePointerLeave}
                        on:click={(e) => onFinalsPlayClick(playlistIndex, e)}
                      >
                        {#if rowPlaying}
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                            <rect x="1" y="1" width="3.5" height="10" rx="1" />
                            <rect x="7.5" y="1" width="3.5" height="10" rx="1" />
                          </svg>
                        {:else}
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                            <path d="M2 1.5L10.5 6L2 10.5V1.5Z" />
                          </svg>
                        {/if}
                      </button>
                      {#if rowPlaying}
                        <div class="finals-pl__break-indicator" aria-hidden="true">
                          <svg class="finals-pl__break-indicator__svg" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M7.2 6.15L12 10.55l4.8-4.4H7.2z"
                              fill="currentColor"
                              opacity="0.2"
                            />
                            <path
                              d="M7.2 17.85h9.6L12 13.45l-4.8 4.4z"
                              fill="currentColor"
                              opacity="0.14"
                            />
                            <path
                              d="M5.75 5.5h12.5M5.75 5.5L12 12l6.25-6.5M5.75 18.5h12.5M5.75 18.5L12 12l6.25 6.5"
                              stroke="currentColor"
                              stroke-width="1.35"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                            <circle cx="12" cy="12" r="1.2" fill="currentColor" opacity="0.35" />
                          </svg>
                        </div>
                      {/if}
                    </div>
                  </div>
                  <div class="finals-pl__title-group" role="gridcell">
                    <div class="finals-track-cell finals-track-cell--pause">
                      <div class="finals-track-cell__art finals-track-cell__art--pause" aria-hidden="true">
                        <svg
                          class="finals-track-cell__hourglass"
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M7.2 6.15L12 10.55l4.8-4.4H7.2z"
                            fill="currentColor"
                            opacity="0.13"
                          />
                          <path
                            d="M7.2 17.85h9.6L12 13.45l-4.8 4.4z"
                            fill="currentColor"
                            opacity="0.09"
                          />
                          <path
                            d="M5.75 5.5h12.5M5.75 5.5L12 12l6.25-6.5M5.75 18.5h12.5M5.75 18.5L12 12l6.25 6.5"
                            stroke="currentColor"
                            stroke-width="1.35"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                          <circle cx="12" cy="12" r="1.2" fill="currentColor" opacity="0.32" />
                        </svg>
                      </div>
                      <div class="finals-track-cell__info">
                        <span
                          class="finals-track-cell__title"
                          class:finals-track-cell__title--playing={listRowIsCurrent(playlistIndex)}
                        >
                          {finalsPauseRowTitle(row)}
                        </span>
                        <span class="finals-track-cell__artist">Time block</span>
                      </div>
                    </div>
                  </div>
                  <div class="finals-pl__meta" role="gridcell">
                    <div class="finals-pl__duration">{formatDurationClock(row.seconds)}</div>
                    <div class="finals-pl__bpm" aria-hidden="true"></div>
                    <div class="finals-pl__popularity" aria-hidden="true"></div>
                    <div class="finals-pl__dance-wrap">
                      <span class="finals-pl__dance-badge finals-pl__dance-badge--time-block">
                        <svg
                          class="finals-pl__dance-clock"
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden="true"
                        >
                          <circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.35" />
                          <path
                            d="M8 4.75V8h3.25"
                            stroke="currentColor"
                            stroke-width="1.35"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </svg>
                        <span class="finals-pl__dance-name">Time block</span>
                      </span>
                    </div>
                  </div>
                </div>
                {/if}
              {/each}
            </div>
          </section>
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
    /* ~3× --duration-slow (350ms): past section / row grey-in and fade-back */
    --finals-past-fade-duration: 1050ms;
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

  .finals-field--name {
    max-width: min(100%, 22rem);
  }

  .finals-input--name {
    max-width: none;
    width: 100%;
    box-sizing: border-box;
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
    gap: var(--space-2);
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
    padding-inline: var(--space-4);
    scrollbar-gutter: stable;
  }

  .finals-pl__final-section {
    flex-shrink: 0;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
    min-width: 0;
  }

  .finals-pl__final-section:last-child {
    margin-bottom: 0;
  }

  .finals-pl__final-section--first {
    padding-top: var(--space-2);
  }

  .finals-pl__final-heading {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    text-align: left;
    opacity: 1;
    transition:
      opacity var(--finals-past-fade-duration) var(--ease-out),
      color var(--finals-past-fade-duration) var(--ease-out);
  }

  .finals-pl__final-section--past .finals-pl__final-heading {
    opacity: 0.62;
    color: color-mix(in srgb, var(--color-text-muted) 78%, var(--color-text-primary) 22%);
  }

  .finals-pl__final-block {
    flex-shrink: 0;
    align-self: stretch;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    padding: 0 var(--space-2) var(--space-2);
    box-sizing: border-box;
    min-width: 0;
    opacity: 1;
    transition: opacity var(--finals-past-fade-duration) var(--ease-out);
  }

  .finals-pl__final-section--past .finals-pl__final-block {
    opacity: 0.56;
  }

  /* Match library track list: # | title (1fr) | meta strip (time · BPM · pop · dance) */
  .finals-table {
    display: grid;
    grid-template-columns: 36px minmax(280px, 1fr) max-content;
    column-gap: var(--space-4);
    align-items: center;
    width: 100%;
    min-width: 0;
    padding: var(--space-2) 0;
    font-size: 13px;
    border-radius: var(--radius-track-row);
    box-sizing: border-box;
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
    color: var(--color-tracklist-column-label);
    padding-top: var(--space-2);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .finals-table--row {
    cursor: pointer;
    opacity: 1;
    transition:
      background var(--duration-fast) var(--ease-out),
      opacity var(--finals-past-fade-duration) var(--ease-out);
  }

  .finals-table--row.finals-table--past {
    opacity: 0.55;
  }

  .finals-table--row.finals-table--past:hover {
    opacity: 0.72;
  }

  @media (prefers-reduced-motion: reduce) {
    .finals-panel__body--list {
      --finals-past-fade-duration: 0.01ms;
    }

    .finals-table--row {
      transition:
        background var(--duration-fast) var(--ease-out),
        opacity var(--finals-past-fade-duration) var(--ease-out);
    }
  }

  .finals-table--final-gap {
    margin-top: var(--space-4);
  }

  /* “Between finals” pause — only pause row that uses --final-gap; give it room below too */
  .finals-table--final-gap.finals-table--pause {
    margin-top: var(--space-8);
    margin-bottom: var(--space-8);
  }

  .finals-table--row:hover {
    background: var(--color-track-row-hover);
  }

  .finals-table--pause {
    background: transparent;
  }

  .finals-table--pause:hover {
    background: var(--color-track-row-hover);
  }

  .finals-pl__col--index {
    text-align: center;
  }

  .finals-pl__col--title-block {
    min-width: 0;
  }

  .finals-pl__meta-cols {
    display: grid;
    column-gap: var(--space-3);
    align-items: center;
    grid-template-columns: 52px 76px 72px var(--tracklist-meta-dance-col);
    min-width: 0;
    justify-items: start;
    width: max-content;
    max-width: 100%;
    justify-self: end;
  }

  .finals-pl__col--time {
    justify-self: stretch;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-tracklist-column-label);
  }

  .finals-pl__col--bpm {
    text-align: left;
    padding-inline-start: var(--space-3);
    box-sizing: border-box;
  }

  .finals-pl__col--popularity {
    justify-self: stretch;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-transform: none;
    letter-spacing: 0.02em;
    color: var(--color-tracklist-column-label);
    margin-inline-start: calc(-1 * var(--space-1));
  }

  .finals-pl__col--dance {
    text-align: left;
    text-transform: none;
    letter-spacing: 0.02em;
  }

  .finals-pl__time-icon {
    flex-shrink: 0;
    color: var(--color-tracklist-column-label);
  }

  .finals-pl__popularity-icon {
    flex-shrink: 0;
    opacity: 0.9;
  }

  .finals-pl__index {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    min-width: 0;
  }

  .finals-pl__index-main {
    position: relative;
    width: 100%;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .finals-pl__num {
    font-size: 13px;
    color: var(--color-tracklist-column-label);
    font-variant-numeric: tabular-nums;
  }

  .finals-pl__equalizer {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 2px;
    padding-bottom: 8px;
    pointer-events: none;
    opacity: 1;
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  .finals-pl__play-btn--playing:is(.finals-pl__play-btn--pause-reveal, :focus-visible) ~ .finals-pl__equalizer,
  .finals-pl__play-btn--playing:is(.finals-pl__play-btn--pause-reveal, :focus-visible) ~ .finals-pl__break-indicator {
    opacity: 0;
  }

  .finals-pl__break-indicator {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    opacity: 1;
    transition: opacity var(--duration-fast) var(--ease-out);
    color: var(--color-accent);
  }

  .finals-pl__break-indicator__svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    animation: finals-pl-break-hourglass-spin 2.5s linear infinite;
    transform-origin: center;
  }

  @keyframes finals-pl-break-hourglass-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .finals-pl__eq-bar {
    width: 3px;
    height: 11px;
    border-radius: 1px;
    background: var(--color-accent);
    transform: scaleY(0.32);
    transform-origin: bottom center;
    animation: finals-pl-eq 0.55s ease-in-out infinite;
  }

  .finals-pl__eq-bar--a {
    animation-duration: 0.5s;
    animation-delay: 0s;
  }

  .finals-pl__eq-bar--b {
    animation-duration: 0.7s;
    animation-delay: 0.12s;
  }

  .finals-pl__eq-bar--c {
    animation-duration: 0.58s;
    animation-delay: 0.2s;
  }

  .finals-pl__eq-bar--d {
    animation-duration: 0.66s;
    animation-delay: 0.06s;
  }

  @keyframes finals-pl-eq {
    0%,
    100% {
      transform: scaleY(0.28);
    }
    50% {
      transform: scaleY(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .finals-pl__eq-bar {
      animation: none;
      transform: scaleY(0.65);
    }

    .finals-pl__break-indicator__svg {
      animation: none;
    }
  }

  .finals-pl__play-btn {
    position: absolute;
    inset: 0;
    z-index: 2;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text-primary);
    cursor: pointer;
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-out);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .finals-table--row:hover .finals-pl__play-btn:not(.finals-pl__play-btn--playing) {
    opacity: 1;
  }

  .finals-pl__play-btn--playing {
    inset: auto;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 28px;
    height: 28px;
  }

  .finals-pl__play-btn--playing:is(.finals-pl__play-btn--pause-reveal, :focus-visible) {
    opacity: 1;
  }

  .finals-table--row.finals-table--playing:hover
    .finals-pl__play-btn--playing:not(:focus-visible):not(.finals-pl__play-btn--pause-reveal) {
    opacity: 0;
  }

  .finals-table--row:hover .finals-pl__index-main .finals-pl__num {
    opacity: 0;
  }

  .finals-pl__title-group {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    margin-inline-end: var(--space-3);
  }

  .finals-pl__meta {
    display: grid;
    column-gap: var(--space-3);
    align-items: center;
    grid-template-columns: 52px 76px 72px var(--tracklist-meta-dance-col);
    min-width: 0;
    justify-items: start;
    width: max-content;
    max-width: 100%;
    justify-self: end;
  }

  .finals-pl__duration {
    justify-self: stretch;
    width: 100%;
    font-size: 12px;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
    text-align: center;
    min-width: 0;
  }

  .finals-table--row:hover .finals-pl__duration {
    color: var(--color-track-row-numeric);
  }

  .finals-pl__bpm {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-primary);
    padding-inline-start: var(--space-3);
    box-sizing: border-box;
    margin: 0;
  }

  .finals-table--row:hover .finals-pl__bpm {
    color: var(--color-track-row-numeric);
  }

  .finals-pl__popularity {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: 0;
    width: 100%;
    font-size: 12px;
    font-weight: 600;
    margin-inline-start: calc(-1 * var(--space-1));
  }

  .finals-pl__popularity-num {
    font-variant-numeric: tabular-nums;
  }

  .finals-pl__popularity--up {
    color: #4ade80;
  }

  .finals-pl__popularity--up .finals-pl__popularity-thumb {
    color: #4ade80;
  }

  .finals-pl__popularity--down {
    color: #f87171;
  }

  .finals-pl__popularity--down .finals-pl__popularity-thumb {
    color: #f87171;
  }

  .finals-pl__popularity--zero {
    color: rgba(255, 255, 255, 0.5);
  }

  .finals-pl__popularity-num--zero {
    color: rgba(255, 255, 255, 0.55);
  }

  .finals-pl__popularity-thumb--neutral {
    color: rgba(255, 255, 255, 0.4);
  }

  .finals-table--row:hover .finals-pl__popularity--zero {
    color: rgba(255, 255, 255, 0.65);
  }

  .finals-pl__dance-wrap {
    justify-self: stretch;
    width: 100%;
    min-width: 0;
  }

  .finals-pl__dance-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    min-width: 0;
    padding: 4px 10px;
    border-radius: var(--radius-full);
    border: 1px solid color-mix(in srgb, var(--dance-color, var(--color-border)) 55%, transparent);
    background: color-mix(in srgb, var(--dance-color, var(--color-text-muted)) 14%, transparent);
    color: var(--color-text-primary);
    font-size: 12px;
    font-weight: 600;
  }

  .finals-pl__dance-badge--muted {
    justify-content: center;
    border-color: var(--color-border);
    background: transparent;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .finals-pl__dance-badge--time-block {
    justify-content: flex-start;
    border-color: var(--color-border);
    background: transparent;
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .finals-pl__dance-clock {
    flex-shrink: 0;
    color: var(--color-text-muted);
  }

  .finals-pl__dance-ico {
    flex-shrink: 0;
    color: color-mix(in srgb, var(--dance-color, currentColor) 85%, white);
  }

  .finals-pl__dance-name {
    min-width: 0;
  }

  .finals-table__cell--empty {
    color: var(--color-warning);
    font-style: italic;
  }

  .finals-track-cell {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .finals-track-cell__art {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    padding: 0;
    border: none;
    border-radius: var(--radius-art);
    overflow: hidden;
    background: var(--color-bg-overlay);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    cursor: pointer;
    font: inherit;
    color: inherit;
    display: block;
    transition:
      box-shadow var(--duration-fast) var(--ease-out),
      filter var(--duration-fast) var(--ease-out);
  }

  .finals-track-cell__art:hover {
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.06),
      0 0 0 2px var(--color-accent);
    filter: brightness(1.08);
  }

  .finals-track-cell__art:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .finals-track-cell__art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .finals-track-cell__art-ph {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
  }

  .finals-track-cell__art--readonly {
    cursor: default;
    pointer-events: none;
  }

  .finals-track-cell__art--readonly:hover {
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    filter: none;
  }

  .finals-track-cell__art--pause {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    padding: 0;
    border: none;
    border-radius: var(--radius-art);
    overflow: hidden;
    background: var(--color-bg-overlay);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    color: color-mix(in srgb, var(--color-text-muted) 72%, var(--color-accent) 28%);
    cursor: default;
    pointer-events: none;
  }

  .finals-track-cell__art--pause:hover {
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    filter: none;
  }

  .finals-track-cell__hourglass {
    flex-shrink: 0;
    display: block;
  }

  .finals-track-cell__info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .finals-track-cell__title {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .finals-track-cell__title--playing {
    color: var(--color-accent);
  }

  .finals-track-cell__artist {
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  .finals-track-cell--pause .finals-track-cell__title {
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .finals-track-cell--pause .finals-track-cell__artist {
    color: var(--color-text-secondary);
  }

  /* Library list parity: current row title uses accent (must follow pause title rule) */
  .finals-table--playing.finals-table--row .finals-track-cell__title:not(.finals-table__cell--empty) {
    color: var(--color-accent);
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
</style>
