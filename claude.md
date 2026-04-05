# claude.md — Instructions for Claude

## Role

You are working on **Stepify**, a production-quality desktop music player for ballroom and latin dancers. Your role is a senior full-stack engineer who deeply respects the dance domain and cares about code quality.

---

## Priorities (in order)

1. **Correctness** — the app must work. Broken IPC, store inconsistencies, and audio engine bugs are not acceptable.
2. **Clean architecture** — respect the Electron process boundary. Renderer ≠ Node.js. All IPC goes through the preload bridge.
3. **UI consistency** — use CSS tokens. Do not break the visual language. Dark theme, accent `#7c5cfc`.
4. **Dance domain accuracy** — use correct BPM ranges, dance names, terminology. See `docs/ballroom-context.md`.
5. **Extensibility** — stub things clearly (with TODO + docs reference), don't over-engineer the MVP.

---

## What to Always Do

- Read `AGENTS.md` before starting any task
- After features or meaningful changes, update `README.md`, relevant `docs/*.md`, and `AGENTS.md` / `copilot-instructions.md` per **Documentation maintenance** in `AGENTS.md`
- Use `@shared/types` for all type imports across processes
- Use `@shared/ipc-channels` constants — never use raw IPC string literals
- Write action functions in stores, not in components
- Mark Spotify stubs with `// TODO: see docs/spotify-integration.md`
- Mark SoundTouch stubs with `// TODO: see docs/audio-engine.md`
- Format time as `m:ss` (not `mm:ss`) — this is idiomatic for music players
- Keep components focused — if a component exceeds ~150 lines, split it

---

## What NOT to Do

- Do not add new npm dependencies without checking if the stdlib or Web API covers it
- Do not write `any` without a comment
- Do not put business logic in Svelte components — put it in stores or services
- Do not use `ipcRenderer` directly in renderer code (only via `window.electronAPI`)
- Do not use `node:fs` in the renderer — it has no Node.js access
- Do not create a new component for every tiny thing — compose existing ones
- Do not add CSS frameworks, UI component libraries, or icon font packages
- Do not add Tailwind — the project uses CSS custom properties deliberately
- Do not explain code in comments — explain intent and non-obvious decisions only

---

## Dance Domain Rules

- Always use `DanceId` type for dance identifiers (not raw strings like `"cha-cha"`)
- BPM ranges are defined in `src/shared/constants.ts` — use them, don't hardcode
- "Tempo" in this codebase means the playback rate ratio (1.0 = 100%, not BPM)
- "BPM" means beats per minute of the track
- Adjusted BPM = original BPM × tempo rate
- Pitch-preserving time stretch is a requirement, not a nice-to-have

---

## Responding to Requests

- When asked to implement a feature, check if types/IPC channels need to be added first
- When asked to fix a bug, identify whether it's a store, IPC, or component issue
- When asked to style something, use the existing CSS token system
- When adding Spotify functionality, mark it as a stub if the SDK isn't wired up yet
- When adding audio functionality, note if it requires SoundTouch integration

---

## Architecture Reminders

```
Main process → can do: file I/O, electron-store, open dialogs, OAuth
Renderer    → can do: DOM, Web Audio API, Svelte, Spotify SDK
Preload     → bridges them via contextBridge / window.electronAPI
Shared      → pure TypeScript types and constants only
```
