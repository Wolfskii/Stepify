<script lang="ts">
import { playerActions, tempoPercent } from '../../stores/player.store'
import { audioEngine } from '../../services/audioEngine'
import {
  TEMPO_MIN_PERCENT,
  TEMPO_MAX_PERCENT,
  TEMPO_STEP_PERCENT,
  TEMPO_FINE_STEP_PERCENT,
} from '@shared/constants'

/** Shorter track when horizontal space is tight */
export let compact = false

const RANGE = TEMPO_MAX_PERCENT - TEMPO_MIN_PERCENT

// ─── Drag state ───────────────────────────────────────────────────────────

let trackEl: HTMLElement
let isDragging = false
let dragStartY = 0
let dragStartPercent = 0

// ─── Derived display ──────────────────────────────────────────────────────

$: displayPercent = $tempoPercent
$: fillHeight = ((TEMPO_MAX_PERCENT - displayPercent) / RANGE) * 100
$: atCenter = displayPercent === 0

function formatLabel(p: number): string {
  if (p === 0) return '0%'
  return `${(p > 0 ? '+' : '') + p.toFixed(p % 1 === 0 ? 0 : 1)}%`
}

// ─── Apply change ─────────────────────────────────────────────────────────

function applyPercent(pct: number) {
  const clamped = Math.max(TEMPO_MIN_PERCENT, Math.min(TEMPO_MAX_PERCENT, pct))
  playerActions.setTempoByPercent(clamped)
  audioEngine.setTempo(1 + clamped / 100)
}

function reset() {
  applyPercent(0)
}

// ─── Mouse / Touch drag ───────────────────────────────────────────────────

function getTrackHeight(): number {
  return trackEl?.getBoundingClientRect().height ?? 200
}

function percentFromClientY(clientY: number): number {
  const rect = trackEl.getBoundingClientRect()
  // Top = max tempo, bottom = min tempo (inverted)
  const ratio = (clientY - rect.top) / rect.height
  const clamped = Math.max(0, Math.min(1, ratio))
  return TEMPO_MAX_PERCENT - clamped * RANGE
}

function snapToStep(pct: number, step: number): number {
  return Math.round(pct / step) * step
}

function onPointerDown(e: PointerEvent) {
  e.preventDefault()
  isDragging = true
  dragStartY = e.clientY
  dragStartPercent = displayPercent
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging) return
  const trackHeight = getTrackHeight()
  const deltaY = e.clientY - dragStartY
  const deltaPct = -(deltaY / trackHeight) * RANGE
  const raw = dragStartPercent + deltaPct
  applyPercent(snapToStep(raw, TEMPO_STEP_PERCENT))
}

function onPointerUp(e: PointerEvent) {
  isDragging = false
  ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
}

// Direct click on track (not on thumb)
function onTrackClick(e: MouseEvent) {
  if (isDragging) return
  const pct = percentFromClientY(e.clientY)
  applyPercent(snapToStep(pct, TEMPO_STEP_PERCENT))
}

// ─── Keyboard ─────────────────────────────────────────────────────────────

function onKeyDown(e: KeyboardEvent) {
  const fine = e.shiftKey
  const step = fine ? TEMPO_FINE_STEP_PERCENT : TEMPO_STEP_PERCENT

  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault()
      applyPercent(displayPercent + step)
      break
    case 'ArrowDown':
      e.preventDefault()
      applyPercent(displayPercent - step)
      break
    case 'Home':
      e.preventDefault()
      applyPercent(TEMPO_MAX_PERCENT)
      break
    case 'End':
      e.preventDefault()
      applyPercent(TEMPO_MIN_PERCENT)
      break
    case 'Escape':
    case 'r':
      reset()
      break
  }
}

// ─── Wheel ────────────────────────────────────────────────────────────────

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const fine = e.shiftKey
  const step = fine ? TEMPO_FINE_STEP_PERCENT : TEMPO_STEP_PERCENT
  const direction = e.deltaY > 0 ? -1 : 1
  applyPercent(displayPercent + direction * step)
}
</script>

<div
  class="tempo-slider"
  class:tempo-slider--compact={compact}
  role="group"
  aria-label="Tempo control"
>
  <!-- Max label -->
  <div class="tempo-slider__edge-label tempo-slider__edge-label--top">
    +{TEMPO_MAX_PERCENT}%
  </div>

  <!-- The slider track -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div
    class="tempo-slider__track"
    bind:this={trackEl}
    on:click={onTrackClick}
    aria-hidden="true"
  >
    <!-- Fill above center (positive = speed up → fill from center upward) -->
    <!-- Fill area — visualizes offset from zero -->
    <div class="tempo-slider__fill-zone">
      {#if displayPercent > 0}
        <div
          class="tempo-slider__fill tempo-slider__fill--positive"
          style="height: {(displayPercent / TEMPO_MAX_PERCENT) * 50}%; bottom: 50%"
        ></div>
      {:else if displayPercent < 0}
        <div
          class="tempo-slider__fill tempo-slider__fill--negative"
          style="height: {(Math.abs(displayPercent) / Math.abs(TEMPO_MIN_PERCENT)) * 50}%; top: 50%"
        ></div>
      {/if}

      <!-- Center line -->
      <div class="tempo-slider__center-line"></div>

      <!-- Tick marks -->
      <div class="tempo-slider__ticks" aria-hidden="true">
        {#each Array.from({ length: 9 }, (_, i) => i) as i}
          <div class="tick" class:major={i === 4}></div>
        {/each}
      </div>
    </div>

    <!-- Draggable thumb -->
    <div
      class="tempo-slider__thumb"
      class:dragging={isDragging}
      style="top: {fillHeight}%"
      role="slider"
      aria-valuemin={TEMPO_MIN_PERCENT}
      aria-valuemax={TEMPO_MAX_PERCENT}
      aria-valuenow={displayPercent}
      aria-valuetext={formatLabel(displayPercent)}
      tabindex="0"
      on:pointerdown={onPointerDown}
      on:pointermove={onPointerMove}
      on:pointerup={onPointerUp}
      on:keydown={onKeyDown}
      on:wheel|nonpassive={onWheel}
    >
      <div class="tempo-slider__thumb-inner">
        <span class="tempo-slider__thumb-lines">
          <span></span><span></span><span></span>
        </span>
      </div>
    </div>
  </div>

  <!-- Min label -->
  <div class="tempo-slider__edge-label tempo-slider__edge-label--bottom">
    {TEMPO_MIN_PERCENT}%
  </div>

  <!-- Percentage readout -->
  <div class="tempo-slider__readout" class:at-zero={atCenter}>
    {formatLabel(displayPercent)}
  </div>

  <!-- Reset button -->
  <button
    class="tempo-slider__reset"
    on:click={reset}
    disabled={atCenter}
    title="Reset tempo (R)"
    aria-label="Reset tempo to 0%"
  >
    Reset
  </button>
</div>

<style>
  .tempo-slider {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-3);
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }

  /* Edge labels */
  .tempo-slider__edge-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--color-text-muted);
    letter-spacing: 0.04em;
  }

  /* ── Track ─────────────────────────────────────── */
  .tempo-slider__track {
    position: relative;
    width: 48px;
    height: 200px;
    cursor: pointer;
  }

  .tempo-slider--compact .tempo-slider__track {
    height: 100px;
    width: 40px;
  }

  .tempo-slider--compact {
    padding: var(--space-2) var(--space-2);
    gap: var(--space-1);
  }

  .tempo-slider--compact .tempo-slider__edge-label {
    font-size: 9px;
  }

  .tempo-slider--compact .tempo-slider__readout {
    font-size: 14px;
    min-width: 48px;
  }

  .tempo-slider--compact .tempo-slider__reset {
    font-size: 10px;
    padding: var(--space-1) var(--space-3);
  }

  .tempo-slider__fill-zone {
    position: absolute;
    inset: 0;
    background: var(--color-bg-overlay);
    border-radius: var(--radius-md);
    overflow: hidden;
    border: 1px solid var(--color-border);
  }

  /* Colored fill */
  .tempo-slider__fill {
    position: absolute;
    left: 0;
    right: 0;
    border-radius: 0;
    transition: height var(--duration-fast) linear;
  }

  .tempo-slider__fill--positive {
    background: linear-gradient(
      to top,
      var(--color-accent),
      color-mix(in srgb, var(--color-accent) 40%, transparent)
    );
  }

  .tempo-slider__fill--negative {
    background: linear-gradient(
      to bottom,
      var(--color-warning),
      color-mix(in srgb, var(--color-warning) 40%, transparent)
    );
  }

  /* Center line */
  .tempo-slider__center-line {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--color-border);
    transform: translateY(-50%);
  }

  /* Tick marks */
  .tempo-slider__ticks {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: var(--space-2) 0;
    pointer-events: none;
  }

  .tick {
    width: 8px;
    height: 1px;
    background: var(--color-border);
    align-self: flex-end;
    margin-right: var(--space-1);
  }

  .tick.major {
    width: 12px;
    background: var(--color-text-muted);
  }

  /* ── Thumb ─────────────────────────────────────── */
  .tempo-slider__thumb {
    position: absolute;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 2;
    cursor: grab;
    touch-action: none;
    outline: none;
  }

  .tempo-slider__thumb:focus-visible .tempo-slider__thumb-inner {
    box-shadow:
      0 0 0 2px var(--color-bg-base),
      0 0 0 4px var(--color-accent);
  }

  .tempo-slider__thumb.dragging {
    cursor: grabbing;
  }

  .tempo-slider__thumb-inner {
    width: 52px;
    height: 28px;
    background: var(--color-bg-elevated);
    border: 1.5px solid var(--color-accent);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.4),
      0 0 12px var(--color-accent-glow);
    transition:
      box-shadow var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out);
  }

  .tempo-slider__thumb.dragging .tempo-slider__thumb-inner {
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.5),
      0 0 20px var(--color-accent-glow);
    border-color: var(--color-accent-hover);
  }

  /* Grip lines on the thumb */
  .tempo-slider__thumb-lines {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .tempo-slider__thumb-lines span {
    display: block;
    width: 18px;
    height: 1.5px;
    background: var(--color-accent);
    border-radius: 1px;
    opacity: 0.7;
  }

  /* ── Readout ────────────────────────────────────── */
  .tempo-slider__readout {
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    color: var(--color-accent);
    min-width: 56px;
    text-align: center;
    transition: color var(--duration-fast) var(--ease-out);
  }

  .tempo-slider__readout.at-zero {
    color: var(--color-text-muted);
  }

  /* ── Reset button ────────────────────────────────── */
  .tempo-slider__reset {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    padding: var(--space-1) var(--space-4);
    border-radius: var(--radius-full);
    border: 1px solid var(--color-border);
    background: transparent;
    transition:
      color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out),
      background var(--duration-fast) var(--ease-out);
  }

  .tempo-slider__reset:not(:disabled):hover {
    color: var(--color-text-primary);
    border-color: var(--color-accent);
    background: var(--color-accent-muted);
  }

  .tempo-slider__reset:disabled {
    opacity: 0.3;
  }
</style>
