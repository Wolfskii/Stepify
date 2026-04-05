<script lang="ts">
import { DANCE_CATEGORIES_BY_ID } from '@shared/constants'
import DanceCategoryItem from './DanceCategoryItem.svelte'
import { latinOrder, standardOrder } from '../../stores/danceOrder.store'
import SearchBar from './SearchBar.svelte'
import { get } from 'svelte/store'
import {
  libraryActions,
  isScanning,
  scanProgress,
  libraryDirectories,
  selectedDanceId,
} from '../../stores/library.store'
import { uiActions, activePanel } from '../../stores/ui.store'
import { currentTrack, playerActions, playerState } from '../../stores/player.store'
import SidebarPlaybackIndicator from './SidebarPlaybackIndicator.svelte'
import { audioEngine } from '../../services/audioEngine'

$: latinDances = $latinOrder.map((id) => DANCE_CATEGORIES_BY_ID[id])
$: standardDances = $standardOrder.map((id) => DANCE_CATEGORIES_BY_ID[id])
$: allTracksIsPlaybackSource =
  $playerState.track != null && $playerState.playbackListDanceId === null

function folderLabel(fullPath: string): string {
  const s = fullPath.replace(/[/\\]+$/, '')
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
  return i >= 0 ? s.slice(i + 1) : s
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
  <!-- Logo / Brand -->
  <div class="sidebar__brand">
    <div class="sidebar__logo">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d="M9 18V5l12-2v13"
          stroke="var(--color-accent)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle cx="6" cy="18" r="3" stroke="var(--color-accent)" stroke-width="2"/>
        <circle cx="18" cy="16" r="3" stroke="var(--color-accent)" stroke-width="2"/>
      </svg>
    </div>
    <span class="sidebar__app-name">Stepify</span>
  </div>

  <!-- Search -->
  <div class="sidebar__search">
    <SearchBar />
  </div>

  <!-- Main nav -->
  <div class="sidebar__section">
    <button
      type="button"
      class="sidebar__nav-item"
      class:sidebar__nav-item--active={$selectedDanceId === null}
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
  <div class="sidebar__group">
    <div class="sidebar__group-label">Latin</div>
    {#each latinDances as dance}
      <DanceCategoryItem {dance} />
    {/each}
  </div>

  <!-- Standard dances -->
  <div class="sidebar__group">
    <div class="sidebar__group-label">Standard</div>
    {#each standardDances as dance}
      <DanceCategoryItem {dance} />
    {/each}
  </div>

  <!-- Library folders -->
  {#if $libraryDirectories.length > 0}
    <div class="sidebar__group">
      <div class="sidebar__group-label">Folders</div>
      {#each $libraryDirectories as dir}
        <div class="sidebar__folder-row">
          <span class="sidebar__folder-name truncate" title={dir.path}>
            {folderLabel(dir.path)}
          </span>
          <span class="sidebar__folder-count">{dir.trackCount}</span>
          <button
            type="button"
            class="sidebar__folder-remove"
            title="Remove folder from library"
            aria-label="Remove {folderLabel(dir.path)} from library"
            on:click={() => removeFolder(dir.path, folderLabel(dir.path))}
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
    </div>
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

  .sidebar__brand {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-1) var(--space-3);
    margin-bottom: var(--space-1);
  }

  .sidebar__logo {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: var(--color-accent-muted);
    border-radius: var(--radius-md);
    flex-shrink: 0;
  }

  .sidebar__app-name {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--color-text-primary);
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

  .sidebar__group {
    margin-bottom: var(--space-4);
  }

  .sidebar__group-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    padding: var(--space-1) var(--space-3);
    margin-bottom: var(--space-1);
  }

  .sidebar__folder-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
    border-radius: var(--radius-md);
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  .sidebar__folder-row:hover {
    background: var(--color-bg-elevated);
  }

  .sidebar__folder-name {
    flex: 1;
    min-width: 0;
  }

  .sidebar__folder-count {
    font-size: 10px;
    font-weight: 600;
    color: var(--color-text-muted);
    background: var(--color-bg-overlay);
    padding: 1px 6px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
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
