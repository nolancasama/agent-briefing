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

## 2026-09-12 — Artwork-first cinematic interface
- Simplified the interface to foreground the painted artwork and cinematic spy-agency presentation.
- Replaced per-screen stacks of dashboard-like panels with one principal display per screen; field intelligence retains a tangible manila dossier while headquarters uses restrained navy, amber and cyan technology.
- Removed non-informational chrome so mission actions, recording states and verified or unverified results carry the visual hierarchy without changing the game flow or evaluation meaning.

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

## 2026-09-12 — Factual content gates briefing evaluation

- **The fact is what is scored, not the sentence frame.** Previously `evaluateClip` blended fact
  match (45%), grammar-frame match (30%), completeness and STT confidence into one number. A
  student who deliberately said "He is strong." for the target "He is kind." scored 0.54, and
  three correct answers averaged that away to an overall **S rank**. Grammar could rescue wrong
  intelligence. It no longer can: quality now sits in non-overlapping bands by verification
  state, so a mismatch tops out near the floor no matter how perfect the frame is.
- **Recognition resolves to four explicit states** — `confirmed`, `partial`, `mismatch`,
  `unverified` — instead of a bare number. `partial` was added beyond the original three because
  the facts here are multi-word ("a new ball", "play the piano", "run fast"): a child who says
  "He wants a ball" has reported *incomplete* intelligence, not *wrong* intelligence, and
  collapsing that into `mismatch` would punish an honest partial answer as if it were an error.
- **Unverified is neutral, never implicitly positive.** A missing or unusable STT result used to
  fall back to `0.75`, which by itself graded an **A** — so a browser without speech recognition
  scored better than a child who was correctly heard but spoke imperfectly. Unverified now
  carries `quality: null` and is excluded from the average entirely. It neither rewards nor
  punishes, and the clip is still recorded, still sent, and still played in the debrief.
- **A known factual mismatch caps the mission.** Aggregation is explicit caps over the average of
  *verified* clips, not a blended weighting: any mismatch caps at B, two caps at C, two partials
  cap at A, any unverified caps at A, and an unverified majority caps at B. Three excellent
  answers can no longer hide one demonstrably wrong fact.
- **When nothing could be verified there is no grade.** The report shows `SIGNAL UNVERIFIED`
  rather than inventing a letter, and the commander thanks the agent for the report instead of
  praising content HQ cannot vouch for. Labels claiming knowledge the game does not have
  ("FULL UNDERSTANDING") were removed for the same reason.
- Rejected: aggressive rejection heuristics to catch Chrome mis-hearing "strong" as "kind".
  Unfixable with the browser recognizer and it would produce false negatives for exactly the
  children this game is for. The fix is limited to transcripts that clearly show a mismatch.
- Unchanged on purpose: recognition still never gates play. `SEND TO HQ` stays available after a
  mismatch or an unverified clip, nothing auto-restarts, and points per clip are unaffected — a
  child is never told mid-mission that they were wrong, so the in-mission stamp reads VERIFIED
  only when the fact came through and RECEIVED otherwise. Detail belongs in the after-action
  report.
- This supersedes the parenthetical in the entry above: `evaluateClip` no longer "only ever adds
  encouraging signal". It can now mark content as incorrect. The *gameplay* half of that decision
  still stands in full — auto-stop remains positive-only and now requires the fact to be present,
  not merely the frame.

## 2026-10-25 — Automatic verified dispatch, two editable models and seated HQ reply
- A correct live speech-recognition result ends recording automatically after a minimum duration and short trailing buffer. Once the completed clip is verified for both reported fact and sentence frame, it is automatically sent to headquarters after a short acknowledgement. Partial, mismatched, quiet or unverified results remain manually reviewable and sendable; speech recognition does not block children.
- Normalize contracted and expanded negative forms such as "doesn't" and "does not" so correct Level 2 speech can trigger hands-free dispatch.
- First-time agent creation visibly offers male/female procedural SVG models. Both retain full mouth animation and the same independently customizable skin, hair, clothes colors, sunglasses and outfit silhouette choices (suit, trench coat, skirt suit). These should eventually be replaced by art sets that preserve both customization and lip sync, not a single uneditable PNG.
- HQ's last response comes from the seated center listener rather than a separate commander on the far right. The extra table wedge was removed because it conflicted with the painted seated characters and perspective.
- Mic hardware is released on mission exit. Rewatching a debrief does not re-issue earned points.

## 2026-11-12 — Spy Operations: minigames wrapped around the briefing
- The briefing becomes the middle of an Operation: intel minigame → dossier → recording → HQ debrief → interception minigame → ending → badge ceremony → report. One intel + one interception game per operation (9 pairings). Full contract: `docs/OPERATIONS_SPEC.md`.
- **English drives every answer, solution-first.** Intel games reveal the pack's facts; interception targets are identified by facts made visible (a carried prop tied to a fact plus shirt colour), with crowds validated so exactly one person matches all clues. Hobbies only count when shown by a visible prop. Chase uses fact clues at route forks (correct route = shortcut, never a dead end).
- **BRIEFING ONLY mode kept** (archive toggle) so teachers short on time get the original flow unchanged. Added beyond the original plan.
- **One global Relaxed mode** instead of per-game accessibility settings: removes failure timers/alert meters, floors drone battery, slows the chase mark.
- Teacher-facing operation setup (AUTO or a chosen game per kind) and URL overrides, so specific pairings can be played in class and tested.
- Intel games cannot be failed (mistakes cost score only); interception can end in a friendly escape with instant retry that keeps the recorded clips.
- Wrong selections in CCTV/drone end with the decoy waving and "Not our target — sorry!" — never a detention. Interception is a shoulder-tap / mark stops and smiles.
- Rejected: building all six games as one monolithic change, and a combined CCTV+drone engine (different camera models; shared crowd generation lives in `js/missions.js` instead).
- Minigame art is procedural canvas (kit `drawChild`/`drawAgent`) plus emoji props, not new raster art, to keep the build dependency-free and fast on Chromebooks; the painted art remains for dossier, HQ and ceremony.

## 2026-11-12 — Framework contract details for independently owned games
- `Missions.profile(char, pack)` returns the two base clues. Because that API has no tier argument, the framework appends an observable hair-style sentence to the context profile at tier 3. Crowd validation checks that extra hair attribute whenever a third clue is present; props and shirt still uniquely identify the mark at every tier.
- `Missions.badgesFor` consumes `{ intel: intelResult, clips: clipArrayOrCount, intercept: gameId, success, outcome, wrongPicks, markHides }`. It also accepts explicit `intelComplete` / `clipsSent` flags. Minigames continue returning only the frozen result interface; the framework supplies operation context.
- Ending an operation after an escape counts as a completed operation for progression. Successful interceptions are counted separately. Each escape attempt increments `escapes`; retry preserves all earned badges, with each badge counted at most once per operation. Progression is finalized at the report; escape badges are saved immediately so they appear in the collection even if the player leaves before retrying.
- `Missions.migrateSave` is the pure, shared migration entry point used by the browser and Node tests. Kit instances are constructed with `new Kit(host)` (also `Kit.create(host)`); timer handles expose `cancel()`. Touch controls accept key strings, `{key,label}` entries, or a key-to-label object.

## 2026-11-12 — Drone town is a fixed place
- The drone neighbourhood layout is fixed (same streets and blocks every mission); only people, the mark's itinerary and hiding choices vary with the seed. Children learn the town and can predict hiding spots, which the spec's "predict their next location" needs. Decided by the user.
- Block archetypes borrowed (as ideas, not code) from the Godot `tower-command/UrbanHunter` district: houses with an alley, parking lot with a carport, construction site under a tarp, alongside park and covered market. That project's code is 3D Godot with combat mechanics and was not reused.
- Rejected: shuffling block positions per mission (less learnable, no gameplay gain).

## 2026-11-12 — Minigame rules settled during implementation
- Every intel game reveals all three of the pack's facts (photo: one round per fact; typing: fact words hidden in the stream; password: one vault per fact), so the dossier never shows a faded, unrevealed fact before recording.
- Photo frames use a per-verb visual grammar (can = doing it, likes = ❤️, has = holding/beside, wants = 💭, doesn't like = yuck face + 💢). From tier 2 one decoy shows the right item with the opposite verb, so the verb decides the answer, not just the noun.
- Chase: the mark cannot be caught before the last fork (it sprints to keep a lead), so the English fork clues always matter; hiding spots only appear after the forks. Escape needs a large gap held for several seconds (longer at low tiers) so a child pausing to read the radio does not lose.
- CCTV and drone people follow seeded itineraries rather than live AI, so solvability (one full match, hide count/length, visibility) is proven in Node tests.
- Drone scanning requires 2× zoom; at 1× only shirt colours are visible. An empty battery relaunches from base, never fails.
- A `?debug` URL flag exposes test hooks (`window.__mgDone`, `window.__mg`) for automated playthroughs; nothing changes for players.
