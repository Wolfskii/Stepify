<script lang="ts">
import { activeModal, folderAssignTrackIds, folderDanceSettingsPath, uiActions } from '../../stores/ui.store'
import { libraryActions, libraryDirectories } from '../../stores/library.store'
import { DANCE_CATEGORIES_BY_ID } from '@shared/constants'
import { orderedDanceCategories } from '../../stores/danceOrder.store'
import type { DanceId } from '@shared/types'

$: isFolderSettings = !!$folderDanceSettingsPath
$: folderPath = $folderDanceSettingsPath
$: currentDefaultId =
  folderPath != null
    ? $libraryDirectories.find((d) => d.path === folderPath)?.defaultDanceId
    : undefined
$: currentDefaultName = currentDefaultId
  ? DANCE_CATEGORIES_BY_ID[currentDefaultId]?.name
  : null

async function assignAll(danceId: DanceId) {
  if (isFolderSettings && folderPath) {
    await libraryActions.applyFolderDefaultDance(folderPath, danceId)
    uiActions.closeModal()
    return
  }
  const ids = $folderAssignTrackIds ?? []
  if (ids.length === 0) {
    uiActions.closeModal()
    return
  }
  await libraryActions.assignDanceToTracks(ids, danceId)
  uiActions.closeModal()
}

async function clearFolderDefault() {
  if (!folderPath) return
  await libraryActions.clearFolderDefaultDance(folderPath)
  uiActions.closeModal()
}

function skip() {
  uiActions.closeModal()
}
</script>

<svelte:window
  on:keydown={(e) =>
    $activeModal === 'assign-folder-dance' && e.key === 'Escape' && skip()}
/>

{#if $activeModal === 'assign-folder-dance' && (isFolderSettings || ($folderAssignTrackIds?.length ?? 0) > 0)}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" role="presentation" on:click={skip}>
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="folder-assign-title"
      on:click|stopPropagation
    >
      {#if isFolderSettings}
        <h2 id="folder-assign-title" class="modal__title">Folder dance</h2>
        <p class="modal__hint">
          Choose a dance for this folder. New files discovered here will get that tag automatically. Applying
          also updates every track already in this folder.
        </p>
        {#if currentDefaultName}
          <p class="modal__current">Current default: <strong>{currentDefaultName}</strong></p>
        {:else}
          <p class="modal__current modal__current--muted">No default — new files stay untagged until you assign.</p>
        {/if}
        <div class="modal__grid">
          {#each $orderedDanceCategories as d}
            <button
              type="button"
              class="modal__dance"
              style="--dance-color: {d.color}"
              on:click={() => assignAll(d.id)}
            >
              {d.name}
            </button>
          {/each}
        </div>
        <button type="button" class="modal__skip" on:click={clearFolderDefault}>
          No automatic assignment
        </button>
      {:else}
        <h2 id="folder-assign-title" class="modal__title">New tracks added</h2>
        <p class="modal__hint">
          Assign all <strong>{$folderAssignTrackIds?.length}</strong> new
          {$folderAssignTrackIds?.length === 1 ? 'file' : 'files'} to one dance, or skip if this folder is
          mixed.
        </p>
        <div class="modal__grid">
          {#each $orderedDanceCategories as d}
            <button
              type="button"
              class="modal__dance"
              style="--dance-color: {d.color}"
              on:click={() => assignAll(d.id)}
            >
              {d.name}
            </button>
          {/each}
        </div>
        <button type="button" class="modal__skip" on:click={skip}>
          Don’t assign (mixed folder)
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    padding: var(--space-6);
  }

  .modal {
    width: min(420px, 100%);
    max-height: var(--modal-max-height);
    overflow: auto;
    padding: var(--space-6);
    border-radius: var(--radius-lg);
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-subtle);
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
  }

  .modal__title {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: var(--space-2);
  }

  .modal__hint {
    font-size: 13px;
    color: var(--color-text-muted);
    margin-bottom: var(--space-4);
    line-height: 1.45;
  }

  .modal__current {
    font-size: 12px;
    margin-bottom: var(--space-4);
    color: var(--color-text-secondary);
  }

  .modal__current--muted {
    color: var(--color-text-muted);
  }

  .modal__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .modal__dance {
    padding: var(--space-3) var(--space-3);
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 600;
    text-align: left;
    color: var(--dance-color);
    background: color-mix(in srgb, var(--dance-color) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--dance-color) 35%, transparent);
    transition:
      background var(--duration-fast),
      transform var(--duration-fast) var(--ease-spring);
  }

  .modal__dance:hover {
    background: color-mix(in srgb, var(--dance-color) 22%, transparent);
    transform: translateY(-1px);
  }

  .modal__skip {
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
    background: var(--color-bg-elevated);
  }

  .modal__skip:hover {
    color: var(--color-text-primary);
    border-color: var(--color-text-muted);
  }
</style>
