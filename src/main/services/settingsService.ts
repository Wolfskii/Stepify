import Store from 'electron-store'
import type { AppSettings, LibraryDirectory } from '../../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  libraryDirectories: [],
  defaultVolume: 0.8,
  theme: 'dark',
  spotifyClientId: undefined,
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
      latinDanceOrder: store.get('latinDanceOrder'),
      standardDanceOrder: store.get('standardDanceOrder'),
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
}
