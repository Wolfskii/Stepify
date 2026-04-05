<script lang="ts">
import Sidebar from '../sidebar/Sidebar.svelte'
import TrackList from '../tracklist/TrackList.svelte'
import FinalsPanel from '../finals/FinalsPanel.svelte'
import NowPlayingBar from '../player/NowPlayingBar.svelte'
import PlayerSidebar from '../player/PlayerSidebar.svelte'
import { sidebarCollapsed } from '../../stores/ui.store'
import { finalsFlow } from '../../stores/finals.store'
import Notifications from './Notifications.svelte'
import AssignDanceModal from '../modals/AssignDanceModal.svelte'
import AssignFolderDanceModal from '../modals/AssignFolderDanceModal.svelte'
import EditBpmModal from '../modals/EditBpmModal.svelte'
import TrackMetadataModal from '../modals/TrackMetadataModal.svelte'
</script>

<div class="app-shell">
  <div class="app-shell__panels">
    <div class="sidebar-col" class:collapsed={$sidebarCollapsed}>
      <Sidebar />
    </div>

    <main class="content-col">
      {#if $finalsFlow != null}
        <FinalsPanel />
      {:else}
        <TrackList />
      {/if}
    </main>

    <PlayerSidebar />
  </div>

  <NowPlayingBar />

  <Notifications />
  <AssignDanceModal />
  <AssignFolderDanceModal />
  <EditBpmModal />
  <TrackMetadataModal />
</div>

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--color-bg-base);
    min-height: 0;
  }

  .app-shell__panels {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: var(--sidebar-width) 1fr var(--player-sidebar-width);
    gap: var(--shell-gap);
    /* No top padding — avoids a black strip between the custom title bar and the panels. */
    padding: 0 var(--shell-pad) var(--space-2);
  }

  .sidebar-col {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: width var(--duration-normal) var(--ease-out);
    border-radius: var(--radius-panel);
    background: var(--color-bg-surface);
    min-width: 0;
  }

  .sidebar-col.collapsed {
    width: 0;
    min-width: 0;
    overflow: hidden;
  }

  .content-col {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-width: 0;
    border-radius: var(--radius-panel);
    background: var(--color-bg-surface);
  }
</style>
