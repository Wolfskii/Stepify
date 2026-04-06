import Store from 'electron-store'
import type { AppSettings, DanceId, LibraryDirectory } from '../../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  libraryDirectories: [],
  defaultVolume: 0.8,
  theme: 'dark',
  spotifyClientId: undefined,
  spotifyClientSecret: undefined,
}

// electron-store provides a typed, persistent JSON store backed by the OS
// app data directory. No database setup required.
const store = new Store<AppSettings>({
  name: 'settings',
  defaults: DEFAULT_SETTINGS,
})

export const settingsService = {
  get(): AppSettings {
    return {
      libraryDirectories: store.get('libraryDirectories', []),
      defaultVolume: store.get('defaultVolume', 0.8),
      theme: store.get('theme', 'dark'),
      spotifyClientId: store.get('spotifyClientId'),
      spotifyClientSecret: store.get('spotifyClientSecret'),
      latinDanceOrder: store.get('latinDanceOrder'),
      standardDanceOrder: store.get('standardDanceOrder'),
      finalsSessions: store.get('finalsSessions'),
    }
  },

  set(partial: Partial<AppSettings>): void {
    for (const [key, value] of Object.entries(partial)) {
      store.set(key, value)
    }
  },

  reset(): void {
    store.clear()
  },

  getLibraryDirectories(): LibraryDirectory[] {
    return store.get('libraryDirectories', [])
  },

  addLibraryDirectory(dir: LibraryDirectory): void {
    const dirs = this.getLibraryDirectories()
    if (!dirs.find((d) => d.path === dir.path)) {
      store.set('libraryDirectories', [...dirs, dir])
    }
  },

  removeLibraryDirectory(path: string): void {
    const dirs = this.getLibraryDirectories().filter((d) => d.path !== path)
    store.set('libraryDirectories', dirs)
  },

  /** Persist default dance for a folder, or clear it when `danceId` is null. */
  setLibraryFolderDefaultDance(dirPath: string, danceId: DanceId | null): boolean {
    const dirs = this.getLibraryDirectories()
    const idx = dirs.findIndex((d) => d.path === dirPath)
    if (idx < 0) return false
    const next = dirs.map((d, i) => {
      if (i !== idx) return d
      if (danceId == null) {
        return {
          path: d.path,
          dateAdded: d.dateAdded,
          trackCount: d.trackCount,
        }
      }
      return { ...d, defaultDanceId: danceId }
    })
    store.set('libraryDirectories', next)
    return true
  },
}
