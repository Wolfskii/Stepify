import type { SpotifyTrackResult } from '@shared/types'
import { derived, writable } from 'svelte/store'

interface SpotifyState {
  isAuthenticated: boolean
  displayName: string | null
  searchQuery: string
  searchResults: SpotifyTrackResult[]
  isSearching: boolean
  isLoggingIn: boolean
  error: string | null
}

const initialState: SpotifyState = {
  isAuthenticated: false,
  displayName: null,
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  isLoggingIn: false,
  error: null,
}

export const spotifyState = writable<SpotifyState>(initialState)

// ─── Derived ──────────────────────────────────────────────────────────────────

export const isSpotifyAuthenticated = derived(spotifyState, ($s) => $s.isAuthenticated)
export const spotifySearchResults = derived(spotifyState, ($s) => $s.searchResults)
export const spotifyDisplayName = derived(spotifyState, ($s) => $s.displayName)

// ─── Actions ──────────────────────────────────────────────────────────────────

export const spotifyActions = {
  setAuthStatus(isAuthenticated: boolean, displayName?: string) {
    spotifyState.update((s) => ({
      ...s,
      isAuthenticated,
      displayName: displayName ?? null,
      error: null,
    }))
  },

  setSearchQuery(query: string) {
    spotifyState.update((s) => ({ ...s, searchQuery: query }))
  },

  setSearchResults(results: SpotifyTrackResult[]) {
    spotifyState.update((s) => ({ ...s, searchResults: results, isSearching: false }))
  },

  setSearching(isSearching: boolean) {
    spotifyState.update((s) => ({ ...s, isSearching }))
  },

  setLoggingIn(isLoggingIn: boolean) {
    spotifyState.update((s) => ({ ...s, isLoggingIn }))
  },

  setError(error: string | null) {
    spotifyState.update((s) => ({ ...s, error }))
  },

  clearSearch() {
    spotifyState.update((s) => ({ ...s, searchQuery: '', searchResults: [] }))
  },

  logout() {
    spotifyState.update((s) => ({
      ...s,
      isAuthenticated: false,
      displayName: null,
      searchResults: [],
      searchQuery: '',
    }))
  },
}
