<script lang="ts">
import { get } from 'svelte/store'
import { activeModal, assignDanceTrackId, uiActions } from '../../stores/ui.store'
import { libraryActions, libraryState } from '../../stores/library.store'
import { DANCE_CATEGORIES_BY_ID } from '@shared/constants'
import { orderedDanceCategories } from '../../stores/danceOrder.store'
import type { DanceId } from '@shared/types'

async function pick(danceId: DanceId) {
  const tid = $assignDanceTrackId
  if (!tid) return
  const r = await window.electronAPI.library.assignDance(tid, danceId)
  if (r.success) {
    libraryActions.updateTrackDance(tid, danceId, true)
    uiActions.closeModal()
    const name = DANCE_CATEGORIES_BY_ID[danceId]?.name ?? danceId
    uiActions.notify(`Assigned to ${name}`, 'success')
  } else {
    uiActions.notify(r.error ?? 'Assign failed', 'error')
  }
}

async function pickNone() {
  const tid = $assignDanceTrackId
  if (!tid) return
  const track = get(libraryState).tracks.find((t) => t.id === tid)
  if (!track || track.dances.length === 0) {
    uiActions.closeModal()
    return
  }
  let ok = 0
  for (const danceId of [...track.dances]) {
    const r = await window.electronAPI.library.unassignDance(tid, danceId)
    if (r.success) {
      libraryActions.updateTrackDance(tid, danceId, false)
      ok++
    }
  }
  uiActions.closeModal()
  if (ok > 0) {
    uiActions.notify('Dance cleared', 'success')
  } else {
    uiActions.notify('Could not clear dance', 'warning')
  }
}

function close() {
  uiActions.closeModal()
}
</script>

<svelte:window
  on:keydown={(e) =>
    $activeModal === 'assign-dance' && e.key === 'Escape' && close()}
/>

{#if $activeModal === 'assign-dance' && $assignDanceTrackId}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" role="presentation" on:click={close}>
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-dance-title"
      on:click|stopPropagation
    >
      <h2 id="assign-dance-title" class="modal__title">Set dance</h2>
      <p class="modal__hint">
        One dance per track — choosing a style replaces any previous tag. Use <strong>None</strong> to leave the
        track untagged (same idea as “no automatic assignment” for a folder).
      </p>
      <div class="modal__grid">
        {#each $orderedDanceCategories as d}
          <button
            type="button"
            class="modal__dance"
            style="--dance-color: {d.color}"
            on:click={() => pick(d.id)}
          >
            {d.name}
          </button>
        {/each}
      </div>
      <button type="button" class="modal__none" on:click={pickNone}>None (no dance)</button>
      <button type="button" class="modal__cancel" on:click={close}>Cancel</button>
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
    margin-bottom: var(--space-5);
  }

  .modal__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .modal__none {
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
    background: var(--color-bg-elevated);
    margin-bottom: var(--space-3);
    transition:
      color var(--duration-fast),
      border-color var(--duration-fast),
      background var(--duration-fast);
  }

  .modal__none:hover {
    color: var(--color-text-primary);
    border-color: var(--color-text-muted);
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

  .modal__cancel {
    width: 100%;
    padding: var(--space-2);
    border-radius: var(--radius-md);
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .modal__cancel:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }
</style>
