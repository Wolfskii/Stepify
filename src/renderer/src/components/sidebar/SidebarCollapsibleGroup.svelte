<script lang="ts">
/** Collapsible sidebar block; match folder-row styling for the header toggle. */
export let title: string
export let sectionId: string
export let defaultOpen = true

let open = defaultOpen
</script>

<div class="sidebar__group">
  <button
    type="button"
    class="sidebar__group-label sidebar__group-heading-toggle"
    aria-expanded={open}
    aria-controls={sectionId}
    on:click={() => (open = !open)}
  >
    <span>{title}</span>
    <svg
      class="sidebar__section-chevron"
      class:sidebar__section-chevron--open={open}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>
  <div
    id={sectionId}
    class="sidebar__collapsible-body"
    class:sidebar__collapsible-body--collapsed={!open}
  >
    <slot />
  </div>
</div>

<style>
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

  .sidebar__group-heading-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    margin-bottom: var(--space-1);
    border: none;
    background: none;
    font-family: inherit;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: left;
    cursor: pointer;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .sidebar__group-heading-toggle:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text-secondary);
  }

  .sidebar__group-heading-toggle:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .sidebar__section-chevron {
    flex-shrink: 0;
    color: var(--color-text-muted);
    transform: rotate(-90deg);
    transition: transform var(--duration-fast) var(--ease-out);
  }

  .sidebar__section-chevron--open {
    transform: rotate(0deg);
  }

  .sidebar__group-heading-toggle:hover .sidebar__section-chevron {
    color: var(--color-text-secondary);
  }

  .sidebar__collapsible-body {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .sidebar__collapsible-body--collapsed {
    display: none;
  }
</style>
