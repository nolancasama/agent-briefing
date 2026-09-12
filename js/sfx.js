/* ============================================================
   AGENT BRIEFING — sound engine
   Every sound is synthesized with WebAudio: no audio files.
   ============================================================ */
'use strict';

const Sfx = (() => {
  let ctx = null, master = null;
  let muted = false;
  let bgmTimer = null, bgmStep = 0, bgmPlaying = false;
  let noiseBuf = null;

  function ensure() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function getCtx() { return ensure(); }

  function tone(opt) {
    if (!ensure()) return;
    const { f = 440, f2 = null, t = 0.15, type = 'sine', v = 0.2, when = 0, a = 0.005 } = opt;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t0 + t);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + t + 0.05);
  }

  function getNoiseBuf() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function noise(opt) {
    if (!ensure()) return;
    const { t = 0.2, v = 0.2, when = 0, bp = null, f2 = null, q = 1, pan = 0 } = opt;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuf(); src.loop = true;
    let node = src;
    if (bp) {
      const flt = ctx.createBiquadFilter();
      flt.type = 'bandpass';
      flt.frequency.setValueAtTime(bp, t0);
      if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t0 + t);
      flt.Q.value = q;
      node.connect(flt); node = flt;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(v, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
    node.connect(g);
    let out = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      g.connect(p); out = p;
    }
    out.connect(master);
    src.start(t0); src.stop(t0 + t + 0.05);
  }

  /* ---------- one-shot effects ---------- */
  const api = {
    getCtx,
    click()   { tone({ f: 850, t: 0.05, type: 'square', v: 0.045 }); },
    type()    { noise({ bp: 3200, t: 0.03, v: 0.1, q: 2 }); tone({ f: 1900 + Math.random() * 500, t: 0.02, type: 'square', v: 0.03 }); },
    swoosh()  { noise({ bp: 500, f2: 2600, t: 0.35, v: 0.16, q: 1.4 }); },
    paper()   { noise({ bp: 1900, t: 0.16, v: 0.12, q: 0.9 }); },
    stamp()   { tone({ f: 150, f2: 46, t: 0.2, type: 'sine', v: 0.55 }); noise({ bp: 800, t: 0.09, v: 0.28 }); },
    chime()   { tone({ f: 660, t: 0.13, type: 'triangle', v: 0.18 }); tone({ f: 880, t: 0.22, type: 'triangle', v: 0.18, when: 0.1 }); },
    points()  { tone({ f: 1250, t: 0.06, type: 'square', v: 0.06 }); tone({ f: 1500, t: 0.07, type: 'square', v: 0.06, when: 0.07 }); },
    blip()    { tone({ f: 1250, t: 0.045, type: 'square', v: 0.1 }); tone({ f: 1250, t: 0.045, type: 'square', v: 0.1, when: 0.09 }); },
    footstep(){ noise({ bp: 320, t: 0.07, v: 0.22, q: 1.6 }); },
    fanfare() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => {
        tone({ f, t: i === 3 ? 0.55 : 0.16, type: 'sawtooth', v: 0.13, when: i * 0.13 });
        tone({ f: f / 2, t: i === 3 ? 0.55 : 0.16, type: 'triangle', v: 0.1, when: i * 0.13 });
      });
    },
    promo() {
      [659, 784, 988, 1319].forEach((f, i) => {
        tone({ f, t: i === 3 ? 0.7 : 0.15, type: 'sawtooth', v: 0.12, when: i * 0.12 });
      });
    },
    applause(dur = 3) {
      if (!ensure()) return;
      const n = Math.floor(dur * 20);
      for (let i = 0; i < n; i++) {
        const when = Math.random() * dur;
        const fade = when < dur * 0.7 ? 1 : (dur - when) / (dur * 0.3);
        noise({
          t: 0.025 + Math.random() * 0.035,
          v: 0.13 * fade * (0.5 + Math.random() * 0.5),
          when,
          bp: 1500 + Math.random() * 1600,
          q: 0.7,
          pan: (Math.random() * 2 - 1) * 0.85,
        });
      }
    },

    /* ---------- background spy riff ---------- */
    bgmStart() {
      if (bgmPlaying || muted || !ensure()) return;
      bgmPlaying = true; bgmStep = 0;
      const riff = [82.4, 82.4, 98, 110, 116.5, 110, 98, 82.4]; // E G A Bb minor-ish
      const stepMs = (60 / 128 / 2) * 1000;
      bgmTimer = setInterval(() => {
        const f = riff[bgmStep % riff.length];
        tone({ f, t: 0.2, type: 'triangle', v: 0.085 });
        if (bgmStep % 2 === 0) noise({ bp: 7500, t: 0.02, v: 0.018, q: 2 });
        if (bgmStep % 8 === 4) tone({ f: f * 2, t: 0.1, type: 'sine', v: 0.03 });
        bgmStep++;
      }, stepMs);
    },
    bgmStop() {
      if (bgmTimer) clearInterval(bgmTimer);
      bgmTimer = null; bgmPlaying = false;
    },

    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 1;
      if (m) api.bgmStop();
    },
    isMuted() { return muted; },
  };

  return api;
})();
