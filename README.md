# 🕵️ Agent Briefing — ESL Speaking Game

A lighthearted spy-themed speaking game for elementary ESL students (ages 8–12).
Students investigate a "Person of Interest", **record themselves speaking English
sentences**, then watch their own customizable agent avatar deliver the briefing
to headquarters — lip-synced to their real voice — while NPC agents nod, take
notes, and applaud.

No installs or build step are needed to play. The game uses procedural browser art by
default, with an optional reviewed raster-art override pipeline. One folder, open and play.

## ▶ How to run

1. Open `index.html` in **Chrome or Edge** (double-click it).
2. Click **START MISSION** and allow the **microphone** when the browser asks.

If the microphone is blocked when opening the file directly, serve the folder
instead (any local server works):

```
cd agent-briefing
python -m http.server 8000
# then open http://localhost:8000
```

## 🎮 Game flow

1. **Title → Agent ID** — the student customizes their agent avatar (skin, hair,
   suit, tie, sunglasses, codename). Saved in the browser.
2. **Intelligence Archive** — a wall of six confidential dossiers. Pick a level:
   - **LEVEL 1 · FIRST REPORT**: *This is… / He–She is… / He–She likes… / He–She can…*
   - **LEVEL 2 · DEEP COVER**: *This is… / He–She has… / He–She wants… / He–She doesn't like…*
3. **Dossier** — the folder flips open with stamps and typewriter effects and
   reveals the character's facts.
4. **Speaking Mission** — one prompt at a time. HQ asks a question over the
   radio, the fact card appears, and the student records the full sentence.
   Each clip gets a **VERIFIED** stamp, +25 points, and progress. A quiet
   recording gets a friendly "HQ couldn't hear you!" retry. The 🔊 EXAMPLE
   button speaks a model sentence (browser text-to-speech).
5. **Headquarters Debriefing** — the reward. The avatar walks into the briefing
   room, the character's photo is on the projector, and the student's recorded
   clips play one by one while the avatar lip-syncs. The camera cuts to agents
   reacting (nodding, taking notes, whispering). At the end the commander
   stands: *"Excellent work, Agent!"* — applause, confetti, MISSION COMPLETE,
   score, rank progress.

Points and ranks (🔰 Rookie → 👑 Master Spy), completed cases, and the avatar
persist in `localStorage`. Recordings stay **in memory only** (privacy) — they
can optionally be downloaded from the Mission Report screen.

## ✏️ For teachers: adding content

Everything lives in `js/data.js`:

- **Add a character** — copy any entry in `CHARACTERS` and change the name,
  look colors, and facts.
- **Add a grammar pack** — copy a pack in `GRAMMAR_PACKS` and change the
  `radio` (HQ's question), `prompt` (sentence frame with `______`), and
  `answer` (full model sentence). The mission and debrief adapt automatically.
  Ideas: *They are… / Yesterday he… / There is–There are…*
- Tune `POINTS_PER_CLIP`, `MISSION_BONUS`, or the `RANKS` thresholds.

## Manual artwork workflow

Artwork generation is manual. The review and apply pipeline keeps every candidate and
does not replace production art without an explicit approval.

1. Start with `npm run art:prepare` for the next pending asset, or
   `npm run art:prepare -- --all` to prepare all pending assets.
2. Copy the complete prompt printed by the command and generate the image in ChatGPT.
   When a reference path is listed, upload that image alongside the prompt.
3. Save each PNG with the exact filename printed by the command, in the exact candidate
   directory it creates.
4. Run `npm run art:review`, open the displayed local URL, and refresh the page. The
   review server detects candidate PNGs directly from the folder.
5. Compare candidates with the current procedural art, then select, revise, lock
   properties, or mark a candidate **Use As-Is**.
6. Choose **Apply Selected Artwork** only when the approved choices are ready.

Revision and new-direction requests prepare a new generation folder and paste-ready
prompt without overwriting the parent candidate. The reference paths printed for a
revision must be uploaded manually.

Playwright automation of the ChatGPT consumer website is legacy, unsupported, and
disabled. A future official OpenAI API adapter can be implemented without changing the
candidate review, approval, apply, rollback, or runtime override workflow.

## 🧩 Files

| File | What it does |
|---|---|
| `index.html` | Shell page |
| `styles.css` | Theme + all animations (stamps, folder flip, reactions, confetti) |
| `js/data.js` | Characters, grammar packs, ranks, avatar options |
| `js/art.js` | All art, drawn as SVG in code (portraits, avatar, NPCs, commander, logo) |
| `js/sfx.js` | All sound, synthesized with WebAudio (typewriter, stamps, applause, spy riff) |
| `js/recorder.js` | Mic recording, loudness check, lip-sync playback |
| `js/game.js` | Screens and game flow |

## 🌐 Browser support

Chrome and Edge are best (MediaRecorder + mic on `file://`). Firefox works.
Safari/iPad works over `http(s)` (records as `.m4a`). The recorded voice is the
only spoken dialogue in the debriefing — by design.
