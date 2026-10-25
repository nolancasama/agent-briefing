# Current State

## Status
The game retains its end-to-end flow and 120-point target. Its presentation now uses a unified
artwork-first design system; any art slot without an approved raster still falls back to procedural
SVG. Briefing evaluation was rewritten so factual content gates the score — a grammatically perfect
sentence carrying the wrong fact no longer earns a high rank, and an unverifiable recording is
treated as neutral rather than as a free pass.

Note for anyone reading a passing `npm run test:e2e` as proof the scoring works: that test drives a
fake microphone producing a tone, so every clip comes back `unverified` and the report shows
`SIGNAL UNVERIFIED` with no rank letter. That is the expected path for it, but it means the test
never exercises a real rank letter. The verified and mismatch paths were checked separately by
stubbing `SpeechRecognition` with scripted transcripts; nothing in the committed suite covers them
yet, and adding that would be a genuine improvement.

## October 25, 2026 updates
- Speaking: a confirmed fact plus sufficiently complete sentence pattern now auto-stops the recording and sends to HQ. Incomplete, mismatched, quiet or unverified reports retain the manual review/SEND flow; Chrome's speech recognition never blocks progress. Expanded vs contracted "does not/doesn't" forms are normalized.
- HQ: removed the isolated right-hand commander and his backdrop. The center seated listener is now the lead analyst, who delivers the same final feedback. Removed the extra perspective table overlay that made the seated team appear embedded in a ramp, and redistributed listeners across the room.
- Agent ID: initial creation and subsequent editing now support male/female SVG agent models and live skin, hair, clothes color, neckwear, sunglasses and suit/trench-coat/skirt-suit customizations, all visible on the briefing avatar. Painted gender-specific lip-sync sprite sets are still future art work.
- Safety and rewards: exiting a mission releases the microphone, and replaying a debrief cannot award the mission bonus again.
- Tests: 50 pure-Node evaluation checks pass; the Chromium smoke test now also asserts female model/outfit persistence and absence of the old commander/table elements, but it has not been rerun in an actual browser as part of this update.

## What Exists
- Game: `index.html`, `styles.css`, `js/` (data, evaluate, art, sfx, recorder, icons, game).
- Speech evaluation lives in `js/evaluate.js`, separate from `game.js` and loadable under Node so it
  can be unit-tested. It resolves each clip to `confirmed` / `partial` / `mismatch` / `unverified`
  and aggregates a mission with explicit caps — see DESIGN_DECISIONS.md for the rules and why.
  `game.js` only adapts a grammar-pack step into the `{ fact, frame }` target it expects.
- Tests: `npm test` runs `test-eval.js` (48 checks, pure Node, no dependencies); `npm run test:e2e`
  runs the Playwright mission smoke test. Playwright resolves from the parent `recipe-tester`
  directory, so both work from the project root.
- Presentation: a four-step type and token system, four button variants, inline SVG functional icons, and one principal display per screen foreground the painted art. The speaking mission, archive, debrief and after-action report use the same restrained navy, amber and cyan agency language, while the dossier keeps its physical manila-paper treatment.
- E2E screenshot coverage includes the archive, dossier, speaking idle, speaking recording, speaking review, debrief agent view, debrief audience view and mission report states.
- Art pipeline: `art/generate.js` (`npm run art:prepare`) prints prompts. `art/review-server.js` (`npm run art:review`) handles review, approval and apply. `art/apply.js` copies approved art into `assets/` and writes `assets/manifest.js`, with a backup in `art/rollback/`.
- Applied art (2026-09-12): all six dossier portraits (Ben, Mia, Leo, Emma, Sam, Lily), the four front-view NPC agents, the four back-of-head NPC agents, the title background, the archive background, the commander, the room background. Every phase-1/phase-2 background and character slot in `art/manifest.json` is now filled except `player_avatar` and `avatar_presets_others` (see below).
- `room_background` was applied despite being photorealistic 3D-rendered rather than the game's 2D anime/cel-shaded style (both generated candidates came back this way) — accepted as-is per explicit instruction rather than blocked on style purity. Revisit if it reads as visually inconsistent in playtesting.

## Current Work
The artwork-first interface polish is implemented. Raster art replacement continues phase by phase (see `art/manifest.json`); backgrounds, NPCs and dossiers are done, and only the player-avatar system remains.

## Known Issues
- `player_avatar` preset 1: a properly transparent generation-2 candidate is approved (`use-as-is` in state.json) but `art/apply.js` still blocks it by design until the phase-3 face overlays exist (avatar_base, eyes_open, eyes_closed, mouth_closed/small/medium/wide) — see `art/apply.js`.
- The old opaque-background commander/player_avatar generation-1 candidates are superseded by generation-2 (real transparency) and can be ignored/cleaned up.
- The four `npc_agents_back` images are 1254x1254 (generator returned larger than the requested 1024x1024); square aspect is correct and they render fine at display size, but resize if exact source dimensions ever matter.

## Next Steps
1. Build the phase-3 avatar face overlays (or the neutral-base + drawn-overlay approach noted in `art/manifest.json`), then apply `player_avatar` preset 1.
2. `avatar_presets_others` (p2/p3/p4) is now unblocked since preset 1 is approved — `node art/generate.js --asset avatar_presets_others` has already prepared prompts referencing the approved preset-1 image as style reference; generate and review those next.
3. After all four presets are approved: their own phase-3 overlays.
