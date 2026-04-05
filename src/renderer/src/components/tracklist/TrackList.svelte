<script lang="ts">
import { onMount } from 'svelte'
import { get } from 'svelte/store'
import {
  filteredTracks,
  selectedDanceId,
  selectedFolderPath,
  libraryDirectories,
  isScanning,
  libraryActions,
  selectedTrackIds,
} from '../../stores/library.store'
import { DANCE_CATEGORIES_BY_ID } from '@shared/constants'
import TrackItem from './TrackItem.svelte'
import { activeModal, uiActions } from '../../stores/ui.store'
import { pathsFromFileDrop } from '../../utils/dropPaths'
import { folderBadgeColor } from '../../utils/folderBadgeColor'

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

function folderBasename(fullPath: string): string {
  const s = fullPath.replace(/[/\\]+$/, '')
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
  return i >= 0 ? s.slice(i + 1) : s
}

function normalizePathLoose(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase()
}

$: selectedDance = $selectedDanceId ? DANCE_CATEGORIES_BY_ID[$selectedDanceId] : null
$: headingText = selectedDance
  ? selectedDance.name
  : $selectedFolderPath
    ? folderBasename($selectedFolderPath)
    : 'All Tracks'
$: bpmLabel = selectedDance ? `${selectedDance.bpmRange[0]}–${selectedDance.bpmRange[1]} BPM` : ''
$: selectedFolderDir = $selectedFolderPath
  ? $libraryDirectories.find(
      (d) => normalizePathLoose(d.path) === normalizePathLoose($selectedFolderPath),
    )
  : undefined
$: folderDefaultDance = selectedFolderDir?.defaultDanceId
  ? DANCE_CATEGORIES_BY_ID[selectedFolderDir.defaultDanceId]
  : null
$: folderViewBadgeAccent = folderBadgeColor(selectedFolderDir?.defaultDanceId)
function addDirectory() {
  void libraryActions.pickAddMusicFolder()
}

async function openLibraryFolderOnDisk(absPath: string) {
  const r = await window.electronAPI.library.openLibraryFolder(absPath)
  if (!r.success) {
    uiActions.notify(r.error ?? 'Could not open folder', 'error')
  }
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
      <div class="track-list__title-lead">
        {#if selectedDance}
          <span
            class="track-list__dance-dot"
            style="background: {selectedDance.color}"
          ></span>
        {:else if $selectedFolderPath}
          <span
            class="track-list__folder-icon"
            style="--folder-icon-accent: {folderViewBadgeAccent}"
            aria-hidden="true"
          >
            <svg class="track-list__folder-icon__svg" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M4 6a2 2 0 012-2h4.5l1.71 1.71a1 1 0 00.7.29H20a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
              />
            </svg>
          </span>
        {/if}
        <h1 class="track-list__title">{headingText}</h1>
        {#if bpmLabel}
          <span class="track-list__bpm-badge">{bpmLabel}</span>
        {/if}
      </div>
      {#if $selectedFolderPath}
        <button
          type="button"
          class="track-list__open-folder-btn"
          title="Open this folder in File Explorer / Finder"
          aria-label="Open folder in file explorer"
          on:click|stopPropagation={() => openLibraryFolderOnDisk($selectedFolderPath)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v1"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M15 3h6v6M10 14L21 3"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      {/if}
    </div>

    {#if $selectedFolderPath}
      <div class="track-list__folder-actions">
        <button
          type="button"
          class="track-list__folder-dance-btn"
          title="Tags tracks in this folder that have no dance yet, and new files added here. Click to change."
          on:click={() =>
            uiActions.openModal('assign-folder-dance', { folderSettingsPath: $selectedFolderPath })}
        >
          {#if folderDefaultDance}
            Default dance for folder: <strong>{folderDefaultDance.name}</strong>
          {:else}
            Set default dance for folder
          {/if}
        </button>
      </div>
    {/if}
  </header>

  <!-- Track rows (+ sticky column labels share scroll width so headers line up with cells when a scrollbar is present) -->
  <div class="track-list__rows" role="grid" aria-label="Tracks">
    {#if $filteredTracks.length > 0}
      <div class="track-list__cols track-list__cols--sticky" role="row" aria-label="Track list columns">
        <div role="columnheader" class="track-list__col track-list__col--index">#</div>
        <div role="columnheader" class="track-list__col track-list__col--title-block">Title</div>
        <div class="track-list__meta-cols" class:track-list__meta-cols--dance-filter={$selectedDanceId}>
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
          <div role="columnheader" class="track-list__col track-list__col--bpm">BPM</div>
          <div
            role="columnheader"
            class="track-list__col track-list__col--popularity"
            title="Likes minus dislikes for this track"
            aria-label="Popularity: likes minus dislikes"
          >
            <svg
              class="track-list__popularity-icon"
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
          {#if !$selectedDanceId}
            <div role="columnheader" class="track-list__col track-list__col--dance">Dance</div>
          {:else}
            <div
              role="columnheader"
              class="track-list__col track-list__col--dance-icon-slot"
              aria-hidden="true"
            ></div>
          {/if}
        </div>
      </div>
    {/if}
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
            onto a dance. You can also use the dance column on each row there to set or change the dance.
            On this screen, use the <strong>tag icon</strong> on each row to change dance or set
            <strong>None</strong>. <strong>Delete</strong> / <strong>Backspace</strong> still removes the
            selected tracks from this dance only.
          </p>
        {:else if $selectedFolderPath}
          <p>No tracks in this folder yet.</p>
          <p class="track-list__hint">
            Add audio files under this folder on disk, then rescan (or the app may pick them up
            automatically). Spotify tracks are not tied to library folders.
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
        <TrackItem
          {track}
          index={i}
          queue={$filteredTracks}
          filterDanceId={$selectedDanceId}
          filterFolderPath={$selectedFolderPath}
        />
      {/each}
    {/if}
  </div>
</div>

<style>
  .track-list {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    width: 100%;
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
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-1);
    min-width: 0;
  }

  .track-list__title-lead {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    flex: 1;
  }

  .track-list__open-folder-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    margin: -6px -4px -6px 0;
    padding: 0;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .track-list__open-folder-btn:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }

  .track-list__open-folder-btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
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

  .track-list__folder-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--folder-icon-accent);
    opacity: 0.95;
  }

  .track-list__folder-icon__svg {
    width: 20px;
    height: 20px;
    display: block;
  }

  .track-list__folder-actions {
    margin-top: var(--space-3);
  }

  .track-list__folder-dance-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
    background: var(--color-bg-elevated);
    color: var(--color-text-secondary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    transition:
      background var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .track-list__folder-dance-btn:hover {
    background: var(--color-bg-overlay);
    color: var(--color-text-primary);
    border-color: var(--color-border);
  }

  .track-list__folder-dance-btn strong {
    font-weight: 700;
    color: var(--color-text-primary);
  }

  /* Same three-column grid as .track-item: # | title (1fr) | meta */
  .track-list__cols {
    display: grid;
    grid-template-columns: 36px minmax(280px, 1fr) max-content;
    column-gap: var(--space-4);
    align-items: center;
    width: 100%;
    min-width: 0;
    /* Horizontal inset comes from .track-list__rows only — avoid doubling padding now that the header sits inside the scroll area. */
    padding: var(--space-2) 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-tracklist-column-label);
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
  }

  .track-list__cols--sticky {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--color-bg-surface);
  }

  /*
   * Same grid cell as .track-item__title-group: label starts at album art’s left edge
   * (covers art + track name as one “Title” column).
   */
  .track-list__col--title-block {
    display: flex;
    align-items: center;
    min-width: 0;
    margin-inline-end: var(--space-3);
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Time · BPM · Pop. · dance (or narrow icon slot in dance-filter view) */
  .track-list__meta-cols {
    display: grid;
    column-gap: var(--space-3);
    align-items: center;
    grid-template-columns: 52px 76px 72px var(--tracklist-meta-dance-col);
    min-width: 0;
    justify-items: start;
    /* Shrink-wrap the strip and pin to column 3’s end so we don’t leave dead space right of Dance when another row sets the column width. */
    width: max-content;
    max-width: 100%;
    justify-self: end;
  }

  .track-list__meta-cols--dance-filter {
    grid-template-columns: 52px 76px 72px 36px;
  }

  .track-list__col--dance-icon-slot {
    justify-self: center;
    width: 100%;
    padding: 0;
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
    justify-self: stretch;
    text-align: left;
  }

  .track-list__col--popularity {
    justify-self: stretch;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-transform: none;
    letter-spacing: 0.02em;
    margin-inline-start: calc(-1 * var(--space-1));
  }

  .track-list__popularity-icon {
    display: block;
    flex-shrink: 0;
    color: var(--color-tracklist-column-label);
    opacity: 0.95;
  }

  .track-list__col--bpm {
    text-align: left;
    padding-inline-start: var(--space-3);
    box-sizing: border-box;
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

  .track-list__rows {
    flex: 1;
    min-width: 0;
    width: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-gutter: stable;
    /* Horizontal padding for track rows + sticky column header (header has no extra inline padding). */
    padding: var(--space-2) var(--space-4);
    box-sizing: border-box;
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
