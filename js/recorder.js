/* ============================================================
   AGENT BRIEFING — microphone recording + lip-sync playback
   Records one clip per sentence with MediaRecorder, measures
   loudness live, and plays clips back through an analyser so
   the avatar's mouth can follow the student's real voice.
   ============================================================ */
'use strict';

const Recorder = (() => {
  let stream = null, analyser = null, timeBuf = null;
  let mediaRecorder = null, chunks = [];
  let raf = 0, curPeak = 0, t0 = 0, mime = '';
  let playing = null;
  let recognizer = null, recResult = null;

  const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  function recognitionSupported() { return !!SR; }

  /* Runs in parallel with the mic recording. Never blocks or gates
     anything — if it fails or is unsupported, callers treat a missing
     result as "couldn't verify" rather than "wrong". The optional
     onInterim callback is a convenience hint only (e.g. auto-stop once
     the sentence sounds complete) — callers must not rely on it firing. */
  function startRecognition(onInterim) {
    recResult = { transcript: '', confidence: 0, gotResult: false };
    if (!SR) return;
    try {
      recognizer = new SR();
      recognizer.lang = 'en-US';
      recognizer.continuous = true;
      recognizer.interimResults = true;
      recognizer.onresult = e => {
        let text = '', conf = 0, n = 0;
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          text += r[0].transcript + ' ';
          if (r.isFinal) { conf += (r[0].confidence || 0.7); n++; }
        }
        recResult.transcript = text.trim();
        recResult.confidence = n ? conf / n : recResult.confidence;
        recResult.gotResult = true;
        if (onInterim) onInterim(recResult.transcript);
      };
      recognizer.onerror = () => {};
      recognizer.start();
    } catch (e) {
      recognizer = null;
    }
  }

  function stopRecognition() {
    return new Promise(resolve => {
      const result = () => recResult || { transcript: '', confidence: 0, gotResult: false };
      if (!recognizer) { resolve(result()); return; }
      const r = recognizer;
      recognizer = null;
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(result()); };
      r.onend = finish;
      r.onerror = finish;
      try { r.stop(); } catch (e) { finish(); }
      setTimeout(finish, 900); // safety net if onend never fires
    });
  }

  function abortRecognition() {
    if (!recognizer) return;
    const r = recognizer;
    recognizer = null;
    r.onend = null; r.onerror = null; r.onresult = null;
    try { r.abort(); } catch (e) { /* already stopped */ }
  }

  function extFor(m) {
    if (m.indexOf('webm') >= 0) return 'webm';
    if (m.indexOf('mp4') >= 0) return 'm4a';
    if (m.indexOf('ogg') >= 0) return 'ogg';
    return 'audio';
  }

  async function init() {
    if (stream) return true;
    const ctx = Sfx.getCtx();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    timeBuf = new Uint8Array(analyser.fftSize);
    src.connect(analyser); // analyser only — never to speakers (no feedback)
    mime = MIMES.find(m => {
      try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; }
    }) || '';
    return true;
  }

  function level(an, buf) {
    an.getByteTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) {
      const d = (buf[i] - 128) / 128;
      s += d * d;
    }
    return Math.sqrt(s / buf.length);
  }

  function start(onLevel) {
    chunks = []; curPeak = 0; t0 = performance.now();
    mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    mediaRecorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    mediaRecorder.start();
    const loop = () => {
      const v = level(analyser, timeBuf);
      curPeak = Math.max(curPeak, v);
      if (onLevel) onLevel(v);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    return new Promise(resolve => {
      cancelAnimationFrame(raf);
      const mr = mediaRecorder;
      if (!mr) { resolve(null); return; }
      mr.onstop = () => {
        const type = mr.mimeType || mime || 'audio/webm';
        resolve({
          blob: new Blob(chunks, { type }),
          peak: curPeak,
          dur: (performance.now() - t0) / 1000,
          ext: extFor(type),
        });
      };
      if (mr.state !== 'inactive') mr.stop();
      else mr.onstop();
    });
  }

  /* Play a recorded clip; onLevel(v) fires every frame for lip sync. */
  async function play(blob, opt) {
    const { onLevel, onEnd } = opt || {};
    stopPlayback();
    const ctx = Sfx.getCtx();
    try {
      const raw = await blob.arrayBuffer();
      const audio = await ctx.decodeAudioData(raw.slice(0));
      const src = ctx.createBufferSource();
      src.buffer = audio;
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      const tb = new Uint8Array(an.fftSize);
      src.connect(an);
      an.connect(ctx.destination);
      let rafId = 0;
      const tick = () => { if (onLevel) onLevel(level(an, tb)); rafId = requestAnimationFrame(tick); };
      rafId = requestAnimationFrame(tick);
      src.onended = () => {
        cancelAnimationFrame(rafId);
        playing = null;
        if (onLevel) onLevel(0);
        if (onEnd) onEnd();
      };
      playing = { stop() { try { src.stop(); } catch (e) { /* already stopped */ } } };
      src.start();
      return playing;
    } catch (err) {
      // Fallback: <audio> element + pretend mouth movement
      const url = URL.createObjectURL(blob);
      const el = new Audio(url);
      let rafId = 0, t = 0;
      const tick = () => {
        t += 0.16;
        if (onLevel) onLevel(el.paused ? 0 : 0.05 + 0.05 * Math.abs(Math.sin(t)) * Math.random());
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      el.onended = () => {
        cancelAnimationFrame(rafId);
        URL.revokeObjectURL(url);
        playing = null;
        if (onLevel) onLevel(0);
        if (onEnd) onEnd();
      };
      playing = { stop() { el.pause(); if (el.onended) el.onended(); el.onended = null; } };
      el.play();
      return playing;
    }
  }

  function stopPlayback() {
    if (playing) {
      const p = playing;
      playing = null;
      p.stop();
    }
  }

  /* Release hardware when a student aborts or finishes the mission.
     stop() is for preserving a clip; release() intentionally discards
     any active recording and disables the microphone indicator. */
  function release() {
    cancelAnimationFrame(raf);
    abortRecognition();
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.ondataavailable = null;
        mediaRecorder.onstop = null;
        mediaRecorder.stop();
      } catch (e) { /* recorder was already shutting down */ }
    }
    mediaRecorder = null;
    chunks = [];
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    analyser = null;
    timeBuf = null;
  }

  return {
    supported, init, start, stop, play, stopPlayback, hasStream: () => !!stream,
    recognitionSupported, startRecognition, stopRecognition, abortRecognition, release,
  };
})();
