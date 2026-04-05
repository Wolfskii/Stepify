import type { DanceCategory } from './types'

// ─── Dance Definitions ────────────────────────────────────────────────────────

export const DANCE_CATEGORIES: DanceCategory[] = [
  // Latin (competition order: Samba before Cha Cha)
  {
    id: 'samba',
    name: 'Samba',
    style: 'latin',
    bpmRange: [96, 104],
    color: '#eab308',
  },
  {
    id: 'cha-cha',
    name: 'Cha Cha',
    style: 'latin',
    bpmRange: [120, 128],
    color: '#f97316',
  },
  {
    id: 'rumba',
    name: 'Rumba',
    style: 'latin',
    bpmRange: [96, 100],
    color: '#ec4899',
  },
  {
    id: 'paso-doble',
    name: 'Paso Doble',
    style: 'latin',
    bpmRange: [112, 124],
    color: '#dc2626',
  },
  {
    id: 'jive',
    name: 'Jive',
    style: 'latin',
    bpmRange: [152, 176],
    color: '#7c3aed',
  },
  // Standard
  {
    id: 'slow-waltz',
    name: 'Slow Waltz',
    style: 'standard',
    bpmRange: [84, 90],
    color: '#06b6d4',
  },
  {
    id: 'tango',
    name: 'Tango',
    style: 'standard',
    bpmRange: [112, 120],
    color: '#1d4ed8',
  },
  {
    id: 'viennese-waltz',
    name: 'Viennese Waltz',
    style: 'standard',
    bpmRange: [174, 180],
    color: '#0ea5e9',
  },
  {
    id: 'foxtrot',
    name: 'Foxtrot',
    style: 'standard',
    bpmRange: [112, 120],
    color: '#10b981',
  },
  {
    id: 'quickstep',
    name: 'Quickstep',
    style: 'standard',
    bpmRange: [196, 208],
    color: '#f59e0b',
  },
]

export const DANCE_CATEGORIES_BY_ID = Object.fromEntries(
  DANCE_CATEGORIES.map((d) => [d.id, d]),
) as Record<string, DanceCategory>

// ─── Audio ────────────────────────────────────────────────────────────────────

/** Supported audio file extensions for library scanning */
export const SUPPORTED_AUDIO_EXTENSIONS = ['mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a', 'opus', 'wma']

export const SUPPORTED_AUDIO_GLOB = `**/*.{${SUPPORTED_AUDIO_EXTENSIONS.join(',')}}`

/** Tempo slider range in percentage points relative to 1.0 */
export const TEMPO_MIN_PERCENT = -32
export const TEMPO_MAX_PERCENT = 32
export const TEMPO_STEP_PERCENT = 0.5
export const TEMPO_FINE_STEP_PERCENT = 0.1

// ─── UI ───────────────────────────────────────────────────────────────────────

export const SIDEBAR_WIDTH_PX = 220
export const PLAYER_PANEL_WIDTH_PX = 300

// ─── App ──────────────────────────────────────────────────────────────────────

export const APP_NAME = 'Stepify'
export const APP_VERSION = '0.1.0'
