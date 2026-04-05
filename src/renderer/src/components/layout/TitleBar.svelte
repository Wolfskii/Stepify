<script lang="ts">
import { onMount } from 'svelte'

let isMaximized = false
let removeMaxListener: (() => void) | undefined

onMount(() => {
  void window.electronAPI.window.getMaximized().then((v) => {
    isMaximized = v
  })
  removeMaxListener = window.electronAPI.window.onMaximizedChange((v) => {
    isMaximized = v
  })
  return () => removeMaxListener?.()
})

function onDoubleClickDrag(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.title-bar__controls')) return
  window.electronAPI.window.maximize()
}
</script>

<!-- Custom drag region (frameless window). -->
<header class="title-bar" on:dblclick={onDoubleClickDrag}>
  <div class="title-bar__drag">
    <span class="title-bar__brand">Stepify</span>
  </div>
  <div class="title-bar__controls" role="toolbar" aria-label="Window">
    <button
      type="button"
      class="title-bar__btn"
      aria-label="Minimize"
      on:click={() => window.electronAPI.window.minimize()}
    >
      <svg width="10" height="1" viewBox="0 0 10 1" aria-hidden="true">
        <rect width="10" height="1" fill="currentColor" />
      </svg>
    </button>
    <button
      type="button"
      class="title-bar__btn"
      aria-label={isMaximized ? 'Restore' : 'Maximize'}
      on:click={() => window.electronAPI.window.maximize()}
    >
      {#if isMaximized}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path
            d="M2.5 2.5v5h5v-5h-5zM4 1h5v5"
            stroke="currentColor"
            stroke-width="1.1"
          />
        </svg>
      {:else}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="8" height="8" stroke="currentColor" stroke-width="1.1" />
        </svg>
      {/if}
    </button>
    <button
      type="button"
      class="title-bar__btn title-bar__btn--close"
      aria-label="Close"
      on:click={() => window.electronAPI.window.close()}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.1" />
      </svg>
    </button>
  </div>
</header>

<style>
  .title-bar {
    flex-shrink: 0;
    display: flex;
    align-items: stretch;
    height: var(--titlebar-height);
    background: #000000;
    border-bottom: 1px solid #1a1a1a;
    user-select: none;
  }

  .title-bar__drag {
    flex: 1;
    display: flex;
    align-items: center;
    padding-left: var(--space-4);
    min-width: 0;
    -webkit-app-region: drag;
    app-region: drag;
  }

  .title-bar__brand {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.35);
    pointer-events: none;
  }

  .title-bar__controls {
    display: flex;
    flex-shrink: 0;
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }

  .title-bar__btn {
    width: 46px;
    height: 100%;
    min-height: var(--titlebar-height);
    color: rgba(255, 255, 255, 0.85);
    border-radius: 0;
    transition: background var(--duration-fast) var(--ease-out), color var(--duration-fast)
      var(--ease-out);
  }

  .title-bar__btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
  }

  .title-bar__btn:active {
    background: rgba(255, 255, 255, 0.12);
  }

  .title-bar__btn--close:hover {
    background: #e81123;
    color: #ffffff;
  }

  .title-bar__btn--close:active {
    background: #bf0f1d;
  }
</style>
