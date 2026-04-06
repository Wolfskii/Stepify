import { DANCE_CATEGORIES, DANCE_CATEGORIES_BY_ID } from '@shared/constants'
import type {
  DanceId,
  DanceStyle,
  FinalsFlow,
  FinalsPersistedSession,
  FinalsPersistedSessionSnapshot,
} from '@shared/types'
import { derived, get, writable } from 'svelte/store'
import { audioEngine } from '../services/audioEngine'
import {
  buildFinalsPlaybackQueue,
  buildFinalsPlaylistRows,
  playbackQueueIndexForPlaylistRow,
  randomizeFinalsTrackPicks,
} from '../utils/finalsPlaylist'
import { libraryActions, libraryState } from './library.store'
import { playerActions, playerState, syncAudioEnginePlaybackCap } from './player.store'
import { uiActions } from './ui.store'

const DEFAULT_GAP_BETWEEN_FINALS_SEC = 60

function normalizeFinalsSession(sess: FinalsPersistedSessionSnapshot): FinalsPersistedSession {
  const gap = sess.gapBetweenFinalsSec
  const gapOk = typeof gap === 'number' && Number.isFinite(gap) && gap >= 0
  return {
    ...sess,
    gapBetweenFinalsSec: gapOk ? gap : DEFAULT_GAP_BETWEEN_FINALS_SEC,
  }
}

interface FinalsUiState {
  sessions: FinalsPersistedSession[]
  activeSessionId: string | null
  finalsNavExpanded: boolean
}

const emptyUi: FinalsUiState = {
  sessions: [],
  activeSessionId: null,
  finalsNavExpanded: false,
}

export const finalsState = writable<FinalsUiState>(emptyUi)

export const finalsFlow = derived(finalsState, ($s): FinalsFlow => {
  if ($s.activeSessionId == null) return null
  const sess = $s.sessions.find((x) => x.id === $s.activeSessionId)
  return sess?.panelFlow ?? null
})

export const activeFinalsSession = derived(finalsState, ($s) => {
  if ($s.activeSessionId == null) return null
  return $s.sessions.find((x) => x.id === $s.activeSessionId) ?? null
})

let persistTimer: ReturnType<typeof setTimeout> | null = null
function schedulePersistFinalsSessions() {
  if (persistTimer != null) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    const sessions = get(finalsState).sessions
    void window.electronAPI.settings.set({ finalsSessions: sessions })
  }, 120)
}

function defaultRound(): FinalsPersistedSession['rounds'][0] {
  const discipline: DanceStyle = 'standard'
  return {
    discipline,
    danceIds: DANCE_CATEGORIES.filter((d) => d.style === discipline).map((d) => d.id),
    danceDurationSec: 105,
    breakDurationSec: 20,
  }
}

function nextFinalLabel(sessions: FinalsPersistedSession[]): string {
  return `Final ${sessions.length + 1}`
}

function updateSession(id: string, patch: Partial<FinalsPersistedSession>) {
  finalsState.update((st) => {
    const sessions = st.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x))
    return { ...st, sessions }
  })
  schedulePersistFinalsSessions()
}

export const finalsActions = {
  hydrateFromSettings(sessions: FinalsPersistedSessionSnapshot[] | undefined) {
    finalsState.update((s) => ({
      ...s,
      sessions: Array.isArray(sessions) ? sessions.map(normalizeFinalsSession) : [],
    }))
  },

  toggleFinalsNavExpanded() {
    finalsState.update((s) => {
      if (s.sessions.length === 0) return s
      return { ...s, finalsNavExpanded: !s.finalsNavExpanded }
    })
  },

  /** Expand Modes → Finals and ensure a session exists (legacy entry). */
  openFromSidebar() {
    finalsState.update((s) => ({ ...s, finalsNavExpanded: true }))
    const st = get(finalsState)
    if (st.sessions.length === 0) {
      finalsActions.createSession()
      return
    }
    finalsActions.openSession(st.sessions[0].id)
  },

  createSession() {
    const id = crypto.randomUUID()
    const sess: FinalsPersistedSession = {
      id,
      label: nextFinalLabel(get(finalsState).sessions),
      finalsCount: 1,
      gapBetweenFinalsSec: DEFAULT_GAP_BETWEEN_FINALS_SEC,
      configureIndex: 0,
      rounds: [],
      playlist: [],
      panelFlow: 'count',
    }
    finalsState.update((s) => ({
      ...s,
      sessions: [...s.sessions, sess],
      activeSessionId: id,
      finalsNavExpanded: true,
    }))
    schedulePersistFinalsSessions()
  },

  openSession(id: string) {
    finalsState.update((s) => ({
      ...s,
      activeSessionId: id,
      finalsNavExpanded: true,
    }))
    libraryActions.selectDance(null)
  },

  closePanel() {
    finalsState.update((s) => ({ ...s, activeSessionId: null }))
  },

  removeSession(id: string) {
    const p = get(playerState)
    if (p.playbackFinalsSessionId === id) {
      audioEngine.stop()
      playerActions.stopAndClearQueue()
    }
    finalsState.update((s) => {
      const sessions = s.sessions.filter((x) => x.id !== id)
      const activeSessionId = s.activeSessionId === id ? null : s.activeSessionId
      return {
        ...s,
        sessions,
        activeSessionId,
        finalsNavExpanded: sessions.length > 0 ? s.finalsNavExpanded : false,
      }
    })
    schedulePersistFinalsSessions()
  },

  cancelToLibrary() {
    finalsActions.closePanel()
  },

  setFinalsCountForActive(n: number) {
    const id = get(finalsState).activeSessionId
    if (!id) return
    const count = Math.max(1, Math.min(20, Math.floor(Number(n)) || 1))
    updateSession(id, { finalsCount: count })
  },

  setGapBetweenFinalsForActive(n: number) {
    const id = get(finalsState).activeSessionId
    if (!id) return
    const sec = Math.max(0, Math.min(600, Math.floor(Number(n)) || 0))
    updateSession(id, { gapBetweenFinalsSec: sec })
  },

  startConfigure() {
    const id = get(finalsState).activeSessionId
    if (!id) return
    const s = get(finalsState)
    const sess = s.sessions.find((x) => x.id === id)
    if (!sess) return
    const rounds = Array.from({ length: sess.finalsCount }, () => defaultRound())
    updateSession(id, { rounds, configureIndex: 0, panelFlow: 'configure' })
  },

  goConfigureRound(index: number) {
    const id = get(finalsState).activeSessionId
    if (!id) return
    const s = get(finalsState)
    const sess = s.sessions.find((x) => x.id === id)
    if (!sess) return
    updateSession(id, {
      configureIndex: Math.max(0, Math.min(sess.rounds.length - 1, index)),
    })
  },

  configurePrev() {
    const id = get(finalsState).activeSessionId
    if (!id) return
    const s = get(finalsState)
    const sess = s.sessions.find((x) => x.id === id)
    if (!sess) return
    if (sess.panelFlow !== 'configure') return
    if (sess.configureIndex <= 0) {
      updateSession(id, { panelFlow: 'count', configureIndex: 0 })
      return
    }
    updateSession(id, { configureIndex: sess.configureIndex - 1 })
  },

  configureNextOrFinish(): boolean {
    const id = get(finalsState).activeSessionId
    if (!id) return false
    const st = get(finalsState)
    const sess = st.sessions.find((x) => x.id === id)
    if (!sess || sess.panelFlow !== 'configure') return false
    const r = sess.rounds[sess.configureIndex]
    if (!r || r.danceIds.length === 0) {
      uiActions.notify('Select at least one dance for this final', 'warning')
      return false
    }
    if (sess.configureIndex < sess.rounds.length - 1) {
      updateSession(id, { configureIndex: sess.configureIndex + 1 })
      return true
    }
    for (const round of sess.rounds) {
      if (round.danceIds.length === 0) {
        uiActions.notify('Each final needs at least one dance', 'warning')
        return false
      }
    }
    const tracks = get(libraryState).tracks
    const playlist = buildFinalsPlaylistRows(sess.rounds, tracks, sess.gapBetweenFinalsSec)
    updateSession(id, { playlist, panelFlow: 'list' })
    return true
  },

  updateRound(index: number, patch: Partial<FinalsPersistedSession['rounds'][0]>) {
    const id = get(finalsState).activeSessionId
    if (!id) return
    const s = get(finalsState)
    const sess = s.sessions.find((x) => x.id === id)
    if (!sess) return
    const rounds = [...sess.rounds]
    if (!rounds[index]) return
    rounds[index] = { ...rounds[index], ...patch }
    updateSession(id, { rounds })
  },

  setRoundDiscipline(index: number, discipline: DanceStyle) {
    const ids = DANCE_CATEGORIES.filter((d) => d.style === discipline).map((d) => d.id)
    finalsActions.updateRound(index, { discipline, danceIds: [...ids] })
  },

  toggleRoundDance(index: number, danceId: DanceId) {
    const id = get(finalsState).activeSessionId
    if (!id) return
    const s = get(finalsState)
    const sess = s.sessions.find((x) => x.id === id)
    if (!sess) return
    const rounds = [...sess.rounds]
    const r = rounds[index]
    const cat = DANCE_CATEGORIES_BY_ID[danceId]
    if (!r || !cat || r.discipline !== cat.style) return
    const set = new Set(r.danceIds)
    if (set.has(danceId)) set.delete(danceId)
    else set.add(danceId)
    const ordered = DANCE_CATEGORIES.filter((d) => d.style === r.discipline && set.has(d.id)).map(
      (d) => d.id,
    )
    rounds[index] = { ...r, danceIds: ordered }
    updateSession(id, { rounds })
  },

  applyTimesToAllFinals(fromIndex: number) {
    const id = get(finalsState).activeSessionId
    if (!id) return
    const s = get(finalsState)
    const sess = s.sessions.find((x) => x.id === id)
    if (!sess) return
    const src = sess.rounds[fromIndex]
    if (!src) return
    const rounds = sess.rounds.map((r, i) =>
      i === fromIndex
        ? r
        : {
            ...r,
            danceDurationSec: src.danceDurationSec,
            breakDurationSec: src.breakDurationSec,
          },
    )
    updateSession(id, { rounds })
  },

  applyFullToAllFinals(fromIndex: number) {
    const id = get(finalsState).activeSessionId
    if (!id) return
    const s = get(finalsState)
    const sess = s.sessions.find((x) => x.id === id)
    if (!sess) return
    const src = sess.rounds[fromIndex]
    if (!src) return
    const rounds = sess.rounds.map(() => ({
      discipline: src.discipline,
      danceIds: [...src.danceIds],
      danceDurationSec: src.danceDurationSec,
      breakDurationSec: src.breakDurationSec,
    }))
    updateSession(id, { rounds })
  },

  randomizePlaylistTracks() {
    const id = get(finalsState).activeSessionId
    if (!id) return
    const s = get(finalsState)
    const sess = s.sessions.find((x) => x.id === id)
    if (!sess || sess.panelFlow !== 'list') return
    const tracks = get(libraryState).tracks
    const playlist = randomizeFinalsTrackPicks(sess.playlist, tracks, sess.rounds)
    updateSession(id, { playlist })
  },

  backToConfigure() {
    const id = get(finalsState).activeSessionId
    if (!id) return
    updateSession(id, { panelFlow: 'configure', configureIndex: 0 })
  },

  async playFromPlaylistRow(playlistIndex: number) {
    const id = get(finalsState).activeSessionId
    if (!id) return
    const s = get(finalsState)
    const sess = s.sessions.find((x) => x.id === id)
    if (!sess || sess.panelFlow !== 'list') return
    const row = sess.playlist[playlistIndex]
    if (!row) return
    if (row.kind === 'track' && row.trackId == null) {
      uiActions.notify('No track in this slot', 'warning')
      return
    }
    const tracks = get(libraryState).tracks
    const items = buildFinalsPlaybackQueue(sess.playlist, tracks)
    const startIndex = playbackQueueIndexForPlaylistRow(sess.playlist, playlistIndex, tracks)
    if (startIndex < 0 || startIndex >= items.length) {
      uiActions.notify('Could not start playback', 'warning')
      return
    }
    const first = items[startIndex]
    if (first.kind === 'track' && (first.track.source !== 'local' || !first.track.localPath)) {
      uiActions.notify('Only local library tracks can play here', 'warning')
      return
    }
    playerActions.setFinalsQueue(items, startIndex, id)
    playerActions.setCurrentTime(0)
    const st = get(playerState)
    const item = st.queue[st.queueIndex]
    if (item?.kind === 'track') {
      await audioEngine.load(item.track)
      syncAudioEnginePlaybackCap()
      audioEngine.setTempo(st.tempo)
      audioEngine.seek(0)
      audioEngine.play()
    } else {
      audioEngine.stop()
      audioEngine.setPlaybackEndCap(null)
    }
    playerActions.play()
  },
}
