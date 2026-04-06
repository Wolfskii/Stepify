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
  /**
   * Like/dislike popularity (likes add, dislikes subtract). Used for default list order and shuffle weighting.
   */
  popularityScore?: number
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

/** Column sort for the library track list (All Tracks, folder, or dance filter). */
/** `none` = custom row order (manual reorder or shuffle); no column-sort carets. */
export type TrackListSortKey = 'popularity' | 'bpm' | 'duration' | 'title' | 'dance' | 'none'

export interface TrackListSort {
  key: TrackListSortKey
  direction: 'asc' | 'desc'
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

/** One entry in the player queue: a library track (optional segment cap) or a timed break. */
export type PlaybackQueueItem =
  | { kind: 'track'; track: Track; capSec: number | null }
  | { kind: 'break'; seconds: number; label?: string }

export interface PlaybackState {
  track: Track | null
  isPlaying: boolean
  /**
   * Timeline position: for tracks, seconds in the source file (0 … sourceDuration).
   * For breaks, wall-clock elapsed seconds (tempo does not apply).
   */
  currentTime: number
  /** Playback rate: 1.0 = normal speed, 0.9 = -10%, 1.1 = +10% */
  tempo: number
  /** Volume 0.0 – 1.0 (slider level; output is 0 when muted) */
  volume: number
  /** When true, gain is forced to 0; volume stores the pre-mute level for the slider */
  muted: boolean
  /** Ordered playback segments (tracks + breaks). */
  queue: PlaybackQueueItem[]
  /** Index of the current segment in `queue` */
  queueIndex: number
  /**
   * For tracks: decoded / metadata file length in seconds.
   * For breaks: break length in seconds (wall clock).
   */
  sourceDuration: number
  /**
   * When true, follow `queue` order; order is built when shuffle is turned on (random with mild popularity bias).
   */
  shuffle: boolean
  /** Loop: off, whole queue, or current track (applies to track segments only) */
  repeatMode: RepeatMode
  /**
   * Sidebar dance filter when the queue was started from the track list.
   * `null` = not started from a dance-only list. Row “now playing” styling matches
   * when this aligns with the active list filter (`selectedDanceId` / folder view).
   */
  playbackListDanceId: DanceId | null
  /**
   * Library folder path when the queue was started from a folder-scoped list.
   * `null` = All Tracks or a dance filter. Mutually exclusive with `playbackListDanceId`.
   */
  playbackListFolderPath: string | null
  /**
   * When set, queue was started from this saved finals session (sidebar + list highlighting).
   */
  playbackFinalsSessionId: string | null
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

/** One competition-style final block (discipline + dances + timing). */
export interface FinalRoundConfig {
  discipline: DanceStyle
  /** Subset of the five dances for `discipline`, competition order preserved. */
  danceIds: DanceId[]
  /** Target segment length per dance (seconds): library picks tracks at least this long; playback shows/plays only this much. */
  danceDurationSec: number
  breakDurationSec: number
}

/** Sidebar → Finals flow: null = panel closed (library list). */
export type FinalsFlow = null | 'count' | 'configure' | 'list'

/** One saved finals run (persisted in app settings). */
export interface FinalsPersistedSession {
  id: string
  /** e.g. Final 1 */
  label: string
  finalsCount: number
  /** Time block after each final except the last (seconds). */
  gapBetweenFinalsSec: number
  configureIndex: number
  rounds: FinalRoundConfig[]
  playlist: FinalsPlaylistRow[]
  panelFlow: 'count' | 'configure' | 'list'
}

/** Persisted JSON may omit `gapBetweenFinalsSec` (older saves); hydrate normalizes to {@link FinalsPersistedSession}. */
export type FinalsPersistedSessionSnapshot = Omit<FinalsPersistedSession, 'gapBetweenFinalsSec'> & {
  gapBetweenFinalsSec?: number
}

/** Built finals run: songs + pauses between dances within each final, and pauses between finals. */
export type FinalsPlaylistRow =
  | {
      kind: 'track'
      trackId: string | null
      danceId: DanceId
      finalIndex: number
      /** Seconds to display and play from the start (≤ file length). */
      playDurationSec: number
      emptyReason?: string
    }
  | {
      kind: 'pause'
      seconds: number
      finalIndex: number
      /** Now-playing label; omit for default “Break”. */
      label?: string
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
  /** Saved finals runs; removed only via sidebar delete. */
  finalsSessions?: FinalsPersistedSessionSnapshot[]
}
