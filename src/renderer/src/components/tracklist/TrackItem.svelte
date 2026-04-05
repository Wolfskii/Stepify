<script lang="ts">
import type { Track, DanceId } from '@shared/types'
import { DANCE_CATEGORIES_BY_ID } from '@shared/constants'
import { currentTrack, isPlaying, playerActions, playerState } from '../../stores/player.store'
import { audioEngine } from '../../services/audioEngine'
import { uiActions } from '../../stores/ui.store'
import { libraryActions, selectedTrackIds } from '../../stores/library.store'

const TRACK_DRAG_MIME = 'application/x-stepify-tracks'

export let track: Track
export let index: number
export let queue: Track[]
/** When set (dance filter view), meta shows BPM/time + a dance label control that opens Set dance (incl. None). */
export let filterDanceId: DanceId | null = null
/** When set (folder filter view), scope “now playing” row to that list */
export let filterFolderPath: string | null = null

$: isCurrent = $currentTrack?.id === track.id
/** “Now playing” row treatment only in the list where playback was started */
$: listContextMatches =
  (filterDanceId != null &&
    $playerState.playbackListDanceId === filterDanceId &&
    $playerState.playbackListFolderPath == null) ||
  (filterDanceId == null &&
    filterFolderPath != null &&
    $playerState.playbackListFolderPath != null &&
    normalizePathKey($playerState.playbackListFolderPath) === normalizePathKey(filterFolderPath) &&
    $playerState.playbackListDanceId == null) ||
  (filterDanceId == null &&
    filterFolderPath == null &&
    $playerState.playbackListDanceId == null &&
    $playerState.playbackListFolderPath == null)

function normalizePathKey(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase()
}
$: showAsPlayingRow = isCurrent && listContextMatches
$: isCurrentlyPlaying = showAsPlayingRow && $isPlaying
$: isRowSelected = $selectedTrackIds.includes(track.id)

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

async function play() {
  playerActions.setQueue(queue, index, filterDanceId, filterFolderPath)
  await audioEngine.load(track)
  // List play always starts from the beginning; load() may noop if already buffered.
  audioEngine.seek(0)
  playerActions.setCurrentTime(0)
  audioEngine.play()
  playerActions.play()
}

async function togglePlay() {
  // Same file as global current track, but another list (e.g. All Tracks vs Samba): play = restart from this queue
  if (!isCurrent || !listContextMatches) {
    await play()
    return
  }
  if ($isPlaying) {
    audioEngine.pause()
    playerActions.pause()
  } else {
    audioEngine.play()
    playerActions.play()
  }
}

function openAssignDance() {
  uiActions.openModal('assign-dance', { trackId: track.id })
}

function openEditBpm() {
  uiActions.openModal('edit-bpm', { trackId: track.id })
}

function openTrackMetadata() {
  uiActions.openModal('track-metadata', { trackId: track.id })
}

$: primaryDanceId = track.dances[0]
$: filterDanceMeta = filterDanceId ? DANCE_CATEGORIES_BY_ID[filterDanceId] : null
$: primaryDance = primaryDanceId ? DANCE_CATEGORIES_BY_ID[primaryDanceId] : null
$: popScore = track.popularityScore ?? 0

function onRowClick(e: MouseEvent) {
  const el = e.target as HTMLElement | null
  if (el?.closest('button')) return
  libraryActions.handleTrackRowClick(track.id, index, queue, e)
}

function onDragStart(e: DragEvent) {
  const dt = e.dataTransfer
  if (!dt) return
  const sel = $selectedTrackIds
  const ids = sel.length > 0 && sel.includes(track.id) ? sel : [track.id]
  dt.setData(TRACK_DRAG_MIME, JSON.stringify(ids))
  dt.effectAllowed = 'copy'
}
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div
  class="track-item"
  class:row-selected={isRowSelected}
  class:track-item--current={showAsPlayingRow}
  role="row"
  aria-selected={isRowSelected}
  aria-current={showAsPlayingRow ? 'true' : undefined}
  draggable="true"
  on:click={onRowClick}
  on:dblclick={play}
  tabindex="0"
  on:keydown={(e) => e.key === 'Enter' && play()}
  on:dragstart={onDragStart}
>
  <div class="track-item__lead" role="gridcell">
    <div class="track-item__index">
      <span class="track-item__num" class:hidden={isCurrentlyPlaying}>
        {index + 1}
      </span>
      {#if isCurrentlyPlaying}
        <div class="track-item__equalizer" aria-hidden="true">
          <span class="track-item__eq-bar track-item__eq-bar--a"></span>
          <span class="track-item__eq-bar track-item__eq-bar--b"></span>
          <span class="track-item__eq-bar track-item__eq-bar--c"></span>
          <span class="track-item__eq-bar track-item__eq-bar--d"></span>
        </div>
      {/if}
      <button
        type="button"
        class="track-item__play-btn"
        class:track-item__play-btn--playing={isCurrentlyPlaying}
        aria-label={isCurrentlyPlaying ? 'Pause' : 'Play'}
        on:click|stopPropagation={togglePlay}
      >
        {#if isCurrentlyPlaying}
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
    </div>

    <div class="track-item__title-group">
      <button
        type="button"
        class="track-item__art track-item__art--btn"
        title="Edit title, artist, or cover art"
        aria-label="Edit artwork and details for {track.title}"
        on:click|stopPropagation={openTrackMetadata}
      >
        {#if track.artworkUrl}
          <img
            src={track.artworkUrl}
            alt=""
            width="40"
            height="40"
            loading="lazy"
            decoding="async"
          />
        {:else}
          <div class="track-item__art-ph">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

      <div class="track-item__info">
        <span class="track-item__title truncate">{track.title}</span>
        <span class="track-item__artist truncate">{track.artist}</span>
      </div>
    </div>
  </div>

  <div
    class="track-item__meta"
    class:track-item__meta--no-dance={filterDanceId}
    role="gridcell"
  >
    {#if !filterDanceId}
      <div class="track-item__dances">
        {#if primaryDance}
          <button
            type="button"
            class="dance-tag dance-tag--btn"
            style="--dance-color: {primaryDance.color}"
            title="Change dance"
            aria-label="Change dance for {track.title}"
            on:click|stopPropagation={openAssignDance}
          >
            {primaryDance.name}
          </button>
        {:else}
          <button
            type="button"
            class="dance-tag dance-tag--btn dance-tag--none"
            title="Set dance"
            aria-label="No dance set — choose a dance for {track.title}"
            on:click|stopPropagation={openAssignDance}
          >
            None
          </button>
        {/if}
      </div>
    {/if}

    <div
      class="track-item__popularity"
      class:track-item__popularity--up={popScore > 0}
      class:track-item__popularity--down={popScore < 0}
      class:track-item__popularity--zero={popScore === 0}
      title="Popularity: likes minus dislikes"
    >
      {#if popScore > 0}
        <span class="track-item__popularity-num">{popScore}</span>
        <svg
          class="track-item__popularity-icon"
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
        <span class="track-item__popularity-num">{Math.abs(popScore)}</span>
        <svg
          class="track-item__popularity-icon"
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
        <span class="track-item__popularity-num track-item__popularity-num--zero">0</span>
        <svg
          class="track-item__popularity-icon track-item__popularity-icon--neutral"
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

    {#if track.bpm}
      <button
        type="button"
        class="track-item__bpm track-item__bpm--btn"
        title="Edit BPM"
        aria-label="Edit BPM for {track.title}"
        on:click|stopPropagation={openEditBpm}
      >
        <span>{track.bpm}</span>
        <span class="track-item__bpm-unit">BPM</span>
      </button>
    {:else}
      <button
        type="button"
        class="track-item__bpm track-item__bpm--empty track-item__bpm--btn"
        title="Set BPM"
        aria-label="Set BPM for {track.title}"
        on:click|stopPropagation={openEditBpm}
      >
        —
      </button>
    {/if}

    <div class="track-item__duration">
      {formatDuration(track.duration)}
    </div>

    {#if filterDanceId && filterDanceMeta}
      <div class="track-item__actions">
        <button
          type="button"
          class="track-item__dance-change-btn"
          style="--dance-color: {filterDanceMeta.color}"
          on:click|stopPropagation={openAssignDance}
          title="Change dance or set to none"
          aria-label="Change dance for {track.title}"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="track-item__dance-change-icon" aria-hidden="true">
            <path
              d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <circle cx="7" cy="7" r="1.25" fill="currentColor" />
          </svg>
          <span class="track-item__dance-change-label truncate">{filterDanceMeta.name}</span>
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  /*
   * Two-column row: flexible #+title (never overlapped) | fixed meta strip (dance, BPM, …).
   * Keep .track-item__meta grid in sync with .track-list__meta-cols (TrackList.svelte).
   */
  .track-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: var(--space-4);
    align-items: center;
    padding: var(--space-2) 0;
    border-radius: var(--radius-track-row);
    /* HTML5 draggable can show a grab cursor; keep default over the row */
    cursor: default;
    user-select: none;
    transition: background var(--duration-fast) var(--ease-out);
    min-width: 0;
  }

  .track-item[draggable='true'] {
    cursor: default;
  }

  .track-item__lead {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    column-gap: var(--space-3);
    align-items: center;
    min-width: 0;
  }

  .track-item__title-group {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .track-item__art {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: var(--radius-art);
    overflow: hidden;
    background: var(--color-bg-overlay);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }

  .track-item__art--btn {
    padding: 0;
    border: none;
    cursor: pointer;
    font: inherit;
    color: inherit;
    transition:
      box-shadow var(--duration-fast) var(--ease-out),
      filter var(--duration-fast) var(--ease-out);
  }

  .track-item__art--btn:hover {
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.06),
      0 0 0 2px var(--color-accent);
    filter: brightness(1.08);
  }

  .track-item__art--btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .track-item__art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .track-item__art-ph {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
  }

  .track-item__meta {
    display: grid;
    column-gap: var(--space-3);
    align-items: center;
    /* Dance · Pop. · BPM · time — actions column only in dance-filtered view */
    grid-template-columns: minmax(72px, 152px) 72px 76px 52px;
    flex-shrink: 0;
    min-width: 0;
    justify-items: start;
    cursor: default;
  }

  /* Single-dance list: Pop. · BPM · time · dance label + tag */
  .track-item__meta--no-dance {
    grid-template-columns: 72px 76px 52px minmax(108px, 172px);
  }

  .track-item__meta :is(button, .dance-tag--btn) {
    cursor: pointer;
  }

  .track-item:hover {
    background: var(--color-track-row-hover);
  }

  .track-item.row-selected {
    background: var(--color-track-row-selected);
  }

  .track-item.row-selected:hover {
    background: var(--color-track-row-highlight-hover);
  }

  .track-item:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }

  /* Index / play button */
  .track-item__index {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
  }

  .track-item__num {
    font-size: 13px;
    color: var(--color-tracklist-column-label);
    font-variant-numeric: tabular-nums;
  }

  .track-item__num.hidden {
    opacity: 0;
  }

  /* Spotify-style equalizer while this row is the playing track */
  .track-item__equalizer {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 2px;
    padding-bottom: 8px;
    pointer-events: none;
    opacity: 1;
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  .track-item__index:hover .track-item__equalizer {
    opacity: 0;
  }

  .track-item__eq-bar {
    width: 3px;
    height: 11px;
    border-radius: 1px;
    background: var(--color-accent);
    transform: scaleY(0.32);
    transform-origin: bottom center;
    animation: track-item-eq 0.55s ease-in-out infinite;
  }

  .track-item__eq-bar--a {
    animation-duration: 0.5s;
    animation-delay: 0s;
  }

  .track-item__eq-bar--b {
    animation-duration: 0.7s;
    animation-delay: 0.12s;
  }

  .track-item__eq-bar--c {
    animation-duration: 0.58s;
    animation-delay: 0.2s;
  }

  .track-item__eq-bar--d {
    animation-duration: 0.66s;
    animation-delay: 0.06s;
  }

  @keyframes track-item-eq {
    0%,
    100% {
      transform: scaleY(0.28);
    }
    50% {
      transform: scaleY(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .track-item__eq-bar {
      animation: none;
      transform: scaleY(0.65);
    }
  }

  .track-item__play-btn {
    position: absolute;
    inset: 0;
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  .track-item:hover .track-item__play-btn:not(.track-item__play-btn--playing) {
    opacity: 1;
  }

  .track-item__index:hover .track-item__play-btn--playing {
    opacity: 1;
  }

  .track-item:hover .track-item__num:not(.hidden) {
    opacity: 0;
  }

  /* Info */
  .track-item__info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .track-item__title {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .track-item__artist {
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  /* Now playing: accent title only — row background is not “selected” */
  .track-item--current .track-item__title {
    color: var(--color-accent);
  }

  .track-item:hover .track-item__duration,
  .track-item.row-selected .track-item__duration {
    color: var(--color-track-row-numeric);
  }

  .track-item:hover .track-item__bpm,
  .track-item.row-selected .track-item__bpm {
    color: var(--color-track-row-numeric);
  }

  .track-item:hover .track-item__bpm-unit,
  .track-item.row-selected .track-item__bpm-unit {
    color: var(--color-track-row-numeric);
  }

  .track-item:hover .track-item__bpm--empty,
  .track-item.row-selected .track-item__bpm--empty {
    color: var(--color-track-row-numeric);
  }

  .track-item__popularity {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: 0;
    width: 100%;
    font-size: 12px;
    font-weight: 600;
  }

  .track-item__popularity-num {
    font-variant-numeric: tabular-nums;
  }

  .track-item__popularity--up {
    color: #4ade80;
  }

  .track-item__popularity--up .track-item__popularity-icon {
    color: #4ade80;
  }

  .track-item__popularity--down {
    color: #f87171;
  }

  .track-item__popularity--down .track-item__popularity-icon {
    color: #f87171;
  }

  .track-item__popularity--zero {
    color: rgba(255, 255, 255, 0.5);
  }

  .track-item__popularity-num--zero {
    color: rgba(255, 255, 255, 0.55);
  }

  .track-item__popularity-icon--neutral {
    color: rgba(255, 255, 255, 0.4);
  }

  .track-item:hover .track-item__popularity--zero,
  .track-item.row-selected .track-item__popularity--zero {
    color: rgba(255, 255, 255, 0.65);
  }

  .track-item:hover .track-item__popularity-num--zero,
  .track-item.row-selected .track-item__popularity-num--zero {
    color: rgba(255, 255, 255, 0.7);
  }

  .track-item:hover .track-item__popularity-icon--neutral,
  .track-item.row-selected .track-item__popularity-icon--neutral {
    color: rgba(255, 255, 255, 0.55);
  }

  /* Dance tags — right side of meta strip, never bleed into title */
  .track-item__dances {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
    justify-content: flex-end;
    align-content: center;
    min-width: 0;
    overflow: hidden;
  }

  .dance-tag {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--dance-color) 15%, transparent);
    color: var(--dance-color);
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dance-tag--btn {
    font-family: inherit;
    border: none;
    cursor: pointer;
    text-align: center;
    transition:
      background var(--duration-fast) var(--ease-out),
      filter var(--duration-fast) var(--ease-out);
  }

  .dance-tag--btn:hover {
    filter: brightness(1.12);
  }

  .dance-tag--btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .dance-tag--none {
    --dance-color: #c8c8c8;
    background: rgba(255, 255, 255, 0.14);
    color: #e8e8e8;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  }

  .dance-tag--none:hover {
    background: rgba(255, 255, 255, 0.2);
    filter: none;
  }

  .dance-tag--more {
    --dance-color: var(--color-text-muted);
    background: var(--color-bg-overlay);
    color: var(--color-text-muted);
  }

  /* BPM */
  .track-item__bpm {
    display: flex;
    align-items: baseline;
    gap: 2px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-primary);
    justify-content: flex-start;
  }

  .track-item__bpm--empty {
    color: var(--color-text-muted);
  }

  .track-item__bpm-unit {
    font-size: 10px;
    color: var(--color-text-muted);
  }

  .track-item__bpm--btn {
    font-family: inherit;
    border: none;
    background: none;
    cursor: pointer;
    padding: 0;
    margin: 0;
  }

  .track-item__bpm--btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  /* Duration — centered under clock column header */
  .track-item__duration {
    justify-self: stretch;
    font-size: 12px;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
    text-align: center;
    min-width: 0;
    width: 100%;
  }

  /* Actions — narrow column, hug right edge of row */
  .track-item__dance-change-btn {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-width: 100%;
    min-width: 0;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-md);
    border: 1px solid color-mix(in srgb, var(--dance-color) 38%, var(--color-border-subtle));
    background: color-mix(in srgb, var(--dance-color) 12%, var(--color-bg-elevated));
    color: var(--color-text-secondary);
    font-size: 11px;
    font-weight: 600;
    text-align: left;
    transition:
      background var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .track-item__dance-change-btn:hover {
    background: color-mix(in srgb, var(--dance-color) 20%, var(--color-bg-overlay));
    color: var(--color-text-primary);
    border-color: color-mix(in srgb, var(--dance-color) 50%, var(--color-border));
  }

  .track-item__dance-change-icon {
    flex-shrink: 0;
    color: color-mix(in srgb, var(--dance-color) 85%, var(--color-text-muted));
  }

  .track-item__dance-change-label {
    min-width: 0;
  }

  .track-item__actions {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-width: 0;
    gap: 2px;
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  .track-item:hover .track-item__actions,
  .track-item.row-selected .track-item__actions {
    opacity: 1;
  }

  .track-item__action-btn {
    width: 26px;
    height: 26px;
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    transition: color var(--duration-fast), background var(--duration-fast);
  }

  .track-item__action-btn:hover {
    color: var(--color-text-primary);
    background: var(--color-bg-overlay);
  }
</style>
