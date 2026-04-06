/** Approximate dance row height in sidebar (padding + label). */
export const DANCE_SIDEBAR_REORDER_ROW_SHIFT_PX = 40

export function computeDanceReorderPreviewOffset(
  index: number,
  from: number | null,
  over: number | null,
): number {
  if (from == null || over == null) return 0
  if (from === over) return 0
  if (index === from) return 0
  const h = DANCE_SIDEBAR_REORDER_ROW_SHIFT_PX
  if (from < over) {
    if (index > from && index <= over) return -h
  } else {
    if (index >= over && index < from) return h
  }
  return 0
}
