<script lang="ts">
import type { DanceCategory, DanceId } from '@shared/types'
import { libraryActions, selectedDanceId } from '../../stores/library.store'
import { danceOrderActions, reorderMimeForStyle } from '../../stores/danceOrder.store'
import { playerState } from '../../stores/player.store'
import SidebarPlaybackIndicator from './SidebarPlaybackIndicator.svelte'

const TRACK_DRAG_MIME = 'application/x-stepify-tracks'

export let dance: DanceCategory

let rowEl: HTMLDivElement
let dropHover = false
let reorderHover = false

$: isSelected = $selectedDanceId === dance.id
$: reorderMime = reorderMimeForStyle(dance.style)
$: isPlaybackSource =
  $playerState.track != null &&
  $playerState.playbackListDanceId === dance.id &&
  $playerState.playbackListFolderPath == null
$: danceRowTitle =
  `${dance.name} — ${dance.bpmRange[0]}–${dance.bpmRange[1]} BPM — click to filter, drag row to reorder (${dance.style === 'latin' ? 'Latin' : 'Standard'} only), drop tracks here` +
  (isPlaybackSource ? ' — playback from this list' : '')

function select() {
  libraryActions.selectDance(isSelected ? null : dance.id)
}

function onRowClick() {
  select()
}

function onRowKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    select()
  }
}

function isTrackDrag(e: DragEvent) {
  return e.dataTransfer?.types.includes(TRACK_DRAG_MIME) ?? false
}

function isReorderDrag(e: DragEvent) {
  return e.dataTransfer?.types.includes(reorderMime) ?? false
}

function onRowDragStart(e: DragEvent) {
  const dt = e.dataTransfer
  if (!dt) return
  dt.setData(reorderMime, dance.id)
  dt.effectAllowed = 'move'
}

function onRowDragEnd() {
  reorderHover = false
}

function onRowDragOver(e: DragEvent) {
  const dt = e.dataTransfer
  if (!dt) return

  if (isTrackDrag(e)) {
    e.preventDefault()
    dt.dropEffect = 'copy'
    dropHover = true
    reorderHover = false
    return
  }

  if (isReorderDrag(e)) {
    e.preventDefault()
    dt.dropEffect = 'move'
    reorderHover = true
    dropHover = false
  }
}

function onRowDragLeave(e: DragEvent) {
  const related = e.relatedTarget as Node | null
  if (related && rowEl?.contains(related)) return
  dropHover = false
  reorderHover = false
}

async function onRowDrop(e: DragEvent) {
  const dt = e.dataTransfer
  if (!dt) return

  if (isTrackDrag(e)) {
    e.preventDefault()
    dropHover = false
    reorderHover = false
    const raw = dt.getData(TRACK_DRAG_MIME)
    if (!raw) return
    let ids: unknown
    try {
      ids = JSON.parse(raw)
    } catch {
      return
    }
    if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) return
    await libraryActions.assignDanceToTracks(ids as string[], dance.id as DanceId)
    return
  }

  if (isReorderDrag(e)) {
    e.preventDefault()
    dropHover = false
    reorderHover = false
    const fromId = dt.getData(reorderMime) as DanceId
    if (!fromId || fromId === dance.id) return
    danceOrderActions.reorderInsertBefore(dance.style, fromId, dance.id)
  }
}
</script>

<div
  bind:this={rowEl}
  class="dance-item"
  class:selected={isSelected}
  class:dance-item--queue-source={isPlaybackSource}
  class:dance-item--drop-hover={dropHover}
  class:dance-item--reorder-hover={reorderHover}
  style="--dance-color: {dance.color}"
  draggable="true"
  role="button"
  tabindex="0"
  aria-pressed={isSelected}
  title={danceRowTitle}
  on:click={onRowClick}
  on:keydown={onRowKeydown}
  on:dragstart={onRowDragStart}
  on:dragend={onRowDragEnd}
  on:dragover={onRowDragOver}
  on:dragleave={onRowDragLeave}
  on:drop={onRowDrop}
>
  <span class="dance-item__dot" aria-hidden="true"></span>
  <span class="dance-item__name truncate">{dance.name}</span>
  {#if isPlaybackSource}
    <SidebarPlaybackIndicator />
  {/if}
</div>

<style>
  .dance-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    font-size: 13px;
    font-weight: 500;
    width: 100%;
    min-width: 0;
    text-align: left;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .dance-item:active {
    cursor: pointer;
  }

  .dance-item:focus {
    outline: none;
  }

  .dance-item:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.35);
    outline-offset: 2px;
  }

  .dance-item:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }

  .dance-item.selected {
    background: var(--color-accent-muted);
    color: var(--color-accent);
  }

  .dance-item--drop-hover {
    background: color-mix(in srgb, var(--dance-color) 22%, var(--color-bg-elevated));
    color: var(--color-text-primary);
    outline: 2px dashed color-mix(in srgb, var(--dance-color) 70%, transparent);
    outline-offset: 2px;
  }

  .dance-item--reorder-hover {
    box-shadow: inset 0 2px 0 0 var(--color-accent);
  }

  .dance-item__dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    background: var(--dance-color, var(--color-text-muted));
    flex-shrink: 0;
    transition: transform var(--duration-fast) var(--ease-spring);
  }

  .dance-item.selected .dance-item__dot {
    transform: scale(1.3);
  }

  .dance-item__name {
    flex: 1;
    min-width: 0;
  }

  /* Spotify-style: queue started from this dance — accent title even when another filter is selected */
  .dance-item--queue-source:not(.selected) .dance-item__name {
    color: var(--color-accent);
  }
</style>
