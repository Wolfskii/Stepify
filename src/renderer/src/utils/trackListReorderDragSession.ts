import { logTrackReorder, resetTrackReorderVerboseCounters } from './trackReorderDebug'

/**
 * Internal list reorder DnD: Chromium/Electron often does not expose custom
 * `application/*` payloads via `dataTransfer.getData()` on drop, so we keep
 * the source row index here for the duration of the drag.
 */
let pendingFromIndex: number | null = null

export function setTrackListReorderDragOrigin(fromIndex: number): void {
  resetTrackReorderVerboseCounters()
  pendingFromIndex = fromIndex
  logTrackReorder('session set origin', { fromIndex })
}

export function peekTrackListReorderFromIndex(): number | null {
  return pendingFromIndex
}

export function takeTrackListReorderFromIndex(): number | null {
  const v = pendingFromIndex
  pendingFromIndex = null
  logTrackReorder('session take', { fromIndex: v })
  return v
}

export function clearTrackListReorderDragOrigin(): void {
  if (pendingFromIndex != null) {
    logTrackReorder('session clear', { hadPending: pendingFromIndex })
  }
  pendingFromIndex = null
}

export function isTrackListReorderDragPending(): boolean {
  return pendingFromIndex !== null
}
