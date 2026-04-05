import { Buffer } from 'node:buffer'
import type { MetadataSearchHit } from '../../shared/types'
import { settingsService } from './settingsService'

interface ItunesSongResult {
  trackName?: string
  artistName?: string
  collectionName?: string
  artworkUrl100?: string
}

interface ItunesSearchResponse {
  results?: ItunesSongResult[]
}

interface SpotifySearchResponse {
  tracks?: {
    items?: Array<{
      name?: string
      artists?: Array<{ name?: string }>
      album?: { name?: string; images?: Array<{ url?: string; height?: number }> }
    }>
  }
}

interface SpotifyTokenResponse {
  access_token: string
  expires_in: number
}

/**
 * App-only Spotify credentials (Client Credentials flow). No end-user login or Premium is
 * required for catalog search — only a Spotify Developer app (Client ID + Client Secret).
 * Prefer env vars at build/pack time for shipping; settings store is optional for local dev.
 */
function resolveSpotifyAppCredentials(): { clientId: string; clientSecret: string } | null {
  const id =
    process.env.SPOTIFY_CLIENT_ID?.trim() || settingsService.get().spotifyClientId?.trim()
  const secret =
    process.env.SPOTIFY_CLIENT_SECRET?.trim() || settingsService.get().spotifyClientSecret?.trim()
  if (!id || !secret) return null
  return { clientId: id, clientSecret: secret }
}

let spotifyTokenCache: { token: string; expiresAtMs: number; forClientId: string } | null = null

async function getSpotifyAppAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now()
  if (
    spotifyTokenCache &&
    spotifyTokenCache.forClientId === clientId &&
    now < spotifyTokenCache.expiresAtMs - 60_000
  ) {
    return spotifyTokenCache.token
  }

  const body = new URLSearchParams({ grant_type: 'client_credentials' })
  const basic = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Spotify token failed (${res.status}): ${t.slice(0, 200)}`)
  }
  const json = (await res.json()) as SpotifyTokenResponse
  if (!json.access_token) throw new Error('Spotify token response missing access_token')
  spotifyTokenCache = {
    token: json.access_token,
    expiresAtMs: now + (json.expires_in ?? 3600) * 1000,
    forClientId: clientId,
  }
  return json.access_token
}

function invalidateSpotifyTokenCache(): void {
  spotifyTokenCache = null
}

function normKeyPart(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

function hitDedupKey(h: MetadataSearchHit): string {
  return `${normKeyPart(h.artist)}|${normKeyPart(h.title)}`
}

function mergeDeduped(
  primary: MetadataSearchHit[],
  secondary: MetadataSearchHit[],
  max: number,
): MetadataSearchHit[] {
  const seen = new Set<string>()
  const out: MetadataSearchHit[] = []
  for (const h of [...primary, ...secondary]) {
    const k = hitDedupKey(h)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(h)
    if (out.length >= max) break
  }
  return out
}

async function searchItunesCatalog(term: string): Promise<MetadataSearchHit[]> {
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
    throw new Error(`iTunes search failed (${res.status})`)
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

async function searchSpotifyCatalogOnce(
  term: string,
  accessToken: string,
): Promise<MetadataSearchHit[]> {
  const params = new URLSearchParams({
    q: term,
    type: 'track',
    limit: '25',
  })
  const url = `https://api.spotify.com/v1/search?${params.toString()}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'StepifyDesktop/1.0',
    },
  })
  if (res.status === 401) {
    throw Object.assign(new Error('Spotify unauthorized'), { code: 'SPOTIFY_401' })
  }
  if (!res.ok) {
    throw new Error(`Spotify search failed (${res.status})`)
  }
  const json = (await res.json()) as SpotifySearchResponse
  const items = json.tracks?.items ?? []
  return items.map((item) => {
    const artists =
      item.artists?.map((a) => a.name).filter((n): n is string => Boolean(n?.trim())) ?? []
    const artist = artists.length ? artists.join(', ') : 'Unknown artist'
    const img = item.album?.images?.[0]
    return {
      title: item.name?.trim() || 'Unknown title',
      artist,
      album: item.album?.name?.trim() || undefined,
      artworkUrl: img?.url?.trim() ?? '',
      sourceLabel: 'Spotify catalog',
    }
  })
}

async function searchSpotifyCatalog(
  term: string,
  creds: { clientId: string; clientSecret: string },
): Promise<MetadataSearchHit[]> {
  let token = await getSpotifyAppAccessToken(creds.clientId, creds.clientSecret)
  try {
    return await searchSpotifyCatalogOnce(term, token)
  } catch (e) {
    if (e && typeof e === 'object' && (e as { code?: string }).code === 'SPOTIFY_401') {
      invalidateSpotifyTokenCache()
      token = await getSpotifyAppAccessToken(creds.clientId, creds.clientSecret)
      return await searchSpotifyCatalogOnce(term, token)
    }
    throw e
  }
}

const MERGED_RESULT_CAP = 25

/**
 * Search public catalogs for track metadata suggestions.
 * - Apple iTunes Search API: no key.
 * - Spotify Web API: optional; uses Client Credentials (app ID + secret). End users never
 *   log in and do not need Premium for this search-only use case.
 */
export async function searchTrackMetadataOnline(query: string): Promise<MetadataSearchHit[]> {
  const term = query.trim().slice(0, 200)
  if (!term) return []

  const itunes = await searchItunesCatalog(term)

  let spotify: MetadataSearchHit[] = []
  try {
    const creds = resolveSpotifyAppCredentials()
    if (creds) {
      spotify = await searchSpotifyCatalog(term, creds)
    }
  } catch (e) {
    console.warn('[metadata] Spotify catalog search skipped or failed:', e)
  }

  return mergeDeduped(itunes, spotify, MERGED_RESULT_CAP)
}
