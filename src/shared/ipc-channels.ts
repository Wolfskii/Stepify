/**
 * Typed IPC channel registry.
 *
 * All IPC communication between the main and renderer processes must use
 * these channel constants. This ensures compile-time safety and avoids
 * string typos scattered across the codebase.
 */

// ─── Library Channels ─────────────────────────────────────────────────────────

export const IPC_LIBRARY = {
  /** Add a local directory to the music library */
  ADD_DIRECTORY: 'library:add-directory',
  /** Add one or more directories by absolute path (e.g. OS drag-and-drop) */
  ADD_DIRECTORY_PATHS: 'library:add-directory-paths',
  /** Remove a directory from the library and all tracks whose files lived under it */
  REMOVE_DIRECTORY: 'library:remove-directory',
  /** Remove a single local track from the library store */
  REMOVE_TRACK: 'library:remove-track',
  /** Get all known library directories */
  GET_DIRECTORIES: 'library:get-directories',
  /** Set or clear default dance for a library folder (new scans + UI). */
  SET_FOLDER_DEFAULT_DANCE: 'library:set-folder-default-dance',
  /** Get all tracks (optionally filtered by dance) */
  GET_TRACKS: 'library:get-tracks',
  /** Assign a track to one or more dance categories */
  ASSIGN_DANCE: 'library:assign-dance',
  /** Remove a dance assignment from a track */
  UNASSIGN_DANCE: 'library:unassign-dance',
  /** Trigger a rescan of all library directories */
  RESCAN: 'library:rescan',
  /** Emitted by main when a scan completes */
  SCAN_COMPLETE: 'library:scan-complete',
  /** Emitted by main during scanning with progress */
  SCAN_PROGRESS: 'library:scan-progress',
  /**
   * Write detected BPM into the audio file tags and persist on the library track.
   * Used when no BPM was present in metadata and analysis produced a value.
   */
  SAVE_DETECTED_BPM: 'library:save-detected-bpm',
  /** Persist BPM on library track only (no file write), e.g. when format cannot embed TBPM */
  SET_TRACK_BPM: 'library:set-track-bpm',
  /** Remove stored BPM from the library track (does not strip file tags) */
  CLEAR_TRACK_BPM: 'library:clear-track-bpm',
  /** Search online catalogs for title/artist/art matches */
  SEARCH_TRACK_METADATA: 'library:search-track-metadata',
  /** Apply title/artist/album/cover to a track (and embed tags for MP3/FLAC when possible) */
  UPDATE_TRACK_METADATA: 'library:update-track-metadata',
  /** Open a registered library root in the system file manager (Explorer / Finder / etc.) */
  OPEN_LIBRARY_FOLDER: 'library:open-library-folder',
  /** Like (+1) or dislike (-1); main enforces a per-track cooldown between votes */
  ADJUST_TRACK_POPULARITY: 'library:adjust-track-popularity',
} as const

// ─── Audio Channels ───────────────────────────────────────────────────────────

export const IPC_AUDIO = {
  /** Read a local audio file and return an ArrayBuffer for the renderer */
  READ_FILE: 'audio:read-file',
  /** Get metadata (BPM, duration, etc.) for a file */
  GET_METADATA: 'audio:get-metadata',
} as const

// ─── Spotify Channels ─────────────────────────────────────────────────────────

export const IPC_SPOTIFY = {
  /** Start the OAuth PKCE login flow (opens browser) */
  LOGIN: 'spotify:login',
  /** Called by the main process after redirect callback is captured */
  LOGIN_COMPLETE: 'spotify:login-complete',
  /** Log out and clear tokens */
  LOGOUT: 'spotify:logout',
  /** Check if user is currently authenticated */
  GET_AUTH_STATUS: 'spotify:get-auth-status',
  /** Search Spotify tracks */
  SEARCH: 'spotify:search',
  /** Get a Spotify access token (refreshed if needed) */
  GET_TOKEN: 'spotify:get-token',
} as const

// ─── Settings Channels ────────────────────────────────────────────────────────

export const IPC_SETTINGS = {
  GET: 'settings:get',
  SET: 'settings:set',
  RESET: 'settings:reset',
} as const

// ─── Window Channels ──────────────────────────────────────────────────────────

export const IPC_WINDOW = {
  MINIMIZE: 'window:minimize',
  MAXIMIZE: 'window:maximize',
  CLOSE: 'window:close',
  TOGGLE_FULLSCREEN: 'window:toggle-fullscreen',
  GET_MAXIMIZED: 'window:get-maximized',
  /** Main → renderer when maximize / unmaximize / fullscreen changes */
  MAXIMIZED_CHANGED: 'window:maximized-changed',
} as const
