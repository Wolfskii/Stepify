# Ballroom Context

This document provides domain knowledge about competitive ballroom dancing that every developer on the Stepify project should understand. Incorrect assumptions about the dance domain lead to incorrect software.

---

## What is Ballroom Dancing?

Ballroom dancing is a family of partner dances performed in competition or social settings. In the competitive context, couples are judged on technique, timing, footwork, musicality, and presentation. Competitions are governed by international bodies such as the **World Dance Council (WDC)** and **World DanceSport Federation (WDSF)**.

---

## Standard vs. Latin

Competitive ballroom is divided into two distinct disciplines:

### Standard (also called "Ballroom")

Five dances performed in closed hold, characterized by elegant posture, rise and fall, and sweeping floor coverage.

| Dance           | Character              | BPM range | Time signature |
|-----------------|------------------------|-----------|----------------|
| Slow Waltz      | Romantic, lilting      | 84–90     | 3/4            |
| Tango           | Staccato, dramatic     | 112–120   | 4/4            |
| Viennese Waltz  | Fast, flowing          | 174–180   | 3/4            |
| Foxtrot         | Smooth, sophisticated  | 112–120   | 4/4            |
| Quickstep       | Fast, light, energetic | 196–208   | 4/4            |

### Latin

Five dances with hip motion (Cuban motion), performed in more open holds.

| Dance       | Character                  | BPM range | Time signature |
|-------------|----------------------------|-----------|----------------|
| Cha Cha     | Playful, syncopated        | 120–128   | 4/4            |
| Samba       | Bouncy, carnival energy    | 96–104    | 2/4            |
| Rumba       | Slow, sensual, romantic    | 96–100    | 4/4            |
| Paso Doble  | Dramatic, Spanish march    | 112–124   | 2/4            |
| Jive        | Fast, bouncy, rock-and-roll| 152–176   | 4/4            |

> **Note:** BPM ranges above are competition standards. In training, dancers often practice at 70–80% tempo to develop technique before gradually increasing to full speed.

---

## Rounds and Heats

Understanding these terms is critical for building the Practice Mode.

### Heat
A **heat** is a single pass on the dance floor at a competition. Multiple couples dance simultaneously. A heat typically lasts **90 seconds to 2 minutes** for a single dance.

### Round
A competition event consists of multiple **rounds**:
- **Preliminary / First Round** — all entered couples dance
- **Quarter Final / Semi Final** — a subset advance
- **Final** — typically 6 couples compete

At each round, each dance is performed once. In a **5-dance final**, couples dance all 5 dances of their discipline back-to-back with brief transitions between songs.

### Sequence in a Final
A typical Latin final sequence:
1. Cha Cha (~90s)
2. Samba (~90s)
3. Rumba (~90s)
4. Paso Doble (~90s)
5. Jive (~90s)

This is exactly what **Competition Mode** in Stepify simulates.

---

## Why Tempo Control is Critical

### Training Progression
Coaches routinely slow music down when teaching new choreography or correcting technique. A dancer learning a complex Quickstep combination will start at 60–70% speed and work up to 100%.

The ability to slow down while **preserving pitch** is essential. Changing the pitch of music makes it unpleasant and makes it harder to hear musical phrasing.

### Competition Tempo Variance
Competition music is not always at the exact standard BPM. Orchestras vary, and different recordings of the same song may differ by 3–5 BPM. Dancers use Stepify to:
- Adjust a track's effective BPM to match competition conditions
- Compare their routine timing at different tempos
- Simulate a specific orchestra's tempo they know will be played at a competition

### Common Training Scenarios
- **Slow run-through**: 70–80% tempo — focus on footwork and technique
- **Normal practice**: 100% — full timing
- **Over-speed training**: 105–110% — trains stamina and reaction
- **Competition simulation**: 100% with competition-spec music

---

## Musical Phrasing

Ballroom music is highly structured. Most pieces are arranged in **8-count phrases** (two bars of 4/4 music). Choreography is built in multiples of 8 counts.

- A 90-second heat covers approximately 12–16 musical phrases depending on the dance
- Dancers must start choreography on the phrase, not arbitrarily
- The app should, in the future, display the current phrase number as a training aid

---

## Implications for Stepify Features

| Domain Concept | Feature Impact |
|----------------|---------------|
| BPM standards per dance | Auto-suggest BPM range when tagging a track |
| Tempo-preserving pitch control | SoundTouch (or AudioWorklet) required — not just `playbackRate` |
| Round structure | Practice Mode: configure dance sequence + durations |
| Training at sub-tempo | Tempo slider range -32% to +32%, keyboard fine-control |
| Competition music matching | BPM display must show adjusted BPM, not just percentage |
| 5-dance block | Practice Mode supports queuing 5 dances with auto-advance |
