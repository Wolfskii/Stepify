import { DANCE_CATEGORIES_BY_ID } from '@shared/constants'
import type { DanceId, Track, TrackListSort } from '@shared/types'

export function normLibraryPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
}

export function trackFileUnderLibraryFolder(filePath: string, dirPath: string): boolean {
  const f = normLibraryPath(filePath)
  const d = normLibraryPath(dirPath)
  return f === d || f.startsWith(`${d}/`)
}

export function pathsEqualLibrary(a: string | null, b: string | null): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return normLibraryPath(a).toLowerCase() === normLibraryPath(b).toLowerCase()
}

export function filterTracksForListView(
  tracks: Track[],
  opts: { folderPath: string | null; danceId: DanceId | null; searchQuery: string },
): Track[] {
  let out = tracks

  const folderPath = opts.folderPath
  if (folderPath) {
    out = out.filter(
      (t) =>
        t.source === 'local' &&
        Boolean(t.localPath && trackFileUnderLibraryFolder(t.localPath, folderPath)),
    )
  }

  const danceId = opts.danceId
  if (danceId) {
    out = out.filter((t) => t.dances.includes(danceId))
  }

  const q = opts.searchQuery.trim()
  if (q) {
    const ql = q.toLowerCase()
    out = out.filter(
      (t) =>
        t.title.toLowerCase().includes(ql) ||
        t.artist.toLowerCase().includes(ql) ||
        t.album?.toLowerCase().includes(ql),
    )
  }

  return out
}

/** Popularity used for list order / shuffle weights; `listDefer` overrides stored score (e.g. like/dislike while that track is playing). */
export function listPopularityForSort(t: Track, listDefer?: Record<string, number> | null): number {
  const d = listDefer?.[t.id]
  if (d !== undefined) return d
  return t.popularityScore ?? 0
}

export const DEFAULT_TRACK_LIST_SORT: TrackListSort = {
  key: 'popularity',
  direction: 'desc',
}

function tieBreakByTitle(a: Track, b: Track): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
}

function danceNameForSort(t: Track): string {
  const id = t.dances[0]
  return id ? DANCE_CATEGORIES_BY_ID[id].name : ''
}

/**
 * Sort filtered list rows by the active column. `listDefer` applies only when `sort.key === 'popularity'`.
 */
export function sortTracksForListView(
  tracks: Track[],
  sort: TrackListSort,
  listDefer?: Record<string, number> | null,
): Track[] {
  const asc = sort.direction === 'asc'

  return [...tracks].sort((a, b) => {
    let cmp = 0

    switch (sort.key) {
      case 'popularity': {
        cmp = listPopularityForSort(a, listDefer) - listPopularityForSort(b, listDefer)
        break
      }
      case 'bpm': {
        const na = a.bpm != null && a.bpm > 0 ? a.bpm : null
        const nb = b.bpm != null && b.bpm > 0 ? b.bpm : null
        if (na == null && nb == null) cmp = 0
        else if (na == null) cmp = 1
        else if (nb == null) cmp = -1
        else cmp = na - nb
        break
      }
      case 'duration': {
        cmp = a.duration - b.duration
        break
      }
      case 'title': {
        cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
        if (cmp !== 0) return asc ? cmp : -cmp
        return tieBreakByTitle(a, b)
      }
      case 'dance': {
        cmp = danceNameForSort(a).localeCompare(danceNameForSort(b), undefined, {
          sensitivity: 'base',
        })
        if (cmp !== 0) return asc ? cmp : -cmp
        return tieBreakByTitle(a, b)
      }
      default:
        cmp = 0
    }

    if (cmp !== 0) return asc ? cmp : -cmp
    return tieBreakByTitle(a, b)
  })
}

export function sortTracksByPopularity(
  tracks: Track[],
  listDefer?: Record<string, number> | null,
): Track[] {
  return sortTracksForListView(tracks, DEFAULT_TRACK_LIST_SORT, listDefer)
}

/** Higher popularity → tends to appear earlier after shuffle (exponential race / Gumbel trick). */
export function weightedShuffleByPopularity(
  tracks: Track[],
  listDefer?: Record<string, number> | null,
): Track[] {
  const scored = tracks.map((t) => {
    const w = Math.max(0.5, 5 + listPopularityForSort(t, listDefer))
    const key = -Math.log(Math.random()) / w
    return { t, key }
  })
  scored.sort((a, b) => a.key - b.key)
  return scored.map((x) => x.t)
}
