/* ============================================================
   AGENT BRIEFING — procedural SVG art
   All faces, avatars, NPCs and props are drawn in code,
   so the game needs no image files at all.
   ============================================================ */
'use strict';

const Art = (() => {

  /* Optional production raster assets. This stays empty unless startup successfully
     loads an applied manifest, so every existing function returns its original SVG. */
  const overrides = new Map();
  let warnedMissingAvatarMouth = false;

  function safeAssetSource(value) {
    const src = String(value || '').replace(/\\/g, '/');
    return /^assets\/[a-z0-9_./-]+\.png$/i.test(src) && !src.split('/').includes('..') ? src : '';
  }

  function overrideSource(slot) {
    return overrides.get(slot) || '';
  }

  function imageHTML(slot, className, width, height, label) {
    const src = overrideSource(slot);
    if (!src) return '';
    const attrs = [
      `src="${src}"`,
      `class="${className}"`,
      `alt="${String(label || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}"`,
      'draggable="false"',
    ];
    if (width) attrs.push(`width="${width}"`);
    if (height) attrs.push(`height="${height}"`);
    return `<img ${attrs.join(' ')}>`;
  }

  async function loadOverrides(url = 'assets/manifest.json') {
    if (typeof window === 'undefined') return false;
    let manifest = window.ART_ASSETS;
    if (!manifest) {
      // JSON fetch is unavailable for the game's documented file:// launch mode.
      // Applied artwork supplies the same manifest through assets/manifest.js there.
      if (window.location.protocol === 'file:') return false;
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) return false;
        manifest = await response.json();
      } catch (error) {
        return false;
      }
    }
    try {
      Object.entries(manifest.assets || {}).forEach(([slot, value]) => {
        const src = safeAssetSource(typeof value === 'string' ? value : value && value.src);
        if (src) overrides.set(slot, src);
      });

      const root = document.documentElement;
      [
        ['title_background', '--art-title-background-image', 'has-art-title-background'],
        ['archive_background', '--art-archive-background-image', 'has-art-archive-background'],
        ['room_background', '--art-room-background-image', 'has-art-room-background'],
      ].forEach(([slot, property, className]) => {
        const src = overrideSource(slot);
        if (!src) return;
        root.style.setProperty(property, `url("${src}")`);
        root.classList.add(className);
      });
      return overrides.size > 0;
    } catch (error) {
      return false;
    }
  }

  /* Looks used for the audience NPCs in the debriefing room */
  const NPC_LOOKS = [
    { skin: '#e8b98a', hairColor: '#1d1d1d', hair: 'short', shades: true,  tie: '#c0392b' },
    { skin: '#ffd9b3', hairColor: '#7a4a21', hair: 'bob',   glasses: true, tie: '#2980b9' },
    { skin: '#c68863', hairColor: '#101010', hair: 'curly', tie: '#27ae60' },
    { skin: '#f6c9a0', hairColor: '#c9a227', hair: 'spiky', shades: true,  tie: '#8e44ad' },
  ];

  /* ---------- hair styles (drawn over a head of radius 40 at 0,0) ---------- */
  function hairSVG(style, color) {
    const dome = `<path d="M -40 -5 A 40 40 0 0 1 40 -5 Z" fill="${color}"/>`;
    switch (style) {
      case 'bald':
        return '';
      case 'short':
        return dome;
      case 'spiky':
        return dome +
          `<polygon points="-36,-4 -28,-17 -20,-4 -10,-19 0,-4 10,-19 20,-4 28,-17 36,-4" fill="${color}"/>`;
      case 'bob':
        return dome +
          `<path d="M -40 -5 Q -47 16 -39 28 L -29 26 Q -35 8 -33 -5 Z" fill="${color}"/>` +
          `<path d="M 40 -5 Q 47 16 39 28 L 29 26 Q 35 8 33 -5 Z" fill="${color}"/>`;
      case 'long':
        return dome +
          `<path d="M -40 -5 Q -49 26 -41 46 L -27 46 Q -34 14 -32 -5 Z" fill="${color}"/>` +
          `<path d="M 40 -5 Q 49 26 41 46 L 27 46 Q 34 14 32 -5 Z" fill="${color}"/>`;
      case 'curly':
        return dome +
          [[-30, -14], [-15, -25], [0, -28], [15, -25], [30, -14]]
            .map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="12" fill="${color}"/>`).join('');
      default:
        return dome;
    }
  }

  /* ---------- face (head r=40 centred at 0,0; mouth is lip-sync ready) ---------- */
  function faceSVG(o) {
    const skin = o.skin || '#f6c9a0';
    const hc = o.hairColor || '#3c2a20';
    const p = [];
    p.push(`<circle cx="-40" cy="3" r="8" fill="${skin}"/>`);
    p.push(`<circle cx="40" cy="3" r="8" fill="${skin}"/>`);
    p.push(`<circle cx="0" cy="0" r="40" fill="${skin}"/>`);
    p.push(hairSVG(o.hair || 'short', hc));
    // brows
    p.push(`<rect x="-21" y="-15" width="14" height="3.4" rx="1.7" fill="${hc}" transform="rotate(-6 -14 -13)"/>`);
    p.push(`<rect x="7" y="-15" width="14" height="3.4" rx="1.7" fill="${hc}" transform="rotate(6 14 -13)"/>`);
    // eyes
    p.push(`<g class="eyes">
      <circle cx="-14" cy="-1" r="6.5" fill="#fff"/><circle cx="-13" cy="0" r="3.1" fill="#26221f"/>
      <circle cx="14" cy="-1" r="6.5" fill="#fff"/><circle cx="15" cy="0" r="3.1" fill="#26221f"/>
    </g>`);
    if (o.shades) {
      p.push(`<rect x="-25" y="-8" width="20" height="12" rx="4" fill="#101418"/>
              <rect x="5" y="-8" width="20" height="12" rx="4" fill="#101418"/>
              <rect x="-6" y="-4" width="12" height="3" fill="#101418"/>
              <rect x="-23" y="-6" width="7" height="3" rx="1.5" fill="#4a5a6a" opacity="0.8"/>
              <rect x="7" y="-6" width="7" height="3" rx="1.5" fill="#4a5a6a" opacity="0.8"/>`);
    } else if (o.glasses) {
      p.push(`<circle cx="-14" cy="-1" r="9.5" fill="none" stroke="#33302c" stroke-width="2.6"/>
              <circle cx="14" cy="-1" r="9.5" fill="none" stroke="#33302c" stroke-width="2.6"/>
              <rect x="-5" y="-3" width="10" height="2.6" fill="#33302c"/>`);
    }
    // A little extra expression distinguishes the two selectable player models.
    // Hairstyles and outfits remain available to either model.
    if (o.gender === 'f' && !o.shades) {
      p.push(`<path d="M -21 -5 l-5 -4 M 21 -5 l5 -4" fill="none" stroke="#34282d" stroke-width="2.4" stroke-linecap="round"/>`);
    }
    // nose + blush
    p.push(`<ellipse cx="0" cy="9" rx="4" ry="3" fill="rgba(0,0,0,0.13)"/>`);
    if (o.blush) {
      p.push(`<circle cx="-23" cy="10" r="5.5" fill="rgba(255,110,110,0.32)"/>
              <circle cx="23" cy="10" r="5.5" fill="rgba(255,110,110,0.32)"/>`);
    }
    if (o.mustache) {
      p.push(`<path d="M -15 15 Q 0 9 15 15 Q 8 21 1 17 Q -8 21 -15 15 Z" fill="${hc}"/>`);
    }
    // mouth: smiling when quiet, open ellipse while "talking" (lip sync)
    p.push(`<g class="mouth" transform="translate(0 ${o.mustache ? 25 : 21})">
      <path class="m-smile" d="M -11 -2 Q 0 8 11 -2" fill="none" stroke="#8a4a3a" stroke-width="3.5" stroke-linecap="round"/>
      <g class="m-open" opacity="0">
        <ellipse class="m-hole" cx="0" cy="1" rx="8.5" ry="5" fill="#6b2f28"/>
        <ellipse cx="0" cy="4" rx="4.5" ry="2.2" fill="#ff8f7e"/>
      </g>
    </g>`);
    return `<g class="face">${p.join('')}</g>`;
  }

  /* Drive the mouth of any element containing a face. v = 0..~0.5 loudness */
  function setMouth(rootEl, v) {
    if (!rootEl) return;
    const mouths = rootEl.querySelectorAll('.mouth');
    if (!mouths.length) {
      if (overrideSource('player_avatar') && !warnedMissingAvatarMouth) {
        console.warn('Player avatar raster override is active without the required phase-3 mouth overlays; lip sync cannot animate.');
        warnedMissingAvatarMouth = true;
      }
      return;
    }
    const open = Math.max(0, Math.min(1, (v - 0.02) * 7));
    mouths.forEach(m => {
      const o = m.querySelector('.m-open');
      const s = m.querySelector('.m-smile');
      const hole = m.querySelector('.m-hole');
      const talking = open > 0.15;
      if (o) o.setAttribute('opacity', talking ? '1' : '0');
      if (s) s.setAttribute('opacity', talking ? '0' : '1');
      if (hole) hole.setAttribute('ry', (2.5 + open * 7).toFixed(2));
    });
  }

  /* ---------- ID-photo style portrait for dossiers / projector ---------- */
  function portrait(c, w = 150, h = 170) {
    const slot = c.id === 'ben' ? 'dossier_ben' : `dossier_others.${c.id}`;
    const image = imageHTML(slot, 'portrait-svg portrait-art', w, h, c.name);
    if (image) return image;
    const L = c.look;
    return `<svg viewBox="-75 -95 150 170" width="${w}" height="${h}" class="portrait-svg" aria-label="${c.name}">
      <path d="M -46 85 Q -46 46 0 44 Q 46 46 46 85 Z" fill="${L.shirt}"/>
      <polygon points="-10,46 10,46 0,60" fill="#ffffff" opacity="0.85"/>
      <g transform="translate(0 -12)">
        ${faceSVG({ skin: L.skin, hairColor: L.hairColor, hair: L.hair, glasses: L.glasses, blush: true })}
      </g>
    </svg>`;
  }

  /* ---------- the player's full-body agent avatar ---------- */
  function agentFull(av, w = 130) {
    const h = Math.round(w * 260 / 140);
    // Keep models procedural until the full, lip-sync-ready raster avatar set
    // exists. Unlike a static PNG, every outfit/hair/skin choice appears in
    // both the ID preview and the headquarters presentation.
    const image = imageHTML('player_avatar', 'agent-svg agent-art', w, h, 'Player agent');
    if (image) return image;
    const feminine = av.gender === 'f';
    const outfit = av.outfit || 'suit';
    const shoulder = feminine ? 32 : 40;
    const waist = feminine ? 25 : 32;
    const jacket = av.suit || '#22314a';
    const tie = av.tie || '#e0b23a';
    const trousers = `<rect x="-24" y="70" width="20" height="46" rx="7" fill="#1c2733"/>
      <rect x="4" y="70" width="20" height="46" rx="7" fill="#1c2733"/>`;
    const shoes = `<ellipse cx="-14" cy="116" rx="15" ry="7" fill="#0d1218"/>
      <ellipse cx="14" cy="116" rx="15" ry="7" fill="#0d1218"/>`;
    const torso = `<path d="M -${shoulder} -14 Q -${shoulder + 7} 28 -${waist} 68 L ${waist} 68 Q ${shoulder + 7} 28 ${shoulder} -14 Q 20 -27 0 -27 Q -20 -27 -${shoulder} -14 Z" fill="${jacket}"/>`;
    const lapels = `<path d="M -14 -25 L 0 12 L 14 -25 L 7 -26 L 0 -11 L -7 -26 Z" fill="#f4f3ed"/>
      <path d="M -14 -25 L -22 -12 L -7 8 L 0 12 Z M 14 -25 L 22 -12 L 7 8 L 0 12 Z" fill="${jacket}" stroke="rgba(0,0,0,.3)" stroke-width="1"/>`;
    const neckwear = `<path d="M -5 -22 L 5 -22 L 3 10 L 0 19 L -3 10 Z" fill="${tie}"/>`;
    const skirt = outfit === 'skirt'
      ? `<path d="M -${waist} 53 L ${waist} 53 L 36 93 Q 0 98 -36 93 Z" fill="${jacket}" stroke="#101725" stroke-width="2"/>`
      : '';
    const coat = outfit === 'coat'
      ? `<path d="M -${shoulder} -12 L -${shoulder + 5} 48 L -37 96 L -4 89 L 0 0 L 4 89 L 37 96 L ${shoulder + 5} 48 L ${shoulder} -12 L 12 -22 L 0 22 L -12 -22 Z"
          fill="${jacket}" stroke="#152237" stroke-width="2"/>
        <path d="M -${shoulder} 41 Q 0 51 ${shoulder} 41" fill="none" stroke="${tie}" stroke-width="4"/>
        <circle cx="-9" cy="34" r="2.3" fill="#e5c780"/><circle cx="9" cy="34" r="2.3" fill="#e5c780"/>`
      : '';
    return `<svg viewBox="-70 -130 140 260" width="${w}" height="${h}" class="agent-svg" role="img" aria-label="${feminine ? 'Female' : 'Male'} agent wearing ${outfit}">
      <g class="agent-body">
        ${trousers}${shoes}${torso}${lapels}${neckwear}${skirt}${coat}
        <rect x="-${shoulder + 16}" y="-14" width="17" height="66" rx="8.5" fill="${jacket}"/>
        <rect x="${shoulder - 1}" y="-14" width="17" height="66" rx="8.5" fill="${jacket}"/>
        <circle cx="-${shoulder + 7}" cy="58" r="8" fill="${av.skin}"/>
        <circle cx="${shoulder + 7}" cy="58" r="8" fill="${av.skin}"/>
        <circle cx="-24" cy="-4" r="5.5" fill="#ffd24a" stroke="#b8860b" stroke-width="1.5"/>
      </g>
      <g class="agent-head" transform="translate(0 -74) scale(${feminine ? 0.88 : 0.92})">
        ${faceSVG({ skin: av.skin, hairColor: av.hairColor, hair: av.hair, shades: av.shades, gender: av.gender })}
      </g>
    </svg>`;
  }

  /* ---------- audience NPC, front view (for reaction close-ups) ---------- */
  function npcFront(i) {
    const image = imageHTML(`npc_agents_front.npc${(i % NPC_LOOKS.length) + 1}`, 'npc-svg npc-art', null, null, 'Agency agent');
    if (image) return image;
    const L = NPC_LOOKS[i % NPC_LOOKS.length];
    return `<svg viewBox="-70 -120 140 200" class="npc-svg">
      <g class="npc">
        <path d="M -52 80 Q -52 24 0 22 Q 52 24 52 80 Z" fill="#232f3e"/>
        <polygon points="-11,23 11,23 0,42" fill="#fff"/>
        <polygon points="-4,26 4,26 2,52 0,58 -2,52" fill="${L.tie}"/>
        <rect x="-48" y="52" width="36" height="13" rx="6.5" fill="#232f3e"/>
        <rect x="2" y="60" width="44" height="18" rx="3" fill="#fdf6d8" stroke="#c9b458" stroke-width="1.5"/>
        <line x1="8" y1="66" x2="40" y2="66" stroke="#b9a76c" stroke-width="1.6"/>
        <line x1="8" y1="71" x2="34" y2="71" stroke="#b9a76c" stroke-width="1.6"/>
        <g class="npc-pen">
          <rect x="22" y="36" width="4.4" height="24" rx="2.2" fill="#f4b400" transform="rotate(18 24 48)"/>
          <circle cx="24" cy="56" r="7.5" fill="${L.skin}"/>
        </g>
        <g class="npc-head" transform="translate(0 -26) scale(0.82)">
          ${faceSVG({ skin: L.skin, hairColor: L.hairColor, hair: L.hair, shades: L.shades, glasses: L.glasses })}
        </g>
        <g class="whisper" opacity="0">
          <circle cx="46" cy="-78" r="3.4" fill="#dfe9f5"/>
          <circle cx="55" cy="-86" r="4.4" fill="#dfe9f5"/>
          <circle cx="66" cy="-95" r="5.6" fill="#dfe9f5"/>
        </g>
      </g>
    </svg>`;
  }

  /* ---------- audience NPC, back of head (wide shot at the table) ---------- */
  function npcBack(i) {
    const image = imageHTML(`npc_agents_back.npc${(i % NPC_LOOKS.length) + 1}`, 'npcback-svg npcback-art', null, null, 'Agency agent from behind');
    if (image) return image;
    const L = NPC_LOOKS[(i + 1) % NPC_LOOKS.length];
    return `<svg viewBox="-60 -72 120 116" class="npcback-svg">
      <g class="npcback">
        <path d="M -48 44 Q -48 8 0 6 Q 48 8 48 44 Z" fill="#1d2836"/>
        <rect x="-8" y="-10" width="16" height="16" fill="${L.skin}"/>
        <circle cx="0" cy="-28" r="26" fill="${L.skin}"/>
        <circle cx="-25" cy="-26" r="6" fill="${L.skin}"/>
        <circle cx="25" cy="-26" r="6" fill="${L.skin}"/>
        <path d="M -26 -20 A 26 26 0 1 1 26 -20 Q 13 -8 0 -8 Q -13 -8 -26 -20 Z" fill="${L.hairColor}"/>
      </g>
    </svg>`;
  }

  /* ---------- the commander ---------- */
  function commander() {
    const image = imageHTML('commander', 'cmdr-svg commander-art', null, null, 'Briefing room commander');
    if (image) return image;
    return `<svg viewBox="-70 -130 140 225" class="cmdr-svg">
      <g class="commander">
        <path d="M -54 92 Q -54 26 0 24 Q 54 26 54 92 Z" fill="#16324f"/>
        <rect x="-52" y="20" width="26" height="10" rx="3" fill="#c9a227"/>
        <rect x="26" y="20" width="26" height="10" rx="3" fill="#c9a227"/>
        <polygon points="-12,25 12,25 0,46" fill="#fff"/>
        <polygon points="-4,28 4,28 2,58 0,64 -2,58" fill="#7a1f28"/>
        <circle cx="-28" cy="52" r="7" fill="#ffd24a" stroke="#b8860b" stroke-width="1.6"/>
        <polygon points="-28,48 -26.8,50.8 -23.8,51 -26,53 -25.4,56 -28,54.4 -30.6,56 -30,53 -32.2,51 -29.2,50.8"
                 fill="#8a6500"/>
        <g class="npc-head" transform="translate(0 -28) scale(0.88)">
          ${faceSVG({ skin: '#eec39a', hairColor: '#cfd6dd', hair: 'short', mustache: true })}
        </g>
      </g>
    </svg>`;
  }

  /* ---------- agency logo with rotating radar sweep ----------
     The sweep pivots on user-space 0,0 (the emblem centre); `center` resolves to 60px 60px here, off the emblem. */
  function logo(size = 140) {
    const image = imageHTML('agency_logo', 'logo-svg logo-art', size, size, 'Agency logo');
    if (image) return image;
    return `<svg viewBox="-60 -60 120 120" width="${size}" height="${size}" class="logo-svg">
      <circle r="54" fill="#11253d" stroke="#ffb400" stroke-width="4"/>
      <circle r="44" fill="none" stroke="rgba(255,180,0,0.35)" stroke-width="2" stroke-dasharray="4 6"/>
      <line x1="-54" y1="0" x2="54" y2="0" stroke="rgba(255,180,0,0.2)" stroke-width="1.5"/>
      <line x1="0" y1="-54" x2="0" y2="54" stroke="rgba(255,180,0,0.2)" stroke-width="1.5"/>
      <g style="transform-origin:0 0;animation:radarspin 3.2s linear infinite">
        <path d="M 0 0 L 42 -10 A 43 43 0 0 1 42 10 Z" fill="rgba(255,180,0,0.30)"/>
      </g>
      <polygon points="0,-30 8.8,-9.3 30,-9.3 12.9,4.6 19.1,26 0,13 -19.1,26 -12.9,4.6 -30,-9.3 -8.8,-9.3"
               fill="#ffb400"/>
    </svg>`;
  }

  return { NPC_LOOKS, faceSVG, setMouth, portrait, agentFull, npcFront, npcBack, commander, logo, loadOverrides };
})();
