import {
  categoriesForOrders,
  defaultOrderForStyle,
  insertDanceBefore,
  mergeDanceOrder,
} from '@shared/dance-order'
import type { AppSettings, DanceId, DanceStyle } from '@shared/types'
import { derived, get, writable } from 'svelte/store'

export const DANCE_REORDER_MIME_LATIN = 'application/x-stepify-dance-order-latin'
export const DANCE_REORDER_MIME_STANDARD = 'application/x-stepify-dance-order-standard'

export function reorderMimeForStyle(style: DanceStyle): string {
  return style === 'latin' ? DANCE_REORDER_MIME_LATIN : DANCE_REORDER_MIME_STANDARD
}

const latinOrder = writable<DanceId[]>(defaultOrderForStyle('latin'))
const standardOrder = writable<DanceId[]>(defaultOrderForStyle('standard'))

export { latinOrder, standardOrder }

export const orderedDanceCategories = derived([latinOrder, standardOrder], ([l, s]) =>
  categoriesForOrders(l, s),
)

export function initDanceOrdersFromSettings(settings: AppSettings): void {
  latinOrder.set(mergeDanceOrder('latin', settings.latinDanceOrder))
  standardOrder.set(mergeDanceOrder('standard', settings.standardDanceOrder))
}

async function persistOrders(): Promise<void> {
  const r = await window.electronAPI.settings.set({
    latinDanceOrder: get(latinOrder),
    standardDanceOrder: get(standardOrder),
  })
  if (!r.success) {
    console.warn('Could not persist dance sidebar order', r.error)
  }
}

export const danceOrderActions = {
  /** Drop `draggedId` so it appears immediately before `beforeId` in that style’s list. */
  reorderInsertBefore(style: DanceStyle, draggedId: DanceId, beforeId: DanceId): void {
    const store = style === 'latin' ? latinOrder : standardOrder
    store.update((order) => insertDanceBefore(order, draggedId, beforeId))
    void persistOrders()
  },
}
