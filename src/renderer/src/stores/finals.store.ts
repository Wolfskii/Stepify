import { DANCE_CATEGORIES, DANCE_CATEGORIES_BY_ID } from '@shared/constants'
import type {
  DanceId,
  DanceStyle,
  FinalRoundConfig,
  FinalsFlow,
  FinalsPlaylistRow,
} from '@shared/types'
import { derived, get, writable } from 'svelte/store'
import { buildFinalsPlaylistRows, randomizeFinalsTrackPicks } from '../utils/finalsPlaylist'
import { libraryState } from './library.store'
import { uiActions } from './ui.store'

interface FinalsState {
  flow: FinalsFlow
  finalsCount: number
  configureIndex: number
  rounds: FinalRoundConfig[]
  playlist: FinalsPlaylistRow[]
}

const emptyState: FinalsState = {
  flow: null,
  finalsCount: 1,
  configureIndex: 0,
  rounds: [],
  playlist: [],
}

export const finalsState = writable<FinalsState>(emptyState)

export const finalsFlow = derived(finalsState, ($s) => $s.flow)

function defaultRound(): FinalRoundConfig {
  const discipline: DanceStyle = 'standard'
  return {
    discipline,
    danceIds: DANCE_CATEGORIES.filter((d) => d.style === discipline).map((d) => d.id),
    danceDurationSec: 105,
    breakDurationSec: 30,
  }
}

export const finalsActions = {
  openFromSidebar() {
    finalsState.set({
      flow: 'count',
      finalsCount: 1,
      configureIndex: 0,
      rounds: [],
      playlist: [],
    })
  },

  cancelToLibrary() {
    finalsState.set(emptyState)
  },

  setFinalsCount(n: number) {
    const count = Math.max(1, Math.min(20, Math.floor(Number(n)) || 1))
    finalsState.update((s) => ({ ...s, finalsCount: count }))
  },

  startConfigure() {
    const s = get(finalsState)
    const rounds = Array.from({ length: s.finalsCount }, () => defaultRound())
    finalsState.update((st) => ({
      ...st,
      flow: 'configure',
      configureIndex: 0,
      rounds,
    }))
  },

  goConfigureRound(index: number) {
    finalsState.update((s) => ({
      ...s,
      configureIndex: Math.max(0, Math.min(s.rounds.length - 1, index)),
    }))
  },

  configurePrev() {
    finalsState.update((s) => {
      if (s.flow !== 'configure') return s
      if (s.configureIndex <= 0) {
        return { ...s, flow: 'count' as const, configureIndex: 0 }
      }
      return { ...s, configureIndex: s.configureIndex - 1 }
    })
  },

  /** Validates current round, then advances or builds the playlist on the last final. */
  configureNextOrFinish(): boolean {
    const s = get(finalsState)
    if (s.flow !== 'configure' || s.rounds.length === 0) return false
    const r = s.rounds[s.configureIndex]
    if (!r || r.danceIds.length === 0) {
      uiActions.notify('Select at least one dance for this final', 'warning')
      return false
    }
    if (s.configureIndex < s.rounds.length - 1) {
      finalsState.update((st) => ({ ...st, configureIndex: st.configureIndex + 1 }))
      return true
    }
    for (const round of s.rounds) {
      if (round.danceIds.length === 0) {
        uiActions.notify('Each final needs at least one dance', 'warning')
        return false
      }
    }
    const tracks = get(libraryState).tracks
    const playlist = buildFinalsPlaylistRows(s.rounds, tracks)
    finalsState.update((st) => ({ ...st, flow: 'list', playlist }))
    return true
  },

  updateRound(index: number, patch: Partial<FinalRoundConfig>) {
    finalsState.update((s) => {
      const rounds = [...s.rounds]
      if (!rounds[index]) return s
      rounds[index] = { ...rounds[index], ...patch }
      return { ...s, rounds }
    })
  },

  setRoundDiscipline(index: number, discipline: DanceStyle) {
    const ids = DANCE_CATEGORIES.filter((d) => d.style === discipline).map((d) => d.id)
    finalsActions.updateRound(index, { discipline, danceIds: [...ids] })
  },

  toggleRoundDance(index: number, danceId: DanceId) {
    finalsState.update((s) => {
      const rounds = [...s.rounds]
      const r = rounds[index]
      const cat = DANCE_CATEGORIES_BY_ID[danceId]
      if (!r || !cat || r.discipline !== cat.style) return s
      const set = new Set(r.danceIds)
      if (set.has(danceId)) set.delete(danceId)
      else set.add(danceId)
      const ordered = DANCE_CATEGORIES.filter((d) => d.style === r.discipline && set.has(d.id)).map(
        (d) => d.id,
      )
      rounds[index] = { ...r, danceIds: ordered }
      return { ...s, rounds }
    })
  },

  applyTimesToAllFinals(fromIndex: number) {
    finalsState.update((s) => {
      const src = s.rounds[fromIndex]
      if (!src) return s
      const rounds = s.rounds.map((r, i) =>
        i === fromIndex
          ? r
          : {
              ...r,
              danceDurationSec: src.danceDurationSec,
              breakDurationSec: src.breakDurationSec,
            },
      )
      return { ...s, rounds }
    })
  },

  applyFullToAllFinals(fromIndex: number) {
    finalsState.update((s) => {
      const src = s.rounds[fromIndex]
      if (!src) return s
      const rounds = s.rounds.map(() => ({
        discipline: src.discipline,
        danceIds: [...src.danceIds],
        danceDurationSec: src.danceDurationSec,
        breakDurationSec: src.breakDurationSec,
      }))
      return { ...s, rounds }
    })
  },

  randomizePlaylistTracks() {
    finalsState.update((s) => {
      if (s.flow !== 'list') return s
      const tracks = get(libraryState).tracks
      return {
        ...s,
        playlist: randomizeFinalsTrackPicks(s.playlist, tracks, s.rounds),
      }
    })
  },

  backToConfigure() {
    finalsState.update((s) => {
      if (s.flow !== 'list') return s
      return { ...s, flow: 'configure', configureIndex: 0, playlist: [] }
    })
  },
}
