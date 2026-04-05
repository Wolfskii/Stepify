import { TRACK_REORDER_DRAG_MIME } from './libraryDrag'
import { logTrackReorder } from './trackReorderDebug'

export function parseTrackListReorderPayload(dt: DataTransfer): { fromIndex: number } | null {
  const rawMime = dt.getData(TRACK_REORDER_DRAG_MIME)
  const rawPlain = dt.getData('text/plain')
  const raw = rawMime || rawPlain
  if (import.meta.env.DEV) {
    logTrackReorder('parseTrackListReorderPayload getData', {
      mimeLen: rawMime.length,
      plainLen: rawPlain.length,
      plainPrefix: rawPlain.slice(0, 40),
    })
  }
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as unknown
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null
    const rec = p as { fromIndex?: number }
    if (typeof rec.fromIndex !== 'number' || rec.fromIndex < 0) return null
    return { fromIndex: rec.fromIndex }
  } catch {
    logTrackReorder('parseTrackListReorderPayload JSON.parse failed', { raw: raw.slice(0, 80) })
    return null
  }
}
