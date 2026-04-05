<script lang="ts">
import { onMount } from 'svelte'
import { get } from 'svelte/store'
import {
  filteredTracks,
  selectedDanceId,
  isScanning,
  libraryActions,
  selectedTrackIds,
} from '../../stores/library.store'
import { DANCE_CATEGORIES_BY_ID } from '@shared/constants'
import TrackItem from './TrackItem.svelte'
import { activeModal } from '../../stores/ui.store'
import { pathsFromFileDrop } from '../../utils/dropPaths'

onMount(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (get(activeModal) != null) return
      libraryActions.clearTrackSelection()
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (get(activeModal) != null) return
      const t = (e.target as HTMLElement)?.tagName
      if (t === 'INPUT' || t === 'TEXTAREA') return
      if (get(selectedTrackIds).length === 0) return
      e.preventDefault()
      void libraryActions.applyDeleteToSelection()
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
})

$: selectedDance = $selectedDanceId ? DANCE_CATEGORIES_BY_ID[$selectedDanceId] : null
$: headingText = selectedDance ? selectedDance.name : 'All Tracks'
$: bpmLabel = selectedDance ? `${selectedDance.bpmRange[0]}–${selectedDance.bpmRange[1]} BPM` : ''

function addDirectory() {
  void libraryActions.pickAddMusicFolder()
}

let dragDepth = 0
let dragOver = false

function onDragEnter(e: DragEvent) {
  e.preventDefault()
  dragDepth++
  if (e.dataTransfer?.types?.includes('Files')) dragOver = true
}

function onDragLeave(e: DragEvent) {
  e.preventDefault()
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragOver = false
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragDepth = 0
  dragOver = false
  const paths = pathsFromFileDrop(e.dataTransfer)
  if (paths.length) void libraryActions.addMusicFoldersFromDroppedPaths(paths)
}

/** Clicks on chrome/empty space (not on a track row or button) clear multi-select. */
function onTrackListBackgroundClick(e: MouseEvent) {
  const el = e.target as HTMLElement
  if (el.closest('.track-item')) return
  if (el.closest('button')) return
  if (el.closest('input') || el.closest('textarea')) return
  libraryActions.clearTrackSelection()
}
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
  class="track-list"
  class:track-list--drag={dragOver}
  role="presentation"
  on:click={onTrackListBackgroundClick}
  on:dragenter={onDragEnter}
  on:dragleave={onDragLeave}
  on:dragover={onDragOver}
  on:drop={onDrop}
>
  <!-- Header -->
  <header class="track-list__header">
    <div class="track-list__title-row">
      {#if selectedDance}
        <span
          class="track-list__dance-dot"
          style="background: {selectedDance.color}"
        ></span>
      {/if}
      <h1 class="track-list__title">{headingText}</h1>
      {#if bpmLabel}
        <span class="track-list__bpm-badge">{bpmLabel}</span>
      {/if}
    </div>

    <div class="track-list__meta">
      {$filteredTracks.length}
      {$filteredTracks.length === 1 ? 'track' : 'tracks'}
    </div>
  </header>

  <!-- Column labels -->
  {#if $filteredTracks.length > 0}
    <div class="track-list__cols" role="row" aria-label="Track list columns">
      <div class="track-list__lead">
        <div role="columnheader" class="track-list__col track-list__col--index">#</div>
        <div role="columnheader" class="track-list__col track-list__col--title-block">Title</div>
      </div>
      <div class="track-list__meta-cols">
        <div role="columnheader" class="track-list__col track-list__col--dance">Dance</div>
        <div role="columnheader" class="track-list__col track-list__col--bpm">BPM</div>
        <div
          role="columnheader"
          class="track-list__col track-list__col--time"
          aria-label="Duration"
        >
          <svg
            class="track-list__time-icon"
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
        <div role="columnheader" class="track-list__col track-list__col--actions" aria-hidden="true"></div>
      </div>
    </div>
  {/if}

  <!-- Track rows -->
  <div class="track-list__rows" role="grid" aria-label="Tracks">
    {#if $isScanning}
      <div class="track-list__empty">
        <div class="track-list__spinner"></div>
        <span>Scanning library…</span>
      </div>
    {:else if $filteredTracks.length === 0}
      <div class="track-list__empty">
        {#if $selectedDanceId}
          <p>No tracks assigned to this dance yet.</p>
          <p class="track-list__hint">
            From <strong>All Tracks</strong>: drag rows onto a dance in the sidebar, or use
            <strong>Ctrl/Cmd+click</strong> / <strong>Shift+click</strong> to select several, then drag
            onto a dance. You can also click the <strong>None</strong> badge or a dance tag on a row to
            set or change the dance. Use <strong>−</strong> on a row or <strong>Delete</strong> /
            <strong>Backspace</strong> on a selection to remove tracks from this dance only.
          </p>
        {:else}
          <p>Your library is empty.</p>
          <p class="track-list__hint">Drag a music folder here, or:</p>
          <button class="track-list__add-btn" on:click={addDirectory}>
            Add a music folder
          </button>
        {/if}
      </div>
    {:else}
      {#each $filteredTracks as track, i (track.id)}
        <TrackItem {track} index={i} queue={$filteredTracks} filterDanceId={$selectedDanceId} />
      {/each}
    {/if}
  </div>
</div>

<style>
  .track-list {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    overflow: hidden;
  }

  .track-list--drag {
    outline: 2px dashed var(--color-accent);
    outline-offset: -6px;
    border-radius: var(--radius-md);
    background: var(--color-accent-muted);
  }

  .track-list__header {
    padding: var(--space-5) var(--space-6) var(--space-4);
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .track-list__title-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-1);
  }

  .track-list__dance-dot {
    width: 12px;
    height: 12px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .track-list__title {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .track-list__bpm-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    background: var(--color-bg-elevated);
    color: var(--color-text-muted);
    align-self: center;
  }

  .track-list__meta {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  /*
   * Match track rows: flexible #+title | meta strip (see .track-item__meta in TrackItem.svelte).
   */
  .track-list__cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: var(--space-4);
    row-gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-tracklist-column-label);
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
    min-width: 0;
  }

  .track-list__lead {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    column-gap: var(--space-3);
    align-items: center;
    min-width: 0;
  }

  /*
   * Same grid cell as .track-item__title-group: label starts at album art’s left edge
   * (covers art + track name as one “Title” column).
   */
  .track-list__col--title-block {
    display: flex;
    align-items: center;
    min-width: 0;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-list__meta-cols {
    display: grid;
    column-gap: var(--space-3);
    align-items: center;
    grid-template-columns: minmax(72px, 152px) 76px 52px 32px;
    flex-shrink: 0;
    min-width: 0;
    justify-items: start;
  }

  .track-list__col {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .track-list__col--index {
    min-width: 36px;
    overflow: visible;
    text-align: center;
  }

  .track-list__col--dance {
    text-align: right;
  }

  .track-list__col--bpm {
    text-align: left;
  }

  .track-list__col--time {
    justify-self: stretch;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    text-transform: none;
    color: var(--color-tracklist-column-label);
  }

  .track-list__time-icon {
    display: block;
    flex-shrink: 0;
    color: var(--color-tracklist-column-label);
  }

  .track-list__col--actions {
    width: 32px;
    min-width: 32px;
    padding: 0;
  }

  .track-list__rows {
    flex: 1;
    min-width: 0;
    overflow-x: hidden;
    overflow-y: auto;
    /* Horizontal padding only on rows — matches .track-list__cols so cells line up */
    padding: var(--space-2) var(--space-4);
  }

  .track-list__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: var(--space-3);
    color: var(--color-text-muted);
    text-align: center;
    padding: var(--space-8);
  }

  .track-list__hint {
    font-size: 12px;
    opacity: 0.7;
  }

  .track-list__add-btn {
    padding: var(--space-2) var(--space-5);
    background: var(--color-accent);
    color: white;
    border-radius: var(--radius-full);
    font-size: 13px;
    font-weight: 600;
    transition: opacity var(--duration-fast);
    margin-top: var(--space-2);
  }

  .track-list__add-btn:hover {
    opacity: 0.85;
  }

  .track-list__spinner {
    width: 28px;
    height: 28px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
