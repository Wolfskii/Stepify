<script lang="ts">
import {
  currentTrack,
  tempoPercent,
  adjustedBpm,
  referenceBpmInfo,
} from '../../stores/player.store'

export let compact = false

$: ref = $referenceBpmInfo
$: isAdjusted = $tempoPercent !== 0
$: baseBpm = ref?.bpm ?? null
</script>

<div class="bpm-display" class:bpm-display--compact={compact} aria-label="BPM information">
  {#if ref && baseBpm != null}
    <div class="bpm-display__row">
      <div class="bpm-display__value" class:adjusted={isAdjusted}>
        {$adjustedBpm ?? baseBpm}
        <span class="bpm-display__unit">BPM</span>
      </div>

      {#if isAdjusted && !compact}
        <div
          class="bpm-display__original"
          title={ref.source === 'metadata' ? 'BPM from file tags' : 'Typical competition tempo for assigned dance'}
        >
          {#if ref.source === 'metadata'}
            orig. {baseBpm}
          {:else}
            base {baseBpm}
          {/if}
        </div>
      {/if}
    </div>

    {#if ref.source === 'dance-midpoint' && !compact}
      <div class="bpm-display__hint" title="Midpoint of competition BPM range for your dance">
        Typical for dance
      </div>
    {/if}

    {#if isAdjusted && !compact}
      <div
        class="bpm-display__delta"
        class:positive={$tempoPercent > 0}
        class:negative={$tempoPercent < 0}
      >
        {$tempoPercent > 0 ? '+' : ''}{($adjustedBpm ?? 0) - baseBpm} BPM
        ({$tempoPercent > 0 ? '+' : ''}{$tempoPercent.toFixed(1)}%)
      </div>
    {/if}
  {:else if $currentTrack}
    <div class="bpm-display__empty">— BPM</div>
    {#if !compact}
      <p class="bpm-display__empty-hint">
        Tag a dance in the list, or use a file with BPM in its metadata.
      </p>
    {/if}
  {:else}
    <div class="bpm-display__empty">— BPM</div>
  {/if}
</div>

<style>
  .bpm-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2) 0;
  }

  .bpm-display__row {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  .bpm-display__value {
    font-size: 32px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.03em;
    color: var(--color-text-primary);
    line-height: 1;
    display: flex;
    align-items: baseline;
    gap: var(--space-1);
    transition: color var(--duration-normal) var(--ease-out);
  }

  .bpm-display__value.adjusted {
    color: var(--color-accent);
  }

  .bpm-display__unit {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-muted);
    letter-spacing: 0.04em;
  }

  .bpm-display__original {
    font-size: 11px;
    color: var(--color-text-muted);
    align-self: flex-end;
    padding-bottom: 2px;
  }

  .bpm-display__hint {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    opacity: 0.85;
  }

  .bpm-display__delta {
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .bpm-display__delta.positive {
    color: var(--color-accent);
  }

  .bpm-display__delta.negative {
    color: var(--color-warning);
  }

  .bpm-display__empty {
    font-size: 28px;
    font-weight: 700;
    color: var(--color-text-muted);
    letter-spacing: -0.02em;
  }

  .bpm-display__empty-hint {
    font-size: 11px;
    color: var(--color-text-muted);
    text-align: center;
    max-width: 200px;
    line-height: 1.35;
    opacity: 0.85;
    font-weight: 400;
  }

  .bpm-display--compact {
    padding: 0;
    align-items: flex-end;
    text-align: right;
  }

  .bpm-display--compact .bpm-display__row {
    justify-content: flex-end;
  }

  .bpm-display--compact .bpm-display__value {
    font-size: 22px;
  }

  .bpm-display--compact .bpm-display__unit {
    font-size: 11px;
  }

  .bpm-display--compact .bpm-display__empty {
    font-size: 18px;
  }
</style>
