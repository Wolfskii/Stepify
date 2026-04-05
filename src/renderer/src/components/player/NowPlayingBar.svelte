<script lang="ts">
import { get } from 'svelte/store'
import {
  playerState,
  playerActions,
  currentTrack,
  isPlaying,
  currentTime,
  queue,
  listenerElapsed,
  listenerDuration,
} from '../../stores/player.store'
import { audioEngine } from '../../services/audioEngine'
import { onMount, onDestroy } from 'svelte'
import type { RepeatMode } from '@shared/types'

$: sourceDuration =
  $playerState.sourceDuration > 0 ? $playerState.sourceDuration : ($currentTrack?.duration ?? 0)
$: progress = sourceDuration > 0 ? ($currentTime / sourceDuration) * 100 : 0
$: displayElapsed = $listenerElapsed
$: displayTotal = $listenerDuration

$: canPrev =
  $currentTime > 3 ||
  $playerState.queueIndex > 0 ||
  ($playerState.repeatMode === 'all' && $queue.length > 0)

$: canNext =
  $queue.length > 0 &&
  ($playerState.queueIndex < $queue.length - 1 ||
    $playerState.repeatMode === 'all' ||
    ($playerState.shuffle && $queue.length > 1))

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

async function loadAndPlayFromStore() {
  const t = get(currentTrack)
  const st = get(playerState)
  if (!t) return
  await audioEngine.load(t)
  audioEngine.setTempo(st.tempo)
  audioEngine.play()
  playerActions.play()
}

async function togglePlay() {
  if ($isPlaying) {
    audioEngine.pause()
    playerActions.pause()
  } else {
    if ($currentTrack) {
      await audioEngine.load($currentTrack)
      audioEngine.setTempo($playerState.tempo)
    }
    audioEngine.play()
    playerActions.play()
  }
}

async function previous() {
  if ($playerState.currentTime > 3) {
    audioEngine.seek(0)
    playerActions.restartCurrentInPlace()
    return
  }
  if (!playerActions.skipToPreviousQueue()) return
  await loadAndPlayFromStore()
}

async function next() {
  if (!playerActions.skipToNextQueue()) return
  await loadAndPlayFromStore()
}

/** Source-file duration used for scrubbing (decoded buffer length). */
function durationForSeek(): number {
  const st = get(playerState)
  if (st.sourceDuration > 0) return st.sourceDuration
  const t = get(currentTrack)
  return t && t.duration > 0 ? t.duration : 0
}

function seekToClientX(clientX: number, el: HTMLInputElement) {
  if (el.disabled) return
  const dur = durationForSeek()
  if (!(dur > 0)) return
  const rect = el.getBoundingClientRect()
  const w = Math.max(1, rect.width)
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / w))
  const seconds = ratio * dur
  audioEngine.seek(seconds)
  playerActions.setCurrentTime(seconds)
}

/** Range `input` / `change` (value is 0–100). */
function onSeekFromRange(e: Event) {
  const el = e.currentTarget as HTMLInputElement
  const dur = durationForSeek()
  if (!(dur > 0)) return
  const value = parseFloat(el.value)
  const seconds = (value / 100) * dur
  audioEngine.seek(seconds)
  playerActions.setCurrentTime(seconds)
}

/** Click / tap on bar: some browsers omit `change` when only clicking the track. */
function onSeekPointerDown(e: PointerEvent) {
  const el = e.currentTarget as HTMLInputElement
  seekToClientX(e.clientX, el)
}

/** Drop focus after pointer so Chromium/Electron does not keep a green accent focus ring. */
function onSeekPointerUp(e: PointerEvent) {
  const el = e.currentTarget as HTMLInputElement
  requestAnimationFrame(() => el.blur())
}

let rangeInputEl: HTMLInputElement
let seekHoverLabel = ''
let seekHoverX = 0
let seekHoverShow = false

function onSeekBarPointerMove(e: PointerEvent) {
  const el = rangeInputEl
  if (!el || el.disabled || !get(currentTrack)) {
    seekHoverShow = false
    return
  }
  const dur = durationForSeek()
  if (!(dur > 0)) {
    seekHoverShow = false
    return
  }
  const rect = el.getBoundingClientRect()
  const w = Math.max(1, rect.width)
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / w))
  seekHoverLabel = formatTime(ratio * dur)
  seekHoverX = e.clientX - rect.left
  seekHoverShow = true
}

function onSeekBarPointerLeave() {
  seekHoverShow = false
}

function repeatAria(mode: RepeatMode): string {
  if (mode === 'one') return 'Repeat one'
  if (mode === 'all') return 'Repeat queue'
  return 'Repeat off'
}

let unsubTimeUpdate: () => void
let unsubEnded: () => void
let unsubLoaded: () => void

onMount(() => {
  unsubTimeUpdate = audioEngine.on<number>('timeupdate', (time) => {
    playerActions.setCurrentTime(time)
  })
  unsubEnded = audioEngine.on('ended', async () => {
    const outcome = playerActions.handleTrackEnded()
    if (outcome === 'stop') return
    await loadAndPlayFromStore()
  })
  unsubLoaded = audioEngine.on('loaded', () => {
    const d = audioEngine.duration
    if (d > 0) {
      playerActions.setSourceDuration(d)
    }
  })
})

onDestroy(() => {
  unsubTimeUpdate?.()
  unsubEnded?.()
  unsubLoaded?.()
})
</script>

<footer class="now-playing-bar">
  <div class="now-playing-bar__inner">
    <!-- Fixed-width track info: does not shrink or get covered when the seek row is wide. -->
    <div class="now-playing-bar__left">
      <div
        class="now-playing-bar__art"
        class:now-playing-bar__art--dim={!$currentTrack}
        aria-hidden="true"
      >
        {#if $currentTrack?.artworkUrl}
          <img src={$currentTrack.artworkUrl} alt="" />
        {:else}
          <div class="now-playing-bar__art-ph">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 18V5l12-2v13"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.5" />
              <circle cx="18" cy="16" r="3" stroke="currentColor" stroke-width="1.5" />
            </svg>
          </div>
        {/if}
      </div>
      <div class="now-playing-bar__meta">
        {#if $currentTrack}
          <div class="now-playing-bar__title truncate">{$currentTrack.title}</div>
          <div class="now-playing-bar__artist truncate">{$currentTrack.artist}</div>
        {:else}
          <span class="now-playing-bar__title now-playing-bar__title--muted">No track selected</span>
        {/if}
      </div>
    </div>

    <div class="now-playing-bar__center-wrap">
    <div class="now-playing-bar__center">
      <div class="now-playing-bar__transport">
        <button
          type="button"
          class="np-btn np-btn--icon"
          class:active={$playerState.shuffle}
          on:click={() => playerActions.toggleShuffle()}
          title="Shuffle"
          aria-label="Shuffle"
          aria-pressed={$playerState.shuffle}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
            />
          </svg>
        </button>

        <button
          type="button"
          class="np-btn np-btn--icon"
          on:click={previous}
          disabled={!canPrev}
          aria-label="Previous track"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
          </svg>
        </button>

        <button
          type="button"
          class="np-btn np-btn--play"
          on:click={togglePlay}
          disabled={!$currentTrack}
          aria-label={$isPlaying ? 'Pause' : 'Play'}
        >
          {#if $isPlaying}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          {:else}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          {/if}
        </button>

        <button
          type="button"
          class="np-btn np-btn--icon"
          on:click={next}
          disabled={!canNext}
          aria-label="Next track"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zm2.5-6 8.5 6V6z" />
          </svg>
        </button>

        <button
          type="button"
          class="np-btn np-btn--icon"
          class:active={$playerState.repeatMode !== 'off'}
          class:repeat-one={$playerState.repeatMode === 'one'}
          on:click={() => playerActions.cycleRepeat()}
          title={repeatAria($playerState.repeatMode)}
          aria-label={repeatAria($playerState.repeatMode)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"
            />
          </svg>
        </button>
      </div>

      <div class="now-playing-bar__seek">
        <span class="now-playing-bar__time">{formatTime(displayElapsed)}</span>
        <div
          class="now-playing-bar__range-shell"
          on:pointermove={onSeekBarPointerMove}
          on:pointerleave={onSeekBarPointerLeave}
        >
          {#if seekHoverShow && $currentTrack && sourceDuration > 0}
            <div
              class="now-playing-bar__seek-tooltip"
              style:left="{seekHoverX}px"
              role="tooltip"
            >
              {seekHoverLabel}
            </div>
          {/if}
          <input
            bind:this={rangeInputEl}
            type="range"
            class="now-playing-bar__range"
            style="--seek-progress: {progress}%"
            min="0"
            max="100"
            step="0.1"
            value={progress}
            on:input={onSeekFromRange}
            on:change={onSeekFromRange}
            on:pointerdown={onSeekPointerDown}
            on:pointerup={onSeekPointerUp}
            aria-label="Seek"
            disabled={!$currentTrack}
          />
        </div>
        <span class="now-playing-bar__time">{formatTime(displayTotal)}</span>
      </div>
    </div>
    </div>

    <!-- Mirrors max width of left block so transport + seek stay visually centered on wide windows. -->
    <div class="now-playing-bar__spacer-right" aria-hidden="true"></div>
  </div>
</footer>

<style>
  .now-playing-bar {
    flex-shrink: 0;
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-base);
    /* Shared cap for left label + right spacer (keeps controls centered). */
    --np-side-slot: min(320px, 42vw);
    --np-seek-max: min(960px, 100%);
  }

  /* Full viewport width — do NOT max-width + margin:auto here or ultrawide centers the whole
     row and artwork sits left of the scrubber instead of the window edge. */
  .now-playing-bar__inner {
    box-sizing: border-box;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0;
    padding: var(--space-3) var(--shell-pad);
    min-height: var(--now-playing-height, 108px);
    overflow: hidden;
  }

  /*
    Fixed-width side columns (same basis as spacer): artwork + title stay pinned to the
    inner *left* edge, not visually “centered” in the gap left of the seek bar.
  */
  .now-playing-bar__left {
    box-sizing: border-box;
    flex: 0 1 var(--np-side-slot);
    width: var(--np-side-slot);
    max-width: var(--np-side-slot);
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-3);
    z-index: 2;
  }

  .now-playing-bar__center-wrap {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
  }

  .now-playing-bar__spacer-right {
    box-sizing: border-box;
    flex: 0 1 var(--np-side-slot);
    width: var(--np-side-slot);
    max-width: var(--np-side-slot);
    min-width: 0;
  }

  .now-playing-bar__art {
    width: 64px;
    height: 64px;
    border-radius: var(--radius-art);
    overflow: hidden;
    background: var(--color-bg-overlay);
    flex-shrink: 0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
  }

  .now-playing-bar__art--dim {
    opacity: 0.45;
  }

  .now-playing-bar__art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .now-playing-bar__art-ph {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    background: linear-gradient(145deg, var(--color-bg-elevated), var(--color-bg-overlay));
  }

  .now-playing-bar__meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    justify-content: center;
  }

  .now-playing-bar__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
    letter-spacing: 0.01em;
  }

  .now-playing-bar__title--muted {
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .now-playing-bar__artist {
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  .now-playing-bar__center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    max-width: var(--np-seek-max);
    min-width: 0;
  }

  .now-playing-bar__transport {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  }

  .np-btn {
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
    transition:
      background var(--duration-fast),
      color var(--duration-fast),
      transform var(--duration-fast) var(--ease-spring);
  }

  .np-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .np-btn--icon {
    width: 42px;
    height: 42px;
  }

  .np-btn--icon:hover:not(:disabled) {
    color: var(--color-text-primary);
    background: rgba(255, 255, 255, 0.1);
  }

  .np-btn--icon.active {
    color: var(--color-accent);
  }

  .np-btn--icon.repeat-one {
    color: var(--color-accent);
  }

  .np-btn--play {
    /* Tight circle around 24×24 icon (was 44px — too much empty ring). */
    width: 32px;
    height: 32px;
    min-width: 32px;
    min-height: 32px;
    padding: 0;
    gap: 0;
    line-height: 0;
    background: var(--color-text-primary);
    color: var(--color-bg-base);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  }

  .np-btn--play svg {
    display: block;
    flex-shrink: 0;
  }

  .np-btn--play:hover:not(:disabled) {
    transform: scale(1.04);
    background: white;
  }

  .np-btn--play:disabled {
    background: var(--color-bg-overlay);
    color: var(--color-text-muted);
    box-shadow: none;
  }

  .now-playing-bar__seek {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    max-width: var(--np-seek-max);
    min-width: 0;
    outline: none;
  }

  .now-playing-bar__time {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-secondary);
    min-width: 38px;
  }

  .now-playing-bar__range-shell {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    height: 24px;
    outline: none;
  }

  .now-playing-bar__seek-tooltip {
    position: absolute;
    bottom: 100%;
    left: 0;
    transform: translateX(-50%);
    margin-bottom: 6px;
    padding: 4px 8px;
    background: #000000;
    color: #ffffff;
    font-size: 11px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    border-radius: var(--radius-sm);
    pointer-events: none;
    white-space: nowrap;
    z-index: 20;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }

  .now-playing-bar__range {
    --seek-progress: 0%;
    width: 100%;
    flex: 1;
    min-width: 0;
    height: 22px;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
    background: transparent;
    border: none;
    /* Avoid Chromium using system / accent green on the native control */
    accent-color: var(--color-text-primary);
    -webkit-tap-highlight-color: transparent;
  }

  .now-playing-bar__range:focus,
  .now-playing-bar__range:focus-visible,
  .now-playing-bar__range:active {
    outline: none !important;
    box-shadow: none !important;
  }

  .now-playing-bar__range::-webkit-slider-runnable-track {
    height: 4px;
    border: none;
    border-radius: var(--radius-full);
    background: linear-gradient(
      to right,
      var(--color-text-primary) 0%,
      var(--color-text-primary) var(--seek-progress),
      rgba(255, 255, 255, 0.22) var(--seek-progress),
      rgba(255, 255, 255, 0.22) 100%
    );
  }

  .now-playing-bar__range:hover:not(:disabled)::-webkit-slider-runnable-track {
    background: linear-gradient(
      to right,
      var(--color-accent) 0%,
      var(--color-accent) var(--seek-progress),
      rgba(255, 255, 255, 0.22) var(--seek-progress),
      rgba(255, 255, 255, 0.22) 100%
    );
  }

  .now-playing-bar__range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -4px;
    border: none;
    border-radius: 50%;
    background: var(--color-text-primary);
    cursor: pointer;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
    transition: background var(--duration-fast) var(--ease-out);
    outline: none;
  }

  .now-playing-bar__range:hover:not(:disabled)::-webkit-slider-thumb {
    background: var(--color-accent);
  }

  .now-playing-bar__range::-moz-range-track {
    height: 4px;
    border-radius: var(--radius-full);
    background: rgba(255, 255, 255, 0.22);
    border: none;
  }

  .now-playing-bar__range::-moz-range-progress {
    height: 4px;
    border-radius: var(--radius-full);
    background: var(--color-text-primary);
  }

  .now-playing-bar__range:hover:not(:disabled)::-moz-range-progress {
    background: var(--color-accent);
  }

  .now-playing-bar__range::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: none;
    border-radius: 50%;
    background: var(--color-text-primary);
    cursor: pointer;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  }

  .now-playing-bar__range:hover:not(:disabled)::-moz-range-thumb {
    background: var(--color-accent);
  }

  .now-playing-bar__range:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
</style>
