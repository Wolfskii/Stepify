import type { DanceId, SpotifyTrackResult, Track } from '@shared/types'
import { libraryActions } from '../stores/library.store'
import { spotifyActions } from '../stores/spotify.store'
import { uiActions } from '../stores/ui.store'

/**
 * Spotify service — renderer-side facade for Spotify operations.
 *
 * All actual Spotify API calls are delegated to the main process via
 * window.electronAPI.spotify.*. This service owns the UX state updates
 * (loading states, error handling, store mutations) so components stay thin.
 *
 * TODO: Integrate the Spotify Web Playback SDK here for in-app playback.
 * The SDK requires a valid Premium account and injects a <script> tag.
 * See docs/spotify-integration.md for the full implementation guide.
 */
export const spotifyService = {
  // ─── Auth ─────────────────────────────────────────────────────────────────

  async login(): Promise<void> {
    spotifyActions.setLoggingIn(true)
    spotifyActions.setError(null)

    try {
      const result = await window.electronAPI.spotify.login()
      if (!result.success) {
        spotifyActions.setError(result.error ?? 'Login failed')
      }
    } catch (err) {
      spotifyActions.setError(String(err))
    } finally {
      spotifyActions.setLoggingIn(false)
    }
  },

  async logout(): Promise<void> {
    await window.electronAPI.spotify.logout()
    spotifyActions.logout()
    uiActions.notify('Logged out from Spotify', 'info')
  },

  async checkAuthStatus(): Promise<void> {
    const result = await window.electronAPI.spotify.getAuthStatus()
    if (result.success && result.data) {
      spotifyActions.setAuthStatus(result.data.isAuthenticated, result.data.displayName)
    }
  },

  // ─── Search ───────────────────────────────────────────────────────────────

  async search(query: string): Promise<void> {
    if (!query.trim()) return
    spotifyActions.setSearching(true)
    spotifyActions.setError(null)

    try {
      const result = await window.electronAPI.spotify.search(query)
      if (result.success && result.data) {
        spotifyActions.setSearchResults(result.data)
      } else {
        spotifyActions.setError(result.error ?? 'Search failed')
        spotifyActions.setSearchResults([])
      }
    } catch (err) {
      spotifyActions.setError(String(err))
    }
  },

  // ─── Add to Library ───────────────────────────────────────────────────────

  addSpotifyTrackToLibrary(spotifyTrack: SpotifyTrackResult, danceId?: DanceId): void {
    const track: Track = {
      id: `spotify-${spotifyTrack.spotifyId}`,
      source: 'spotify',
      title: spotifyTrack.title,
      artist: spotifyTrack.artist,
      album: spotifyTrack.album,
      duration: spotifyTrack.duration,
      spotifyId: spotifyTrack.spotifyId,
      artworkUrl: spotifyTrack.artworkUrl,
      dances: danceId ? [danceId] : [],
      tags: [],
      dateAdded: Date.now(),
    }

    libraryActions.addTracks([track])
    uiActions.notify(`Added "${track.title}" to library`, 'success')
  },

  // ─── Playback (stub) ──────────────────────────────────────────────────────

  /**
   * Initialize the Spotify Web Playback SDK.
   *
   * TODO: Load the Spotify SDK script, create a Player instance,
   * and wire up player state events to the playerStore.
   *
   * Requirements:
   * - Spotify Premium account
   * - Valid access token
   * - Script: https://sdk.scdn.co/spotify-player.js
   */
  async initPlaybackSDK(): Promise<void> {
    console.warn('[Spotify] Web Playback SDK not yet implemented')
    // const token = await window.electronAPI.spotify.getToken()
    // const player = new window.Spotify.Player({ name: 'Stepify', getOAuthToken: cb => cb(token.data!) })
    // player.connect()
  },

  /**
   * Play a Spotify track by URI.
   * TODO: call player.load({ uris: [spotifyUri] }) after SDK init
   */
  async playTrack(_spotifyId: string): Promise<void> {
    console.warn('[Spotify] Playback not yet implemented')
  },
}

// Register the login-complete callback from the main process
window.electronAPI.spotify.onLoginComplete((success: boolean) => {
  if (success) {
    spotifyService.checkAuthStatus()
    uiActions.notify('Connected to Spotify', 'success')
  } else {
    uiActions.notify('Spotify login failed', 'error')
  }
})
