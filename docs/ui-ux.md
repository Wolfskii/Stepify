# UI / UX Guidelines

## Design Principles

1. **Dark-first** — dancers practice in studios with varied lighting. Dark UI reduces eye strain.
2. **Tactile controls** — the tempo slider must feel physical, like a CD player knob.
3. **Fast access** — key controls reachable without navigating menus.
4. **Touch-friendly** — supports studios using touch-screen monitors or tablets.
5. **No clutter** — respect the user's focus during practice.

---

## Layout

Chrome is **Spotify-inspired**: outer background `#000`, floating `#121212` panels with **8px** corner radius and **8px** gap between them (`--shell-gap`, `--radius-panel`). The bottom player bar is full-width black with artwork + track meta on the left.

```
┌──────────────┬───────────────────────────────┬────────────────────┐
│   Sidebar    │      Track List (flexible)      │  Tempo / BPM       │
│  220px wide  │                               │  300px wide        │
│              │  Header, columns, rows        │  Vertical tempo    │
│  (nav)       │  + / − / × actions          │  slider + readout  │
│              │                               │  BPM display       │
│              │                               │  (wall clock at    │
│              │                               │   tempo in list)   │
└──────────────┴───────────────────────────────┴────────────────────┘
┌───────────────────────────────────────────────────────────────────┐
│ Now Playing Bar (full width, max-width centered on ultrawide)     │
│  [art] title / artist  |  shuffle · prev · play · next · repeat   │
│                        |  ───────── seek progress ─────────         │
└───────────────────────────────────────────────────────────────────┘
```

---

## Design Tokens

All design values are defined as CSS custom properties in `src/renderer/src/styles/global.css`. **Never hardcode colors or spacing in component styles.**

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg-base` | `#000000` | App background, bottom player bar |
| `--color-bg-surface` | `#121212` | Floating panel surfaces |
| `--color-bg-elevated` | `#1a1a1a` | Row hover, raised controls |
| `--color-bg-overlay` | `#2a2a2a` | Tags, inputs, buttons |
| `--color-accent` | `#1db954` | Primary action, active nav (Spotify green) |
| `--color-accent-hover` | `#1ed760` | Hover on accent elements |
| `--color-accent-muted` | `rgba(29, 185, 84, 0.15)` | Selected row / sidebar item tint |
| `--color-text-primary` | `#ffffff` | Main text |
| `--color-text-secondary` | `#b3b3b3` | Subdued text |
| `--color-text-muted` | `#6a6a6a` | Placeholders, hints |

### Typography

- Body: `Inter` (Google Fonts) — 14px, weight 400/500/600/700
- Monospaced: `JetBrains Mono` or `Fira Code` — used for time displays, BPM
- Numeric displays: `font-variant-numeric: tabular-nums` (prevents layout shift)

### Motion

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-fast` | `120ms` | Hover states, small transitions |
| `--duration-normal` | `200ms` | Panel slides, mode changes |
| `--duration-slow` | `350ms` | Page-level transitions |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Standard easing |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Thumb snap, button press |

---

## Tempo Slider — Design Detail

The tempo slider is the most important UI element. It must feel premium.

### Anatomy

```
  +32%        ← edge label
  ┌──────┐
  │ ···· │   ← thumb (draggable, 52×28px, glowing border)
  │══════│   ← fill (purple above center = speed up)
  │  ——  │   ← center line
  │      │
  └──────┘
  -32%        ← edge label

   +7.5%      ← readout (large, accent color)
  [ Reset ]   ← button (disabled when at 0%)
```

### Interaction Requirements

| Gesture | Behavior |
|---------|----------|
| Click on track | Snaps to nearest 0.5% |
| Drag thumb | Smooth 1:1 follow, snaps to 0.5% |
| Touch drag | Same as mouse drag |
| `↑` / `↓` | ±0.5% per press |
| `Shift + ↑↓` | ±0.1% per press (fine adjust) |
| `Home` / `End` | Jump to +32% / -32% |
| `Escape` or `R` | Reset to 0% |
| Mouse wheel | ±0.5% per tick, ±0.1% with Shift |

### Visual Feedback

- Fill above center: accent purple (speed up)
- Fill below center: warning amber (slow down)
- At zero: fill disappears, readout goes muted
- While dragging: thumb border brightens, shadow expands
- BPM display updates in real time

### Library management

- **Add folder** — Opens a system folder picker; after scan, a modal offers to assign **one dance to all newly added files** or skip for mixed folders.
- **Folders list** (sidebar) — Shows indexed roots with track counts; **×** removes the folder from Stepify and drops all tracks whose `localPath` lies under that directory (files on disk are untouched).
- **Remove track** — Local rows expose a remove control (next to assign dance); stops playback if that track is current.

### Track list interactions

- **Assign dance** — Per-row **+**, drag onto sidebar dance, or multi-select (click / Ctrl / Shift) and drag the selection.
- **Column sort** — Header buttons on **Title**, **Duration**, **BPM**, **Likes**, and **Dance** (when not in a single-dance filter) sort the visible list; a second click reverses direction. Choosing a sort clears an active shuffle display order for that list. Default order remains popularity-based until the user picks a column.
- **Seek bar times** — Elapsed and total show **listening (wall-clock) time at the current tempo** (slower tempo ⇒ longer displayed duration). The bar still seeks by position in the underlying file.

---

## Accessibility

- All interactive elements have `aria-label` or `title`
- Slider uses `role="slider"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext`
- Focus visible styles on all focusable elements (no `outline: none` without replacement)
- Keyboard navigation throughout
- Color is never the only indicator (shape, position also used)

---

## Responsive Behavior

The app has a minimum window size of 900×600. Below this, the layout may clip.

Future: collapse sidebar at ≤960px total width (sidebar becomes a hamburger drawer).

---

## Component Patterns

### State classes
Use BEM-inspired modifier classes: `dance-item`, `dance-item.selected`, `dance-item__count`.

### Animations
Prefer CSS transitions over JS animation. Use `requestAnimationFrame` only for the audio time update.

### Icons
Inline SVG only — no icon font dependencies. SVG viewboxes are `0 0 16 16` or `0 0 24 24`.
