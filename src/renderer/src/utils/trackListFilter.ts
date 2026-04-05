import type { DanceId, Track } from '@shared/types'

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

export function sortTracksByPopularity(
  tracks: Track[],
  listDefer?: Record<string, number> | null,
): Track[] {
  return [...tracks].sort((a, b) => {
    const sa = listPopularityForSort(a, listDefer)
    const sb = listPopularityForSort(b, listDefer)
    if (sb !== sa) return sb - sa
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  })
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
