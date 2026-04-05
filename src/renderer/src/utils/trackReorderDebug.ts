const PREFIX = '[Stepify track reorder]'

function ts(): string {
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now().toFixed(1)
  }
  return `${Date.now()}`
}

/** Dev-only logs for diagnosing list DnD; search console for the prefix. */
export function logTrackReorder(phase: string, detail?: unknown): void {
  if (!import.meta.env.DEV) return
  const stamp = ts()
  if (detail !== undefined) {
    console.log(PREFIX, stamp, 'ms', phase, detail)
  } else {
    console.log(PREFIX, stamp, 'ms', phase)
  }
}

let dragOverSampleSeq = 0

/** Call when a new list-reorder drag starts (resamples dragover logs). */
export function resetTrackReorderVerboseCounters(): void {
  dragOverSampleSeq = 0
}

/** First N capture-phase document dragover events while pending (avoids log flood). */
export function logTrackReorderDragOverSample(detail: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return
  dragOverSampleSeq++
  if (dragOverSampleSeq > 25) return
  logTrackReorder(`doc dragover capture sample #${dragOverSampleSeq}`, detail)
}
