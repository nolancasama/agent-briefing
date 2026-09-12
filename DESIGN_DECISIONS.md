# Design Decisions

This file records meaningful product, UX, visual, architectural, or behavioral decisions for this project.

For each significant decision, record:

- Date
- What was decided or changed
- Why
- Previous approach, if relevant
- Rejected alternatives, if useful

Only record decisions that may be useful to understand later.

Do NOT record:
- trivial UI adjustments
- routine bug fixes
- formatting changes
- mechanical refactors with no design consequence
- every individual code modification

Git is the source of truth for detailed code-change history.

A useful rule:

> If a future developer or AI could reasonably ask, "Why is it designed this way?", record the answer here.

## 2026-08-25 — Avatar presets and logo
- Player avatar: four painted presets (one shared pose, camera, suit, lighting) replace the parametric customizer, but only once approved preset art exists. The SVG customizer stays until then.
- Agency logo: the SVG emblem with its live radar sweep stays. It is excluded from raster generation.

## 2026-09-12 — First raster art applied
- Applied: `dossier_ben`, `npc_agents_front` (npc1–4), `title_background`, `archive_background`.
- Title background uses a post-processed version (candidate-02). The generated image put a bright reception desk and the world map dead-centre, behind the logo and START button, so the centre was darkened with a soft radial multiply and the edges left as they were. The original is kept as candidate-01.
- NPC picks: npc1 candidate-02 (hands clasped, which matches npc3's seated pose better than crossed arms); npc4 candidate-02 (adjusting her sunglasses; the chin-rest pose is kept as candidate-01).
- The NPC PNGs keep their semi-transparent blue/amber glow halo. Composited in the debrief it reads as rim light, so it was left in on purpose.

## 2026-09-12 — Remaining five dossier portraits applied
- Applied: `dossier_others` (Mia, Leo, Emma, Sam, Lily), one candidate each. All six archive-wall portraits are now painted art; no dossier slot still falls back to SVG.
- Each portrait was generated with Ben's approved portrait attached as a style reference, so hair rendering, eye style, rim light and backdrop hue match across the set without per-image touch-up.

## 2026-09-12 — Live speech recognition auto-stops recording, never auto-retries
- Recording now auto-stops early (after a ~900ms grace period, plus a 500ms buffer once triggered) when the live interim transcript already contains enough of the target fact/pattern words. Manual stop and the 8s cap still work as before.
- Deliberately one-directional: a mismatch never auto-restarts or blocks "SEND TO HQ". Browser speech recognition is unreliable for kids' voices and accents, so treating a miss as "wrong" would trap a student who said the sentence correctly but got mis-heard. This mirrors the existing `evaluateClip` philosophy (recognition only ever adds encouraging signal).
- Rejected: auto-restart on a low match — too likely to loop a correct answer.
