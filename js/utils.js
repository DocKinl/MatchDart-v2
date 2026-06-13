// ════════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════════
function haptic(ms = 10) {
  if (!settings.haptic) return;
  if (navigator.vibrate) navigator.vibrate(ms);
}

function confirmQuit() {
  document.getElementById('quit-modal').classList.add('show');
}
function doQuit() {
  document.getElementById('quit-modal').classList.remove('show');
  window.speechSynthesis && window.speechSynthesis.cancel();
  if (micActive) {
    micActive = false;
    try { speechRecognition && speechRecognition.abort(); } catch(e) {}
    document.getElementById('mic-btn').classList.remove('listening');
    document.getElementById('mic-btn').classList.add('muted');
    document.getElementById('speech-status').classList.remove('active');
  }
  showPage('start');
}
function cancelQuit() {
  document.getElementById('quit-modal').classList.remove('show');
}


// ════════════════════════════════════════════
//  BOB'S 27 — CONFIG & STATE
// ════════════════════════════════════════════

//  WAKE LOCK — Bildschirm bleibt an
//  Strategie 1: Wake Lock API (Chrome/Android)
//  Strategie 2: Audio NoSleep (iOS Safari)
// ════════════════════════════════════════════
let wakeLock = null;
let noSleepEnabled = false;
let noSleepTimer = null;
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
        if (document.visibilityState === 'visible') requestWakeLock();
      });
      return;
    } catch(e) {}
  }
  startNoSleepAudio();
}

function startNoSleepAudio() {
  if (noSleepEnabled) return;
  noSleepEnabled = true;
  function playNoop() {
    if (!noSleepEnabled) return;
    const a = new Audio(SILENT_WAV);
    a.volume = 0.01;
    a.play().catch(() => {});
    noSleepTimer = setTimeout(playNoop, 25000);
  }
  playNoop();
}

function stopNoSleepAudio() {
  noSleepEnabled = false;
  if (noSleepTimer) { clearTimeout(noSleepTimer); noSleepTimer = null; }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock();
  else stopNoSleepAudio();
});



// ════════════════════════════════════════════
//  CRICKET — CONFIG & STATE
// ════════════════════════════════════════════
const cricketConfig = {
  playermode: 'solo',
  difficulty: 'easy',
  variant: 'standard',
  order: 'standard',
};

const CRICKET_FIELDS_STD = [20, 19, 18, 17, 16, 15, 'bull'];
const CRICKET_AI_PROB = { easy: 0.30, medium: 0.50, hard: 0.70 };
// Bull value: 25 per hit (single=25, double=50)
const CRICKET_FIELD_VAL = { 20:20, 19:19, 18:18, 17:17, 16:16, 15:15, bull:25 };

let cricketState = {
  fields: [],        // ordered list of fields to play
  // marks[player][field] = 0-3 (3 = closed)
  marks: { p1: {}, p2: {} },
  scores: { p1: 0, p2: 0 },
  currentPlayer: 'p1',
  dartInRound: 0,     // 0-2
  dartsThisRound: [], // [{field, mod, marks, points}]
  totalDarts: { p1: 0, p2: 0 },
  totalMarks: { p1: 0, p2: 0 },
  selectedField: null,
  selectedMod: 'single',
  playerMode: 'solo',
  winner: null,
};

let cricketRecognition = null;
let cricketMicActive = false;

function cricketSelectOpt(group, val, btn) {
  const grp = document.getElementById('cricket-grp-' + group);
  grp.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  cricketConfig[group] = val;
  if (group === 'playermode') {
    document.getElementById('cricket-grp-difficulty-group')
      .classList.toggle('visible', val === 'cpu');
  }
}

// ════════════════════════════════════════════
//  CRICKET — START
// ════════════════════════════════════════════
function startCricket() {
  haptic(10);
  let fields = [...CRICKET_FIELDS_STD];
  if (cricketConfig.order === 'random') {
    for (let i = fields.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fields[i], fields[j]] = [fields[j], fields[i]];
    }
  }

  const marks = { p1: {}, p2: {} };
  fields.forEach(f => { marks.p1[f] = 0; marks.p2[f] = 0; });

  const p1Name = document.getElementById('input-p1-name')?.value.trim() || 'Spieler 1';
  const p2Name = cricketConfig.playermode === 'cpu'
    ? 'KI (' + {easy:'Leicht',medium:'Mittel',hard:'Schwer'}[cricketConfig.difficulty] + ')'
    : (document.getElementById('input-p2-name')?.value.trim() || 'Spieler 2');

  cricketState = {
    fields,
    marks,
    scores: { p1: 0, p2: 0 },
    currentPlayer: 'p1',
    dartInRound: 0,
    dartsThisRound: [],
    totalDarts: { p1: 0, p2: 0 },
    totalMarks: { p1: 0, p2: 0 },
    selectedField: null,
    selectedMod: 'single',
    playerMode: cricketConfig.playermode,
    winner: null,
    p1Name, p2Name,
  };

  // UI
  document.getElementById('cricket-p1-name').textContent = p1Name;
  document.getElementById('cricket-p2-name').textContent = p2Name;
  document.getElementById('cricket-p1-score').textContent = '0';
  document.getElementById('cricket-p2-score').textContent = '0';

  const variantLabel = {standard:'Standard · Punkte', noscore:'No Score', cutthroat:'Cut-Throat'}[cricketConfig.variant];
  document.getElementById('cricket-rule-tag').textContent = variantLabel;

  const isMulti = cricketConfig.playermode !== 'solo';
  document.getElementById('cricket-pbox-p2').style.display = isMulti ? 'flex' : 'none';
  document.getElementById('cricket-vs-box') && (document.querySelector('.cricket-vs-box').style.display = isMulti ? 'flex' : 'none');

  // Build table
  cricketBuildTable();
  cricketUpdateDisplay();
  cricketSetMod('single');
  cricketDeselectField();

  // Mic reset
  if (cricketMicActive) {
    cricketMicActive = false;
    try { cricketRecognition?.abort(); } catch(e) {}
  }
  document.getElementById('cricket-mic-btn').className = 'mic-btn muted';
  document.getElementById('cricket-speech-status').classList.remove('active');
  document.getElementById('cricket-result-overlay').classList.remove('show');

  window.speechSynthesis?.cancel();
  setTimeout(() => cricketSpeakTurn(), 400);
  showPage('cricket-game');
}

// ════════════════════════════════════════════
//  CRICKET — TABLE
// ════════════════════════════════════════════
function cricketBuildTable() {
  const s = cricketState;
  const tbody = document.getElementById('cricket-table');
  tbody.innerHTML = '';
  const isMulti = s.playerMode !== 'solo';

  s.fields.forEach(field => {
    const tr = document.createElement('tr');
    tr.id = 'cricket-row-' + field;

    const label = field === 'bull' ? 'Bull' : field;

    // P1 marks cell
    const tdP1 = document.createElement('td');
    tdP1.className = 'ct-mark-cell';
    tdP1.innerHTML = '<div class="ct-marks" id="ct-marks-p1-' + field + '"></div>';
    tr.appendChild(tdP1);

    // Field cell
    const tdF = document.createElement('td');
    tdF.className = 'ct-field-cell';
    tdF.id = 'ct-field-' + field;
    tdF.textContent = label;
    tdF.onclick = () => cricketSelectField(field);
    tr.appendChild(tdF);

    // P2 marks cell
    const tdP2 = document.createElement('td');
    tdP2.className = 'ct-mark-cell right';
    tdP2.style.display = isMulti ? '' : 'none';
    tdP2.innerHTML = '<div class="ct-marks right" id="ct-marks-p2-' + field + '"></div>';
    tr.appendChild(tdP2);

    tbody.appendChild(tr);
  });
}

// SVG marks: / for 1, X for 2, ⊗ for 3
function cricketMarksSVG(count) {
  const W = 36, H = 32;
  if (count === 0) return '';
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  const col = 'currentColor';
  if (count >= 1) {
    // Single slash
    svg += `<line x1="18" y1="4" x2="28" y2="28" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`;
  }
  if (count >= 2) {
    // Second line to make X
    svg += `<line x1="8" y1="4" x2="18" y2="28" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`;
  }
  if (count >= 3) {
    // Circle around X
    svg += `<circle cx="16" cy="16" r="13" stroke="${col}" stroke-width="2" fill="none"/>`;
  }
  svg += '</svg>';
  return svg;
}

function cricketUpdateMarksCell(player, field) {
  const s = cricketState;
  const el = document.getElementById('ct-marks-' + player + '-' + field);
  if (!el) return;
  const count = s.marks[player][field] || 0;
  el.innerHTML = cricketMarksSVG(count);
  // Color based on closed status
  const closed = count >= 3;
  el.style.color = closed ? 'var(--success)' : 'var(--accent)';
}

function cricketUpdateDisplay() {
  const s = cricketState;
  // Update all marks and row states
  s.fields.forEach(field => {
    cricketUpdateMarksCell('p1', field);
    cricketUpdateMarksCell('p2', field);

    const p1closed = (s.marks.p1[field] || 0) >= 3;
    const p2closed = (s.marks.p2[field] || 0) >= 3;
    const bothClosed = p1closed && (s.playerMode === 'solo' || p2closed);

    const row = document.getElementById('cricket-row-' + field);
    if (row) row.className = bothClosed ? 'both-closed' : '';

    // Field btn state
    const btn = document.getElementById('cfb-' + field);
    if (btn) {
      const myPlayer = s.currentPlayer;
      const myMarks = (s.marks[myPlayer][field] || 0) >= 3;
      btn.classList.toggle('closed', myMarks);
    }
  });

  // Scores
  document.getElementById('cricket-p1-score').textContent = s.scores.p1;
  document.getElementById('cricket-p2-score').textContent = s.scores.p2;

  // Player boxes highlight
  const isP1 = s.currentPlayer === 'p1';
  const p1box = document.getElementById('cricket-pbox-p1');
  const p2box = document.getElementById('cricket-pbox-p2');
  p1box.className = 'cricket-player-box' + (isP1 ? ' active' : '');
  p2box.className = 'cricket-player-box right' + (!isP1 ? (cricketConfig.playermode === 'cpu' ? ' active-ai' : ' active') : '');

  // Status bar
  document.getElementById('cricket-dart-count').textContent =
    'Dart ' + (s.dartInRound + 1) + ' von 3';
  const turnName = isP1 ? (s.p1Name || 'Spieler 1') : (s.p2Name || 'Spieler 2');
  document.getElementById('cricket-turn-label').textContent =
    s.currentPlayer === 'p1' || s.playerMode === 'pvp' ? turnName + ' ist dran' : '';
}

// ════════════════════════════════════════════
//  CRICKET — INPUT
// ════════════════════════════════════════════
function cricketSelectField(field) {
  haptic(6);
  const s = cricketState;
  // Can't select already-closed field for current player
  if ((s.marks[s.currentPlayer][field] || 0) >= 3) return;
  s.selectedField = field;
  // Highlight selected field btn
  document.querySelectorAll('.cricket-field-btn').forEach(b => b.classList.remove('selected'));
  const btn = document.getElementById('cfb-' + field);
  if (btn) btn.classList.add('selected');
}

function cricketDeselectField() {
  cricketState.selectedField = null;
  document.querySelectorAll('.cricket-field-btn').forEach(b => b.classList.remove('selected'));
}

function cricketSetMod(mod) {
  cricketState.selectedMod = mod;
  ['single','double','triple','miss'].forEach(m => {
    document.getElementById('cricket-mod-' + m)?.classList.toggle('active', m === mod);
  });
}

function cricketThrowMiss() {
  haptic(8);
  cricketRegisterThrow(null, 'miss', 0);
}

function cricketConfirmThrow() {
  haptic(10);
  const s = cricketState;
  if (s.selectedMod === 'miss') { cricketRegisterThrow(null, 'miss', 0); return; }
  if (s.selectedField === null) {
    // Flash prompt
    document.getElementById('cricket-dart-count').textContent = '⚠ Bitte erst Feld auswählen!';
    setTimeout(() => cricketUpdateDisplay(), 1500);
    return;
  }
  const multiplier = s.selectedMod === 'single' ? 1 : s.selectedMod === 'double' ? 2 : 3;
  cricketRegisterThrow(s.selectedField, s.selectedMod, multiplier);
}

function cricketRegisterThrow(field, mod, multiplier) {
  const s = cricketState;
  haptic(8);

  let marksAdded = 0;
  let pointsScored = 0;

  if (field !== null && multiplier > 0) {
    const current = s.marks[s.currentPlayer][field] || 0;
    const opponent = s.currentPlayer === 'p1' ? 'p2' : 'p1';
    const needed = Math.max(0, 3 - current); // marks needed to close
    const extra = multiplier - needed;        // extra marks after closing

    marksAdded = Math.min(multiplier, needed + (current < 3 ? 0 : multiplier));
    // Actually: marks added = min(multiplier, 3 - current) capped at 3
    const newMarks = Math.min(3, current + multiplier);
    s.marks[s.currentPlayer][field] = newMarks;
    marksAdded = newMarks - current;
    s.totalMarks[s.currentPlayer] += marksAdded;

    // Points: extra hits after closing, if opponent hasn't closed
    if (extra > 0 && newMarks >= 3) {
      const oppClosed = (s.marks[opponent][field] || 0) >= 3;
      if (!oppClosed && cricketConfig.variant !== 'noscore') {
        const fieldVal = CRICKET_FIELD_VAL[field];
        if (cricketConfig.variant === 'cutthroat') {
          s.scores[opponent] += extra * fieldVal;
        } else {
          s.scores[s.currentPlayer] += extra * fieldVal;
        }
        pointsScored = extra * fieldVal;
      }
    }
  }

  s.dartsThisRound.push({ field, mod, multiplier, marksAdded, pointsScored });
  s.dartInRound++;
  s.totalDarts[s.currentPlayer]++;

  cricketUpdateDisplay();
  cricketDeselectField();
  cricketSetMod('single');

  // Check win after each dart
  if (cricketCheckWin()) return;

  // End of 3 darts
  if (s.dartInRound >= 3) {
    setTimeout(() => cricketEndRound(), 300);
  }
}

function cricketEndRound() {
  const s = cricketState;
  s.dartInRound = 0;
  s.dartsThisRound = [];
  cricketDeselectField();
  cricketSetMod('single');

  if (s.playerMode === 'cpu' && s.currentPlayer === 'p1') {
    s.currentPlayer = 'p2';
    cricketUpdateDisplay();
    setTimeout(() => cricketRunCpu(), 700);
  } else if (s.playerMode === 'pvp') {
    s.currentPlayer = s.currentPlayer === 'p1' ? 'p2' : 'p1';
    cricketUpdateDisplay();
    speak((s.currentPlayer === 'p1' ? (s.p1Name || 'Spieler 1') : (s.p2Name || 'Spieler 2')) + ' ist dran');
  } else {
    // Solo: stay as p1
    cricketUpdateDisplay();
    cricketSpeakTurn();
  }
}

// ════════════════════════════════════════════
//  CRICKET — WIN CHECK
// ════════════════════════════════════════════
function cricketCheckWin() {
  const s = cricketState;
  const allClosed = (player) => s.fields.every(f => (s.marks[player][f] || 0) >= 3);
  const p1done = allClosed('p1');
  const p2done = s.playerMode !== 'solo' ? allClosed('p2') : false;

  if (s.playerMode === 'solo' && p1done) {
    setTimeout(() => cricketShowResult('p1'), 400);
    return true;
  }

  if (p1done || p2done) {
    // In standard/cutthroat: winner must also have >= opponent's score
    let winner = null;
    if (cricketConfig.variant === 'noscore') {
      winner = p1done && !p2done ? 'p1' : p2done && !p1done ? 'p2' : 'p1'; // tie → p1
    } else if (cricketConfig.variant === 'cutthroat') {
      // Lower score wins in cut-throat
      if (p1done && s.scores.p1 <= s.scores.p2) winner = 'p1';
      else if (p2done && s.scores.p2 <= s.scores.p1) winner = 'p2';
    } else {
      // Standard: all closed + higher or equal score
      if (p1done && s.scores.p1 >= s.scores.p2) winner = 'p1';
      else if (p2done && s.scores.p2 >= s.scores.p1) winner = 'p2';
    }
    if (winner) {
      s.winner = winner;
      setTimeout(() => cricketShowResult(winner), 400);
      return true;
    }
  }
  return false;
}

// ════════════════════════════════════════════
//  CRICKET — UNDO
// ════════════════════════════════════════════
function cricketUndo() {
  haptic(12);
  const s = cricketState;
  if (s.dartsThisRound.length === 0) return;
  const last = s.dartsThisRound.pop();
  s.dartInRound--;
  s.totalDarts[s.currentPlayer]--;

  if (last.field !== null && last.marksAdded > 0) {
    s.marks[s.currentPlayer][last.field] = Math.max(0,
      (s.marks[s.currentPlayer][last.field] || 0) - last.marksAdded);
    s.totalMarks[s.currentPlayer] -= last.marksAdded;
  }
  if (last.pointsScored !== 0) {
    const opponent = s.currentPlayer === 'p1' ? 'p2' : 'p1';
    if (cricketConfig.variant === 'cutthroat') {
      s.scores[opponent] -= last.pointsScored;
    } else {
      s.scores[s.currentPlayer] -= last.pointsScored;
    }
  }
  cricketUpdateDisplay();
  cricketDeselectField();
  cricketSetMod('single');
}

// ════════════════════════════════════════════
//  CRICKET — CPU AI
// ════════════════════════════════════════════
function cricketRunCpu() {
  const s = cricketState;
  const prob = CRICKET_AI_PROB[cricketConfig.difficulty];

  // AI strategy: choose target field
  function chooseTarget() {
    const variant = cricketConfig.variant;
    // Hard: strategic — close fields where opponent is scoring, then own fields
    if (cricketConfig.difficulty === 'hard' && variant === 'standard') {
      // Find fields opponent has open that we've closed (we can score on)
      const canScore = s.fields.filter(f => {
        const myM = s.marks.p2[f] || 0;
        const oppM = s.marks.p1[f] || 0;
        return myM >= 3 && oppM < 3;
      });
      if (canScore.length > 0) return canScore[0];
      // Otherwise close highest open field
    }
    // Find first unclosed field (highest value)
    return s.fields.find(f => (s.marks.p2[f] || 0) < 3) || null;
  }

  let dartsLeft = 3;
  function throwOne() {
    if (dartsLeft <= 0 || cricketCheckWin()) {
      // CPU done
      s.currentPlayer = 'p1';
      s.dartInRound = 0;
      s.dartsThisRound = [];
      cricketUpdateDisplay();
      cricketSpeakTurn();
      return;
    }

    dartsLeft--;
    s.totalDarts.p2++;

    const target = chooseTarget();
    const hit = target !== null && Math.random() < prob;

    if (hit) {
      // Determine multiplier (weighted: 50% single, 30% double, 20% triple)
      const r = Math.random();
      const mult = r < 0.5 ? 1 : r < 0.8 ? 2 : 3;
      const current = s.marks.p2[target] || 0;
      const newMarks = Math.min(3, current + mult);
      const marksAdded = newMarks - current;
      s.marks.p2[target] = newMarks;
      s.totalMarks.p2 += marksAdded;

      const extra = mult - (3 - current);
      if (extra > 0 && newMarks >= 3) {
        const p1closed = (s.marks.p1[target] || 0) >= 3;
        if (!p1closed && cricketConfig.variant !== 'noscore') {
          const fval = CRICKET_FIELD_VAL[target];
          if (cricketConfig.variant === 'cutthroat') {
            s.scores.p1 += extra * fval;
          } else {
            s.scores.p2 += extra * fval;
          }
        }
      }
    }

    cricketUpdateDisplay();
    if (cricketCheckWin()) return;
    setTimeout(throwOne, 400);
  }
  throwOne();
}

// ════════════════════════════════════════════
//  CRICKET — RESULT
// ════════════════════════════════════════════
function cricketShowResult(winner) {
  const s = cricketState;
  const isHuman = winner === 'p1';
  const totalD = s.totalDarts.p1;
  const totalM = s.totalMarks.p1;
  const mpr = totalD > 0 ? (totalM / (totalD / 3)).toFixed(2) : '—';

  document.getElementById('cricket-result-icon').textContent  = isHuman ? '🦗' : '💀';
  document.getElementById('cricket-result-title').textContent =
    s.playerMode === 'solo' ? 'ABGESCHLOSSEN!' : (isHuman ? 'GEWONNEN!' : 'VERLOREN!');
  document.getElementById('cricket-result-title').className =
    'cricket-result-title ' + (isHuman || s.playerMode === 'solo' ? 'won' : 'lost');
  document.getElementById('cricket-result-sub').textContent =
    s.playerMode === 'solo' ? 'Alle Felder geschlossen'
    : isHuman ? (s.p2Name + ' besiegt!')
    : (s.p2Name + ' hat gewonnen');
  document.getElementById('cricket-final-score').textContent  = s.scores.p1;
  document.getElementById('cricket-final-darts').textContent  = totalD;
  document.getElementById('cricket-final-mpr').textContent    = mpr;
  document.getElementById('cricket-result-overlay').classList.add('show');

  const msg = s.playerMode === 'solo'
    ? 'Glückwunsch, alle Felder geschlossen'
    : isHuman ? 'Glückwunsch, du hast gewonnen'
    : (s.p2Name || 'Die KI') + ' hat gewonnen';
  speak(msg);
}

function cricketResultClose() {
  document.getElementById('cricket-result-overlay').classList.remove('show');
  if (cricketMicActive) {
    cricketMicActive = false;
    try { cricketRecognition?.abort(); } catch(e) {}
  }
  showPage('start');
}

function confirmCricketQuit() {
  document.getElementById('quit-modal').classList.add('show');
}

// ════════════════════════════════════════════
//  CRICKET — SPEECH OUTPUT
// ════════════════════════════════════════════
function cricketSpeakTurn() {
  if (!settings.speech) return;
  const s = cricketState;
  // Find first unclosed field for current player
  const next = s.fields.find(f => (s.marks[s.currentPlayer][f] || 0) < 3);
  if (!next) return;
  const fieldSpoken = next === 'bull' ? 'Bull' : next;
  speak('Nächstes Ziel: ' + fieldSpoken);
}

// ════════════════════════════════════════════
//  CRICKET — SPEECH INPUT
// ════════════════════════════════════════════
function toggleCricketMic() {
  if (!cricketRecognition) initCricketSpeech();
  if (!cricketRecognition) return;
  cricketMicActive = !cricketMicActive;
  const btn    = document.getElementById('cricket-mic-btn');
  const status = document.getElementById('cricket-speech-status');
  if (cricketMicActive) {
    btn.classList.remove('muted'); btn.classList.add('listening');
    status.classList.add('active');
    try { cricketRecognition.start(); } catch(e) {}
  } else {
    btn.classList.remove('listening'); btn.classList.add('muted');
    status.classList.remove('active');
    try { cricketRecognition.abort(); } catch(e) {}
  }
}

function initCricketSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  cricketRecognition = new SR();
  cricketRecognition.lang = 'de-DE';
  cricketRecognition.continuous = false;
  cricketRecognition.interimResults = true;
  cricketRecognition.maxAlternatives = 1;

  cricketRecognition.onstart = () => {
    document.getElementById('cricket-speech-dot').classList.remove('idle');
    resetSpeechSession();
  };
  cricketRecognition.onresult = (e) => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    const text = (final || interim).trim().toLowerCase();
    document.getElementById('cricket-speech-transcript').textContent = text;
    if (final) {
      cancelPauseTimer();
      speechProcess(text, parseCricketSpeech);
    } else if (interim) {
      scheduleFromInterim(text, parseCricketSpeech);
    }
  };
  cricketRecognition.onerror = () => {
    if (cricketMicActive) setTimeout(() => { try { cricketRecognition.start(); } catch(e){} }, 150);
  };
  cricketRecognition.onend = () => {
    if (cricketMicActive) setTimeout(() => { try { cricketRecognition.start(); } catch(e){} }, 100);
    else document.getElementById('cricket-speech-dot').classList.add('idle');
  };
}

function parseCricketSpeech(text) {
  // "miss" / "daneben"
  if (/^(miss|daneben|vorbei)$/.test(text)) {
    cricketSetMod('miss');
    cricketThrowMiss();
    return;
  }

  // Modifier + field: "triple 20", "dreifach zwanzig", "doppel bull" etc.
  const modMap = {
    single:1, einfach:1, '1x':1,
    double:2, doppel:2, '2x':2,
    triple:3, dreifach:3, tripel:3, '3x':3,
  };
  const fieldMap = {
    fünfzehn:15, sechzehn:16, siebzehn:17, achtzehn:18, neunzehn:19, zwanzig:20,
    bull:  'bull', bullseye:'bull', '15':15,'16':16,'17':17,'18':18,'19':19,'20':20,'25':'bull','50':'bull',
  };

  let mod = 'single';
  let field = null;
  const tokens = text.replace(/[,;]/g,' ').split(/\s+/);

  for (const tok of tokens) {
    if (modMap[tok]) mod = ['single','double','triple'][modMap[tok]-1];
  }
  for (const tok of tokens) {
    if (fieldMap[tok] !== undefined) { field = fieldMap[tok]; break; }
    const n = parseInt(tok);
    if (!isNaN(n) && [15,16,17,18,19,20,25,50].includes(n)) {
      field = n === 25 || n === 50 ? 'bull' : n;
      break;
    }
  }

  if (field === null) {
    document.getElementById('cricket-speech-transcript').textContent = '❓ ' + text;
    return;
  }

  cricketSelectField(field);
  cricketSetMod(mod);
  // Auto-confirm after short delay
  setTimeout(() => cricketConfirmThrow(), 150);
}

// Apply persisted state to UI on load
document.addEventListener('DOMContentLoaded', () => {
  // Splash: show for 3s then fade to start
  const splash = document.getElementById('page-splash');
  setTimeout(() => {
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
    }, 650);
  }, 3000);

  loadPersisted();
  setTheme(settings.theme || 'dark');
  // Wake Lock API (Android/Chrome) — works without gesture
  if ('wakeLock' in navigator) requestWakeLock();
  // iOS: NoSleep audio needs user gesture — trigger on first tap
  function onFirstTouch() {
    if (!noSleepEnabled && !wakeLock) startNoSleepAudio();
    document.removeEventListener('touchstart', onFirstTouch);
    document.removeEventListener('click', onFirstTouch);
  }
  document.addEventListener('touchstart', onFirstTouch, { once: true });
  document.addEventListener('click', onFirstTouch, { once: true });
  // Sync settings UI
  const sp = document.getElementById('tgl-speech');
  if (sp) sp.checked = settings.speech;
  const hap = document.getElementById('tgl-haptic');
  if (hap) hap.checked = settings.haptic;
  const vol = document.getElementById('vol-slider');
  if (vol) vol.value = settings.volume;
  // Sync config UI (points, in/out/limit/playerMode/difficulty)
  function syncGrp(id, val) {
    const grp = document.getElementById(id);
    if (!grp) return;
    grp.querySelectorAll('.opt-btn').forEach(b => {
      const bval = b.dataset.val;
      b.classList.toggle('selected', bval == val || bval === String(val));
    });
  }
  syncGrp('grp-points', gameConfig.points);
  syncGrp('grp-in', gameConfig.inRule);
  syncGrp('grp-out', gameConfig.outRule);
  syncGrp('grp-limit', gameConfig.limit);
  syncGrp('grp-playermode', gameConfig.playerMode);
  syncGrp('grp-difficulty', gameConfig.difficulty);
  syncGrp('grp-inputmode', gameConfig.inputMode || 'dart');
  gameState.inputMode = gameConfig.inputMode || 'dart';
  if (gameConfig.playerMode === 'cpu') {
    document.getElementById('grp-difficulty-group').classList.add('visible');
  }
  if (gameConfig.playerMode === 'pvp') {
    document.getElementById('input-p2-name').style.display = 'block';
  }
});
