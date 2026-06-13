const bobsConfig = {
  start: 27,
  order: 'standard',
  bull: 'yes',
  bust: 'yes',
  input: 'simple',
};

let bobsState = {
  score: 27,
  round: 0,        // 0-based index into sequence
  sequence: [],    // array of {field, value} — e.g. {field:'D1', value:2}
  dartInRound: 0,  // 0-2 (detail mode)
  dartsThisRound: [], // [{hit:true/false}]
  history: [],     // [{field, hits, delta, scoreBefore, scoreAfter}]
  totalDarts: 0,
  totalHits: 0,
  bestRound: 0,
  bobsMicActive: false,
  bobsMicMuted: false,
  inputMode: 'simple',
};

let bobsRecognition = null;
let bobsMicActive = false;

// Full sequence: D1–D20 then Bull
function buildSequence(order, includeBull) {
  const seq = [];
  for (let i = 1; i <= 20; i++) {
    seq.push({ field: 'D' + i, value: i * 2 });
  }
  if (includeBull) seq.push({ field: 'BULL', value: 50 });
  if (order === 'random') {
    for (let i = seq.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seq[i], seq[j]] = [seq[j], seq[i]];
    }
  }
  return seq;
}

function bobsSelectOpt(group, val, btn) {
  const grp = document.getElementById('bobs-grp-' + group);
  grp.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  bobsConfig[group] = val;
}

// ════════════════════════════════════════════
//  BOB'S 27 — START
// ════════════════════════════════════════════
function startBobs27() {
  haptic(10);
  bobsState = {
    score: bobsConfig.start,
    round: 0,
    sequence: buildSequence(bobsConfig.order, bobsConfig.bull === 'yes'),
    dartInRound: 0,
    dartsThisRound: [],
    history: [],
    totalDarts: 0,
    totalHits: 0,
    bestRound: 0,
    inputMode: bobsConfig.input,
  };

  setBobsInputMode(bobsConfig.input);
  bobsBuildProgress();
  bobsUpdateDisplay();
  // Cancel any running speech before starting
  window.speechSynthesis && window.speechSynthesis.cancel();
  setTimeout(() => bobsSpeakRound(), 400);

  // Reset mic
  if (bobsMicActive) {
    bobsMicActive = false;
    try { bobsRecognition && bobsRecognition.abort(); } catch(e) {}
  }
  document.getElementById('bobs-mic-btn').className = 'mic-btn muted';
  document.getElementById('bobs-speech-status').classList.remove('active');

  document.getElementById('bobs-result-overlay').classList.remove('show');
  showPage('bobs-game');
}

// ════════════════════════════════════════════
//  BOB'S 27 — DISPLAY
// ════════════════════════════════════════════
function bobsUpdateDisplay() {
  const s = bobsState;
  const round = s.sequence[s.round];
  if (!round) return;

  document.getElementById('bobs-target-field').textContent = round.field;
  document.getElementById('bobs-target-value').textContent =
    '±' + round.value + ' Punkte pro Dart';
  document.getElementById('bobs-round-label').textContent =
    (s.round + 1) + ' / ' + s.sequence.length;

  const scoreEl = document.getElementById('bobs-score');
  scoreEl.textContent = s.score;
  scoreEl.className = 'bobs-box-main bobs-score-main' +
    (s.score > bobsConfig.start ? ' positive' : s.score < 0 ? ' negative' : '');

  bobsUpdatePips();
  bobsUpdateDartBoxes();
}

function bobsBuildProgress() {
  const row = document.getElementById('bobs-progress-row');
  row.innerHTML = '';
  // Always render 21 cells in a 7×3 grid (pad with empty if needed)
  const seq = bobsState.sequence;
  const total = 21; // 7 per row × 3 rows
  for (let i = 0; i < total; i++) {
    const pip = document.createElement('div');
    if (i < seq.length) {
      pip.className = 'bobs-pip' + (i === 0 ? ' current' : '');
      pip.id = 'bobs-pip-' + i;
      const label = seq[i].field === 'BULL' ? 'DB' : seq[i].field.replace('D','');
      pip.textContent = label;
    } else {
      pip.className = 'bobs-pip';
      pip.style.visibility = 'hidden';
    }
    row.appendChild(pip);
  }
}

function bobsUpdatePips() {
  const s = bobsState;
  s.sequence.forEach((_, i) => {
    const pip = document.getElementById('bobs-pip-' + i);
    if (!pip) return;
    if (i < s.round) {
      const h = s.history[i];
      pip.className = 'bobs-pip ' + (h && h.hits > 0 ? 'hit' : 'miss');
    } else if (i === s.round) {
      pip.className = 'bobs-pip current';
    } else {
      pip.className = 'bobs-pip';
    }
  });
}

function bobsUpdateDartBoxes() {
  const s = bobsState;
  [1,2,3].forEach(i => {
    const box = document.getElementById('bobs-dbox-' + i);
    const val = document.getElementById('bobs-dval-' + i);
    if (!box || !val) return;
    const throw_ = s.dartsThisRound[i - 1];
    if (throw_ === undefined) {
      box.className = 'bobs-dart-box' + (i === s.dartInRound + 1 ? ' active' : '');
      val.textContent = '—';
    } else {
      box.className = 'bobs-dart-box ' + (throw_.hit ? 'hit' : 'miss');
      val.textContent = throw_.hit ? '✓' : '✗';
    }
  });
  if (s.dartInRound === 0) {
    const b = document.getElementById('bobs-dbox-1');
    if (b) b.classList.add('active');
  }
}

// ════════════════════════════════════════════
//  BOB'S 27 — INPUT MODES
// ════════════════════════════════════════════
function setBobsInputMode(mode) {
  bobsState.inputMode = mode;
  document.getElementById('bobs-simple-grid').style.display = mode === 'simple' ? 'grid' : 'none';
  document.getElementById('bobs-detail-grid').style.display = mode === 'detail' ? 'grid' : 'none';
  document.getElementById('bobs-dart-row').style.display   = mode === 'detail' ? 'flex' : 'none';
}

// Simple mode: player taps 0/1/2/3
function bobsSimpleInput(hits) {
  haptic(10);
  const s = bobsState;
  const round = s.sequence[s.round];
  if (!round) return;

  const delta = hits > 0 ? hits * round.value : -round.value;
  const scoreBefore = s.score;
  const newScore = s.score + delta;
  const totalDartsThisRound = 3;

  s.totalDarts += totalDartsThisRound;
  s.totalHits += hits;
  if (hits > 0 && delta > s.bestRound) s.bestRound = delta;

  s.history.push({ field: round.field, hits, delta, scoreBefore, scoreAfter: newScore });
  s.score = newScore;
  s.round++;

  bobsUpdateDisplay();
  bobsAddHistoryEntry(round.field, hits, delta);
  bobsCheckEnd();
}

// Detail mode: dart by dart
function bobsDetailInput(hit) {
  haptic(8);
  const s = bobsState;
  if (s.dartInRound >= 3) return;

  s.dartsThisRound.push({ hit });
  s.dartInRound++;
  s.totalDarts++;
  if (hit) s.totalHits++;

  bobsUpdateDartBoxes();

  if (s.dartInRound >= 3) {
    // Round complete
    const round = s.sequence[s.round];
    const hits = s.dartsThisRound.filter(d => d.hit).length;
    const delta = hits > 0 ? hits * round.value : -round.value;
    const scoreBefore = s.score;
    const newScore = s.score + delta;
    if (hits > 0 && delta > s.bestRound) s.bestRound = delta;

    s.history.push({ field: round.field, hits, delta, scoreBefore, scoreAfter: newScore });
    s.score = newScore;
    s.round++;
    s.dartInRound = 0;
    s.dartsThisRound = [];

    setTimeout(() => {
      bobsUpdateDisplay();
      bobsAddHistoryEntry(round.field, hits, delta);
      bobsCheckEnd();
    }, 400);
  }
}

// ════════════════════════════════════════════
//  BOB'S 27 — UNDO
// ════════════════════════════════════════════
function bobsUndo() {
  haptic(12);
  const s = bobsState;
  if (s.inputMode === 'detail' && s.dartInRound > 0) {
    const last = s.dartsThisRound.pop();
    s.dartInRound--;
    s.totalDarts--;
    if (last && last.hit) s.totalHits--;
    bobsUpdateDartBoxes();
    return;
  }
  if (s.history.length === 0) return;
  const last = s.history.pop();
  s.score = last.scoreBefore;
  s.round--;
  s.totalDarts -= 3;
  s.totalHits -= last.hits;
  s.dartInRound = 0;
  s.dartsThisRound = [];
  bobsUpdateDisplay();
  bobsRemoveLastHistoryEntry();
  bobsSpeakRound();
}

// ════════════════════════════════════════════
//  BOB'S 27 — HISTORY (reuse X01 bar)
// ════════════════════════════════════════════
function bobsAddHistoryEntry(field, hits, delta) {
  if (!settings.speech) return;
  const s = bobsState;
  const nextRound = s.sequence[s.round];
  const resultText =
    (delta >= 0 ? 'Plus ' : 'Minus ') + Math.abs(delta) +
    ', Stand: ' + s.score +
    (nextRound
      ? ', nächstes Feld: ' + nextRound.field.replace('D', 'Double ').replace('BULL','Bull')
      : '');
  speak(resultText);
}

function bobsRemoveLastHistoryEntry() {}

// ════════════════════════════════════════════
//  BOB'S 27 — SPEECH OUTPUT
// ════════════════════════════════════════════
function bobsSpeakRound() {
  if (!settings.speech) return;
  const s = bobsState;
  const round = s.sequence[s.round];
  if (!round) return;
  const fieldSpoken = round.field === 'BULL'
    ? 'Bull'
    : 'Double ' + round.field.replace('D','');
  // No dots before numbers — avoids TTS reading ordinals ("Erste" instead of "Eins")
  speak('Runde ' + (s.round + 1) + ', Ziel: ' + fieldSpoken +
        ', Stand: ' + s.score + ' Punkte');
}

// ════════════════════════════════════════════
//  BOB'S 27 — END CHECK
// ════════════════════════════════════════════
function bobsCheckEnd() {
  const s = bobsState;
  // Bust out
  if (bobsConfig.bust === 'yes' && s.score <= 0) {
    setTimeout(() => bobsShowResult(false), 300);
    return;
  }
  // All rounds done
  if (s.round >= s.sequence.length) {
    setTimeout(() => bobsShowResult(true), 300);
    return;
  }
  // Next round — wait for history speech to finish first
  // bobsAddHistoryEntry already calls speak(); bobsSpeakRound waits for it via polling
  function waitAndSpeak() {
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      setTimeout(waitAndSpeak, 150);
    } else {
      setTimeout(() => bobsSpeakRound(), 300);
    }
  }
  waitAndSpeak();
}

function bobsShowResult(won) {
  const s = bobsState;
  const dq = s.totalDarts > 0
    ? Math.round((s.totalHits / s.totalDarts) * 1000) / 10 : 0;

  document.getElementById('bobs-result-icon').textContent  = won ? '🎯' : '💀';
  document.getElementById('bobs-result-title').textContent = won ? 'ABGESCHLOSSEN!' : 'AUSGESCHIEDEN!';
  document.getElementById('bobs-result-title').className   = 'bobs-result-title ' + (won ? 'won' : 'lost');
  document.getElementById('bobs-result-sub').textContent   = won
    ? 'Alle Runden erfolgreich gespielt'
    : 'Punktestand auf ' + s.score + ' gefallen';
  document.getElementById('bobs-final-score').textContent = s.score;
  document.getElementById('bobs-final-hits').textContent  = s.totalHits + ' / ' + s.totalDarts;
  document.getElementById('bobs-final-dq').textContent    = dq.toFixed(1) + ' %';
  document.getElementById('bobs-final-best').textContent  = s.bestRound > 0 ? '+' + s.bestRound : '—';

  document.getElementById('bobs-result-overlay').classList.add('show');

  if (settings.speech) {
    speak(won
      ? 'Herzlichen Glückwunsch, alle Runden abgeschlossen, Endstand: ' + s.score + ' Punkte'
      : 'Ausgeschieden, Endstand: ' + s.score + ' Punkte, Double-Quote: ' + dq.toFixed(1) + ' Prozent');
  }
}

function bobsResultClose() {
  document.getElementById('bobs-result-overlay').classList.remove('show');
  if (bobsMicActive) {
    bobsMicActive = false;
    try { bobsRecognition && bobsRecognition.abort(); } catch(e) {}
  }
  showPage('start');
}

function confirmBobsQuit() {
  document.getElementById('quit-modal').classList.add('show');
  // Override doQuit to go back to start
  window._quitTarget = 'start';
}

// ════════════════════════════════════════════
//  BOB'S 27 — SPEECH INPUT
// ════════════════════════════════════════════
function toggleBobsMic() {
  if (!bobsRecognition) initBobsSpeech();
  if (!bobsRecognition) return;
  bobsMicActive = !bobsMicActive;
  const btn    = document.getElementById('bobs-mic-btn');
  const status = document.getElementById('bobs-speech-status');
  if (bobsMicActive) {
    btn.classList.remove('muted'); btn.classList.add('listening');
    status.classList.add('active');
    try { bobsRecognition.start(); } catch(e) {}
  } else {
    btn.classList.remove('listening'); btn.classList.add('muted');
    status.classList.remove('active');
    try { bobsRecognition.abort(); } catch(e) {}
  }
}

function initBobsSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  bobsRecognition = new SR();
  bobsRecognition.lang = 'de-DE';
  bobsRecognition.continuous = false;
  bobsRecognition.interimResults = true;
  bobsRecognition.maxAlternatives = 1;

  bobsRecognition.onresult = (e) => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    const text = (final || interim).trim().toLowerCase();
    document.getElementById('bobs-speech-transcript').textContent = text;
    if (final) {
      cancelPauseTimer();
      speechProcess(final.trim().toLowerCase(), parseBobsSpeech);
    } else if (interim) {
      scheduleFromInterim(interim.trim().toLowerCase(), parseBobsSpeech);
    }
  };
  bobsRecognition.onerror = (e) => {
    if (e.error !== 'no-speech' && e.error !== 'aborted')
      document.getElementById('bobs-speech-transcript').textContent = 'Fehler: ' + e.error;
    if (bobsMicActive) setTimeout(() => { try { bobsRecognition.start(); } catch(e){} }, 150);
  };
  bobsRecognition.onend = () => {
    if (bobsMicActive) setTimeout(() => { try { bobsRecognition.start(); } catch(e){} }, 100);
    else {
      document.getElementById('bobs-speech-dot').classList.add('idle');
    }
  };
  bobsRecognition.onstart = () => {
    document.getElementById('bobs-speech-dot').classList.remove('idle');
    resetSpeechSession();
  };
}

function parseBobsSpeech(text) {
  const s = bobsState;
  // Simple mode commands: "null","eine","zwei","drei","0","1","2","3"
  // or "miss","daneben" → 0
  // or "treffer" → 1
  if (s.inputMode === 'simple') {
    const map = {
      'null':0,'daneben':0,'miss':0,'keine':0,'kein':0,
      'eins':1,'ein':1,'einen':1,'einen treffer':1,'treffer':1,'1':1,'one':1,
      'zwei':2,'zwei treffer':2,'2':2,'two':2,
      'drei':3,'drei treffer':3,'alle drei':3,'alle':3,'3':3,'three':3,
    };
    for (const [key, val] of Object.entries(map)) {
      if (text.includes(key)) { bobsSimpleInput(val); return; }
    }
  } else {
    // Detail mode: "treffer","ja","hit","getroffen" → hit; "daneben","nein","miss","vorbei" → miss
    if (/treffer|ja|hit|getroffen|rein|drin/.test(text)) { bobsDetailInput(true); return; }
    if (/daneben|nein|miss|vorbei|verfehlt/.test(text))  { bobsDetailInput(false); return; }
  }
  document.getElementById('bobs-speech-transcript').textContent = '❓ ' + text;
}


// ════════════════════════════════════════════
//  AROUND THE CLOCK — CONFIG & STATE
// ════════════════════════════════════════════
