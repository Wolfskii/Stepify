import { DANCE_CATEGORIES_BY_ID } from '@shared/constants'
import type { DanceId } from '@shared/types'

/** Neutral slate when the folder has no default dance — still reads as a “folder” accent. */
export const FOLDER_BADGE_FALLBACK_COLOR = '#73869c'

export function folderBadgeColor(defaultDanceId: DanceId | undefined): string {
  if (!defaultDanceId) return FOLDER_BADGE_FALLBACK_COLOR
  return DANCE_CATEGORIES_BY_ID[defaultDanceId]?.color ?? FOLDER_BADGE_FALLBACK_COLOR
}
