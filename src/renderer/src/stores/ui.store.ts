import { derived, writable } from 'svelte/store'

type Panel = 'library' | 'spotify' | 'practice'
type Modal =
  | 'add-directory'
  | 'spotify-login'
  | 'settings'
  | 'assign-dance'
  | 'assign-folder-dance'
  | null

interface UiState {
  activePanel: Panel
  activeModal: Modal
  sidebarCollapsed: boolean
  /** Track ID for which the assign-dance modal is open */
  assignDanceTrackId: string | null
  /** New track IDs after adding a folder — optional bulk dance assign */
  folderAssignTrackIds: string[] | null
  notifications: Notification[]
}

interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  message: string
  durationMs: number
}

const initialState: UiState = {
  activePanel: 'library',
  activeModal: null,
  sidebarCollapsed: false,
  assignDanceTrackId: null,
  folderAssignTrackIds: null,
  notifications: [],
}

export const uiState = writable<UiState>(initialState)

// ─── Derived ──────────────────────────────────────────────────────────────────

export const activePanel = derived(uiState, ($s) => $s.activePanel)
export const activeModal = derived(uiState, ($s) => $s.activeModal)
export const assignDanceTrackId = derived(uiState, ($s) => $s.assignDanceTrackId)
export const folderAssignTrackIds = derived(uiState, ($s) => $s.folderAssignTrackIds)
export const sidebarCollapsed = derived(uiState, ($s) => $s.sidebarCollapsed)
export const notifications = derived(uiState, ($s) => $s.notifications)

// ─── Actions ──────────────────────────────────────────────────────────────────

let notifCounter = 0

export const uiActions = {
  setPanel(panel: Panel) {
    uiState.update((s) => ({ ...s, activePanel: panel }))
  },

  openModal(modal: Modal, context?: { trackId?: string; folderTrackIds?: string[] }) {
    uiState.update((s) => ({
      ...s,
      activeModal: modal,
      assignDanceTrackId: modal === 'assign-dance' ? (context?.trackId ?? null) : null,
      folderAssignTrackIds:
        modal === 'assign-folder-dance' ? (context?.folderTrackIds ?? []) : null,
    }))
  },

  closeModal() {
    uiState.update((s) => ({
      ...s,
      activeModal: null,
      assignDanceTrackId: null,
      folderAssignTrackIds: null,
    }))
  },

  toggleSidebar() {
    uiState.update((s) => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed }))
  },

  notify(message: string, type: Notification['type'] = 'info', durationMs = 3000) {
    const id = String(++notifCounter)
    uiState.update((s) => ({
      ...s,
      notifications: [...s.notifications, { id, type, message, durationMs }],
    }))
    setTimeout(() => {
      uiState.update((s) => ({
        ...s,
        notifications: s.notifications.filter((n) => n.id !== id),
      }))
    }, durationMs)
  },

  dismissNotification(id: string) {
    uiState.update((s) => ({
      ...s,
      notifications: s.notifications.filter((n) => n.id !== id),
    }))
  },
}
