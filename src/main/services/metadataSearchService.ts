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

/** Lowercase, strip accents, keep letters/digits for fuzzy matching. */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Higher = closer to the user’s search string (Apple + Spotify hits ranked together). */
function relevanceScore(query: string, hit: MetadataSearchHit): number {
  const q = normalizeForMatch(query)
  if (!q) return 0

  const title = normalizeForMatch(hit.title)
  const artist = normalizeForMatch(hit.artist)
  const album = normalizeForMatch(hit.album ?? '')
  const artistTitle = `${artist} ${title}`.replace(/\s+/g, ' ').trim()
  const titleArtist = `${title} ${artist}`.replace(/\s+/g, ' ').trim()
  const combined = `${artistTitle} ${album}`.replace(/\s+/g, ' ').trim()
  const qTokens = q.split(' ').filter((t) => t.length > 0)
  const meaningful = [...new Set(qTokens.filter((t) => t.length >= 2))]

  let score = 0

  if (combined === q) score += 10_000
  if (artistTitle === q) score += 9_500
  if (titleArtist === q) score += 9_500
  if (title === q) score += 9_000

  // User often types "Title … Artist"; combined is "Artist Title …" — full string rarely matches.
  if (title.length >= 6 && q.includes(title)) score += 4_500
  if (artist.length >= 4 && q.includes(artist)) score += 2_200
  if (q.length >= 6 && title.includes(q)) score += 3_800

  if (q.length >= 3 && combined.includes(q)) score += 2_200
  if (q.length >= 3 && title.includes(q)) score += 2_000
  if (q.length >= 3 && artistTitle.includes(q)) score += 1_800
  if (q.length >= 3 && titleArtist.includes(q)) score += 1_800

  if (combined.includes(q)) score += 1_200
  if (q.includes(combined) && combined.length >= 4) score += 800

  if (meaningful.length > 0 && meaningful.every((t) => combined.includes(t))) {
    score += 500 + 45 * meaningful.length
  }

  for (const t of meaningful) {
    if (title.includes(t)) score += 140
    if (artist.includes(t)) score += 110
    if (album.includes(t)) score += 45
  }

  const first = meaningful[0] ?? qTokens[0] ?? ''
  if (first.length >= 2) {
    if (title.startsWith(first)) score += 350
    if (artist.startsWith(first)) score += 220
  }

  return score
}

const APPLE_SOURCE_LABEL = 'Apple Music catalog'
const SPOTIFY_SOURCE_LABEL = 'Spotify catalog'

type ScoredHit = {
  h: MetadataSearchHit
  score: number
  tie: string
}

function scoreHitsForBalance(query: string, hits: MetadataSearchHit[]): ScoredHit[] {
  const arr = hits.map((h, index) => ({
    h,
    score: relevanceScore(query, h),
    tie: `${normKeyPart(h.artist)}\t${normKeyPart(h.title)}\t${String(index).padStart(3, '0')}`,
  }))
  arr.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.tie.localeCompare(b.tie)
  })
  return arr
}

/**
 * Aim for ~half Apple / half Spotify (by count), then backfill from whichever catalog has
 * higher next relevance until `maxTotal` or both are exhausted. Final order is by relevance again.
 */
function balanceHitsBySourceAndRelevance(
  query: string,
  appleHits: MetadataSearchHit[],
  spotifyHits: MetadataSearchHit[],
  maxTotal: number,
): MetadataSearchHit[] {
  if (maxTotal <= 0) return []

  const aList = scoreHitsForBalance(query, appleHits)
  const sList = scoreHitsForBalance(query, spotifyHits)

  const half = Math.floor(maxTotal / 2)
  let takeA = Math.min(half, aList.length)
  let takeS = Math.min(half, sList.length)
  let rem = maxTotal - takeA - takeS

  while (rem > 0) {
    const canA = takeA < aList.length
    const canS = takeS < sList.length
    if (!canA && !canS) break
    if (!canA) {
      takeS++
      rem--
      continue
    }
    if (!canS) {
      takeA++
      rem--
      continue
    }
    if (aList[takeA].score >= sList[takeS].score) takeA++
    else takeS++
    rem--
  }

  const picked = [
    ...aList.slice(0, takeA).map((x) => x.h),
    ...sList.slice(0, takeS).map((x) => x.h),
  ]
  return sortHitsByRelevance(query, picked)
}

/**
 * Reorder hits by relevance only — no artist/title dedupe.
 * Same track from Apple and Spotify stays as two rows when both APIs return it.
 */
function sortHitsByRelevance(query: string, hits: MetadataSearchHit[]): MetadataSearchHit[] {
  const scored = hits.map((h, index) => ({
    h,
    score: relevanceScore(query, h),
    /** Stable ordering when scores tie: catalog name, then artist/title, then original index. */
    tie: `${h.sourceLabel}\t${normKeyPart(h.artist)}\t${normKeyPart(h.title)}\t${String(index).padStart(3, '0')}`,
  }))
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.tie.localeCompare(b.tie)
  })
  return scored.map((x) => x.h)
}

/** Large enough to fill the merged list when Spotify returns nothing (iTunes allows up to 200). */
const ITUNES_SEARCH_LIMIT = 50

async function searchItunesCatalog(term: string): Promise<MetadataSearchHit[]> {
  const params = new URLSearchParams({
    term,
    media: 'music',
    entity: 'song',
    limit: String(ITUNES_SEARCH_LIMIT),
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
  return rows.slice(0, ITUNES_SEARCH_LIMIT).map((r) => {
    const hiArt = r.artworkUrl100
      ? r.artworkUrl100.replace(/100x100bb/g, '600x600bb')
      : ''
    return {
      title: r.trackName ?? 'Unknown title',
      artist: r.artistName ?? 'Unknown artist',
      album: r.collectionName,
      artworkUrl: hiArt,
      sourceLabel: APPLE_SOURCE_LABEL,
    }
  })
}

/** Spotify Search API allows at most 10 items per request (see Web API Search for Item). */
const SPOTIFY_SEARCH_PAGE_LIMIT = 10
/** At most five search pages (50 tracks) — keeps API usage predictable. */
const SPOTIFY_SEARCH_PAGE_COUNT = 5
/** Merged catalog list cap (same as Spotify fetch ceiling: 5 × 10). */
const METADATA_MAX_RESULTS = SPOTIFY_SEARCH_PAGE_LIMIT * SPOTIFY_SEARCH_PAGE_COUNT

/**
 * Client-credentials search has no user market; Spotify needs an ISO 3166-1 alpha-2 market
 * so results are considered available. Override with env e.g. GB, DE.
 */
function spotifySearchMarket(): string {
  const m = process.env.SPOTIFY_MARKET?.trim()
  if (m && /^[A-Za-z]{2}$/.test(m)) return m.toUpperCase()
  return 'US'
}

function stripAsciiControlChars(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    out += c < 32 || c === 127 ? ' ' : ch
  }
  return out
}

/** Avoid control chars / odd whitespace that can upset the search `q` parameter. */
function sanitizeSpotifyQuery(term: string): string {
  const withoutUrl = stripSpotifyTrackUrlsForSearch(term)
  return stripAsciiControlChars(withoutUrl)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

/**
 * Spotify `q` max length is generous; strip embedded track URLs so the text search isn’t polluted.
 */
function stripSpotifyTrackUrlsForSearch(term: string): string {
  return term
    .replace(/https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/[a-zA-Z0-9]+(?:\?[^\s]*)?/gi, ' ')
    .replace(/spotify:track:[a-zA-Z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `open.spotify.com/track/{id}`, optional intl- segment, or `spotify:track:{id}` */
export function parseSpotifyTrackIdFromQuery(text: string): string | null {
  const uri = text.match(/spotify:track:([a-zA-Z0-9]+)/i)
  if (uri?.[1]) return uri[1]
  const web = text.match(
    /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]+)/i,
  )
  if (web?.[1]) return web[1]
  return null
}

interface SpotifySingleTrackResponse {
  id?: string
  name?: string
  artists?: Array<{ name?: string }>
  album?: { name?: string; images?: Array<{ url?: string }> }
}

async function fetchSpotifyTrackById(
  trackId: string,
  accessToken: string,
): Promise<MetadataSearchHit | null> {
  const params = new URLSearchParams({ market: spotifySearchMarket() })
  const url = `https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}?${params.toString()}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'StepifyDesktop/1.0',
    },
  })
  if (res.status === 404) return null
  if (res.status === 401) {
    throw Object.assign(new Error('Spotify unauthorized'), { code: 'SPOTIFY_401' })
  }
  if (!res.ok) {
    const txt = await res.text()
    console.warn('[metadata] Spotify track by id failed:', res.status, txt.slice(0, 200))
    return null
  }
  const json = (await res.json()) as SpotifySingleTrackResponse
  if (!json.id || !json.name) return null
  return mapSpotifyTrackToHit(json as SpotifyTrackItem)
}

type SpotifyTrackItem = NonNullable<
  NonNullable<SpotifySearchResponse['tracks']>['items']
>[number]

function mapSpotifyTrackToHit(item: SpotifyTrackItem): MetadataSearchHit {
  const artists =
    item.artists?.map((a) => a.name).filter((n): n is string => Boolean(n?.trim())) ?? []
  const artist = artists.length ? artists.join(', ') : 'Unknown artist'
  const img = item.album?.images?.[0]
  return {
    title: item.name?.trim() || 'Unknown title',
    artist,
    album: item.album?.name?.trim() || undefined,
    artworkUrl: img?.url?.trim() ?? '',
    sourceLabel: SPOTIFY_SOURCE_LABEL,
  }
}

/**
 * Uses `GET /v1/search` with free-text `q` (Spotify’s own relevance, not substring/contains).
 * We page with limit=10 because the API rejects limit above 10.
 */
async function fetchSpotifySearchPage(
  q: string,
  accessToken: string,
  offset: number,
): Promise<MetadataSearchHit[]> {
  const params = new URLSearchParams({
    q,
    type: 'track',
    limit: String(SPOTIFY_SEARCH_PAGE_LIMIT),
    offset: String(offset),
    market: spotifySearchMarket(),
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
    const txt = await res.text()
    throw new Error(`Spotify search failed (${res.status}): ${txt.slice(0, 400)}`)
  }
  const json = (await res.json()) as SpotifySearchResponse
  const items = json.tracks?.items ?? []
  return items.map(mapSpotifyTrackToHit)
}

function spotifyHitDedupeKey(h: MetadataSearchHit): string {
  return `${normKeyPart(h.artist)}\t${normKeyPart(h.title)}`
}

async function searchSpotifyCatalogOnce(
  term: string,
  accessToken: string,
): Promise<MetadataSearchHit[]> {
  const q = sanitizeSpotifyQuery(term)
  if (!q) return []

  const out: MetadataSearchHit[] = []
  for (let page = 0; page < SPOTIFY_SEARCH_PAGE_COUNT; page++) {
    const offset = page * SPOTIFY_SEARCH_PAGE_LIMIT
    const hits = await fetchSpotifySearchPage(q, accessToken, offset)
    out.push(...hits)
    if (hits.length < SPOTIFY_SEARCH_PAGE_LIMIT) break
  }
  return out
}

async function searchSpotifyCatalog(
  term: string,
  creds: { clientId: string; clientSecret: string },
): Promise<{ hits: MetadataSearchHit[]; directFromUrl: MetadataSearchHit | null }> {
  const run = async (
    accessToken: string,
  ): Promise<{ hits: MetadataSearchHit[]; directFromUrl: MetadataSearchHit | null }> => {
    const trackId = parseSpotifyTrackIdFromQuery(term)
    let direct: MetadataSearchHit | null = null
    if (trackId) {
      direct = await fetchSpotifyTrackById(trackId, accessToken)
    }
    const searched = await searchSpotifyCatalogOnce(term, accessToken)
    if (!direct) return { hits: searched, directFromUrl: null }
    const k = spotifyHitDedupeKey(direct)
    return {
      hits: searched.filter((h) => spotifyHitDedupeKey(h) !== k),
      directFromUrl: direct,
    }
  }

  let token = await getSpotifyAppAccessToken(creds.clientId, creds.clientSecret)
  try {
    return await run(token)
  } catch (e) {
    if (e && typeof e === 'object' && (e as { code?: string }).code === 'SPOTIFY_401') {
      invalidateSpotifyTokenCache()
      token = await getSpotifyAppAccessToken(creds.clientId, creds.clientSecret)
      return await run(token)
    }
    throw e
  }
}

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
  let spotifyDirect: MetadataSearchHit | null = null
  try {
    const creds = resolveSpotifyAppCredentials()
    if (creds) {
      const { hits, directFromUrl } = await searchSpotifyCatalog(term, creds)
      spotify = hits
      spotifyDirect = directFromUrl
    }
  } catch (e) {
    console.warn('[metadata] Spotify catalog search skipped or failed:', e)
  }

  const cap = spotifyDirect ? METADATA_MAX_RESULTS - 1 : METADATA_MAX_RESULTS
  const merged = balanceHitsBySourceAndRelevance(term, itunes, spotify, cap)
  if (!spotifyDirect) return merged
  const k = spotifyHitDedupeKey(spotifyDirect)
  const rest = merged.filter(
    (h) => !(h.sourceLabel === SPOTIFY_SOURCE_LABEL && spotifyHitDedupeKey(h) === k),
  )
  return [spotifyDirect, ...rest]
}
