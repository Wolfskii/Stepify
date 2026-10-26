<script lang="ts">
import { onMount } from 'svelte'
import AppShell from './components/layout/AppShell.svelte'
import TitleBar from './components/layout/TitleBar.svelte'
import { libraryActions } from './stores/library.store'
import { initDanceOrdersFromSettings } from './stores/danceOrder.store'
import { finalsActions } from './stores/finals.store'
import { spotifyService } from './services/spotifyService'
import { playerActions } from './stores/player.store'
import { audioEngine } from './services/audioEngine'
import type { BpmFromFilePayload } from './services/audioEngine'

// onMount ignores a cleanup returned from an async callback, so subscriptions are registered
// synchronously here and the async startup work runs separately.
onMount(() => {
  window.addEventListener('keydown', handleGlobalKey)

  const unsubscribers = [
    window.electronAPI.library.onScanProgress((progress) => {
      libraryActions.setScanning(true)
      libraryActions.setScanProgress(progress)
    }),
    window.electronAPI.library.onScanComplete((payload) => {
      void libraryActions.applyDiskSyncFromMain(payload, 'file-watcher')
    }),
    audioEngine.on<BpmFromFilePayload>('bpmFromFile', (payload) => {
      playerActions.mergeCurrentTrackBpm(payload.bpm, payload.trackId)
    }),
  ]

  void loadInitialState()

  return () => {
    window.removeEventListener('keydown', handleGlobalKey)
    for (const unsubscribe of unsubscribers) unsubscribe()
    audioEngine.destroy()
  }
})

async function loadInitialState() {
  const tracksResult = await window.electronAPI.library.getTracks()
  if (tracksResult.success && tracksResult.data) {
    libraryActions.setTracks(tracksResult.data)
  }

  const dirsResult = await window.electronAPI.library.getDirectories()
  if (dirsResult.success && dirsResult.data) {
    libraryActions.setLibraryDirectories(dirsResult.data)
  }

  const settingsResult = await window.electronAPI.settings.get()
  if (settingsResult.success && settingsResult.data) {
    initDanceOrdersFromSettings(settingsResult.data)
    finalsActions.hydrateFromSettings(settingsResult.data.finalsSessions)
  }

  // Re-scan configured folders for files added while the app was closed (or missed).
  if (dirsResult.success && dirsResult.data && dirsResult.data.length > 0) {
    libraryActions.setScanning(true)
    try {
      const sync = await window.electronAPI.library.rescan()
      if (sync.success && sync.data) {
        await libraryActions.applyDiskSyncFromMain(sync.data, 'startup')
      }
    } finally {
      libraryActions.setScanning(false)
      libraryActions.setScanProgress(null)
    }
  }

  // Check Spotify auth state
  await spotifyService.checkAuthStatus()
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function handleGlobalKey(e: KeyboardEvent) {
  if (isTextEntryTarget(e.target)) return
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault()
    void playerActions.togglePlayback()
  }
}
</script>

<div class="app-frame">
  <TitleBar />
  <div class="app-frame__body">
    <AppShell />
  </div>
</div>

<style>
  .app-frame {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .app-frame__body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
