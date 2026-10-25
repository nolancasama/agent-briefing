/* ============================================================
   AGENT BRIEFING — speech evaluation

   Design rule: the FACT is what matters. A grammatically perfect
   sentence carrying the wrong intelligence is a failed report; a
   broken sentence carrying the right intelligence is a success.

   Second rule: recognition is never a gate. This module only ever
   describes what was heard. It cannot block SEND TO HQ, cannot force
   a retry, and reports "unverified" instead of inventing a score when
   the browser gives it nothing usable.

   Loadable as a browser global (Evaluate) and as a Node module.
   ============================================================ */
'use strict';

const Evaluate = (() => {

  /* Words that carry no intelligence value. "a dog" and "dog" report
     the same fact, so articles must never decide confirmed/mismatch. */
  const STOPWORDS = new Set([
    'a', 'an', 'the', 'some', 'any', 'my', 'your', 'his', 'her', 'their',
    'to', 'of', 'and', 'is', 'are', 'am', 'be', 'do', 'doe', 'did',
  ]);

  /* Noise the recognizer emits when it heard nothing real. */
  const FILLERS = new Set([
    'uh', 'um', 'erm', 'er', 'ah', 'mm', 'hmm', 'huh', 'eh', 'oh',
    'mhm', 'hm', 'yeah', 'yes', 'no', 'ok', 'okay', 'hello', 'hi',
  ]);

  const SUBJECTS = ['he', 'she', 'they', 'it'];

  /* Thresholds — deliberately few and named, so the behaviour can be
     argued about without reading the arithmetic. */
  const CONFIRM_AT = 0.75;   // share of fact content words needed to confirm
  const RANK_S_AT = 0.88;
  const RANK_A_AT = 0.72;
  const RANK_B_AT = 0.50;

  function words(s) {
    return String(s == null ? '' : s).toLowerCase().match(/[a-z']+/g) || [];
  }

  /* Crude, symmetric stemming. It does not need to be linguistically
     correct — it only needs to treat the target and the transcript the
     same way, so "dogs"/"dog" and "drawing"/"draw" line up. */
  function stem(w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 4 && /(ches|shes|sses|xes|oes)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /[^s]s$/.test(w)) return w.slice(0, -1);
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    return w;
  }

  // Chrome may return expanded contractions ("does not") for a model
  // sentence written "doesn't". Treat them as the same English pattern.
  function normalize(s) {
    const expanded = String(s == null ? '' : s)
      .replace(/\bdoesn't\b/gi, 'does not')
      .replace(/\bdon't\b/gi, 'do not')
      .replace(/\bcan't\b/gi, 'cannot')
      .replace(/\bisn't\b/gi, 'is not')
      .replace(/\baren't\b/gi, 'are not');
    return words(expanded).map(stem);
  }
  const contentOf = list => list.filter(w => !STOPWORDS.has(w) && !FILLERS.has(w));

  /* How much of targetWords appears in heardWords (multiset-safe). */
  function coverage(targetWords, heardWords) {
    if (!targetWords.length) return 1;
    const pool = heardWords.slice();
    let hit = 0;
    for (const w of targetWords) {
      const at = pool.indexOf(w);
      if (at >= 0) { hit++; pool.splice(at, 1); }
    }
    return hit / targetWords.length;
  }

  /* Did the student name the wrong person? Only meaningful when the
     target frame actually uses a gendered subject pronoun. */
  function personError(frameWords, heardWords) {
    const want = frameWords.find(w => SUBJECTS.indexOf(w) >= 0);
    if (!want) return false;
    const heardSubjects = heardWords.filter(w => SUBJECTS.indexOf(w) >= 0);
    if (!heardSubjects.length) return false;            // omitted, not wrong
    return heardSubjects.indexOf(want) < 0;             // said a different one
  }

  function frameOf(target) {
    return normalize(String((target && target.frame) || '').replace(/_+/g, ' '));
  }

  /* ------------------------------------------------------------
     evaluateClip(target, stt) -> structured result

     target: { fact, frame }   e.g. { fact: 'kind', frame: 'He is ______.' }
     stt:    { transcript, confidence, gotResult } | null

     verification:
       'confirmed'  — the fact is present
       'partial'    — some of a multi-word fact is present
       'mismatch'   — usable English, but the fact is absent
       'unverified' — nothing usable came back; we make no claim
     ------------------------------------------------------------ */
  function evaluateClip(target, stt) {
    const blank = {
      verification: 'unverified',
      contentScore: null,
      patternScore: null,
      completeness: null,
      confidence: null,
      quality: null,
      personError: false,
    };

    const usable = stt && stt.gotResult && String(stt.transcript || '').trim();
    if (!usable) return blank;

    const factWords = contentOf(normalize(target && target.fact));
    const frameWords = frameOf(target);
    const heard = normalize(stt.transcript);
    const heardContent = contentOf(heard);

    const contentScore = coverage(factWords, heard);
    const patternScore = coverage(frameWords, heard);
    const completeness = Math.min(1, heard.length / Math.max(3, factWords.length + frameWords.length));
    const confidence = typeof stt.confidence === 'number' && stt.confidence > 0 ? stt.confidence : 0.6;
    const wrongPerson = personError(frameWords, heard);

    /* Confirmed short-circuits the "is this usable?" question: a lone
       "kind" is a perfectly good report even though it is one word. */
    let verification;
    if (contentScore >= CONFIRM_AT) {
      verification = 'confirmed';
    } else if (!heardContent.length || heard.length < 2) {
      /* Nothing but filler/stopwords, or a single stray word that is not
         the fact — too little to accuse anyone of being wrong. */
      return blank;
    } else if (contentScore > 0) {
      verification = 'partial';
    } else {
      verification = 'mismatch';
    }

    /* Quality bands cannot cross. Grammar can lift a confirmed report
       from good to perfect; it can never lift a mismatch out of the
       floor. That is the entire point of this rewrite. */
    let quality;
    if (verification === 'confirmed') {
      quality = 0.62 + 0.38 * patternScore;
    } else if (verification === 'partial') {
      quality = 0.30 + 0.25 * contentScore + 0.15 * patternScore;
    } else {
      quality = 0.10 + 0.10 * patternScore;
    }
    if (wrongPerson) quality -= 0.25;
    quality = Math.max(0, Math.min(1, quality));

    return {
      verification,
      contentScore,
      patternScore,
      completeness,
      confidence,
      quality,
      personError: wrongPerson,
    };
  }

  /* Live auto-stop hint, checked against interim results while the mic
     is still open. Positive-only by contract: true may end the recording
     early, false means "keep listening". Requires the FACT, not just the
     frame — otherwise "He is ..." would cut a child off mid-sentence. */
  function looksComplete(target, transcript) {
    const heard = normalize(transcript);
    if (heard.length < 3) return false;
    const factWords = contentOf(normalize(target && target.fact));
    return coverage(factWords, heard) >= CONFIRM_AT && coverage(frameOf(target), heard) >= 0.8;
  }

  /* ------------------------------------------------------------
     Mission aggregation.

     Explicit rules, in order:
       1. The grade starts from the average quality of VERIFIED clips.
          Unverified clips are not averaged in at all — we have no
          evidence about them, good or bad.
       2. Caps are then applied. A cap can only lower the grade.
            any mismatch           -> at most B
            two or more mismatches -> at most C
            two or more partials   -> at most A
            any unverified         -> at most A  (S is earned on evidence)
            unverified majority    -> at most B
       3. If nothing at all was verified there is no grade. We say so
          rather than inventing one.
     ------------------------------------------------------------ */
  const ORDER = ['C', 'B', 'A', 'S'];

  function letterFor(q) {
    return q >= RANK_S_AT ? 'S' : q >= RANK_A_AT ? 'A' : q >= RANK_B_AT ? 'B' : 'C';
  }

  function cap(letter, ceiling) {
    return ORDER.indexOf(ceiling) < ORDER.indexOf(letter) ? ceiling : letter;
  }

  function evaluateMission(results) {
    const list = results || [];
    const n = list.length;
    const counts = { confirmed: 0, partial: 0, mismatch: 0, unverified: 0 };
    for (const r of list) {
      const v = (r && r.verification) || 'unverified';
      counts[v] = (counts[v] || 0) + 1;
    }

    const verified = list.filter(r => r && r.verification && r.verification !== 'unverified');
    const avgQuality = verified.length
      ? verified.reduce((a, r) => a + (r.quality || 0), 0) / verified.length
      : null;

    let rank = null;
    if (avgQuality != null) {
      rank = letterFor(avgQuality);
      if (counts.mismatch >= 1) rank = cap(rank, 'B');
      if (counts.mismatch >= 2) rank = cap(rank, 'C');
      if (counts.partial >= 2) rank = cap(rank, 'A');
      if (counts.unverified >= 1) rank = cap(rank, 'A');
      if (counts.unverified * 2 > n) rank = cap(rank, 'B');
    }

    /* Tier drives the debrief mood only. It is never negative, and an
       unverified mission stays neutral rather than sad. */
    const tier = rank === 'S' || rank === 'A' ? 'high'
      : rank === 'B' ? 'medium'
        : rank === 'C' ? 'low'
          : 'medium';

    return {
      rank,                       // 'S' | 'A' | 'B' | 'C' | null (nothing verified)
      tier,
      counts,
      total: n,
      verifiedCount: verified.length,
      avgQuality,
      contentLabel: contentLabel(counts, n),
      transmissionLabel: transmissionLabel(verified),
    };
  }

  /* Truthful wording. Never claims HQ understood something it did not. */
  function contentLabel(counts, n) {
    if (!n) return 'NO INTELLIGENCE';
    if (counts.unverified === n) return 'SIGNAL UNVERIFIED';
    if (counts.confirmed === n) return 'CONTENT CONFIRMED';

    const parts = [];
    if (counts.confirmed) parts.push(counts.confirmed + ' CONFIRMED');
    if (counts.partial) parts.push(counts.partial + ' PARTIAL');
    if (counts.mismatch) parts.push(counts.mismatch + ' INCORRECT');
    if (counts.unverified) parts.push(counts.unverified + ' UNVERIFIED');
    return parts.join(' · ');
  }

  function transmissionLabel(verified) {
    if (!verified.length) return 'SIGNAL UNVERIFIED';
    const pat = verified.reduce((a, r) => a + (r.patternScore || 0), 0) / verified.length;
    return pat >= 0.85 ? 'CLEAR TRANSMISSION'
      : pat >= 0.5 ? 'TRANSMISSION RECEIVED'
        : 'WEAK SIGNAL';
  }

  return {
    evaluateClip, evaluateMission, looksComplete,
    letterFor, contentLabel, transmissionLabel,
    _internals: { words, stem, normalize, contentOf, coverage, personError, CONFIRM_AT },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Evaluate;
