// ════════════════════════════════════════════
//  CRICKET — CONFIG & STATE
// ════════════════════════════════════════════
const CKT_FIELDS = [20, 19, 18, 17, 16, 15, 25]; // 25 = Bull

const cktConfig = {
  playermode: 'solo',
  difficulty:  'easy',
  variant:     'standard',  // 'standard' | 'noscore' | 'cutthroat'
  order:       'standard',  // 'standard' | 'random'
};

const CKT_AI_HIT_PROB = { easy: 0.30, medium: 0.50, hard: 0.70 };

// State per player: marks[field] = 0..3, pts = points scored
function mkPlayer(name) {
  const marks = {};
  CKT_FIELDS.forEach(f => marks[f] = 0);
  return { name, marks, pts: 0 };
}

let cktState = {
  fields:      [], // ordered fields for this game
  human:       mkPlayer('Spieler 1'),
  opponent:    mkPlayer('KI'),
  current:     'human',      // 'human' | 'opponent'
  dartInRound: 0,            // 0-2
  roundThrows: [],           // [{field, mod, marks_added, pts_added}]
  history:     [],           // for undo
  totalDarts:  0,
  modifier:    'single',
  playerMode:  'solo',
  gameOver:    false,
  pendingMod:  'single',
};



// ── Helpers ──────────────────────────────────────────────────────────────────
function cktSelectOpt(group, val, btn) {
  const grp = document.getElementById('ckt-grp-' + group);
  if (!grp) return;
  grp.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  cktConfig[group] = val;
  if (group === 'playermode') {
    const dg = document.getElementById('ckt-grp-difficulty-group');
    if (dg) dg.classList.toggle('visible', val === 'cpu');
  }
}

function cktFieldValue(field) {
  return field === 25 ? 25 : field; // Bull = 25 pts per mark over 3
}

// How many marks does a throw add?
function cktMarksForMod(mod) {
  if (mod === 'double') return 2;
  if (mod === 'triple') return 3;
  if (mod === 'miss')   return 0;
  return 1; // single
}

// Is a field closed for a player?
function cktClosed(player, field) {
  return player.marks[field] >= 3;
}

// Is field closed by BOTH players?
function cktBothClosed(field) {
  return cktClosed(cktState.human, field) &&
         cktClosed(cktState.opponent, field);
}

// Apply hits to a player, return {marksAdded, ptsAdded}
function cktApplyHit(player, opponent, field, marks) {
  if (marks === 0) return { marksAdded: 0, ptsAdded: 0 };

  const before   = player.marks[field];
  const newMarks = Math.min(before + marks, 3 + marks); // track overage
  const closed   = before >= 3;
  let marksAdded = 0, ptsAdded = 0;

  if (closed) {
    // Already closed — scoring marks if variant allows and opponent not closed
    const scoring = marks;
    if (cktConfig.variant !== 'noscore') {
      if (cktConfig.variant === 'standard') {
        if (!cktClosed(opponent, field)) {
          ptsAdded = scoring * cktFieldValue(field);
          player.pts += ptsAdded;
        }
      } else if (cktConfig.variant === 'cutthroat') {
        if (!cktClosed(opponent, field)) {
          ptsAdded = scoring * cktFieldValue(field);
          opponent.pts += ptsAdded; // goes to opponent
        }
      }
    }
    marksAdded = 0; // already at 3
  } else {
    // Closing marks
    const toClose = 3 - before;
    const closing = Math.min(marks, toClose);
    const extra   = marks - closing;
    player.marks[field] = Math.min(before + closing, 3);
    marksAdded = closing;

    if (extra > 0 && cktConfig.variant !== 'noscore') {
      if (cktConfig.variant === 'standard') {
        if (!cktClosed(opponent, field)) {
          ptsAdded = extra * cktFieldValue(field);
          player.pts += ptsAdded;
        }
      } else if (cktConfig.variant === 'cutthroat') {
        if (!cktClosed(opponent, field)) {
          ptsAdded = extra * cktFieldValue(field);
          opponent.pts += ptsAdded;
        }
      }
    }
  }
  return { marksAdded, ptsAdded };
}

// ════════════════════════════════════════════
//  CRICKET — START
// ════════════════════════════════════════════
function startCricket() {
  haptic(10);

  const fields = cktConfig.order === 'random'
    ? [...CKT_FIELDS].sort(() => Math.random() - 0.5)
    : [...CKT_FIELDS];

  const p1Name = (document.getElementById('input-p1-name') || {}).value?.trim() || 'Spieler 1';
  const isCpu  = cktConfig.playermode === 'cpu';
  const isPvP  = cktConfig.playermode === 'pvp';
  const p2Name = isCpu
    ? 'KI (' + {easy:'Leicht',medium:'Mittel',hard:'Schwer'}[cktConfig.difficulty] + ')'
    : ((document.getElementById('input-p2-name') || {}).value?.trim() || 'Spieler 2');

  cktState = {
    fields,
    human:       mkPlayer(p1Name),
    opponent:    mkPlayer(p2Name),
    current:     'human',
    dartInRound: 0,
    roundThrows: [],
    history:     [],
    totalDarts:  0,
    modifier:    'single',
    playerMode:  cktConfig.playermode,
    gameOver:    false,
    pendingMod:  'single',
  };

  // UI
  const isMulti = cktConfig.playermode !== 'solo';
  document.getElementById('ckt-name-p1').textContent = p1Name;
  document.getElementById('ckt-name-p2').textContent = p2Name;
  document.getElementById('ckt-rule-tag').textContent =
    {standard:'Standard',noscore:'No-Score',cutthroat:'Cut-Throat'}[cktConfig.variant];

  const p2box = document.getElementById('ckt-sbox-p2');
  p2box.style.display = isMulti ? 'flex' : 'none';

  // Mic reset
  if (_cktSpeech) _cktSpeech.destroy();
  document.getElementById('ckt-mic-btn').className = 'mic-btn muted';
  document.getElementById('ckt-speech-status').classList.remove('active');
  document.getElementById('ckt-result-overlay').classList.remove('show');
  document.getElementById('ckt-ai-overlay').classList.remove('show');

  cktSetMod('single');
  cktBuildTable();
  cktUpdateDisplay();
  cktUpdateFieldBtns();
  document.getElementById('ckt-confirm-btn').style.display = 'none';

  window.speechSynthesis && window.speechSynthesis.cancel();
  setTimeout(() => cktSpeakTurn(), 400);
  showPage('cricket-game');
}

// ════════════════════════════════════════════
//  CRICKET — TABLE
// ════════════════════════════════════════════
function cktBuildTable() {
  const table = document.getElementById('ckt-table');
  table.innerHTML = '';
  const isMulti = cktState.playerMode !== 'solo';

  cktState.fields.forEach(field => {
    const row = document.createElement('div');
    row.className = 'cricket-row';
    row.id = 'ckt-row-' + field;

    const label = field === 25 ? 'Bull' : field;

    if (isMulti) {
      // Left: human marks + pts
      const leftDiv = document.createElement('div');
      leftDiv.className = 'cricket-marks';
      leftDiv.id = 'ckt-marks-human-' + field;
      leftDiv.innerHTML = cktMarksSVG(0, false);

      // Center: field label
      const centerDiv = document.createElement('div');
      centerDiv.className = 'cricket-field';
      centerDiv.textContent = label;

      // Right: opponent marks + pts
      const rightDiv = document.createElement('div');
      rightDiv.className = 'cricket-marks right';
      rightDiv.id = 'ckt-marks-opp-' + field;
      rightDiv.innerHTML = cktMarksSVG(0, false);

      row.appendChild(leftDiv);
      row.appendChild(centerDiv);
      row.appendChild(rightDiv);
    } else {
      // Solo: left = empty, center = field, right = marks
      const leftDiv = document.createElement('div');
      leftDiv.className = 'cricket-marks';

      const centerDiv = document.createElement('div');
      centerDiv.className = 'cricket-field';
      centerDiv.textContent = label;

      const rightDiv = document.createElement('div');
      rightDiv.className = 'cricket-marks right';
      rightDiv.id = 'ckt-marks-human-' + field;
      rightDiv.innerHTML = cktMarksSVG(0, false);

      row.appendChild(leftDiv);
      row.appendChild(centerDiv);
      row.appendChild(rightDiv);
    }

    table.appendChild(row);
  });
}

// Generate SVG mark for n hits (0=empty, 1=slash, 2=X, 3=circled X)
function cktMarksSVG(n, showPts) {
  const w = 52, h = 36;
  if (n === 0) return `<svg class="mark-svg" viewBox="0 0 ${w} ${h}"></svg>`;

  let inner = '';
  const stroke = 'var(--text)';
  const sw = 2.5;

  if (n >= 1) {
    // Diagonal slash (bottom-left to top-right)
    inner += `<line x1="14" y1="28" x2="28" y2="8" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
  }
  if (n >= 2) {
    // Second diagonal (top-left to bottom-right) to form X
    inner += `<line x1="14" y1="8" x2="28" y2="28" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
  }
  if (n >= 3) {
    // Circle around the X
    inner += `<circle cx="21" cy="18" r="13" stroke="${stroke}" stroke-width="${sw}" fill="none"/>`;
  }

  return `<svg class="mark-svg" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
}

function cktUpdateDisplay() {
  const s = cktState;
  const isMulti = s.playerMode !== 'solo';

  // Update scores
  document.getElementById('ckt-pts-p1').textContent = s.human.pts;
  if (isMulti) {
    document.getElementById('ckt-pts-p2').textContent = s.opponent.pts;
    // Active player highlight
    const h = s.current === 'human';
    const sbox1 = document.getElementById('ckt-sbox-p1');
    const sbox2 = document.getElementById('ckt-sbox-p2');
    sbox1.className = 'cricket-score-box' + (h ? ' active' : '');
    sbox2.className = 'cricket-score-box right' +
      (!h ? (cktConfig.playermode === 'cpu' ? ' active-ai' : ' active') : '');
    document.getElementById('ckt-sub-p1').textContent = h ? 'Am Zug' : 'Wartet';
    document.getElementById('ckt-sub-p2').textContent = !h ? 'Am Zug' : 'Wartet';
  }

  // Update table rows
  s.fields.forEach(field => {
    const row = document.getElementById('ckt-row-' + field);
    if (!row) return;
    const bothClosed = cktBothClosed(field);
    const anyClose   = cktClosed(s.human, field) || (isMulti && cktClosed(s.opponent, field));
    row.className = 'cricket-row' +
      (bothClosed ? ' closed' : anyClose ? ' closing' : '');

    // Update human marks
    const hEl = document.getElementById('ckt-marks-human-' + field);
    if (hEl) hEl.innerHTML = cktMarksSVG(s.human.marks[field], false);

    // Update opponent marks (multi only)
    const oEl = document.getElementById('ckt-marks-opp-' + field);
    if (oEl) oEl.innerHTML = cktMarksSVG(s.opponent.marks[field], false);
  });

  // Show confirm button when round is complete
  const confirmBtn = document.getElementById('ckt-confirm-btn');
  if (confirmBtn) {
    confirmBtn.style.display = s.dartInRound >= 3 ? 'block' : 'none';
  }
}

function cktUpdateFieldBtns() {
  const s = cktState;
  s.fields.forEach(field => {
    const btn = document.querySelector(`.cricket-field-btn[data-field="${field}"]`);
    if (!btn) return;
    const bothClosed = cktBothClosed(field);
    const humanClosed = cktClosed(s.human, field);
    btn.className = 'cricket-field-btn' +
      (bothClosed ? ' closed-both' : humanClosed ? ' has-pts' : '');
    btn.disabled = (s.dartInRound >= 3);
  });
}

// ════════════════════════════════════════════
//  CRICKET — INPUT
// ════════════════════════════════════════════
function cktSetMod(mod) {
  cktState.modifier = mod;
  ['single','double','triple','miss'].forEach(m => {
    const btn = document.getElementById('ckt-mod-' + m);
    if (btn) btn.classList.toggle('active', m === mod);
  });
}

function cktFieldPress(field) {
  haptic(8);
  const s = cktState;
  if (s.dartInRound >= 3) return;
  if (s.gameOver) return;

  const mod = s.modifier;
  const marks = cktMarksForMod(mod);

  // Miss dart
  if (field === 0 || mod === 'miss') {
    s.roundThrows.push({ field: 0, mod: 'miss', marksAdded: 0, ptsAdded: 0 });
    s.dartInRound++;
    s.totalDarts++;
    cktSetMod('single');
    cktUpdateDisplay();
    cktUpdateFieldBtns();
    if (s.dartInRound >= 3) cktEndRoundPrompt();
    return;
  }

  const player   = s.current === 'human' ? s.human : s.opponent;
  const opponent = s.current === 'human' ? s.opponent : s.human;

  // Check field is in game
  if (!s.fields.includes(field)) return;

  const { marksAdded, ptsAdded } = cktApplyHit(player, opponent, field, marks);

  s.roundThrows.push({ field, mod, marksAdded, ptsAdded });
  s.dartInRound++;
  s.totalDarts++;
  cktSetMod('single');
  cktUpdateDisplay();
  cktUpdateFieldBtns();

  if (s.dartInRound >= 3) cktEndRoundPrompt();
}

function cktEndRoundPrompt() {
  // Show confirm button — player taps to end round
  const btn = document.getElementById('ckt-confirm-btn');
  if (btn) btn.style.display = 'block';
}

function cktConfirmRound() {
  const s = cktState;
  if (s.dartInRound < 3 && s.dartInRound > 0) {
    // Allow confirming early (e.g. after hitting winning field)
  }
  // Save to history for undo
  s.history.push({
    human:       JSON.parse(JSON.stringify(s.human)),
    opponent:    JSON.parse(JSON.stringify(s.opponent)),
    dartInRound: s.dartInRound,
    roundThrows: [...s.roundThrows],
    totalDarts:  s.totalDarts,
    current:     s.current,
  });

  // Check win
  if (cktCheckWin()) return;

  // Announce round
  const scored = s.roundThrows.reduce((sum, t) => sum + t.ptsAdded, 0);
  const closed = s.roundThrows.filter(t => t.marksAdded > 0 && s.human.marks[t.field] === 3).length;
  let msg = '';
  if (scored > 0) msg = scored + ' Punkte, ';
  if (closed > 0) msg += closed + (closed === 1 ? ' Feld geschlossen, ' : ' Felder geschlossen, ');
  msg += 'Stand: ' + s.human.pts;
  if (msg) speak(msg, () => cktNextTurn());
  else cktNextTurn();
}

function cktNextTurn() {
  const s = cktState;
  s.dartInRound = 0;
  s.roundThrows = [];
  cktSetMod('single');
  document.getElementById('ckt-confirm-btn').style.display = 'none';
  cktUpdateFieldBtns();

  if (s.playerMode === 'cpu') {
    s.current = 'opponent';
    cktUpdateDisplay();
    setTimeout(() => cktRunAI(), 600);
  } else if (s.playerMode === 'pvp') {
    s.current = s.current === 'human' ? 'opponent' : 'human';
    cktUpdateDisplay();
    speak((s.current === 'human' ? s.human.name : s.opponent.name) + ' ist dran');
  } else {
    // Solo — just next round
    cktUpdateDisplay();
    setTimeout(() => cktSpeakTurn(), 300);
  }
}

// ════════════════════════════════════════════
//  CRICKET — UNDO
// ════════════════════════════════════════════
function cktUndo() {
  haptic(12);
  const s = cktState;

  if (s.dartInRound > 0) {
    // Undo within current round — revert last throw
    const last = s.roundThrows.pop();
    if (!last) return;
    const player   = s.current === 'human' ? s.human : s.opponent;
    const opponent = s.current === 'human' ? s.opponent : s.human;

    if (last.field !== 0) {
      // Revert marks
      player.marks[last.field] = Math.max(0, player.marks[last.field] - last.marksAdded);
      // Revert pts
      if (cktConfig.variant === 'standard') player.pts  -= last.ptsAdded;
      if (cktConfig.variant === 'cutthroat') opponent.pts -= last.ptsAdded;
    }
    s.dartInRound--;
    s.totalDarts--;
    cktSetMod('single');
    cktUpdateDisplay();
    cktUpdateFieldBtns();
    return;
  }

  // Undo last completed round
  if (s.history.length === 0) return;
  const snap = s.history.pop();
  s.human       = snap.human;
  s.opponent    = snap.opponent;
  s.dartInRound = 0;
  s.roundThrows = [];
  s.totalDarts  = snap.totalDarts;
  s.current     = snap.current;
  cktSetMod('single');
  cktUpdateDisplay();
  cktUpdateFieldBtns();
}

// ════════════════════════════════════════════
//  CRICKET — WIN CHECK
// ════════════════════════════════════════════
function cktCheckWin() {
  const s = cktState;

  function allClosed(player) {
    return s.fields.every(f => player.marks[f] >= 3);
  }

  function isWinning(player, opp) {
    if (!allClosed(player)) return false;
    if (cktConfig.variant === 'noscore') return true;
    if (cktConfig.variant === 'cutthroat') return player.pts <= opp.pts;
    return player.pts >= opp.pts; // standard: all closed AND more pts
  }

  if (s.playerMode === 'solo') {
    if (allClosed(s.human)) {
      cktShowResult(true, 'human');
      return true;
    }
    return false;
  }

  if (isWinning(s.human, s.opponent)) {
    cktShowResult(true, 'human'); return true;
  }
  if (isWinning(s.opponent, s.human)) {
    cktShowResult(false, 'opponent'); return true;
  }
  return false;
}

// ════════════════════════════════════════════
//  CRICKET — AI
// ════════════════════════════════════════════
function cktRunAI() {
  const s = cktState;
  const prob = CKT_AI_HIT_PROB[cktConfig.difficulty];
  const ai  = s.opponent;
  const hum = s.human;

  // AI strategy: pick target field
  function pickTarget() {
    // Hard: strategic — close fields where human scores, then own fields
    if (cktConfig.difficulty === 'hard') {
      // First priority: close fields human has closed but AI hasn't
      const threatenedField = s.fields.find(f =>
        cktClosed(hum, f) && !cktClosed(ai, f));
      if (threatenedField) return threatenedField;
      // Second: highest open field
    }
    // Medium/Easy/Default: highest unclosed field
    const open = s.fields.find(f => !cktClosed(ai, f));
    if (open) return open;
    // All closed — score on fields not yet closed by human
    const scoring = s.fields.find(f => cktClosed(ai, f) && !cktClosed(hum, f));
    return scoring || s.fields[0];
  }

  const overlay = document.getElementById('ckt-ai-overlay');
  overlay.classList.add('show');
  [1,2,3].forEach(i => {
    document.getElementById('ckt-ai-box-' + i).className = 'cricket-ai-box';
    document.getElementById('ckt-ai-val-' + i).textContent = '—';
  });

  let dartIdx = 0;

  function throwOne() {
    if (dartIdx >= 3) {
      // Done
      setTimeout(() => {
        overlay.classList.remove('show');
        s.current = 'human';
        s.dartInRound = 0;
        s.roundThrows = [];
        cktUpdateDisplay();
        cktUpdateFieldBtns();
        if (!cktCheckWin()) {
          speak(ai.name + ', ' + ai.pts + ' Punkte', () => cktSpeakTurn());
        }
      }, 700);
      return;
    }

    const target = pickTarget();
    const hit    = Math.random() < prob;
    const box    = document.getElementById('ckt-ai-box-' + (dartIdx + 1));
    const val    = document.getElementById('ckt-ai-val-' + (dartIdx + 1));
    const label  = target === 25 ? 'Bull' : String(target);

    if (hit) {
      // AI hits with single (simple) or tries triple on hard
      const mod = cktConfig.difficulty === 'hard' && Math.random() < 0.4 ? 'triple'
                : cktConfig.difficulty === 'medium' && Math.random() < 0.25 ? 'double'
                : 'single';
      const marks = cktMarksForMod(mod);
      const { ptsAdded } = cktApplyHit(ai, hum, target, marks);
      const modLabel = mod === 'triple' ? 'T' : mod === 'double' ? 'D' : '';
      box.classList.add(ptsAdded > 0 ? 'pts' : 'hit');
      val.textContent = modLabel + label;
      document.getElementById('ckt-ai-status').textContent =
        modLabel + label + (ptsAdded > 0 ? ' +' + ptsAdded : ' ✓');
    } else {
      box.classList.add('miss');
      val.textContent = 'Miss';
    }

    dartIdx++;
    cktUpdateDisplay();
    setTimeout(throwOne, 500);
  }

  document.getElementById('ckt-ai-status').textContent = ai.name + ' wirft…';
  setTimeout(throwOne, 400);
}

// ════════════════════════════════════════════
//  CRICKET — SPEECH OUTPUT
// ════════════════════════════════════════════
function cktSpeakTurn() {
  if (!settings.speech) return;
  const s = cktState;
  // Find next open field for current player
  const player = s.current === 'human' ? s.human : s.opponent;
  const nextOpen = s.fields.find(f => !cktClosed(player, f));
  if (!nextOpen) return;
  const label = nextOpen === 25 ? 'Bull' : nextOpen;
  speak('Ziel: ' + label + ', Stand: ' + s.human.pts);
}

// ════════════════════════════════════════════
//  CRICKET — SPEECH INPUT
// ════════════════════════════════════════════


let _cktSpeech = null;

function initCktSpeech() {
  if (_cktSpeech) return;
  _cktSpeech = createSpeechInput({
    transcriptId: 'ckt-speech-transcript',
    dotId:        'ckt-speech-dot',
    statusId:     'ckt-speech-status',
    micBtnId:     'ckt-mic-btn',
    onResult:     parseCktSpeech,
  });
}

function toggleCktMic() {
  if (!_cktSpeech) initCktSpeech();
  if (_cktSpeech) _cktSpeech.toggle();
}

// ════════════════════════════════════════════
//  CRICKET — RESULT
// ════════════════════════════════════════════
function cktShowResult(humanWon, winner) {
  const s = cktState;
  cktState.gameOver = true;
  const mpr = s.totalDarts > 0
    ? (s.fields.reduce((sum, f) => sum + Math.min(s.human.marks[f], 3), 0) * 3 / s.totalDarts).toFixed(2)
    : '0.00';
  const closedCount = s.fields.filter(f => s.human.marks[f] >= 3).length;

  document.getElementById('ckt-final-darts').textContent = s.totalDarts;
  document.getElementById('ckt-final-pts').textContent   = s.human.pts;
  document.getElementById('ckt-final-closed').textContent = closedCount + ' / ' + s.fields.length;
  document.getElementById('ckt-final-mpr').textContent   = mpr;

  const won = humanWon;
  const p2n = s.opponent.name;
  document.getElementById('ckt-result-icon').textContent  = won ? '🎯' : '💀';
  document.getElementById('ckt-result-title').textContent = won ? 'GEWONNEN!' : 'VERLOREN!';
  document.getElementById('ckt-result-title').className   = 'cricket-result-title ' + (won ? 'won' : 'lost');
  document.getElementById('ckt-result-sub').textContent   = won
    ? 'Alle Felder geschlossen'
    : p2n + ' war schneller';

  document.getElementById('ckt-result-overlay').classList.add('show');

  if (settings.speech) {
    speak(won
      ? 'Glückwunsch, gewonnen mit ' + s.human.pts + ' Punkten'
      : 'Verloren, ' + p2n + ' gewinnt');
  }
}

function cktResultClose() {
  document.getElementById('ckt-result-overlay').classList.remove('show');
  if (_cktSpeech) _cktSpeech.destroy();
  showPage('start');
}

function confirmCktQuit() {
  document.getElementById('quit-modal').classList.add('show');
}
