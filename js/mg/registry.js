/* Stable registration boundary for independently owned minigames. */
'use strict';
const Minigames = (() => {
  const definitions = new Map();
  return {
    register(def) {
      if (!def || !['photo','typing','password','chase','cctv','drone'].includes(def.id) ||
          def.kind !== (['photo','typing','password'].includes(def.id) ? 'intel' : 'intercept') ||
          typeof def.title !== 'string' || typeof def.brief !== 'function' || typeof def.mount !== 'function') throw new Error('Invalid minigame definition.');
      definitions.set(def.id, def);
    },
    get(id) { return definitions.get(id); },
    list() { return Array.from(definitions.values()); },
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Minigames;
