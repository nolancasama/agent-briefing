/* Pure operation rules. No browser state, clock, or storage access. */
'use strict';
const Missions = (() => {
  const data = typeof module !== 'undefined' && module.exports ? require('./data.js') : DATA;
  const GAMES = { intel: ['photo', 'typing', 'password'], intercept: ['chase', 'cctv', 'drone'] };
  const COLORS = { '#e74c3c': 'red', '#ff6fa5': 'pink', '#f39c12': 'orange', '#9b59b6': 'purple', '#16a085': 'green', '#f4c518': 'yellow' };
  const BADGES = {
    INTEL_AGENT: { name: 'INTEL AGENT', icon: '🔎', desc: 'Unlocked a subject file.' },
    CLEAR_REPORTER: { name: 'CLEAR REPORTER', icon: '🎙️', desc: 'Sent four reports to HQ.' },
    PURSUIT_SPECIALIST: { name: 'PURSUIT SPECIALIST', icon: '👟', desc: 'Completed a friendly field pursuit.' },
    SURVEILLANCE_SPECIALIST: { name: 'SURVEILLANCE SPECIALIST', icon: '📹', desc: 'Located the mark on camera.' },
    DRONE_PILOT: { name: 'DRONE PILOT', icon: '🛸', desc: 'Guided the drone team to the mark.' },
    MISSION_COMPLETE: { name: 'MISSION COMPLETE', icon: '🏅', desc: 'Completed an operation.' },
    SHARP_EYE: { name: 'SHARP EYE', icon: '👁️', desc: 'Reached the mark without a wrong selection.' },
    UNDERCOVER_AGENT: { name: 'UNDERCOVER AGENT', icon: '🕶️', desc: 'Played the undercover mark.' },
    MASTER_OF_DISGUISE: { name: 'MASTER OF DISGUISE', icon: '🎭', desc: 'Practiced moving through a crowd.' },
    STEALTH_TRAINEE: { name: 'STEALTH TRAINEE', icon: '🌳', desc: 'Found at least two hiding spots.' },
    ESCAPE_SPECIALIST: { name: 'ESCAPE SPECIALIST', icon: '💨', desc: 'Slipped away with a friendly wave.' },
  };
  function rng(seed) {
    let state = Number(seed) >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let t = Math.imul(state ^ state >>> 15, 1 | state);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function factKey(step) { return step.factLabel === "DOESN'T LIKE" ? 'dislikes' : step.factLabel.toLowerCase(); }
  function profile(char, pack) {
    const packFacts = pack.steps.filter(s => s.factLabel !== 'NAME').map(s => ({ key: factKey(s), value: s.fact(char), sentence: s.answer(char) }));
    const fact = ['has', 'likes', 'can'].map(k => packFacts.find(f => f.key === k && data.FACT_VISUALS[f.value].carry)).find(Boolean);
    const prop = { factKey: fact.key, value: fact.value, emoji: data.FACT_VISUALS[fact.value].emoji };
    const shirtWord = COLORS[char.look.shirt.toLowerCase()];
    const appearance = { shirt: char.look.shirt, shirtWord, sentence: `${data.Pro(char)} has a ${shirtWord} shirt.` };
    return { markId: char.id, name: char.name, pro: data.pro(char), Pro: data.Pro(char), look: char.look, packFacts, prop, appearance, clues: [fact.sentence, appearance.sentence] };
  }
  function makeCrowd(p, { count = 8, tier = 1, rng: random = Math.random } = {}) {
    count = Math.max(1, Math.floor(count));
    const others = data.CHARACTERS.filter(c => c.look.shirt !== p.look.shirt);
    const props = Object.values(data.FACT_VISUALS).filter(v => v.carry && v.emoji !== p.prop.emoji);
    const crowd = [{ id: p.markId, name: p.name, isMark: true, look: { ...p.look }, prop: { ...p.prop } }];
    for (let i = 1; i < count; i++) {
      const c = others[Math.floor(random() * others.length)];
      const look = { ...c.look };
      let prop = { emoji: props[Math.floor(random() * props.length)].emoji };
      if (tier >= 2 && i % 2) prop = { ...p.prop };
      else if (tier >= 2) look.shirt = p.look.shirt;
      crowd.push({ id: `decoy-${i}`, isMark: false, look, prop });
    }
    for (let i = crowd.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [crowd[i], crowd[j]] = [crowd[j], crowd[i]];
    }
    return crowd;
  }
  function validateCrowd(p, crowd) {
    const errors = [];
    if (!Array.isArray(crowd) || !crowd.length) return ['Crowd is empty.'];
    if (crowd.filter(c => c.isMark).length !== 1) errors.push('Crowd must have exactly one mark.');
    const matches = crowd.filter(c => c.look && c.look.shirt === p.appearance.shirt && c.prop && c.prop.emoji === p.prop.emoji && (p.clues.length < 3 || c.look.hair === p.look.hair));
    if (matches.length !== 1 || !matches[0].isMark) errors.push('Exactly one person must satisfy all clues, and it must be the mark.');
    if (new Set(crowd.map(c => c.id)).size !== crowd.length) errors.push('Person IDs must be unique.');
    return errors;
  }
  const dict = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const nonnegative = n => Number.isFinite(n) && n >= 0 ? n : 0;
  function migrateSave(raw) {
    raw = dict(raw);
    const save = { points: 0, closed: {}, avatar: null, muted: false, packId: 'L1', ...raw };
    save.points = nonnegative(save.points);
    save.closed = dict(save.closed);
    const old = dict(raw.ops), setup = dict(old.setup);
    const cleanMap = (map, ids) => Object.fromEntries(Object.entries(dict(map)).filter(([id]) => ids.includes(id)).map(([id, n]) => [id, nonnegative(n)]));
    save.ops = {
      mode: old.mode === 'briefing' ? 'briefing' : 'full', relaxed: old.relaxed === true, revealSeen: old.revealSeen === true,
      completed: nonnegative(old.completed), intercepts: nonnegative(old.intercepts), escapes: nonnegative(old.escapes),
      badges: cleanMap(old.badges, Object.keys(BADGES)), byMark: cleanMap(old.byMark, data.CHARACTERS.map(c => c.id)),
      best: cleanMap(old.best, [...GAMES.intel, ...GAMES.intercept]), lastPlayed: cleanMap(old.lastPlayed, [...GAMES.intel, ...GAMES.intercept]),
      setup: Object.fromEntries(Object.entries(GAMES).map(([kind, ids]) => [kind, ids.includes(setup[kind]) ? setup[kind] : 'auto'])),
    };
    return save;
  }
  function pickGames(save, overrides = {}, random = Math.random) {
    const ops = migrateSave(save).ops;
    const pick = kind => {
      const override = String(overrides[kind] || '').toLowerCase();
      if (GAMES[kind].includes(override)) return override;
      const setup = override === 'auto' ? 'auto' : ops.setup[kind];
      if (GAMES[kind].includes(setup)) return setup;
      const min = Math.min(...GAMES[kind].map(id => ops.lastPlayed[id] || 0));
      const eligible = GAMES[kind].filter(id => (ops.lastPlayed[id] || 0) === min);
      return eligible[Math.floor(random() * eligible.length)];
    };
    return { intel: pick('intel'), intercept: pick('intercept') };
  }
  function tierFor(save) { const n = migrateSave(save).ops.completed; return n < 2 ? 1 : n < 5 ? 2 : 3; }
  // Outcome: {intel, clips, intercept:<id>, success, outcome, wrongPicks, markHides}.
  function badgesFor(o) {
    const result = typeof o.intercept === 'object' ? o.intercept : (o.result || o);
    const id = typeof o.intercept === 'string' ? o.intercept : (o.interceptId || o.interceptType || result.id);
    const player = [], mark = ['UNDERCOVER_AGENT'];
    if (o.intelComplete || o.intel && o.intel.success) player.push('INTEL_AGENT');
    if ((o.clipsSent || (Array.isArray(o.clips) ? o.clips.length : o.clips)) >= 4) player.push('CLEAR_REPORTER');
    if (result.outcome === 'caught' || result.success === true) {
      const badge = { chase: 'PURSUIT_SPECIALIST', cctv: 'SURVEILLANCE_SPECIALIST', drone: 'DRONE_PILOT' }[id];
      if (badge) player.push(badge);
      player.push('MISSION_COMPLETE');
      if (result.wrongPicks === 0) player.push('SHARP_EYE');
    }
    if (id === 'cctv' || id === 'drone') mark.push('MASTER_OF_DISGUISE');
    if (result.markHides >= 2) mark.push('STEALTH_TRAINEE');
    if (result.outcome === 'escaped') mark.push('ESCAPE_SPECIALIST');
    return { player, mark };
  }
  return { profile, makeCrowd, validateCrowd, pickGames, tierFor, badgesFor, BADGES, rng, migrateSave };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Missions;
