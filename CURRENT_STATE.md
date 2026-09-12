# Current State

## Status
The game is playable end to end (`node test-e2e.js` passes, 120 points). Painted raster art is partly in; any slot without approved art falls back to procedural SVG.

## What Exists
- Game: `index.html`, `styles.css`, `js/` (data, art, sfx, recorder, game).
- Art pipeline: `art/generate.js` (`npm run art:prepare`) prints prompts. `art/review-server.js` (`npm run art:review`) handles review, approval and apply. `art/apply.js` copies approved art into `assets/` and writes `assets/manifest.js`, with a backup in `art/rollback/`.
- Applied art (2026-09-12): all six dossier portraits (Ben, Mia, Leo, Emma, Sam, Lily), the four front-view NPC agents, the four back-of-head NPC agents, the title background, the archive background, the commander, the room background. Every phase-1/phase-2 background and character slot in `art/manifest.json` is now filled except `player_avatar` and `avatar_presets_others` (see below).
- `room_background` was applied despite being photorealistic 3D-rendered rather than the game's 2D anime/cel-shaded style (both generated candidates came back this way) — accepted as-is per explicit instruction rather than blocked on style purity. Revisit if it reads as visually inconsistent in playtesting.

## Current Work
Raster art replacement, phase by phase (see `art/manifest.json`). Backgrounds/NPCs/dossiers are done; only the player-avatar system remains.

## Known Issues
- `player_avatar` preset 1: a properly transparent generation-2 candidate is approved (`use-as-is` in state.json) but `art/apply.js` still blocks it by design until the phase-3 face overlays exist (avatar_base, eyes_open, eyes_closed, mouth_closed/small/medium/wide) — see `art/apply.js`.
- The old opaque-background commander/player_avatar generation-1 candidates are superseded by generation-2 (real transparency) and can be ignored/cleaned up.
- The four `npc_agents_back` images are 1254x1254 (generator returned larger than the requested 1024x1024); square aspect is correct and they render fine at display size, but resize if exact source dimensions ever matter.

## Next Steps
1. Build the phase-3 avatar face overlays (or the neutral-base + drawn-overlay approach noted in `art/manifest.json`), then apply `player_avatar` preset 1.
2. `avatar_presets_others` (p2/p3/p4) is now unblocked since preset 1 is approved — `node art/generate.js --asset avatar_presets_others` has already prepared prompts referencing the approved preset-1 image as style reference; generate and review those next.
3. After all four presets are approved: their own phase-3 overlays.
