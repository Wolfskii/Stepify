<script lang="ts">
import { libraryActions, libraryState } from '../../stores/library.store'
import { createEventDispatcher } from 'svelte'

const dispatch = createEventDispatcher<{ search: string }>()

let value = ''

function handleInput(e: Event) {
  value = (e.target as HTMLInputElement).value
  libraryActions.setSearchQuery(value)
  dispatch('search', value)
}

function clear() {
  value = ''
  libraryActions.setSearchQuery('')
}
</script>

<div class="search-bar">
  <span class="search-bar__icon" aria-hidden="true">
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.5"/>
      <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </span>

  <input
    type="search"
    placeholder="Search tracks..."
    bind:value
    on:input={handleInput}
    aria-label="Search tracks"
  />

  {#if value}
    <button class="search-bar__clear" on:click={clear} aria-label="Clear search">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
  {/if}
</div>

<style>
  .search-bar {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-bar__icon {
    position: absolute;
    left: var(--space-3);
    color: var(--color-text-muted);
    pointer-events: none;
    display: flex;
  }

  input {
    width: 100%;
    padding: var(--space-2) var(--space-3) var(--space-2) var(--space-8);
    background: var(--color-bg-overlay);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-full);
    color: var(--color-text-primary);
    font-size: 13px;
    transition:
      border-color var(--duration-fast) var(--ease-out),
      background var(--duration-fast) var(--ease-out);
  }

  input::placeholder {
    color: var(--color-text-muted);
  }

  input:focus {
    border-color: var(--color-accent);
    background: var(--color-bg-elevated);
  }

  /* Remove native search cancel button */
  input[type='search']::-webkit-search-cancel-button {
    display: none;
  }

  .search-bar__clear {
    position: absolute;
    right: var(--space-3);
    color: var(--color-text-muted);
    width: 18px;
    height: 18px;
    border-radius: var(--radius-full);
  }

  .search-bar__clear:hover {
    color: var(--color-text-primary);
  }
</style>
