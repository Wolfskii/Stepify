<script lang="ts">
import { get } from 'svelte/store'
import { activeModal, editBpmTrackId, uiActions } from '../../stores/ui.store'
import { libraryActions, libraryState } from '../../stores/library.store'
import { playerActions } from '../../stores/player.store'
import { persistManualBpm, resolveBpmForLocalTrack } from '../../services/bpmAnalysis'

$: track =
  $editBpmTrackId != null
    ? $libraryState.tracks.find((t) => t.id === $editBpmTrackId)
    : undefined

let inputStr = ''
let busy = false
let initKey: string | null = null

$: if ($activeModal === 'edit-bpm' && $editBpmTrackId != null) {
  if (initKey !== $editBpmTrackId) {
    initKey = $editBpmTrackId
    const tr = $libraryState.tracks.find((t) => t.id === $editBpmTrackId)
    inputStr = tr != null && tr.bpm != null && tr.bpm > 0 ? String(tr.bpm) : ''
  }
} else {
  initKey = null
}

function close() {
  uiActions.closeModal()
}

async function saveManual() {
  if (!track) return
  const v = Number.parseInt(inputStr.trim(), 10)
  if (!Number.isFinite(v)) {
    uiActions.notify('Enter a whole number BPM', 'warning')
    return
  }
  busy = true
  try {
    const ok = await persistManualBpm(track, v)
    if (!ok) {
      uiActions.notify('BPM must be between 30 and 400', 'warning')
      return
    }
    playerActions.mergeCurrentTrackBpm(Math.round(v), track.id)
    inputStr = String(Math.round(v))
    uiActions.notify('BPM saved', 'success')
  } finally {
    busy = false
  }
}

async function detectAgain() {
  if (!track) return
  if (track.source !== 'local' || !track.localPath) {
    uiActions.notify('Beat detection only works for local files', 'warning')
    return
  }
  busy = true
  try {
    const latest = get(libraryState).tracks.find((t) => t.id === track.id) ?? track
    const bpm = await resolveBpmForLocalTrack(latest, { forceDetect: true })
    if (bpm == null) {
      uiActions.notify('Could not detect BPM for this file', 'warning')
      return
    }
    playerActions.mergeCurrentTrackBpm(bpm, track.id)
    inputStr = String(bpm)
    uiActions.notify(`Detected ${bpm} BPM`, 'success')
  } finally {
    busy = false
  }
}

async function clearStored() {
  if (!track) return
  busy = true
  try {
    const r = await window.electronAPI.library.clearTrackBpm(track.id)
    if (!r.success) {
      uiActions.notify(r.error ?? 'Could not clear BPM', 'error')
      return
    }
    libraryActions.clearTrackBpmInState(track.id)
    playerActions.stripTrackBpm(track.id)
    inputStr = ''
    uiActions.notify('BPM cleared in library', 'success')
  } finally {
    busy = false
  }
}
</script>

<svelte:window
  on:keydown={(e) => $activeModal === 'edit-bpm' && e.key === 'Escape' && !busy && close()}
/>

{#if $activeModal === 'edit-bpm' && $editBpmTrackId && track}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" role="presentation" on:click={() => !busy && close()}>
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-bpm-title"
      on:click|stopPropagation
    >
      <h2 id="edit-bpm-title" class="modal__title">BPM</h2>
      <p class="modal__hint">
        {track.title}
        {#if track.source !== 'local'}
          <span class="modal__subhint"> · Spotify: manual BPM only (stored in your library).</span>
        {/if}
      </p>

      <label class="modal__label" for="edit-bpm-input">Beats per minute</label>
      <input
        id="edit-bpm-input"
        type="text"
        inputmode="numeric"
        class="modal__input"
        placeholder="e.g. 120"
        bind:value={inputStr}
        disabled={busy}
      />

      <div class="modal__actions">
        <button type="button" class="modal__primary" disabled={busy} on:click={saveManual}>
          Save
        </button>
        {#if track.source === 'local' && track.localPath}
          <button type="button" class="modal__secondary" disabled={busy} on:click={detectAgain}>
            Detect from file
          </button>
        {/if}
        <button type="button" class="modal__ghost" disabled={busy} on:click={clearStored}>
          Clear
        </button>
        <button type="button" class="modal__cancel" disabled={busy} on:click={close}>Close</button>
      </div>
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
    width: min(400px, 100%);
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
    line-height: 1.4;
  }

  .modal__subhint {
    display: block;
    margin-top: var(--space-1);
    font-size: 12px;
  }

  .modal__label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-muted);
    margin-bottom: var(--space-1);
  }

  .modal__input {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
    background: var(--color-bg-base);
    color: var(--color-text-primary);
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    margin-bottom: var(--space-5);
  }

  .modal__input:focus {
    outline: none;
    border-color: var(--color-accent);
  }

  .modal__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }

  .modal__primary {
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-accent);
    color: var(--color-bg-base);
    font-weight: 600;
    cursor: pointer;
  }

  .modal__primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal__secondary {
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
    background: transparent;
    color: var(--color-text-primary);
    font-weight: 600;
    cursor: pointer;
  }

  .modal__secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal__ghost {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    font-size: 13px;
    cursor: pointer;
  }

  .modal__ghost:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal__cancel {
    margin-left: auto;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .modal__cancel:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
