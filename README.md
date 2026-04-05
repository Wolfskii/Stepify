# Stepify

A cross-platform desktop dance music player built for ballroom and latin dancers. Used in dance schools and by competitive dancers to practice routines and simulate competition rounds.

![Stepify screenshot placeholder](docs/screenshots/placeholder.png)

---

## Features

- **Music Library** — Add/remove folders and individual tracks; bulk-assign a dance when importing a folder (or skip); drag or **+** to set a dance (**one dance per track** — assigning replaces the previous tag). With a dance selected in the sidebar, **Delete**/**Backspace** removes selected tracks from that dance only; on **All Tracks**, the same keys remove from the library (with confirmation)
- **Playback times at tempo** — Seek labels show how long the track takes at the current tempo (updates live with the slider)
- **Dance Categories** — 10 built-in dances (Standard + Latin) with BPM ranges; library sidebar groups are collapsible (**Folders** and **Other** start collapsed). **Finals** (under Modes) opens a multi-step finals builder in the main panel (random songs ≥ chosen length per dance + break rows); **Rounds**, **New custom mode…**, and **Other** rows are still stubs (`docs/practice-modes.md`); create custom categories
- **Tactile Tempo Control** — Vertical slider with pitch-preserving time stretching; drag, touch, and keyboard control
- **BPM Display** — Shows original and tempo-adjusted BPM in real time
- **Spotify Integration** — OAuth login, track search, add Spotify tracks to dance categories _(coming soon)_
- **Competition Mode** — Queue a sequence of dances with configured durations and auto-advance _(coming soon)_
- **Dark UI** — Clean, distraction-free interface built for studio use

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 30 |
| Frontend | Svelte 4 + TypeScript |
| Build tool | electron-vite + Vite 5 |
| Audio engine | Web Audio API + SoundTouch (time stretching) |
| Persistence | electron-store (JSON, no database) |
| Library scanning | fast-glob + music-metadata |
| Spotify | Spotify Web API + PKCE OAuth |
| Styling | CSS custom properties (no CSS framework) |
| Task runner | go-task (Taskfile.yml) |

---

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [npm](https://npmjs.com) 9+
- [go-task](https://taskfile.dev/installation/) (optional, but recommended)

### Install

```bash
git clone https://github.com/your-org/stepify.git
cd stepify
task install
# or: npm install
```

### Run in development mode

```bash
task dev
# or: npm run dev
```

This starts Electron with hot-reload. Changes to Svelte components and renderer code reflect instantly. Changes to the main process require a restart.

---

## Development Workflow

### Available Commands

| Command | Description |
|---------|-------------|
| `task dev` | Start with hot reload |
| `task build` | Build for current platform |
| `task build:win` | Build Windows NSIS installer |
| `task build:mac` | Build macOS DMG |
| `task build:linux` | Build Linux AppImage |
| `task typecheck` | TypeScript type check (no emit) |
| `task lint` | Biome check (lint + format) |
| `task lint:fix` | Biome check with `--write` |
| `task clean` | Remove build artifacts |
| `task check` | Run typecheck + lint |

All tasks wrap the corresponding `npm run` script — both `task dev` and `npm run dev` work.

### Project Structure

```
src/
├── main/           Electron main process (Node.js)
│   ├── ipc/        IPC handlers per domain
│   └── services/   Library, settings, Spotify auth
├── preload/        contextBridge API exposed to renderer
├── renderer/       Svelte application
│   └── src/
│       ├── components/
│       │   ├── layout/
│       │   ├── sidebar/
│       │   ├── tracklist/
│       │   ├── modals/     ← Assign dance / folder bulk assign
│       │   └── player/     ← TempoSlider lives here
│       ├── services/       Audio engine + Spotify service
│       ├── stores/         Svelte state stores
│       └── styles/         Global CSS + design tokens
└── shared/         Types, constants, IPC channel names
docs/               Architecture and domain documentation
```

---

## Documentation

- [Architecture](docs/architecture.md) — Process model, IPC flow, state management
- [Audio Engine](docs/audio-engine.md) — Web Audio API, SoundTouch time stretching
- [Ballroom Context](docs/ballroom-context.md) — Domain knowledge: dances, BPM, rounds, heats
- [Spotify Integration](docs/spotify-integration.md) — PKCE OAuth, Web API, Playback SDK
- [UI / UX](docs/ui-ux.md) — Design system, tokens, interaction patterns

---

## Spotify Setup

1. Create an app at [developer.spotify.com](https://developer.spotify.com/dashboard)
2. Add `http://localhost:8888/callback` as a Redirect URI
3. Copy the Client ID
4. In Stepify → Settings, paste the Client ID
5. Click "Connect Spotify"

---

## Roadmap

- [ ] SoundTouch AudioWorklet integration (true pitch-preserving time stretch)
- [ ] Spotify Web Playback SDK integration
- [ ] Spotify audio features API for automatic BPM detection
- [ ] Competition Mode (configurable dance sequence, auto-advance)
- [ ] BPM tap detection for unlabeled tracks
- [ ] Custom dance categories
- [ ] Waveform display in seek bar
- [ ] macOS media keys support
- [ ] Export practice session as playlist

---

## Contributing

See [AGENTS.md](AGENTS.md) for coding standards, architecture overview, and AI agent instructions.

---

## License

MIT
