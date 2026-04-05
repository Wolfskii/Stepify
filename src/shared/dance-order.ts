import { DANCE_CATEGORIES, DANCE_CATEGORIES_BY_ID } from './constants'
import type { DanceCategory, DanceId, DanceStyle } from './types'

export function defaultOrderForStyle(style: DanceStyle): DanceId[] {
  return DANCE_CATEGORIES.filter((d) => d.style === style).map((d) => d.id)
}

/** Merge saved order with current catalog: unknown ids dropped, new dances appended in default order. */
export function mergeDanceOrder(style: DanceStyle, saved: DanceId[] | undefined): DanceId[] {
  const defaults = defaultOrderForStyle(style)
  if (!saved?.length) return defaults
  const valid = new Set(defaults)
  const seen = new Set<DanceId>()
  const out: DanceId[] = []
  for (const id of saved) {
    if (valid.has(id) && !seen.has(id)) {
      out.push(id)
      seen.add(id)
    }
  }
  for (const id of defaults) {
    if (!seen.has(id)) out.push(id)
  }
  return out
}

export function categoriesForOrders(latinIds: DanceId[], standardIds: DanceId[]): DanceCategory[] {
  return [...latinIds, ...standardIds].map((id) => DANCE_CATEGORIES_BY_ID[id])
}

/** Move `draggedId` so it sits immediately before `beforeId` in the style’s list. */
export function insertDanceBefore(
  order: DanceId[],
  draggedId: DanceId,
  beforeId: DanceId,
): DanceId[] {
  if (draggedId === beforeId) return order
  const i = order.indexOf(draggedId)
  const j = order.indexOf(beforeId)
  if (i < 0 || j < 0) return order
  const next = [...order]
  next.splice(i, 1)
  const jAfter = next.indexOf(beforeId)
  next.splice(jAfter, 0, draggedId)
  return next
}
