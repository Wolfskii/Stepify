/** Approximate row height for reorder preview (padding + row content). */
export const TRACK_LIST_REORDER_ROW_SHIFT_PX = 56

/**
 * Vertical offset for each row while dragging `from` toward hover index `over`
 * (gap preview). Source row returns 0.
 */
export function computeReorderPreviewOffset(
  index: number,
  from: number | null,
  over: number | null,
): number {
  if (from == null || over == null) return 0
  if (from === over) return 0
  if (index === from) return 0
  const h = TRACK_LIST_REORDER_ROW_SHIFT_PX
  if (from < over) {
    if (index > from && index <= over) return -h
  } else {
    if (index >= over && index < from) return h
  }
  return 0
}
