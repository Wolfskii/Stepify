import type { Track } from '@shared/types'

function fileStem(localPath: string): string {
  const seg = localPath.split(/[/\\]/).pop() ?? ''
  return seg.replace(/\.[^.]+$/, '')
}

const UNKNOWN_ARTIST = 'Unknown Artist'

/** Build a search string from filename + whatever tags exist (for online metadata lookup). */
export function buildMetadataSearchQuery(track: Track): string {
  const stem = track.localPath ? fileStem(track.localPath) : ''
  if (track.missingEmbeddedTitle && track.missingEmbeddedArtist) {
    return stem || `${track.artist} ${track.title}`.trim()
  }
  if (track.missingEmbeddedArtist) {
    return `${track.title} ${stem}`.trim()
  }
  if (track.missingEmbeddedTitle) {
    return `${track.artist} ${stem}`.trim()
  }
  return `${track.artist} ${track.title}`.trim() || stem
}

/**
 * Default text for the metadata modal search box and “Reset to default”: filename (no extension)
 * plus embedded artist when it’s present and not the placeholder.
 */
export function buildDefaultCatalogSearchQuery(track: Track): string {
  const stem = track.localPath ? fileStem(track.localPath) : ''
  const artist =
    track.artist?.trim() && track.artist.trim() !== UNKNOWN_ARTIST ? track.artist.trim() : ''
  if (artist && stem) return `${artist} ${stem}`.trim()
  if (stem) return stem
  if (artist) return artist
  return buildMetadataSearchQuery(track)
}

export function trackNeedsMetadataEnrichment(t: Track): boolean {
  if (t.source !== 'local') return false
  return Boolean(t.missingEmbeddedTitle || t.missingEmbeddedArtist || t.missingEmbeddedArt)
}
