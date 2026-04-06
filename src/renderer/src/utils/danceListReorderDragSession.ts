import type { DanceId, DanceStyle } from '@shared/types'

let pending: { style: DanceStyle; fromIndex: number; fromId: DanceId } | null = null

export function setDanceListReorderDragOrigin(
  style: DanceStyle,
  fromIndex: number,
  fromId: DanceId,
): void {
  pending = { style, fromIndex, fromId }
}

export function peekDanceListReorderDrag(): Readonly<{
  style: DanceStyle
  fromIndex: number
  fromId: DanceId
}> | null {
  return pending
}

export function takeDanceListReorderDrag(): {
  style: DanceStyle
  fromIndex: number
  fromId: DanceId
} | null {
  const v = pending
  pending = null
  return v
}

export function clearDanceListReorderDrag(): void {
  pending = null
}

export function isDanceListReorderDragPending(): boolean {
  return pending != null
}
