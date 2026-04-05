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

type ScrubGradientOpts = {
  /** Pointer over the bar shell — filled segment uses accent; idle = white */
  shellHovered: boolean
  /** Light segment between knob and pointer (only when pointer is *right* of knob) */
  previewActive: boolean
}

/**
 * Filled segment (0→knob): white by default, accent when the shell is hovered.
 * Preview to the right of the knob: only when previewActive, shell hovered, and pointer past knob.
 */
function buildScrubBarGradient(fillPct: number, hoverPct: number, opts: ScrubGradientOpts): string {
  const accent = 'var(--color-accent)'
  const filledIdle = 'rgba(255, 255, 255, 0.85)'
  const preview = 'rgba(255, 255, 255, 0.78)'
  const rest = 'rgba(255, 255, 255, 0.22)'
  const p = Math.max(0, Math.min(100, fillPct))
  const h = Math.max(0, Math.min(100, hoverPct))
  const fillCol = opts.shellHovered ? accent : filledIdle
  const showRightPreview = opts.previewActive && opts.shellHovered && h > p
  if (!showRightPreview) {
    return `linear-gradient(to right, ${fillCol} 0%, ${fillCol} ${p}%, ${rest} ${p}%, ${rest} 100%)`
  }
  return `linear-gradient(to right, ${fillCol} 0%, ${fillCol} ${p}%, ${preview} ${p}%, ${preview} ${h}%, ${rest} ${h}%, ${rest} 100%)`
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
let seekHoverRatio = 0
let seekHoverShow = false
let seekShellHovered = false

let volBlockEl: HTMLDivElement
let volRangeInputEl: HTMLInputElement
let volHoverRatio = 0
let volHoverShow = false
let volShellHovered = false

$: seekHoverActive = seekHoverShow && $currentTrack != null && sourceDuration > 0
$: seekTrackGradient = buildScrubBarGradient(progress, seekHoverRatio, {
  shellHovered: seekShellHovered,
  previewActive: seekHoverActive,
})

/** Slider shows 0 when muted; store `volume` is preserved for unmute */
$: volumeSliderPercent = $playerState.muted ? 0 : $playerState.volume * 100
$: volumeTrackGradient = buildScrubBarGradient(volumeSliderPercent, volHoverRatio, {
  shellHovered: volShellHovered,
  previewActive: volHoverShow,
})

/** Output gain follows mute */
$: audioEngine.setVolume($playerState.muted ? 0 : $playerState.volume)

function onSeekBarPointerMove(e: PointerEvent) {
  const el = rangeInputEl
  if (!el) {
    seekShellHovered = false
    return
  }
  seekShellHovered = true
  if (el.disabled || !get(currentTrack)) {
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
  seekHoverRatio = ratio * 100
  seekHoverShow = true
}

function onSeekBarPointerLeave(e: PointerEvent) {
  if (e.buttons === 0) {
    seekHoverShow = false
    seekShellHovered = false
  }
}

function onWindowPointerUp(e: PointerEvent) {
  const seekShell = rangeInputEl?.parentElement
  if (seekShell) {
    const r = seekShell.getBoundingClientRect()
    const over =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    if (!over) {
      seekHoverShow = false
      seekShellHovered = false
    }
  }
  if (volBlockEl) {
    const r = volBlockEl.getBoundingClientRect()
    const over =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    if (!over) {
      volHoverShow = false
      volShellHovered = false
    }
  }
}

function volumeFromClientX(clientX: number, el: HTMLInputElement) {
  const rect = el.getBoundingClientRect()
  const w = Math.max(1, rect.width)
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / w))
  playerActions.setVolume(ratio)
}

function onVolumeFromRange(e: Event) {
  const el = e.currentTarget as HTMLInputElement
  const value = parseFloat(el.value)
  playerActions.setVolume(value / 100)
}

function onVolumePointerDown(e: PointerEvent) {
  const el = e.currentTarget as HTMLInputElement
  volumeFromClientX(e.clientX, el)
}

function onVolumePointerUp(e: PointerEvent) {
  const el = e.currentTarget as HTMLInputElement
  requestAnimationFrame(() => el.blur())
}

/** Mute + volume line share hover: accent fill + knob; preview only when pointer is over the range */
function onVolumeBlockPointerMove(e: PointerEvent) {
  volShellHovered = true
  const el = volRangeInputEl
  if (!el) {
    volHoverShow = false
    return
  }
  const rect = el.getBoundingClientRect()
  const { clientX, clientY } = e
  const insideRange =
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  if (insideRange) {
    const w = Math.max(1, rect.width)
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / w))
    volHoverRatio = ratio * 100
    volHoverShow = true
  } else {
    volHoverShow = false
  }
}

function onVolumeBlockPointerLeave(e: PointerEvent) {
  if (e.buttons === 0) {
    volHoverShow = false
    volShellHovered = false
  }
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
  window.addEventListener('pointerup', onWindowPointerUp)
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
  window.removeEventListener('pointerup', onWindowPointerUp)
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
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
          <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zM16 6L9 12l7 6V6z" />
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
            <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          {:else}
            <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
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
          <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
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
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
          <div
            class="now-playing-bar__seek-track-bg"
            style:background={seekTrackGradient}
            aria-hidden="true"
          ></div>
          <input
            bind:this={rangeInputEl}
            type="range"
            class="now-playing-bar__range"
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

    <div class="now-playing-bar__right">
      <div
        class="now-playing-bar__volume-block"
        bind:this={volBlockEl}
        on:pointermove={onVolumeBlockPointerMove}
        on:pointerleave={onVolumeBlockPointerLeave}
      >
        <button
          type="button"
          class="now-playing-bar__mute-btn"
          on:click={() => playerActions.toggleMute()}
          title={$playerState.muted ? 'Unmute' : 'Mute'}
          aria-label={$playerState.muted ? 'Unmute' : 'Mute'}
        >
          {#if $playerState.muted}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path
                d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
              />
            </svg>
          {:else}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path
                d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
              />
            </svg>
          {/if}
        </button>
        <div class="now-playing-bar__range-shell now-playing-bar__range-shell--volume">
          <div
            class="now-playing-bar__seek-track-bg now-playing-bar__volume-track-bg"
            style:background={volumeTrackGradient}
            aria-hidden="true"
          ></div>
          <input
            bind:this={volRangeInputEl}
            type="range"
            class="now-playing-bar__range now-playing-bar__range--volume"
            min="0"
            max="100"
            step="0.5"
            value={volumeSliderPercent}
            on:input={onVolumeFromRange}
            on:change={onVolumeFromRange}
            on:pointerdown={onVolumePointerDown}
            on:pointerup={onVolumePointerUp}
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
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
    /* Extra inset vs shell so artwork / volume don’t hug the window edge */
    --np-pad-x: calc(var(--shell-pad) + var(--space-3));
  }

  /* Full viewport width — do NOT max-width + margin:auto here or ultrawide centers the whole
     row and artwork sits left of the scrubber instead of the window edge. */
  .now-playing-bar__inner {
    box-sizing: border-box;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0;
    padding: var(--space-3) calc(var(--np-pad-x) + var(--space-3)) var(--space-3) var(--np-pad-x);
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

  .now-playing-bar__right {
    box-sizing: border-box;
    flex: 0 1 var(--np-side-slot);
    width: var(--np-side-slot);
    max-width: var(--np-side-slot);
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    z-index: 2;
  }

  .now-playing-bar__volume-block {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    max-width: 100%;
    min-width: 0;
  }

  .now-playing-bar__mute-btn {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    color: #a1a1a1;
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .now-playing-bar__mute-btn:hover {
    color: #ffffff;
  }

  .now-playing-bar__mute-btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
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
    /* ~25% under prior 76px hit target — shuffle / prev / next / repeat */
    width: 57px;
    height: 57px;
    color: #a1a1a1;
  }

  .np-btn--icon:hover:not(:disabled) {
    color: #ffffff;
  }

  .np-btn--icon.active {
    color: var(--color-accent);
  }

  .np-btn--icon.repeat-one {
    color: var(--color-accent);
  }

  .np-btn--play {
    /* 32px × 1.25 — play / pause */
    width: 40px;
    height: 40px;
    min-width: 40px;
    min-height: 40px;
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
    cursor: pointer;
  }

  .now-playing-bar__seek-track-bg {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 4px;
    border-radius: var(--radius-full);
    pointer-events: none;
    z-index: 0;
  }

  .now-playing-bar__seek-tooltip {
    position: absolute;
    bottom: 100%;
    left: 0;
    transform: translateX(-50%);
    margin-bottom: 6px;
    padding: 5px 10px;
    background: #121212;
    color: #ffffff;
    font-size: 12px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    border-radius: var(--radius-sm);
    pointer-events: none;
    white-space: nowrap;
    z-index: 20;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }

  .now-playing-bar__range {
    position: relative;
    z-index: 1;
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
    background: transparent;
  }

  .now-playing-bar__range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -4px;
    border: none;
    border-radius: 50%;
    background: #ffffff;
    cursor: pointer;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
    outline: none;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  .now-playing-bar__range-shell:hover .now-playing-bar__range:not(:disabled)::-webkit-slider-thumb,
  .now-playing-bar__range:active:not(:disabled)::-webkit-slider-thumb,
  .now-playing-bar__range:focus-visible:not(:disabled)::-webkit-slider-thumb {
    opacity: 1;
    pointer-events: auto;
  }

  .now-playing-bar__range::-moz-range-track {
    height: 4px;
    border-radius: var(--radius-full);
    background: transparent;
    border: none;
  }

  .now-playing-bar__range::-moz-range-progress {
    height: 4px;
    border-radius: var(--radius-full);
    background: transparent;
    border: none;
  }

  .now-playing-bar__range::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: none;
    border-radius: 50%;
    background: #ffffff;
    cursor: pointer;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  .now-playing-bar__range-shell:hover .now-playing-bar__range:not(:disabled)::-moz-range-thumb,
  .now-playing-bar__range:active:not(:disabled)::-moz-range-thumb,
  .now-playing-bar__range:focus-visible:not(:disabled)::-moz-range-thumb {
    opacity: 1;
    pointer-events: auto;
  }

  .now-playing-bar__range:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  /* Volume — same track weight + thumb as seek; narrower width only */
  .now-playing-bar__range-shell--volume {
    flex: 1;
    max-width: 120px;
    min-width: 72px;
    height: 24px;
  }

  .now-playing-bar__volume-track-bg {
    height: 4px;
  }

  .now-playing-bar__range--volume {
    height: 22px;
  }

  .now-playing-bar__range--volume::-webkit-slider-runnable-track {
    height: 4px;
  }

  .now-playing-bar__range--volume::-webkit-slider-thumb {
    width: 12px;
    height: 12px;
    margin-top: -4px;
  }

  .now-playing-bar__volume-block:hover .now-playing-bar__range--volume::-webkit-slider-thumb,
  .now-playing-bar__range--volume:active::-webkit-slider-thumb,
  .now-playing-bar__range--volume:focus-visible::-webkit-slider-thumb {
    opacity: 1;
    pointer-events: auto;
  }

  .now-playing-bar__range--volume::-moz-range-track {
    height: 4px;
  }

  .now-playing-bar__range--volume::-moz-range-progress {
    height: 4px;
  }

  .now-playing-bar__range--volume::-moz-range-thumb {
    width: 12px;
    height: 12px;
  }

  .now-playing-bar__volume-block:hover .now-playing-bar__range--volume::-moz-range-thumb,
  .now-playing-bar__range--volume:active::-moz-range-thumb,
  .now-playing-bar__range--volume:focus-visible::-moz-range-thumb {
    opacity: 1;
    pointer-events: auto;
  }
</style>
