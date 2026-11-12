# Spy Operations — Frozen Design & Interface Contract

Status: FROZEN 2026-11-12. Workers implement against this file. Changing an interface
here requires the product lead (Claude) to update this file first.

Read also: `DESIGN_DECISIONS.md` (what must not regress), `CURRENT_STATE.md`.

## 1. What is being built

The existing game (Archive → Dossier → record 4 sentences → HQ debrief → report) becomes the
middle of a longer **Operation**:

```
Archive (pick mark + level + mode)
  → Assignment card (HQ radio: "New assignment. Subject file is LOCKED.")
  → INTEL minigame          (photo | typing | password)     → unlocks the dossier
  → Dossier                 (existing, plus NEW INTEL stamps on facts the minigame revealed)
  → Speaking mission        (existing, unchanged)
  → HQ debrief              (existing; in operation mode the lead analyst's final line is followed
                              by "SUBJECT SPOTTED — BEGIN INTERCEPTION" instead of MISSION COMPLETE)
  → INTERCEPT minigame      (chase | cctv | drone)           → caught | escaped
  → Ending                  (first-ever success: training-exercise REVEAL; later: "training case closed")
  → Badge ceremony          (player + mark each receive badges)
  → After-action report     (existing AAR, extended with intel/intercept/badges rows)
```

Escape → friendly escape screen (mark earns ESCAPE SPECIALIST) → RETRY INTERCEPTION (same recorded
clips, no re-briefing) or end the operation (report without the interception badge).

**Two modes on the archive screen:** `FULL OPERATION` (default) and `BRIEFING ONLY` (exactly the
existing flow, byte-for-byte behaviour — for teachers short on class time). Mode persists in the save.

**Operation setup (archive):** Intel = AUTO | PHOTO | TYPING | PASSWORD; Intercept = AUTO | CHASE |
CCTV | DRONE. AUTO picks the least-recently-played game of that kind (ties random). URL params
`?intel=photo&intercept=drone&seed=123` override for testing.

## 2. The English must matter (core rule)

Every minigame's correct answer is derived **from the mark's dossier facts for the current grammar
pack**, built solution-first, then distractors are generated around it and validated.

* **Intel games reveal facts.** Each intel game targets 1–2 fact keys of the current pack
  (L1: personality/likes/can; L2: has/wants/dislikes; NAME is always known). Revealed fact keys are
  returned in `result.revealed` and stamped NEW INTEL in the dossier.
* **Intercept games identify by facts made visible.** The mark carries an observable prop tied to
  a fact (see §5 `FACT_VISUALS`) and wears their `look.shirt` colour. HQ's intel panel lists clue
  sentences in the pack's grammar ("He has a dog.", "He likes soccer.", "He has a red shirt.").
  Decoys are generated so **exactly one person satisfies all clues** (validator-enforced). Never
  imply identification from a hobby alone: hobbies only count when shown by a visible prop.
* **Chase uses facts at route forks.** HQ radio gives a fact sentence; signposts at forks show
  places (emoji + word). The fact-consistent route is a shortcut (catch-up), the other is longer —
  never a dead end.

## 3. Global rules (all minigames)

* Nonviolent. "Intercept" = a friendly field agent taps the mark's shoulder / mark stops and
  smiles. No handcuffs, cages, jail, weapons, grabbing or tackling. A wrong selection in CCTV/drone
  produces "Not our target — sorry!" with the decoy waving happily; never a detention.
* Forgiving. No instant failure on a single mistake. Errors cost a little time/score.
* **Relaxed mode** (`App.save.ops.relaxed`, toggle on archive): no timers/alert meters fail you,
  drone battery does not drain below 25%, chase mark is 15% slower and cannot escape by distance.
* Pause: on `visibilitychange` hidden or window `blur`, the game loop and all game timers pause and
  a PAUSED overlay with RESUME appears. Provided by the kit.
* Input: keyboard + mouse + touch. Every action reachable by touch (on-screen buttons). Chromebook
  target 1366×768 and 1280×800; must also lay out at 1024×600 with no page scroll.
* Performance: one `<canvas>` per game max (plus DOM UI), devicePixelRatio capped at 1.5, target
  60 fps with logic using fixed-timestep dt; no per-frame allocation of large objects; no libraries.
* Audio: only via `Sfx` (WebAudio, respects mute). New sounds may be added as methods inside the
  minigame's own file using `Sfx.tone/noise` helpers exposed by the kit (`Kit.sfx`), never files.
* Language: elementary EFL. Short sentences, words from §5 vocab. UI labels in English capitals
  consistent with the existing agency style (navy/amber/cyan, `styles.css` tokens).
* Every timer/listener/RAF is created through the kit so `destroy()` cleans everything.

## 4. Files and ownership

| File | Owner slice | Notes |
|---|---|---|
| `js/missions.js` | framework | pure, Node-loadable (like `evaluate.js`): profiles, crowds, validation, game selection, badges |
| `js/mg/kit.js` | framework | runtime: loop, pause, input, timers, canvas, rng, sprite drawing |
| `js/mg/registry.js` | framework | `Minigames.register/get/list` |
| `js/mg/stub.js` | framework | temporary stand-ins registered for any id not yet implemented |
| `js/game.js`, `styles.css`, `index.html`, `js/data.js` | framework | flow, ending, ceremony, badge collection, archive setup |
| `test-all.js`, `test-missions.js` | framework | `npm test` runs every `test-*.js` except `test-e2e*.js` |
| `js/mg/photo.js` + `css/mg-photo.css` + `test-mg-photo.js` | intel slice | |
| `js/mg/typing.js` + `css/mg-typing.css` + `test-mg-typing.js` | intel slice | |
| `js/mg/password.js` + `css/mg-password.css` + `test-mg-password.js` | intel slice | |
| `js/mg/chase.js` + `css/mg-chase.css` + `test-mg-chase.js` | chase slice | |
| `js/mg/cctv.js` + `css/mg-cctv.css` + `test-mg-cctv.js` | cctv slice | |
| `js/mg/drone.js` + `css/mg-drone.css` + `test-mg-drone.js` | drone slice | |

Minigame slices **must not edit** framework files. If a kit helper is missing, implement it locally
in the minigame file and report it. The framework pre-creates every minigame file as a stub that
registers nothing (empty IIFE with a header comment), every CSS file empty, and includes all of
them in `index.html` in this order: data, evaluate, missions, manifest, art, sfx, recorder, icons,
mg/kit, mg/registry, mg/photo, mg/typing, mg/password, mg/chase, mg/cctv, mg/drone, mg/stub, game.
`mg/stub.js` registers a stub only for ids that are still unregistered.

Each minigame file is an IIFE that, in the browser, calls `Minigames.register(def)`, and under Node
exports its pure generator: `if (typeof module !== 'undefined') module.exports = { generate, validate }`.
Node-side tests load `js/data.js` + `js/missions.js` the same way `test-eval.js` loads evaluate.js.

## 5. Shared data (framework adds to `js/data.js`)

```js
// Each fact value used by any character → how it is shown visually.
// emoji is drawn with fillText / in DOM. `carry` = can be carried/shown as a prop in crowds.
FACT_VISUALS = {
  'soccer':      { emoji: '⚽', carry: true,  place: { emoji: '🥅', word: 'SOCCER FIELD' } },
  'drawing':     { emoji: '🎨', carry: true,  place: { emoji: '🖼️', word: 'ART MUSEUM' } },
  'robots':      { emoji: '🤖', carry: true,  place: { emoji: '🔧', word: 'ROBOT SHOP' } },
  'books':       { emoji: '📚', carry: true,  place: { emoji: '📖', word: 'LIBRARY' } },
  'music':       { emoji: '🎧', carry: true,  place: { emoji: '🎵', word: 'MUSIC SHOP' } },
  'flowers':     { emoji: '🌸', carry: true,  place: { emoji: '🌷', word: 'FLOWER SHOP' } },
  'swim':        { emoji: '🏊', carry: false, place: { emoji: '🏊', word: 'POOL' } },
  'sing':        { emoji: '🎤', carry: true,  place: { emoji: '🎤', word: 'KARAOKE' } },
  'run fast':    { emoji: '🏃', carry: false, place: { emoji: '🏟️', word: 'STADIUM' } },
  'dance':       { emoji: '💃', carry: false, place: { emoji: '🪩', word: 'DANCE STUDIO' } },
  'play the piano': { emoji: '🎹', carry: false, place: { emoji: '🎹', word: 'PIANO SCHOOL' } },
  'ride a bike': { emoji: '🚲', carry: true,  place: { emoji: '🚲', word: 'BIKE PATH' } },
  'a dog': {emoji:'🐶',carry:true}, 'a cat': {emoji:'🐱',carry:true}, 'a skateboard': {emoji:'🛹',carry:true},
  'a rabbit': {emoji:'🐰',carry:true}, 'a bird': {emoji:'🐦',carry:true}, 'a hamster': {emoji:'🐹',carry:true},
  // wants/dislikes/personality: emoji only (photo + password use), carry:false
  ...
}
INTEL_VOCAB = { 1: [...3–5 letter familiar words], 2: [...4–7 letters], 3: [...longer + 2-word phrases] }
PASSWORD_BANK = [ { answer: 'DOG', factValue: 'a dog', clues: ["It's an animal.", "It says woof.", "It likes to walk."] }, ... ]
```
`PASSWORD_BANK` must contain an entry for every `has`, `likes`, `wants`, `dislikes` value of every
character (answer = the core noun: DOG, SOCCER, BALL, CARROTS…), plus ≥12 extra non-character
entries usable as practice/decoys. Clues are ordered general → specific; the last clue alone must
be unambiguous among the bank. Intel slice may extend the bank but not change existing entries.

## 6. `js/missions.js` API (framework)

```js
Missions.profile(char, pack) → {
  markId, name, pro, Pro,                    // 'he'/'He'
  look: char.look,                            // shirt, hair, hairColor, skin, glasses
  packFacts: [{ key, value, sentence }],      // the pack's non-NAME steps, e.g. {key:'likes', value:'soccer', sentence:'He likes soccer.'}
  prop: { factKey, value, emoji },            // first carryable fact for this pack (has → likes → can), always defined
  appearance: { shirt, shirtWord, sentence }, // shirtWord from a fixed colour→word map ('red','pink','orange','purple','green','yellow')
  clues: [sentence...],                       // prop sentence + appearance sentence (+ 1 more at tier 3)
}
Missions.makeCrowd(profile, { count, tier, rng }) → [person]   // person = { id, isMark, look, prop:{emoji}|null, name? }
   // exactly one isMark; every decoy fails ≥1 clue; at tier ≥2 some decoys share the prop OR the shirt (never both)
Missions.validateCrowd(profile, crowd) → [] | [errorString]
Missions.pickGames(save, overrides, rng) → { intel: 'photo'|'typing'|'password', intercept: 'chase'|'cctv'|'drone' }
Missions.tierFor(save) → 1|2|3                // 1: <2 completed ops, 2: <5, 3: otherwise
Missions.badgesFor(outcome) → { player: [badgeId], mark: [badgeId] }
Missions.BADGES = { id: { name, icon (emoji), desc } }
Missions.rng(seed) → () => [0,1)             // deterministic (mulberry32)
```
Player badges: `INTEL_AGENT` (intel complete), `CLEAR_REPORTER` (4 clips sent), plus intercept-specific
on success: `PURSUIT_SPECIALIST` (chase), `SURVEILLANCE_SPECIALIST` (cctv), `DRONE_PILOT` (drone),
`MISSION_COMPLETE`, and `SHARP_EYE` (no wrong selections). Mark badges: always `UNDERCOVER_AGENT`;
plus `MASTER_OF_DISGUISE` (cctv/drone), `STEALTH_TRAINEE` (hid ≥2 times), `ESCAPE_SPECIALIST` (escaped).

## 7. Minigame interface (`js/mg/registry.js`, `js/mg/kit.js`)

```js
Minigames.register({
  id: 'photo',                 // photo|typing|password|chase|cctv|drone
  kind: 'intel',               // 'intel' | 'intercept'
  title: 'PHOTOGRAPHIC IDENTIFICATION',
  brief: c => 'Find the photo that matches the clue.',   // one-line instruction shown on the intro card
  mount(host, ctx) { ...; return { destroy() {} }; }
});

ctx = {
  mark,            // DATA character
  pack,            // DATA grammar pack
  profile,         // Missions.profile(mark, pack)
  tier,            // 1|2|3
  relaxed,         // bool
  seed, rng,       // deterministic per attempt
  agent,           // the player's avatar options (for drawing the player's agent)
  kit,             // Kit instance scoped to this mount (see below)
  done(result),    // call exactly once
}

result (intel)     = { success: true, score: 0..100, revealed: ['likes','can'], stats: {...} }
result (intercept) = { success: bool, outcome: 'caught'|'escaped', score: 0..100,
                       wrongPicks: n, markHides: n, stats: {...} }
```
Intel games always end in success (they can't be failed; mistakes cost score). The framework shows
the intro card (title, brief, how-to, START) before `mount`, and handles the result screen after
`done`. Minigames render only inside `host` (a full-screen element below the HUD).

**Kit (one instance per mount, all resources auto-released on destroy):**
```js
kit.canvas(host, w, h) → { canvas, g }        // logical size w×h, CSS-scaled to fit host, DPR ≤1.5
kit.loop(update(dt), render())                // fixed 1/60 s updates, pauses automatically
kit.on(target, type, fn, opts)                // tracked listener
kit.after(ms, fn) / kit.every(ms, fn)         // pausable timers
kit.keys                                      // { left, right, up, down, action, ... } live state; WASD + arrows + Space/E
kit.touchPad(host, buttons)                   // on-screen buttons that feed kit.keys
kit.paused                                     // bool
kit.sfx                                        // { blip, good, bad, tick, alarm, success, whoosh, tone(opt), noise(opt) }
kit.drawChild(g, person, x, y, { view: 'side'|'top'|'front', scale, frame, facing, pose, showProp })
   // procedural child: skin, hair style+colour, shirt colour, glasses, held prop emoji
   // side: walk/run cycle by frame, poses 'run'|'jump'|'duck'|'idle'|'hide'|'wave'|'smile'
   // top: head circle with hair, shoulders in shirt colour, prop emoji beside (readable at scale ≥1)
   // front: full-body, poses 'idle'|'wave'|'swim'|'sing'|'dance'|'ride'|'hold'|'yuck'|'read'|'run'
kit.drawAgent(g, avatarOpts, x, y, { view: 'side'|'top', scale, frame, pose })
   // simplified player agent retaining gender, skin, hair, hairColor, suit colour, tie colour,
   // outfit (suit/coat/skirt silhouette), shades
kit.destroy()
```

## 8. Per-game minimum feature contract

**photo (intel).** 3 rounds. Each round: HQ clue sentence from `profile.packFacts` (round 3 at tier≥2
may combine two facts, e.g. "He likes soccer and he has a dog."). Four "surveillance frames"
(`kit.drawChild` front view + scene props + location tint + timestamp + CAM id), positions
shuffled. Distractors: same mark doing other activities from other characters' fact values of the
same category (never the true value). For `dislikes`, the correct frame shows a 'yuck' pose with
the item; distractors show 'yuck' with other items. For `personality`, round shows situational
scenes (kind: helping; funny: making friends laugh…) — authored table. Wrong pick: frame marked
"NO MATCH", −10 score, try again. Correct: zoom + "MATCH CONFIRMED" stamp + fact revealed.

**typing (intel).** Terminal UI. Sequence: mark's pack fact words interleaved with tier vocab
(10/12/14 words). Current word big; typed letters green; wrong key shakes letter and costs 0.6 s of
progress-freeze, never deletes progress. Security alert meter rises slowly over time and on errors;
reaching full triggers a "FIREWALL RESET" (lose 2 words of progress, not the game). Relaxed: meter
disabled. Touch: on-screen letter keyboard. Finish: ACCESS GRANTED + file slides open revealing the
mark's fact lines. Word order randomized per seed.

**password (intel).** 2 passwords per mission. Answer from `PASSWORD_BANK` entries matching the
mark's pack facts. Clues appear one at a time (start with 1; "NEXT CLUE" reveals more, −10 each).
Letter-tile pool (answer letters + decoy letters, shuffled) and answer slots; keyboard optional.
3 wrong submissions → offer "HINT: first letter" then "HINT: reveal a letter". Lock dial / vault
animation on success; fact revealed.

**chase (intercept).** Side-scroller canvas 960×540 logical. Player = `kit.drawAgent` side view.
Mark runs ahead with AI (speed varies, jumps obstacles, hides 1–3 times). Procedural chunks: city
street theme first (benches, boxes, pedestrians to slide past, low barriers to jump, small gaps,
stairs, sliding doors, construction cones); ≥1 alternate theme (park or station) at tier ≥2. Forks
with signposts tied to facts (§2). Hiding spots: vending machine, tree, sign, shop door, boxes —
mark ducks behind; a "?" shimmer and peeking hair give it away; walking past + pressing E / SEARCH
button finds them (they pop out and resume ahead); if missed they reappear shortly ahead. Distance
meter, "GAINING!"/"LOSING GROUND" cues, speed boosts (energy drink 🥤 -> "SPEED BOOST", conveyor).
Catch: reach the mark → slow-mo, mark stops, turns, smiles ("You caught me!"). Escape: distance
>limit for 4 s or timer (90/80/70 s) ends; relaxed disables both and mark tires after 60 s.
Controls ←/→ move, ↑/Space jump, ↓ slide, E search; touch pad. Generous coyote time and jump buffering.

**cctv (intercept).** 4–6 numbered camera feeds of one connected place (station concourse,
shopping street, park, plaza). Left: big active feed (canvas); right: thumbnail list showing
low-detail live previews. People (from `Missions.makeCrowd`, 8/12/16) walk believable paths between
cameras (graph of zones with exits), pause, sit, enter shops (disappear inside then exit),
pass behind occluders (pillars, vending machines, plants). Mark actively hides 1–3 times. Intel
panel lists `profile.clues`. Click a person on the active feed → "MARK LOCATED — SEND TEAM" button.
Team (2 agents) visibly walks within the cameras to the last reported position; if the mark has
moved, a "TARGET MOVED — UPDATE POSITION" prompt asks the player to re-tag. Wrong person: team
arrives, decoy waves, "Not our target — sorry!", −score, continue. Success when team reaches the
correctly-tagged mark: mark stops & smiles, "INTERCEPTION SUCCESSFUL". No failure state other than
an optional generous time limit (none in relaxed); give a hint after long inactivity (blink the
camera the mark is on).

**drone (intercept).** Top-down canvas map (park + neighbourhood, ~4× viewport), drone view with
zoom 1×/2× (buttons + Q/E or +/-); at 1× people show only shirt colour, at 2× props/hair readable.
WASD/arrows move, smooth easing, no physics. Battery meter drains slowly (relaxed min 25%), charge
pads on rooftops restore it; empty battery = "RETURN TO BASE" with instant relaunch (not failure).
Occluders: trees, covered market, buildings with doors, alley walls; mark hides under them 1–3 times
and changes route. Hold SCAN (Space / button) on a person 0.8 s → ID card with visible attributes.
"CONFIRM TARGET — SEND TEAM" → team car/agents move on roads to the mark; drone may keep following;
team catches if they reach the mark's current position (mark may move; team re-targets automatically
while the mark is in drone view, otherwise to last seen). Wrong target: friendly wave as in cctv.
Mini-map with searched areas shaded.

## 9. Ending, ceremony, progression (framework)

Save additions (in `App.save`, migrated with defaults — never break an old save):
```js
ops: { mode:'full'|'briefing', relaxed:false, revealSeen:false, completed:0, intercepts:0,
       escapes:0, badges:{ badgeId: count }, byMark:{ ben:n,... }, best:{ photo:score,... },
       lastPlayed:{ photo:ts,... }, setup:{ intel:'auto', intercept:'auto' } }
```
No personal data (codename only, as now). Badge collection screen reachable from title + archive.

* First success (`!revealSeen`): reveal cinematic (CSS/SVG, ~12 s, skippable): team stops the
  mark → mark smiles → HQ official (painted commander/lead analyst art) walks in → dialogue lines
  from the brief ("Excellent work, Agent!", "You found the target!", mark "You caught me!",
  "Surprise! This was a training mission!", "You are both secret agents!", mark "That was fun!")
  → `revealSeen = true` → ceremony.
* Later successes: short "TRAINING CASE CLOSED" scene with mark waving, HQ line
  "Another great training mission, Agent!" → ceremony.
* Assignment card copy after reveal: "New training challenge: find Agent <codename of mark>."
  Before reveal: "Locate the subject." (mark is "the subject", never "criminal"/"bad").
* Ceremony at HQ room background: player agent (`Art.agentFull`) + mark (`Art.portrait` or kit front
  drawChild) side by side, badges presented one at a time with fanfare, then AAR.
* Escape: friendly screen — mark waves, mark earns ESCAPE_SPECIALIST, HQ "So close! Try again,
  Agent!" — buttons RETRY INTERCEPTION (new seed, same clips) / END OPERATION.
* Mission bonus (`DATA.MISSION_BONUS`) is still issued once per operation at the AAR; add
  `INTERCEPT_BONUS: 30` on success only. Points per clip unchanged. Ranks unchanged.
