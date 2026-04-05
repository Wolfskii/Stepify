// ─── Dance Domain ─────────────────────────────────────────────────────────────

export type DanceStyle = 'standard' | 'latin'

export type DanceId =
  // Standard
  | 'slow-waltz'
  | 'tango'
  | 'viennese-waltz'
  | 'foxtrot'
  | 'quickstep'
  // Latin
  | 'cha-cha'
  | 'samba'
  | 'rumba'
  | 'paso-doble'
  | 'jive'

export interface DanceCategory {
  id: DanceId
  name: string
  style: DanceStyle
  /** Typical BPM range for competition, e.g. [120, 128] */
  bpmRange: [number, number]
  color: string
}

// ─── Track / Library ──────────────────────────────────────────────────────────

export type TrackSource = 'local' | 'spotify'

export interface Track {
  id: string
  source: TrackSource
  title: string
  artist: string
  album?: string
  /** Duration in seconds */
  duration: number
  /** Detected or user-set BPM */
  bpm?: number
  /**
   * Dance category for this track (at most one).
   * Stored as a single-element array for backward-compatible persistence.
   */
  dances: DanceId[]
  /** Absolute path — only for local tracks */
  localPath?: string
  /** Spotify track ID — only for Spotify tracks */
  spotifyId?: string
  /** Album art: Spotify URL or embedded cover (data URL) for local files when scanned */
  artworkUrl?: string
  /** User-defined tags */
  tags?: string[]
  dateAdded: number
  /** File had no embedded title tag (display title may be the filename). */
  missingEmbeddedTitle?: boolean
  /** File had no embedded artist / performer tag. */
  missingEmbeddedArtist?: boolean
  /** File had no usable embedded cover art. */
  missingEmbeddedArt?: boolean
  /** Last known source file mtime (ms); used to skip re-parsing unchanged files on rescan. */
  fileMtimeMs?: number
}

/** One row from online metadata search (e.g. iTunes). */
export interface MetadataSearchHit {
  title: string
  artist: string
  album?: string
  artworkUrl: string
  sourceLabel: string
}

export interface UpdateTrackMetadataPayload {
  trackId: string
  title: string
  artist: string
  album?: string
  /** Remote artwork URL (main process fetches and embeds when supported) */
  coverImageUrl?: string
  /** data:image/...;base64,... from a user-selected image file */
  coverDataUrl?: string
}

export interface LibraryDirectory {
  path: string
  dateAdded: number
  trackCount: number
  /** New files discovered under this folder get this dance on scan (optional). */
  defaultDanceId?: DanceId
}

/** Result shape for rescan / folder watcher / add-folder scan (renderer + IPC). */
export interface LibraryDiskSyncPayload {
  tracks: Track[]
  newTrackIds: string[]
  removedTrackIds: string[]
  /** Tracks re-read from disk whose list/playback-relevant fields changed. */
  changedTrackIds: string[]
}

/** Same as {@link LibraryDiskSyncPayload} plus paths skipped when adding folders by path (drag-drop). */
export interface AddLibraryPathsResult extends LibraryDiskSyncPayload {
  /** Resolved paths already registered as library roots */
  alreadyAddedPaths: string[]
  /** Paths that were not readable directories (e.g. files or broken symlinks) */
  invalidPaths: string[]
  /** Library roots that were new in this operation and were scanned */
  newlyAddedRootPaths: string[]
}

// ─── Playback ─────────────────────────────────────────────────────────────────

export type RepeatMode = 'off' | 'all' | 'one'

export interface PlaybackState {
  track: Track | null
  isPlaying: boolean
  /** Current position in seconds (timeline in the source file, 0 … sourceDuration) */
  currentTime: number
  /** Playback rate: 1.0 = normal speed, 0.9 = -10%, 1.1 = +10% */
  tempo: number
  /** Volume 0.0 – 1.0 (slider level; output is 0 when muted) */
  volume: number
  /** When true, gain is forced to 0; volume stores the pre-mute level for the slider */
  muted: boolean
  /** Queue of upcoming tracks */
  queue: Track[]
  /** Index of current track in queue */
  queueIndex: number
  /** Source file duration in seconds (from metadata / decoded buffer) */
  sourceDuration: number
  /** Random next track when advancing */
  shuffle: boolean
  /** Loop: off, whole queue, or current track (track applies at end of song) */
  repeatMode: RepeatMode
  /**
   * Sidebar dance filter when the queue was started from the track list.
   * `null` = All Tracks. Row “now playing” styling is shown only when this
   * matches the current list’s filter (see TrackList `selectedDanceId`).
   */
  playbackListDanceId: DanceId | null
}

export interface TempoState {
  /** Playback rate: 1.0 = 100% (no change) */
  rate: number
  /** Displayed as percentage offset: (rate - 1) * 100 */
  percentOffset: number
}

// ─── Practice / Competition Mode ──────────────────────────────────────────────

export interface DanceSlot {
  danceId: DanceId
  /** Duration to play in seconds */
  durationSeconds: number
  /** Tracks to draw from (null = random from category) */
  trackIds?: string[]
}

export interface PracticeSession {
  id: string
  name: string
  slots: DanceSlot[]
  /** Auto-transition between dances */
  autoAdvance: boolean
  /** Gap between dances in seconds */
  transitionGapSeconds: number
}

// ─── Spotify ──────────────────────────────────────────────────────────────────

export interface SpotifyCredentials {
  clientId: string
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export interface SpotifyTrackResult {
  spotifyId: string
  title: string
  artist: string
  album: string
  duration: number
  artworkUrl: string
  previewUrl?: string
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

/** Generic IPC response envelope */
export interface IpcResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface AppSettings {
  libraryDirectories: LibraryDirectory[]
  defaultVolume: number
  theme: 'dark' | 'light'
  spotifyClientId?: string
  /**
   * Spotify Client Secret (same app as Client ID). Used only for app-only “Client Credentials”
   * API access — e.g. merging Spotify into metadata search. Not required for end users to log in.
   */
  spotifyClientSecret?: string
  /** Sidebar order within Latin (subset of Latin `DanceId`s, persisted). */
  latinDanceOrder?: DanceId[]
  /** Sidebar order within Standard (subset of Standard `DanceId`s, persisted). */
  standardDanceOrder?: DanceId[]
}
