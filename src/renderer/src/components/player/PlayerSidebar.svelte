<script lang="ts">
import TempoSlider from './TempoSlider.svelte'
import BpmDisplay from './BpmDisplay.svelte'
</script>

<aside class="player-sidebar" aria-label="Tempo and pitch">
  <div class="player-sidebar__inner">
    <TempoSlider />
    <div class="player-sidebar__divider" role="presentation"></div>
    <BpmDisplay />
  </div>
</aside>

<style>
  .player-sidebar {
    border-radius: var(--radius-panel);
    background: var(--color-bg-surface);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .player-sidebar__inner {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-3);
    overflow-y: auto;
  }

  .player-sidebar__divider {
    width: 100%;
    max-width: 120px;
    height: 1px;
    background: var(--color-border-subtle);
    flex-shrink: 0;
  }
</style>
