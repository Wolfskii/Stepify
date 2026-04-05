<script lang="ts">
import { onMount } from 'svelte'
import AppShell from './components/layout/AppShell.svelte'
import { libraryActions } from './stores/library.store'
import { initDanceOrdersFromSettings } from './stores/danceOrder.store'
import { spotifyService } from './services/spotifyService'
import { playerActions } from './stores/player.store'
import { audioEngine } from './services/audioEngine'
import type { BpmFromFilePayload } from './services/audioEngine'

onMount(async () => {
  // Load persisted library on startup
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
  }

  // Check Spotify auth state
  await spotifyService.checkAuthStatus()

  // Register IPC scan progress / complete listeners
  window.electronAPI.library.onScanProgress((progress) => {
    libraryActions.setScanning(true)
    libraryActions.setScanProgress(progress)
  })

  // Global keyboard shortcuts
  window.addEventListener('keydown', handleGlobalKey)

  const unsubBpm = audioEngine.on<BpmFromFilePayload>('bpmFromFile', (payload) => {
    playerActions.mergeCurrentTrackBpm(payload.bpm, payload.trackId)
  })

  return () => {
    window.removeEventListener('keydown', handleGlobalKey)
    unsubBpm()
    audioEngine.destroy()
  }
})

function handleGlobalKey(e: KeyboardEvent) {
  // Don't intercept when an input/textarea is focused
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return

  if (e.code === 'Space') {
    e.preventDefault()
    const playing = audioEngine.isPlaying
    if (playing) {
      audioEngine.pause()
      playerActions.pause()
    } else {
      audioEngine.play()
      playerActions.play()
    }
  }
}
</script>

<AppShell />
