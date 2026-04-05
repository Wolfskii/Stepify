import type { MetadataSearchHit } from '../../shared/types'

interface ItunesSongResult {
  trackName?: string
  artistName?: string
  collectionName?: string
  artworkUrl100?: string
}

interface ItunesSearchResponse {
  results?: ItunesSongResult[]
}

/**
 * Search Apple’s public iTunes catalog (no API key). Results are suggestions only.
 */
export async function searchTrackMetadataOnline(query: string): Promise<MetadataSearchHit[]> {
  const term = query.trim().slice(0, 200)
  if (!term) return []

  /** Up to 25 songs → UI paginates 5 per page × 5 pages */
  const params = new URLSearchParams({
    term,
    media: 'music',
    entity: 'song',
    limit: '25',
  })

  const url = `https://itunes.apple.com/search?${params.toString()}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'StepifyDesktop/1.0' },
  })
  if (!res.ok) {
    throw new Error(`Metadata search failed (${res.status})`)
  }

  const json = (await res.json()) as ItunesSearchResponse
  const rows = json.results ?? []

  return rows.slice(0, 25).map((r) => {
    const hiArt = r.artworkUrl100
      ? r.artworkUrl100.replace(/100x100bb/g, '600x600bb')
      : ''
    return {
      title: r.trackName ?? 'Unknown title',
      artist: r.artistName ?? 'Unknown artist',
      album: r.collectionName,
      artworkUrl: hiArt,
      sourceLabel: 'Apple Music catalog',
    }
  })
}
