// ════════════════════════════════════════════
//  SHARED SPEECH ENGINE
//  Gemeinsame Spracheingabe für alle Modi
// ════════════════════════════════════════════

/**
 * createSpeechInput(cfg) → { recognition, micActive, toggle, destroy }
 *
 * cfg = {
 *   transcriptId : string   — Element-ID für den Transkript-Text
 *   dotId        : string   — Element-ID für den Mikrofon-Indikator-Dot
 *   statusId     : string   — Element-ID für die Status-Bar
 *   micBtnId     : string   — Element-ID für den Mikrofon-Button
 *   unsupportedId: string   — Element-ID für die "nicht unterstützt"-Meldung (optional)
 *   onResult     : function — Callback(text) wenn Sprache erkannt
 * }
 *
 * Gibt zurück:
 *   toggle()    — Mikrofon an/aus schalten
 *   isActive()  — true wenn Mikrofon aktiv
 *   destroy()   — Aufräumen bei Spielende
 */
function createSpeechInput(cfg) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  // Show "not supported" message if needed
  if (!SR) {
    if (cfg.unsupportedId) {
      const el = document.getElementById(cfg.unsupportedId);
      if (el) el.style.display = 'block';
    }
    if (cfg.micBtnId) {
      const btn = document.getElementById(cfg.micBtnId);
      if (btn) btn.style.display = 'none';
    }
    return {
      toggle: () => {},
      isActive: () => false,
      destroy: () => {},
    };
  }

  let recognition = null;
  let active = false;

  function getEl(id) { return id ? document.getElementById(id) : null; }

  function setDot(listening) {
    const dot = getEl(cfg.dotId);
    if (!dot) return;
    if (listening) dot.classList.remove('idle');
    else           dot.classList.add('idle');
  }

  function setMicBtn(listening) {
    const btn = getEl(cfg.micBtnId);
    if (!btn) return;
    if (listening) {
      btn.classList.remove('muted');
      btn.classList.add('listening');
    } else {
      btn.classList.remove('listening');
      btn.classList.add('muted');
    }
  }

  function setStatus(show) {
    const el = getEl(cfg.statusId);
    if (el) el.classList.toggle('active', show);
  }

  function startRecognizer() {
    if (!recognition) return;
    try { recognition.start(); } catch(e) {}
  }

  function init() {
    recognition = new SR();
    recognition.lang            = 'de-DE';
    recognition.continuous      = false;
    recognition.interimResults  = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      resetSpeechSession();
      setDot(true);
      const t = getEl(cfg.transcriptId);
      if (t) t.textContent = 'Höre zu…';
    };

    recognition.onresult = (e) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else                      interim += e.results[i][0].transcript;
      }
      const text = (final || interim).trim();
      const t = getEl(cfg.transcriptId);
      if (t) t.textContent = text;

      if (final) {
        cancelPauseTimer();
        speechProcess(final.trim().toLowerCase(), cfg.onResult);
      } else if (interim) {
        scheduleFromInterim(interim.trim().toLowerCase(), cfg.onResult);
      }
    };

    recognition.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        const t = getEl(cfg.transcriptId);
        if (t) t.textContent = 'Fehler: ' + e.error;
      }
      if (active) setTimeout(startRecognizer, 150);
    };

    recognition.onend = () => {
      setDot(false);
      if (active) setTimeout(startRecognizer, 100);
    };
  }

  function toggle() {
    if (!recognition) init();
    active = !active;
    setMicBtn(active);
    setStatus(active);
    if (active) {
      startRecognizer();
    } else {
      cancelPauseTimer();
      try { recognition.abort(); } catch(e) {}
      setDot(false);
    }
  }

  function destroy() {
    if (active) {
      active = false;
      cancelPauseTimer();
      try { recognition && recognition.abort(); } catch(e) {}
    }
    setMicBtn(false);
    setStatus(false);
    setDot(false);
  }

  return { toggle, isActive: () => active, destroy };
}
