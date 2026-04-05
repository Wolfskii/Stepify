<script lang="ts">
import { DANCE_CATEGORIES_BY_ID } from '@shared/constants'
import DanceCategoryItem from './DanceCategoryItem.svelte'
import SidebarCollapsibleGroup from './SidebarCollapsibleGroup.svelte'
import { latinOrder, standardOrder } from '../../stores/danceOrder.store'
import SearchBar from './SearchBar.svelte'
import { get } from 'svelte/store'
import {
  libraryActions,
  isScanning,
  scanProgress,
  libraryDirectories,
  selectedDanceId,
  selectedFolderPath,
} from '../../stores/library.store'
import { uiActions } from '../../stores/ui.store'
import { finalsActions } from '../../stores/finals.store'
import { currentTrack, playerActions, playerState } from '../../stores/player.store'
import SidebarPlaybackIndicator from './SidebarPlaybackIndicator.svelte'
import { audioEngine } from '../../services/audioEngine'
import { folderBadgeColor } from '../../utils/folderBadgeColor'

// TODO: see docs/practice-modes.md — stub until practice / competition builder ships
function practiceModesStub(label: string) {
  uiActions.notify(
    `${label} — coming soon. You’ll compose runs from dances, time blocks, and announcement cues (see docs/practice-modes.md).`,
    'info',
    4500,
  )
}

$: latinDances = $latinOrder.map((id) => DANCE_CATEGORIES_BY_ID[id])
$: standardDances = $standardOrder.map((id) => DANCE_CATEGORIES_BY_ID[id])
$: allTracksIsPlaybackSource =
  $playerState.track != null &&
  $playerState.playbackListDanceId === null &&
  $playerState.playbackListFolderPath == null

function folderLabel(fullPath: string): string {
  const s = fullPath.replace(/[/\\]+$/, '')
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
  return i >= 0 ? s.slice(i + 1) : s
}

function pathsMatchSidebar(a: string, b: string): boolean {
  const norm = (p: string) =>
    p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase()
  return norm(a) === norm(b)
}

async function removeFolder(path: string, label: string) {
  if (
    !confirm(
      `Remove folder “${label}” from Stepify?\n\nAll tracks from this folder will leave your library. Files on disk are not deleted. To bring them back, add the folder again.\n\nClick OK to confirm, or Cancel to keep the folder.`,
    )
  ) {
    return
  }
  const removed = await libraryActions.removeLibraryFolder(path)
  if (removed.length > 0) {
    playerActions.onLibraryRemovedTracks(removed)
    const cur = get(currentTrack)?.id
    if (cur && removed.includes(cur)) {
      audioEngine.stop()
    }
  }
}

function showAllTracks() {
  libraryActions.selectDance(null)
  libraryActions.setSearchQuery('')
}
</script>

<nav class="sidebar">
  <div class="sidebar__search">
    <SearchBar />
  </div>

  <!-- Main nav -->
  <div class="sidebar__section">
    <button
      type="button"
      class="sidebar__nav-item"
      class:sidebar__nav-item--active={$selectedDanceId === null && $selectedFolderPath === null}
      class:sidebar__nav-item--queue-source={allTracksIsPlaybackSource}
      title={allTracksIsPlaybackSource ? 'All Tracks — playback from this list' : undefined}
      on:click={showAllTracks}
    >
      <span class="sidebar__nav-item__lead">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <rect x="1" y="10" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <rect x="10" y="1" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <rect x="10" y="10" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        <span class="sidebar__nav-item__label">All Tracks</span>
      </span>
      {#if allTracksIsPlaybackSource}
        <SidebarPlaybackIndicator />
      {/if}
    </button>
  </div>

  <!-- Latin dances -->
  <SidebarCollapsibleGroup title="Latin" sectionId="sidebar-section-latin" defaultOpen={true}>
    {#each latinDances as dance}
      <DanceCategoryItem {dance} />
    {/each}
  </SidebarCollapsibleGroup>

  <!-- Standard dances -->
  <SidebarCollapsibleGroup title="Standard" sectionId="sidebar-section-standard" defaultOpen={true}>
    {#each standardDances as dance}
      <DanceCategoryItem {dance} />
    {/each}
  </SidebarCollapsibleGroup>

  <!-- Practice modes (competition-style templates — stub) -->
  <SidebarCollapsibleGroup title="Modes" sectionId="sidebar-section-modes" defaultOpen={true}>
    <button
      type="button"
      class="sidebar__aux-row sidebar__aux-row--finals"
      title="Build a finals run: discipline, dances, timings, random songs"
      aria-label="Finals mode"
      on:click={() => finalsActions.openFromSidebar()}
    >
      <span class="sidebar__aux-row__icon" aria-hidden="true">
        <svg
          class="sidebar__aux-svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      </span>
      <span class="sidebar__aux-row__label">Finals</span>
    </button>
    <button
      type="button"
      class="sidebar__aux-row sidebar__aux-row--rounds"
      title="Rounds flow — coming soon"
      aria-label="Rounds mode"
      on:click={() => practiceModesStub('Rounds')}
    >
      <span class="sidebar__aux-row__icon" aria-hidden="true">
        <svg
          class="sidebar__aux-svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M17 2.1l4 4-4 4" />
          <path d="M3 12.2v-2a4 4 0 0 1 4-4h12.8" />
          <path d="M7 21.9l-4-4 4-4" />
          <path d="M21 11.8v2a4 4 0 0 1-4 4H4.2" />
        </svg>
      </span>
      <span class="sidebar__aux-row__label">Rounds</span>
    </button>
    <button
      type="button"
      class="sidebar__aux-row sidebar__aux-row--muted"
      title="Create a custom mode from dances, pauses, and cues"
      aria-label="Add custom mode"
      on:click={() => practiceModesStub('Custom mode')}
    >
      <span class="sidebar__aux-row__icon" aria-hidden="true">
        <svg
          class="sidebar__aux-svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <span class="sidebar__aux-row__label">New custom mode…</span>
    </button>
  </SidebarCollapsibleGroup>

  <!-- Time blocks & ceremony / PA cues (stub) -->
  <SidebarCollapsibleGroup title="Other" sectionId="sidebar-section-other" defaultOpen={false}>
    <button
      type="button"
      class="sidebar__aux-row sidebar__aux-row--time"
      title="Timed gaps between dances — coming soon"
      aria-label="Time blocks"
      on:click={() => practiceModesStub('Time blocks')}
    >
      <span class="sidebar__aux-row__icon" aria-hidden="true">
        <svg
          class="sidebar__aux-svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      </span>
      <span class="sidebar__aux-row__label">Time blocks</span>
    </button>
    <button
      type="button"
      class="sidebar__aux-row sidebar__aux-row--misc"
      title="Fanfares, PA announcements, couple presentations — coming soon"
      aria-label="Miscellaneous cues"
      on:click={() => practiceModesStub('Miscellaneous')}
    >
      <span class="sidebar__aux-row__icon" aria-hidden="true">
        <svg
          class="sidebar__aux-svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z"
          />
        </svg>
      </span>
      <span class="sidebar__aux-row__label">Miscellaneous</span>
    </button>
  </SidebarCollapsibleGroup>

  <!-- Library folders (collapsed by default) -->
  {#if $libraryDirectories.length > 0}
    <SidebarCollapsibleGroup title="Folders" sectionId="sidebar-section-folders" defaultOpen={false}>
      {#each $libraryDirectories as dir}
        <div class="sidebar__folder-row">
          <button
            type="button"
            class="sidebar__folder-item"
            class:sidebar__folder-item--active={$selectedFolderPath != null &&
              pathsMatchSidebar($selectedFolderPath, dir.path)}
            class:sidebar__folder-item--queue-source={$playerState.track != null &&
              $playerState.playbackListFolderPath != null &&
              pathsMatchSidebar($playerState.playbackListFolderPath, dir.path)}
            title={dir.path}
            on:click={() => libraryActions.selectFolder(dir.path)}
          >
            <span
              class="sidebar__folder-icon"
              style="--folder-icon-accent: {folderBadgeColor(dir.defaultDanceId)}"
              aria-hidden="true"
            >
              <svg class="sidebar__folder-icon__svg" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M4 6a2 2 0 012-2h4.5l1.71 1.71a1 1 0 00.7.29H20a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                />
              </svg>
            </span>
            <span class="sidebar__folder-item__label truncate">{folderLabel(dir.path)}</span>
            {#if $playerState.track != null &&
              $playerState.playbackListFolderPath != null &&
              pathsMatchSidebar($playerState.playbackListFolderPath, dir.path)}
              <SidebarPlaybackIndicator />
            {/if}
          </button>
          <button
            type="button"
            class="sidebar__folder-remove"
            title="Remove folder from library"
            aria-label="Remove {folderLabel(dir.path)} from library"
            on:click|stopPropagation={() => removeFolder(dir.path, folderLabel(dir.path))}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>
      {/each}
    </SidebarCollapsibleGroup>
  {/if}

  <!-- Spacer -->
  <div class="sidebar__spacer"></div>

  <!-- Scanning progress -->
  {#if $isScanning && $scanProgress}
    <div class="sidebar__scan-progress">
      <div class="scan-progress__bar">
        <div
          class="scan-progress__fill"
          style="width: {$scanProgress.total > 0
            ? ($scanProgress.current / $scanProgress.total) * 100
            : 0}%"
        ></div>
      </div>
      <span class="scan-progress__label">
        Scanning {$scanProgress.current}/{$scanProgress.total}
      </span>
    </div>
  {/if}

  <!-- Footer actions -->
  <div class="sidebar__footer">
    <button
      class="sidebar__footer-btn"
      on:click={() => libraryActions.pickAddMusicFolder()}
      title="Add music folder"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      Add Folder
    </button>
    <button
      class="sidebar__footer-btn"
      on:click={() => uiActions.openModal('spotify-login')}
      title="Connect Spotify"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
      </svg>
      Spotify
    </button>
  </div>
</nav>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: var(--space-4) var(--space-3);
    gap: var(--space-1);
    overflow-y: auto;
    overflow-x: hidden;
  }

  .sidebar__search {
    margin-bottom: var(--space-3);
  }

  .sidebar__section {
    margin-bottom: var(--space-2);
  }

  .sidebar__nav-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    font-size: 13px;
    font-weight: 500;
    width: 100%;
    text-align: left;
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .sidebar__nav-item__lead {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .sidebar__nav-item__label {
    min-width: 0;
  }

  .sidebar__nav-item--queue-source:not(.sidebar__nav-item--active) .sidebar__nav-item__label {
    color: var(--color-accent);
  }

  .sidebar__nav-item:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }

  .sidebar__nav-item--active {
    background: var(--color-accent-muted);
    color: var(--color-accent);
  }

  .sidebar__aux-row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-2);
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: var(--space-2) var(--space-3);
    margin-bottom: var(--space-1);
    border-radius: var(--radius-md);
    border: none;
    background: none;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary);
    text-align: left;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .sidebar__aux-row:last-child {
    margin-bottom: 0;
  }

  .sidebar__aux-row:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }

  .sidebar__aux-row:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .sidebar__aux-row--muted {
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .sidebar__aux-row--muted:hover {
    color: var(--color-text-secondary);
  }

  .sidebar__aux-row__icon {
    flex-shrink: 0;
    width: var(--space-4);
    height: var(--space-4);
    display: flex;
    align-items: center;
    justify-content: flex-start;
    color: var(--color-text-muted);
  }

  .sidebar__aux-svg {
    display: block;
    flex-shrink: 0;
  }

  .sidebar__aux-row--finals .sidebar__aux-row__icon {
    color: var(--color-warning);
  }

  .sidebar__aux-row--rounds .sidebar__aux-row__icon {
    color: var(--color-dance-paso-doble);
  }

  .sidebar__aux-row--time .sidebar__aux-row__icon {
    color: var(--color-dance-slow-waltz);
  }

  .sidebar__aux-row--misc .sidebar__aux-row__icon {
    color: var(--color-dance-rumba);
  }

  .sidebar__aux-row--muted .sidebar__aux-row__icon {
    color: var(--color-text-muted);
  }

  .sidebar__aux-row--muted:hover .sidebar__aux-row__icon {
    color: var(--color-text-secondary);
  }

  .sidebar__aux-row__label {
    min-width: 0;
  }

  .sidebar__folder-row {
    display: flex;
    align-items: stretch;
    gap: var(--space-1);
    width: 100%;
    min-width: 0;
  }

  .sidebar__folder-item {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: none;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary);
    text-align: left;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .sidebar__folder-item:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }

  .sidebar__folder-item--active {
    background: var(--color-accent-muted);
    color: var(--color-accent);
  }

  .sidebar__folder-item--queue-source:not(.sidebar__folder-item--active) .sidebar__folder-item__label {
    color: var(--color-accent);
  }

  .sidebar__folder-icon {
    flex-shrink: 0;
    width: var(--space-4);
    height: var(--space-4);
    display: flex;
    align-items: center;
    justify-content: flex-start;
    color: var(--folder-icon-accent);
    opacity: 0.92;
  }

  .sidebar__folder-item--active .sidebar__folder-icon {
    opacity: 1;
  }

  .sidebar__folder-icon__svg {
    width: 16px;
    height: 16px;
    display: block;
  }

  .sidebar__folder-item__label {
    flex: 1;
    min-width: 0;
  }

  .sidebar__folder-remove {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      color var(--duration-fast),
      background var(--duration-fast);
  }

  .sidebar__folder-remove:hover {
    color: var(--color-warning);
    background: color-mix(in srgb, var(--color-warning) 12%, transparent);
  }

  .sidebar__spacer {
    flex: 1;
  }

  .sidebar__scan-progress {
    padding: var(--space-2) var(--space-3);
    margin-bottom: var(--space-2);
  }

  .scan-progress__bar {
    height: 3px;
    background: var(--color-border);
    border-radius: var(--radius-full);
    overflow: hidden;
    margin-bottom: var(--space-1);
  }

  .scan-progress__fill {
    height: 100%;
    background: var(--color-accent);
    border-radius: var(--radius-full);
    transition: width var(--duration-fast) linear;
  }

  .scan-progress__label {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .sidebar__footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border-subtle);
  }

  .sidebar__footer-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    font-size: 12px;
    font-weight: 500;
    width: 100%;
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .sidebar__footer-btn:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }
</style>
