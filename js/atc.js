const atcConfig = {
  playermode: 'solo',
  difficulty: 'easy',
  hitrule: 'single',
  order: 'asc',
  bull: 'yes',
  input: 'complex',
};

// KI hit probabilities per difficulty
const ATC_AI_PROB = { easy: 0.35, medium: 0.55, hard: 0.75 };

let atcState = {
  sequence: [],      // fields in order e.g. [1,2,...,20,'Bull']
  current: 0,        // index into sequence (human)
  dartInRound: 0,    // 0-2
  dartsThisField: 0, // total darts thrown at current field
  dartsThisRound: [],// [{field, hit, mod, actual}] for complex mode
  history: [],       // [{field, dartsUsed, hits}]
  totalDarts: 0,
  totalHits: 0,
  hardestField: null,
  hardestDarts: 0,
  modifier: 'single',
  // Multiplayer
  playerMode: 'solo',
  opponentCurrent: 0,  // AI/P2 field index
  opponentDarts: 0,
  opponentFieldDarts: [],
  opponentDone: false,
};



function buildAtcSequence() {
  const seq = [];
  if (atcConfig.order === 'asc') {
    for (let i = 1; i <= 20; i++) seq.push(i);
  } else {
    for (let i = 20; i >= 1; i--) seq.push(i);
  }
  if (atcConfig.bull === 'yes') seq.push('Bull');
  return seq;
}

function atcSelectOpt(group, val, btn) {
  const grp = document.getElementById('atc-grp-' + group);
  grp.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  atcConfig[group] = val;
  if (group === 'playermode') {
    const diffGrp = document.getElementById('atc-grp-difficulty-group');
    diffGrp.classList.toggle('visible', val === 'cpu');
  }
}

// ════════════════════════════════════════════
//  ATC — START
// ════════════════════════════════════════════
function startAtc() {
  haptic(10);
  const seq = buildAtcSequence();
  // Read player names if set
  const p1Name = document.getElementById('input-p1-name') ? 
    (document.getElementById('input-p1-name').value.trim() || 'Spieler 1') : 'Spieler 1';
  const p2Name = document.getElementById('input-p2-name') ?
    (document.getElementById('input-p2-name').value.trim() || 'Spieler 2') : 'Spieler 2';
  atcConfig._p1Name = p1Name;
  atcConfig._p2Name = p2Name;

  atcState = {
    sequence: seq,
    current: 0,
    dartInRound: 0,
    dartsThisField: 0,
    dartsThisRound: [],
    history: [],
    totalDarts: 0,
    totalHits: 0,
    hardestField: null,
    hardestDarts: 0,
    modifier: 'single',
    playerMode: atcConfig.playermode,
    opponentCurrent: 0,
    opponentDarts: 0,
    opponentFieldDarts: [],
    opponentDone: false,
    // PvP swap state
    _playingAs: 'p1',
    _humanCurrent: 0,
    _humanDartsField: 0,
    _humanTotalDarts: 0,
    _humanTotalHits: 0,
    _humanHistory: [],
    _oppDartsThisField: 0,
  };

  // UI setup
  const isMulti = atcConfig.playermode !== 'solo';
  const isCpu   = atcConfig.playermode === 'cpu';
  const oppBox  = document.getElementById('atc-opponent-box');
  const aiBadge = document.getElementById('atc-ai-badge');
  oppBox.style.display  = isMulti ? 'flex' : 'none';
  aiBadge.style.display = isMulti ? 'flex' : 'none';

  if (isMulti) {
    const oppLabel = isCpu
      ? 'KI (' + {easy:'Leicht',medium:'Mittel',hard:'Schwer'}[atcConfig.difficulty] + ')'
      : 'Spieler 2';
    document.getElementById('atc-opp-label').textContent = oppLabel + ' bei Feld';
  }

  // Rule tag
  const ruleTag = (atcConfig.order === 'asc' ? '1 → 20' : '20 → 1') +
    (atcConfig.bull === 'yes' ? ' → Bull' : '') +
    (atcConfig.hitrule === 'single' ? ' · Nur Single' :
     atcConfig.hitrule === 'any'    ? ' · S+D+T' : ' · Skip D/T');
  document.getElementById('atc-rule-tag').textContent = ruleTag;

  // Input mode
  atcSetInputMode(atcConfig.input);

  // Mic reset
  if (_atcSpeech) _atcSpeech.destroy();
  document.getElementById('atc-result-overlay').classList.remove('show');

  atcBuildProgress();
  atcUpdateDisplay();
  atcUpdateStats();
  window.speechSynthesis && window.speechSynthesis.cancel();
  setTimeout(() => atcSpeakRound(), 400);
  showPage('atc-game');
}

function atcSetInputMode(mode) {
  atcConfig.input = mode;
  document.getElementById('atc-simple-row').style.display = mode === 'simple' ? 'grid' : 'none';
  document.getElementById('atc-keypad').style.display     = mode === 'complex' ? 'flex' : 'none';
  document.getElementById('atc-dart-row').style.display   = mode === 'complex' ? 'flex' : 'none';
  document.getElementById('atc-undo-bar').style.display   = mode === 'simple'  ? 'block' : 'none';
}

// ════════════════════════════════════════════
//  ATC — DISPLAY
// ════════════════════════════════════════════
function atcBuildProgress() {
  const grid = document.getElementById('atc-progress-grid');
  grid.innerHTML = '';
  const total = 21; // 7×3
  const seq = atcState.sequence;
  for (let i = 0; i < total; i++) {
    const pip = document.createElement('div');
    if (i < seq.length) {
      pip.id = 'atc-pip-' + i;
      pip.className = 'atc-pip' + (i === 0 ? ' current' : '');
      pip.textContent = seq[i] === 'Bull' ? 'DB' : seq[i];
    } else {
      pip.className = 'atc-pip empty';
    }
    grid.appendChild(pip);
  }
}

function atcUpdateProgress() {
  const s = atcState;
  s.sequence.forEach((_, i) => {
    const pip = document.getElementById('atc-pip-' + i);
    if (!pip) return;
    if (i < s.current)      pip.className = 'atc-pip done';
    else if (i === s.current) pip.className = 'atc-pip current';
    else                      pip.className = 'atc-pip';
  });
}

function atcUpdateStats() {
  const s = atcState;
  const d1 = document.getElementById('atc-stat-darts');
  const d2 = document.getElementById('atc-stat-field-darts');
  if (d1) d1.textContent = s.totalDarts;
  if (d2) d2.textContent = s.dartsThisField;
}

function atcUpdateDisplay() {
  const s = atcState;
  const seq = s.sequence;
  const field = seq[s.current];
  if (field === undefined) return;

  document.getElementById('atc-target-field').textContent = field === 'Bull' ? 'Bull' : field;
  const subText = atcConfig.hitrule === 'single' ? 'Nur Single'
    : atcConfig.hitrule === 'any' ? 'Single, Double oder Triple'
    : 'Double überspringt 1, Triple überspringt 2';
  document.getElementById('atc-target-sub').textContent = subText;
  document.getElementById('atc-progress-val').textContent =
    (s.current + 1) + ' / ' + seq.length;

  atcUpdateProgress();
  atcUpdateDartBoxes();

  // Opponent display
  if (s.playerMode !== 'solo') {
    const oppField = seq[s.opponentCurrent];
    const oppEl = document.getElementById('atc-opp-field');
    oppEl.textContent = oppField === 'Bull' ? 'Bull' : (oppField ?? '✓');

    // Color: ahead = red, same = white, behind = green
    const diff = s.opponentCurrent - s.current;
    oppEl.style.color = diff > 0 ? 'var(--danger)' : diff < 0 ? 'var(--success)' : 'var(--text)';

    const badge = document.getElementById('atc-ai-badge');
    badge.textContent = (atcConfig.playermode === 'cpu' ? 'KI' : 'P2') +
      ': Feld ' + (s.opponentDone ? '✓' : (oppField === 'Bull' ? 'Bull' : oppField));
    badge.className = 'atc-ai-badge ' + (diff > 0 ? 'ahead' : diff < 0 ? 'behind' : 'same');
  }
}

function atcUpdateDartBoxes() {
  const s = atcState;
  [1,2,3].forEach(i => {
    const box = document.getElementById('atc-dbox-' + i);
    const val = document.getElementById('atc-dval-' + i);
    if (!box || !val) return;
    const t = s.dartsThisRound[i - 1];
    if (!t) {
      box.className = 'atc-dart-box' + (i === s.dartInRound + 1 ? ' active' : '');
      val.textContent = '—';
    } else {
      box.className = 'atc-dart-box ' + (t.hit ? 'hit' : 'miss');
      val.textContent = t.hit
        ? (t.mod !== 'single' ? t.mod[0].toUpperCase() : '') + t.actual
        : (t.actual === 0 ? 'MISS' : t.actual);
    }
  });
  if (s.dartInRound === 0) {
    const b = document.getElementById('atc-dbox-1');
    if (b) b.classList.add('active');
  }
}

// ════════════════════════════════════════════
//  ATC — INPUT (Simple)
// ════════════════════════════════════════════
function atcSimpleInput(hit) {
  haptic(8);
  const s = atcState;
  s.totalDarts++;
  s.dartInRound++;
  s.dartsThisField++;
  atcUpdateStats();

  if (hit) {
    s.totalHits++;
    atcAdvanceField();  // advances field but keeps dartInRound
  } else {
    atcCheckEndRound();
  }
}

// ════════════════════════════════════════════
//  ATC — INPUT (Complex)
// ════════════════════════════════════════════
function atcSetModifier(mod) {
  atcState.modifier = mod;
  ['single','double','triple'].forEach(m => {
    document.getElementById('atc-mod-' + m).classList.toggle('active', m === mod);
  });
  // Disable bull for triple
  const bull = document.getElementById('atc-btn-bull');
  if (bull) {
    bull.disabled = mod === 'triple';
    bull.style.opacity = mod === 'triple' ? '0.35' : '';
  }
}

function atcNumPress(n) {
  haptic(8);
  const s = atcState;
  if (s.dartInRound >= 3) return;
  const target = s.sequence[s.current];
  const mod = s.modifier;

  // Determine if this is a hit
  let hit = false;
  let skip = 0;
  if (atcConfig.hitrule === 'single') {
    hit = (mod === 'single' && n === target);
  } else if (atcConfig.hitrule === 'any') {
    hit = (n === target);
  } else { // skip
    if (n === target) {
      hit = true;
      if (mod === 'double') skip = 1;
      if (mod === 'triple') skip = 2;
    }
  }

  s.dartsThisRound.push({ field: target, hit, mod, actual: n });
  s.dartInRound++;
  s.totalDarts++;
  s.dartsThisField++;
  if (hit) s.totalHits++;

  atcUpdateDartBoxes();
  atcSetModifier('single');
  atcUpdateStats();

  if (hit) {
    setTimeout(() => atcAdvanceField(skip), 200);
  } else {
    atcCheckEndRound();
  }
}

function atcThrowMiss() {
  haptic(8);
  const s = atcState;
  if (s.dartInRound >= 3) return;
  s.dartsThisRound.push({ field: s.sequence[s.current], hit: false, mod: 'miss', actual: 0 });
  s.dartInRound++;
  s.totalDarts++;
  s.dartsThisField++;
  atcUpdateDartBoxes();
  atcSetModifier('single');
  atcUpdateStats();
  atcCheckEndRound();
}

function atcThrowBull() {
  haptic(8);
  const s = atcState;
  if (s.dartInRound >= 3) return;
  if (s.modifier === 'triple') return;
  const target = s.sequence[s.current];
  const hit = (target === 'Bull');
  s.dartsThisRound.push({ field: target, hit, mod: s.modifier, actual: 'Bull' });
  s.dartInRound++;
  s.totalDarts++;
  s.dartsThisField++;
  if (hit) s.totalHits++;
  atcUpdateDartBoxes();
  atcSetModifier('single');
  if (hit) setTimeout(() => atcAdvanceField(), 200);
  else atcCheckEndRound();
}

function atcCheckEndRound() {
  const s = atcState;
  if (s.dartInRound >= 3) {
    atcEndRound();
  }
}

function atcEndRound() {
  const s = atcState;
  s.dartsThisRound = [];
  s.dartInRound = 0;
  atcUpdateDartBoxes();

  if (s.playerMode === 'cpu') {
    setTimeout(() => atcRunCpu(), 600);
  } else if (s.playerMode === 'pvp') {
    atcSwitchPvP();
  }
}

// ════════════════════════════════════════════
//  ATC — ADVANCE FIELD
// ════════════════════════════════════════════
function atcAdvanceField(extraSkip = 0) {
  const s = atcState;
  const field = s.sequence[s.current];

  // Record stats for completed field
  if (s.dartsThisField > s.hardestDarts) {
    s.hardestDarts = s.dartsThisField;
    s.hardestField = field;
  }
  s.history.push({ field, dartsUsed: s.dartsThisField, hits: 1 });
  s.dartsThisField = 0;
  // Do NOT reset dartInRound — remaining darts in this round continue on the next field

  // Advance (+ skip for Double/Triple rule)
  s.current = Math.min(s.current + 1 + extraSkip, s.sequence.length);
  atcUpdateDisplay();
  atcUpdateStats();

  // Speak next field
  const nextField = s.sequence[s.current];
  if (nextField !== undefined) {
    const spokenNext = nextField === 'Bull' ? 'Bull' : nextField;
    speak('Treffer, weiter zu ' + spokenNext);
  }

  // Check win
  if (s.current >= s.sequence.length) {
    setTimeout(() => atcCheckWin(), 400);
    return;
  }

  // After a hit, if round still has darts left, player continues
  // If all 3 darts used up, end the round
  if (s.dartInRound >= 3) {
    s.dartInRound = 0;
    s.dartsThisRound = [];
    atcUpdateDartBoxes();
    if (s.playerMode === 'cpu') {
      setTimeout(() => atcRunCpu(), 800);
    } else if (s.playerMode === 'pvp') {
      atcSwitchPvP();
    }
  }
  // else: player still has darts — just update display, wait for next input
}

// ════════════════════════════════════════════
//  ATC — UNDO
// ════════════════════════════════════════════
function atcUndo() {
  haptic(12);
  const s = atcState;
  if (atcConfig.input === 'complex' && s.dartInRound > 0) {
    const last = s.dartsThisRound.pop();
    s.dartInRound--;
    s.totalDarts--;
    s.dartsThisField--;
    if (last && last.hit) s.totalHits--;
    atcUpdateDartBoxes();
    atcSetModifier('single');
    return;
  }
  // Undo last field
  if (s.history.length === 0 || s.dartInRound > 0) return;
  const last = s.history.pop();
  s.totalDarts -= last.dartsUsed;
  s.totalHits -= last.hits;
  s.current--;
  s.dartsThisField = 0;
  s.dartsThisRound = [];
  s.dartInRound = 0;
  if (s.hardestField === last.field) { s.hardestField = null; s.hardestDarts = 0; }
  atcUpdateDisplay();
}

// ════════════════════════════════════════════
//  ATC — CPU AI
// ════════════════════════════════════════════
function atcRunCpu() {
  const s = atcState;
  if (s.opponentDone) return;
  const prob = ATC_AI_PROB[atcConfig.difficulty];
  let dartsUsed = 0;

  function throwOne() {
    if (s.opponentCurrent >= s.sequence.length || dartsUsed >= 3) {
      // Round done for CPU
      atcUpdateDisplay();
      if (s.opponentDone) {
        // CPU finished — did human finish too?
        if (s.current >= s.sequence.length) {
          atcCheckWin(); // tie — human goes first so human wins
        } else {
          setTimeout(() => atcShowResult(false, 'cpu'), 400);
        }
      }
      return;
    }
    dartsUsed++;
    s.opponentDarts++;
    s.opponentFieldDarts[s.opponentCurrent] = (s.opponentFieldDarts[s.opponentCurrent] || 0) + 1;

    const hit = Math.random() < prob;
    if (hit) {
      s.opponentCurrent++;
      if (s.opponentCurrent >= s.sequence.length) {
        s.opponentDone = true;
      }
      atcUpdateDisplay();
      if (s.opponentDone) {
        // CPU done — if human not done, CPU wins
        if (s.current < s.sequence.length) {
          setTimeout(() => atcShowResult(false, 'cpu'), 400);
          return;
        }
      }
    }
    setTimeout(throwOne, 350);
  }
  throwOne();
}

// ════════════════════════════════════════════
//  ATC — PVP SWITCH
// ════════════════════════════════════════════
function atcSwitchPvP() {
  const s = atcState;
  // Swap: human ↔ opponent
  // Store human's progress, restore opponent's
  const humanCurrent      = s.current;
  const humanDartsField   = s.dartsThisField;
  const humanTotalDarts   = s.totalDarts;
  const humanTotalHits    = s.totalHits;
  const humanHistory      = s.history;

  s.current           = s.opponentCurrent;
  s.dartsThisField    = s._oppDartsThisField || 0;
  s.dartInRound       = 0;
  s.dartsThisRound    = [];

  // Save human state
  s._humanCurrent         = humanCurrent;
  s._humanDartsField      = humanDartsField;
  s._humanTotalDarts      = humanTotalDarts;
  s._humanTotalHits       = humanTotalHits;
  s._humanHistory         = humanHistory;
  s._playingAs            = s._playingAs === 'p2' ? 'p1' : 'p2';

  // Update opponent tracking to current swap
  s.opponentCurrent   = humanCurrent;
  s._oppDartsThisField = humanDartsField;

  // Update header
  const isP2 = s._playingAs === 'p2';
  const p1Name = atcConfig._p1Name || 'Spieler 1';
  const p2Name = atcConfig._p2Name || 'Spieler 2';
  document.getElementById('atc-rule-tag').textContent =
    (isP2 ? p2Name : p1Name) + ' ist dran';

  // Update display
  atcUpdateDisplay();
  atcUpdateStats();
  speak((isP2 ? p2Name : p1Name) + ' ist dran, Ziel: ' +
    (s.sequence[s.current] === 'Bull' ? 'Bull' : s.sequence[s.current]));
}

// ════════════════════════════════════════════
//  ATC — WIN CHECK
// ════════════════════════════════════════════
function atcCheckWin() {
  const s = atcState;
  if (s.current >= s.sequence.length) {
    atcShowResult(true, 'human');
  }
}

function atcShowResult(humanWon, winner) {
  const s = atcState;
  const totalFields = s.sequence.length;
  const avg = totalFields > 0 ? (s.totalDarts / totalFields).toFixed(1) : '—';
  const hitRate = s.totalDarts > 0 ? Math.round((s.totalHits / s.totalDarts) * 100) + '%' : '—';
  const hardest = s.hardestField !== null
    ? (s.hardestField === 'Bull' ? 'Bull' : 'Feld ' + s.hardestField) + ' (' + s.hardestDarts + ' Darts)'
    : '—';

  document.getElementById('atc-final-darts').textContent   = s.totalDarts;
  document.getElementById('atc-final-avg').textContent     = avg;
  document.getElementById('atc-final-hardest').textContent = hardest;
  document.getElementById('atc-final-hitrate').textContent = hitRate;

  const won = humanWon;
  document.getElementById('atc-result-icon').textContent  = won ? '⚡' : '💀';
  document.getElementById('atc-result-title').textContent = won ? 'GEWONNEN!' : 'VERLOREN!';
  document.getElementById('atc-result-title').className   = 'atc-result-title ' + (won ? 'won' : 'lost');
  document.getElementById('atc-result-sub').textContent   = won
    ? 'Alle ' + totalFields + ' Felder getroffen'
    : (atcConfig.playermode === 'cpu' ? 'KI war schneller' : 'Spieler 2 war schneller');

  document.getElementById('atc-result-overlay').classList.add('show');

  if (settings.speech) {
    speak(won
      ? 'Glückwunsch, alle Felder getroffen, ' + s.totalDarts + ' Darts insgesamt'
      : 'Verloren, ' + (atcConfig.playermode === 'cpu' ? 'die KI war schneller' : 'Spieler zwei war schneller'));
  }
}

function atcResultClose() {
  document.getElementById('atc-result-overlay').classList.remove('show');
  if (_atcSpeech) _atcSpeech.destroy();
  showPage('start');
}

function confirmAtcQuit() {
  document.getElementById('quit-modal').classList.add('show');
}

// ════════════════════════════════════════════
//  ATC — SPEECH OUTPUT
// ════════════════════════════════════════════
function atcSpeakRound() {
  if (!settings.speech) return;
  const s = atcState;
  const field = s.sequence[s.current];
  if (field === undefined) return;
  const spoken = field === 'Bull' ? 'Bull' : 'Feld ' + field;
  speak('Ziel: ' + spoken);
}

// ════════════════════════════════════════════
//  ATC — SPEECH INPUT
// ════════════════════════════════════════════


let _atcSpeech = null;

function initAtcSpeech() {
  if (_atcSpeech) return;
  _atcSpeech = createSpeechInput({
    transcriptId: 'atc-speech-transcript',
    dotId:        'atc-speech-dot',
    statusId:     'atc-speech-status',
    micBtnId:     'atc-mic-btn',
    onResult:     parseAtcSpeech,
  });
}

function toggleAtcMic() {
  if (!_atcSpeech) initAtcSpeech();
  if (_atcSpeech) _atcSpeech.toggle();
}


// ════════════════════════════════════════════
