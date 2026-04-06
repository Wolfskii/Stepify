import { derived, writable } from 'svelte/store'

type Panel = 'library' | 'spotify' | 'practice'
type Modal =
  | 'add-directory'
  | 'settings'
  | 'assign-dance'
  | 'assign-folder-dance'
  | 'edit-bpm'
  | 'track-metadata'
  | null

export interface OpenModalContext {
  trackId?: string
  folderTrackIds?: string[]
  /** Open folder default-dance settings for this library path (sidebar). */
  folderSettingsPath?: string
  /** Ordered queue of local track IDs to review (metadata wizard) */
  metadataQueue?: string[]
  metadataWizardTotal?: number
  /** After closing the wizard, assign dance + BPM for these IDs (usually all new folder tracks) */
  metadataAfterAssign?: string[] | null
}

interface UiState {
  activePanel: Panel
  activeModal: Modal
  sidebarCollapsed: boolean
  /** Track ID for which the assign-dance modal is open */
  assignDanceTrackId: string | null
  /** New track IDs after adding a folder — optional bulk dance assign */
  folderAssignTrackIds: string[] | null
  /** Library folder path when configuring default dance from sidebar */
  folderDanceSettingsPath: string | null
  /** Track ID for BPM edit modal */
  editBpmTrackId: string | null
  trackMetadataQueueIds: string[]
  trackMetadataWizardTotal: number
  trackMetadataAfterWizardAssignIds: string[] | null
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
  folderDanceSettingsPath: null,
  editBpmTrackId: null,
  trackMetadataQueueIds: [],
  trackMetadataWizardTotal: 0,
  trackMetadataAfterWizardAssignIds: null,
  notifications: [],
}

export const uiState = writable<UiState>(initialState)

// ─── Derived ──────────────────────────────────────────────────────────────────

export const activePanel = derived(uiState, ($s) => $s.activePanel)
export const activeModal = derived(uiState, ($s) => $s.activeModal)
export const assignDanceTrackId = derived(uiState, ($s) => $s.assignDanceTrackId)
export const folderAssignTrackIds = derived(uiState, ($s) => $s.folderAssignTrackIds)
export const folderDanceSettingsPath = derived(uiState, ($s) => $s.folderDanceSettingsPath)
export const editBpmTrackId = derived(uiState, ($s) => $s.editBpmTrackId)
export const trackMetadataQueueIds = derived(uiState, ($s) => $s.trackMetadataQueueIds)
export const trackMetadataWizardTotal = derived(uiState, ($s) => $s.trackMetadataWizardTotal)
export const trackMetadataAfterWizardAssignIds = derived(
  uiState,
  ($s) => $s.trackMetadataAfterWizardAssignIds,
)
export const sidebarCollapsed = derived(uiState, ($s) => $s.sidebarCollapsed)
export const notifications = derived(uiState, ($s) => $s.notifications)

// ─── Actions ──────────────────────────────────────────────────────────────────

let notifCounter = 0

function emptyMetadataSlice() {
  return {
    trackMetadataQueueIds: [] as string[],
    trackMetadataWizardTotal: 0,
    trackMetadataAfterWizardAssignIds: null as string[] | null,
  }
}

export const uiActions = {
  setPanel(panel: Panel) {
    uiState.update((s) => ({ ...s, activePanel: panel }))
  },

  openModal(modal: Modal, context?: OpenModalContext) {
    const meta =
      modal === 'track-metadata'
        ? (() => {
            const queue = context?.metadataQueue?.length
              ? [...context.metadataQueue]
              : context?.trackId
                ? [context.trackId]
                : []
            const total =
              context?.metadataWizardTotal ??
              (queue.length > 0 ? queue.length : context?.trackId ? 1 : 0)
            return {
              trackMetadataQueueIds: queue,
              trackMetadataWizardTotal: total,
              trackMetadataAfterWizardAssignIds:
                context?.metadataAfterAssign !== undefined ? context?.metadataAfterAssign : null,
            }
          })()
        : emptyMetadataSlice()

    uiState.update((s) => ({
      ...s,
      activeModal: modal,
      assignDanceTrackId: modal === 'assign-dance' ? (context?.trackId ?? null) : null,
      folderDanceSettingsPath:
        modal === 'assign-folder-dance' ? (context?.folderSettingsPath ?? null) : null,
      folderAssignTrackIds:
        modal === 'assign-folder-dance' && !context?.folderSettingsPath
          ? (context?.folderTrackIds ?? [])
          : null,
      editBpmTrackId: modal === 'edit-bpm' ? (context?.trackId ?? null) : null,
      ...meta,
    }))
  },

  closeModal() {
    uiState.update((s) => ({
      ...s,
      activeModal: null,
      assignDanceTrackId: null,
      folderAssignTrackIds: null,
      folderDanceSettingsPath: null,
      editBpmTrackId: null,
      ...emptyMetadataSlice(),
    }))
  },

  /** Drop the current metadata wizard item and move to the next (internal). */
  shiftMetadataQueue() {
    uiState.update((s) => ({
      ...s,
      trackMetadataQueueIds: s.trackMetadataQueueIds.slice(1),
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
