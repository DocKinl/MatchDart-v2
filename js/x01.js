// ════════════════════════════════════════════
//  INPUT MODE
// ════════════════════════════════════════════
function setInputMode(mode) {
  gameState.inputMode = mode;
  gameConfig.inputMode = mode;
  // Toggle keypads
  const dartKp = document.getElementById('dart-keypad');
  const sumKp  = document.getElementById('sum-keypad');
  if (dartKp) dartKp.style.display = mode === 'dart' ? 'flex' : 'none';
  if (sumKp)  sumKp.classList.toggle('active', mode === 'sum');
  // Toggle dart-col display
  const colDart = document.getElementById('dartcol-dart');
  const colSum  = document.getElementById('dartcol-sum');
  if (colDart) colDart.style.display = mode === 'dart' ? 'block' : 'none';
  if (colSum)  colSum.style.display  = mode === 'sum'  ? 'block' : 'none';
  if (mode === 'sum') {
    sumClear();
    updateSumWurfBox(null);
  }
}

// ════════════════════════════════════════════
//  SUM KEYPAD LOGIC
// ════════════════════════════════════════════
function sumDigit(d) {
  haptic(8);
  const gs = gameState;
  if (gs.sumInputStr.length >= 3) return;
  gs.sumInputStr += d.toString();
  sumUpdateDisplay();
}

function sumDel() {
  haptic(8);
  gameState.sumInputStr = gameState.sumInputStr.slice(0, -1);
  sumUpdateDisplay();
}

function sumClear() {
  gameState.sumInputStr = '';
  sumUpdateDisplay();
}

function updateSumWurfBox(scored) {
  const box = document.getElementById('dbox-sum');
  const val = document.getElementById('dbox-sum-val');
  if (!box || !val) return;
  if (scored === null) {
    box.className = 'dart-box';
    val.textContent = '—';
  } else {
    box.className = 'dart-box filled';
    val.textContent = scored;
  }
}

function sumQuick(val) {
  haptic(8);
  gameState.sumInputStr = val.toString();
  sumUpdateDisplay();
}

function sumUpdateDisplay() {
  const gs = gameState;
  const el = document.getElementById('sum-display-val');
  const hint = document.getElementById('sum-display-hint');
  const label = document.getElementById('sum-mode-label');
  label.textContent = 'PUNKTE EINGEBEN';
  if (!gs.sumInputStr) {
    el.className = 'sum-display-val empty';
    el.textContent = '—';
    hint.textContent = '3 Darts / max. 180';
    hint.innerHTML = '3 Darts<br>max. 180';
    return;
  }
  const n = parseInt(gs.sumInputStr);
  const valid = isValidScore(n) && n <= gs.remaining;
  el.className = 'sum-display-val' + (valid ? '' : ' invalid');
  el.textContent = n;
  if (!isValidScore(n)) {
    hint.innerHTML = '<span style="color:var(--danger)">Ungültig!</span>';
  } else if (n > gs.remaining) {
    hint.innerHTML = '<span style="color:var(--danger)">Zu hoch!</span>';
  } else {
    const newRem = gs.remaining - n;
    hint.innerHTML = 'Rest: <strong style="color:var(--accent)">' + newRem + '</strong>';
  }
}

// "Punkte" button — scored n, rest = current - n
function sumCommitScore() {
  haptic(10);
  const gs = gameState;
  if (!gs.sumInputStr) return;
  const n = parseInt(gs.sumInputStr);
  if (!isValidScore(n)) { sumShakeDisplay(); return; }
  if (n > gs.remaining) { sumShakeDisplay(); return; }
  const newRem = gs.remaining - n;
  sumProcessRound(n, newRem);
}

// "Rest" button — player gave rest value, scored = current - rest
function sumCommitRest() {
  haptic(10);
  const gs = gameState;
  if (!gs.sumInputStr) return;
  const n = parseInt(gs.sumInputStr);
  if (n < 0 || n >= gs.remaining) { sumShakeDisplay(); return; }
  const scored = gs.remaining - n;
  if (!isValidScore(scored)) { sumShakeDisplay(); return; }
  sumProcessRound(scored, n);
}

function sumShakeDisplay() {
  const el = document.getElementById('sum-display-val');
  el.style.animation = 'bust-shake 0.4s ease';
  setTimeout(() => el.style.animation = '', 450);
}

function sumProcessRound(scored, newRemaining) {
  const gs = gameState;

  // Check bust conditions
  let busted = false;
  if (newRemaining < 0 || newRemaining === 1) busted = true;
  if (newRemaining === 0 && gameConfig.outRule === 'double') {
    // In sum mode we need to ask about checkout dart anyway — treat as potentially valid
    // Can't validate double-out without knowing which dart — we ask
  }

  if (busted) {
    sumClear();
    showBust();
    // Ask which dart busted
    setTimeout(() => showBustDartModal(scored), 850);
    return;
  }

  if (newRemaining === 0) {
    // Win — ask checkout dart
    gs.sumPendingScore = { scored, newRemaining };
    sumClear();
    showCheckoutModal();
    return;
  }

  // Normal round
  sumClear();
  if (micActive) {
    showConfirmModal({
      mode: 'sum',
      throws: [],
      actualScore: scored,
      newRemaining,
      remainingBefore: gs.remaining,
      won: false,
      busted: false,
    });
    return;
  }
  gs.remaining = newRemaining;
  gs.totalDarts += 3;
  gs.throwsThisRound = [{ scored, field: scored, mod: 'sum', busted: false }];
  updateScoreDisplay(true);
  updateStats();
  endRoundSum(false, scored, 3);
}

function showCheckoutModal() {
  document.getElementById('checkout-modal').classList.add('show');
}

function showBustDartModal(scored) {
  gameState._bustScoredBeforeModal = scored;
  document.getElementById('bust-dart-modal').classList.add('show');
}

function confirmCheckoutDart(dartNum) {
  document.getElementById('checkout-modal').classList.remove('show');
  const gs = gameState;
  const { scored, newRemaining } = gs.sumPendingScore;
  gs.remaining = newRemaining;
  gs.totalDarts += dartNum;
  gs.throwsThisRound = [{ scored, field: scored, mod: 'sum', busted: false }];
  gs.sumPendingScore = null;
  updateScoreDisplay(true);
  endRoundSum(false, scored, dartNum, true);
}

function confirmBustDart(dartNum) {
  document.getElementById('bust-dart-modal').classList.remove('show');
  const gs = gameState;
  gs.totalDarts += dartNum;
  // Restore remaining (bust = no score)
  gs.throwsThisRound = [{ scored: 0, field: 0, mod: 'sum', busted: true }];
  gs.sumPendingScore = null;
  delete gs._bustScoredBeforeModal;
  updateScoreDisplay();
  endRoundSum(true, 0, dartNum);
}

function endRoundSum(busted, actualScore, dartCount, won = false, skipSpeak = false) {
  const gs = gameState;

  if (actualScore > gs.highestRound && !busted) gs.highestRound = actualScore;

  gs.history.push({
    round: gs.round,
    throws: [actualScore],
    total: busted ? 0 : actualScore,
    remainAfter: gs.remaining,
    dartCount,
  });

  addHistoryEntry(gs.round, busted ? 0 : actualScore, busted);

  if (won) {
    const winner = (gameConfig.playerMode !== 'solo' && gs.currentTurn === 'opponent') ? 'opponent' : 'human';
    announceWin(winner);
    setTimeout(() => showWin(winner), 800);
    return;
  }

  // All turn-switching happens AFTER speech is fully done
  function afterSpeak() {
    if (gameConfig.playerMode !== 'solo') {
      if (gs.currentTurn === 'human') {
        gs.humanRemaining = gs.remaining;
        updateDualScores();
        gs.currentTurn = 'opponent';
        gs.round++;
        gs.dartInRound = 0;
        gs.throwsThisRound = [];
        updateRoundScores();
        updateDarts();
        updateStats();
        switchToOpponent();
      } else {
        gs.opponentRemaining = gs.remaining;
        updateDualScores();
        gs.currentTurn = 'human';
        gs.remaining = gs.humanRemaining;
        gs.round++;
        gs.dartInRound = 0;
        gs.throwsThisRound = [];
        updateScoreDisplay();
        updateRoundScores();
        updateDarts();
        updateStats();
        updateTurnIndicator();
      }
    } else {
      gs.round++;
      gs.dartInRound = 0;
      gs.throwsThisRound = [];
      updateRoundScores();
      updateDarts();
      updateStats();
    }
  }

  if (skipSpeak) {
    // Speech already handled by confirmation modal — just advance
    afterSpeak();
  } else if (settings.speech && !busted) {
    speakRound(actualScore, gs.remaining, afterSpeak);
  } else if (settings.speech && busted) {
    speak('Bust!', afterSpeak);
  } else {
    afterSpeak();
  }
}

// ════════════════════════════════════════════
//  SPEECH INPUT ENGINE
// ════════════════════════════════════════════
let speechRecognition = null;
let micActive = false;

function initSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    document.getElementById('speech-unsupported').style.display = 'block';
    document.getElementById('mic-btn').style.display = 'none';
    return;
  }
  speechRecognition = new SpeechRecognition();
  speechRecognition.lang = 'de-DE';
  speechRecognition.continuous = false;
  speechRecognition.interimResults = true;
  speechRecognition.maxAlternatives = 1;

  speechRecognition.onstart = () => {
    const dot = document.getElementById('speech-dot');
    if (dot) { dot.classList.remove('idle'); }
    document.getElementById('speech-transcript').textContent = 'Höre zu…';
    resetSpeechSession();
  };

  speechRecognition.onresult = (e) => {
    let interim = '';
    let final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t;
      else interim += t;
    }
    const text = (final || interim).trim();
    document.getElementById('speech-transcript').textContent = text;
    if (final) {
      cancelPauseTimer();
      speechProcess(final.trim().toLowerCase(), processSpeechInput);
    } else if (interim) {
      scheduleFromInterim(interim.trim().toLowerCase(), processSpeechInput);
    }
  };

  speechRecognition.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') {
      if (micActive && !gameState.micMuted) restartSpeech();
      return;
    }
    document.getElementById('speech-transcript').textContent = 'Fehler: ' + e.error;
  };

  speechRecognition.onend = () => {
    if (micActive && !gameState.micMuted) {
      setTimeout(() => restartSpeech(), 150);
    } else {
      const dot = document.getElementById('speech-dot');
      if (dot) dot.classList.add('idle');
    }
  };
}

function restartSpeech() {
  try { speechRecognition.start(); } catch(e) {}
}

function toggleMic() {
  if (!speechRecognition) { initSpeech(); }
  if (!speechRecognition) return;
  micActive = !micActive;
  gameState.micMuted = !micActive;
  const btn = document.getElementById('mic-btn');
  const status = document.getElementById('speech-status');
  if (micActive) {
    btn.classList.remove('muted');
    btn.classList.add('listening');
    status.classList.add('active');
    restartSpeech();
  } else {
    btn.classList.remove('listening');
    btn.classList.add('muted');
    status.classList.remove('active');
    try { speechRecognition.abort(); } catch(e) {}
    document.getElementById('speech-dot').classList.add('idle');
  }
}

// ── SPEECH PARSER ──
function processSpeechInput(text) {
  // If confirmation modal is open, route there first
  const modal = document.getElementById('confirm-modal');
  if (modal && modal.classList.contains('show')) {
    handleConfirmSpeech(text);
    return;
  }
  if (gameState.inputMode === 'sum') {
    parseSumSpeech(text);
  } else {
    parseDartSpeech(text);
  }
}

// Normalise spoken German numbers to int
function parseSpokenNumber(s) {
  const map = {
    'null':0,'eins':1,'ein':1,'zwei':2,'drei':3,'vier':4,'fünf':5,
    'sechs':6,'sieben':7,'acht':8,'neun':9,'zehn':10,'elf':11,
    'zwölf':12,'dreizehn':13,'vierzehn':14,'fünfzehn':15,'sechzehn':16,
    'siebzehn':17,'achtzehn':18,'neunzehn':19,'zwanzig':20,
    'einundzwanzig':21,'zweiundzwanzig':22,'dreiundzwanzig':23,
    'vierundzwanzig':24,'fünfundzwanzig':25,'sechsundzwanzig':26,
    'siebenundzwanzig':27,'achtundzwanzig':28,'neunundzwanzig':29,
    'dreißig':30,'vierzig':40,'fünfzig':50,'sechzig':60,'siebzig':70,
    'achtzig':80,'neunzig':90,'hundert':100,'hundertachtzig':180,
  };
  s = s.trim().replace(/\s+/g,'');
  if (map[s] !== undefined) return map[s];
  const n = parseInt(s);
  return isNaN(n) ? null : n;
}

// Extract a dart throw from a token: "t20", "triple20", "dreifach20", "d16", "double16", "doppel16", "s5", "single5", "5", "bull", "miss", "daneben"
function parseDartToken(token) {
  token = token.replace(/\s+/g,'').toLowerCase();

  if (token === 'bull' || token === 'bullseye') return { scored: 50, field: 'Bull', mod: 'double' };
  if (token === 'bull25' || token === 'singlebull') return { scored: 25, field: 'Bull', mod: 'single' };
  if (token === 'miss' || token === 'daneben' || token === 'vorbei') return { scored: 0, field: 0, mod: 'miss' };

  // Triple
  let m = token.match(/^(?:t|triple|tripel|dreifach|3x|3×)(\d{1,2})$/);
  if (m) { const n = parseInt(m[1]); if (n >= 1 && n <= 20) return { scored: n*3, field: n, mod: 'triple' }; }

  // Double
  m = token.match(/^(?:d|double|doppel|2x|2×)(\d{1,2})$/);
  if (m) { const n = parseInt(m[1]); if (n >= 1 && n <= 20) return { scored: n*2, field: n, mod: 'double' }; }
  // Double bull
  if (token === 'doublebull' || token === 'doppelbull' || token === 'dbull') return { scored: 50, field: 'Bull', mod: 'double' };

  // Single (explicit or bare number)
  m = token.match(/^(?:s|single|einfach|1x|1×)?(\d{1,2})$/);
  if (m) { const n = parseInt(m[1]); if (n >= 1 && n <= 20) return { scored: n, field: n, mod: 'single' }; }

  return null;
}

function parseDartSpeech(text) {
  text = text.replace(/[,;]/g,' ').replace(/\bund\b/g,' ').toLowerCase().trim();

  // Always try multi-word first — handles 'triple 20', 'dreifach zwanzig' etc.
  let darts = parseMultiWordDarts(text);

  // Fallback: token-by-token for compact forms like 't20 d16 5'
  if (darts.length === 0) {
    const tokens = text.trim().split(/\s+/);
    for (const tok of tokens) {
      const d = parseDartToken(tok);
      if (d) darts.push(d);
      if (darts.length === 3) break;
    }
  }

  if (darts.length === 0) {
    document.getElementById('speech-transcript').textContent = '❓ Nicht erkannt: ' + text;
    return;
  }

  darts = darts.slice(0, 3);

  // Apply darts one by one
  for (const d of darts) {
    if (gameState.dartInRound >= 3) break;
    processThrow(d.scored, d.field, d.mod);
    // Speak single-dart feedback (3-dart confirmation modal handles full round)
    if (settings.speech && darts.length < 3) {
      const lbl = d.mod === 'triple' ? 'Dreifach ' + d.field
                : d.mod === 'double' ? 'Doppel ' + d.field
                : d.scored === 0 ? 'daneben'
                : d.field === 'Bull' ? 'Bull'
                : String(d.field);
      speak(lbl + ', Rest ' + gameState.remaining);
    }
  }
}

function parseMultiWordDarts(text) {
  const darts = [];
  // Patterns: (triple|dreifach|double|doppel|single|einfach)? <number>
  const re = /(?:(triple|tripel|dreifach|3x|double|doppel|2x|single|einfach|1x|s|d|t)\s+)?(\d{1,2}|zwanzig|neunzehn|achtzehn|siebzehn|sechzehn|fünfzehn|vierzehn|dreizehn|zwölf|elf|zehn|neun|acht|sieben|sechs|fünf|vier|drei|zwei|eins|null|bull|miss|daneben)/gi;
  let m;
  while ((m = re.exec(text)) !== null && darts.length < 3) {
    const modStr = (m[1] || '').toLowerCase();
    const numStr = m[2].toLowerCase();
    if (numStr === 'bull') { darts.push({ scored: 50, field: 'Bull', mod: 'double' }); continue; }
    if (numStr === 'miss' || numStr === 'daneben') { darts.push({ scored: 0, field: 0, mod: 'miss' }); continue; }
    const n = parseSpokenNumber(numStr);
    if (n === null || n < 1 || n > 20) continue;
    let mod = 'single';
    if (/triple|tripel|dreifach|3x/.test(modStr)) mod = 'triple';
    else if (/double|doppel|2x/.test(modStr)) mod = 'double';
    const multiplier = mod === 'triple' ? 3 : mod === 'double' ? 2 : 1;
    darts.push({ scored: n * multiplier, field: n, mod });
  }
  return darts;
}

function parseSumSpeech(text) {
  // Cancel any ongoing speech output before processing input
  window.speechSynthesis && window.speechSynthesis.cancel();

  text = text.replace(/[,;]/g,' ').trim();
  const isRest = /rest|übrig/i.test(text);

  // Check for "rest" keyword with number
  const restMatch = text.match(/(?:rest\s+(\d+)|(\d+)\s+rest|(\d+)\s+übrig|übrig\s+(\d+))/i);
  if (restMatch) {
    const val = parseInt(restMatch[1] || restMatch[2] || restMatch[3] || restMatch[4]);
    if (!isNaN(val)) {
      gameState.sumInputStr = val.toString();
      sumUpdateDisplay();
      sumCommitRest();
      return;
    }
  }

  // Plain number or "X Punkte"
  const scoreMatch = text.match(/(\d+)(?:\s*punkte?)?/i);
  if (scoreMatch) {
    const val = parseInt(scoreMatch[1]);
    if (!isNaN(val)) {
      gameState.sumInputStr = val.toString();
      sumUpdateDisplay();
      if (isRest) sumCommitRest();
      else sumCommitScore();
      return;
    }
  }

  // Spoken German number
  const cleanText = text.replace(/\s*punkte?\s*/i,'').replace(/\s*rest\s*/i,'').trim();
  const tokens = cleanText.split(/\s+/);
  for (const tok of tokens) {
    const n = parseSpokenNumber(tok);
    if (n !== null) {
      gameState.sumInputStr = n.toString();
      sumUpdateDisplay();
      if (isRest) sumCommitRest();
      else sumCommitScore();
      return;
    }
  }

  document.getElementById('speech-transcript').textContent = '❓ Nicht erkannt: ' + text;
}

// ════════════════════════════════════════════
//  DART CONFIRMATION LOGIC
// ════════════════════════════════════════════

// Pending confirmation state
let pendingConfirm = null;
// { mode: 'dart'|'sum', throws: [...], actualScore, newRemaining, won, busted, dartCount }

let fixSumStr = '';

function showConfirmModal(data) {
  pendingConfirm = data;
  const modal = document.getElementById('confirm-modal');
  const isSum = data.mode === 'sum';

  // Show/hide sections
  document.getElementById('confirm-throws-row').style.display = isSum ? 'none' : 'grid';
  document.getElementById('confirm-sum-row').style.display = isSum ? 'flex' : 'none';
  document.getElementById('confirm-main-btns').style.display = 'grid';
  document.getElementById('confirm-fix-dart').style.display = 'none';
  document.getElementById('confirm-fix-sum').style.display = 'none';

  if (!isSum) {
    // Fill dart boxes
    data.throws.forEach((t, i) => {
      const idx = i + 1;
      const label = t.mod === 'triple' ? 'T' + t.field
                  : t.mod === 'double' ? 'D' + t.field
                  : t.field === 'Bull' ? (t.scored === 50 ? 'BULL' : 'Bull')
                  : t.scored === 0 ? 'MISS'
                  : String(t.field);
      document.getElementById('cdb-val-' + idx).textContent = label;
      document.getElementById('cdb-pts-' + idx).textContent = t.scored > 0 ? t.scored + ' Pkt' : '';
      // Fill empty slots
      if (idx > data.throws.length) {
        document.getElementById('cdb-val-' + idx).textContent = '—';
        document.getElementById('cdb-pts-' + idx).textContent = '';
      }
    });
    // Clear unused slots
    for (let i = data.throws.length + 1; i <= 3; i++) {
      document.getElementById('cdb-val-' + i).textContent = '—';
      document.getElementById('cdb-pts-' + i).textContent = '';
    }
    document.getElementById('confirm-title').textContent =
      'Gesamt: ' + data.actualScore + ' Pkt  |  Rest: ' + data.newRemaining;
  } else {
    document.getElementById('confirm-sum-val').textContent = data.actualScore;
    document.getElementById('confirm-sum-rest').textContent = data.newRemaining;
    document.getElementById('confirm-title').textContent = 'Wurf bestätigen';
  }

  // Mic listening hint
  const hint = document.getElementById('confirm-listening');
  if (micActive) {
    hint.style.display = 'flex';
    document.getElementById('confirm-listen-txt').textContent = 'Sage „Ja" oder „Korrigieren"';
  } else {
    hint.style.display = 'none';
  }

  modal.classList.add('show');

  // Announce only dart results — score+rest spoken AFTER confirmation
  if (!isSum) {
    const throwText = data.throws.map(t => {
      if (t.scored === 0) return 'daneben';
      if (t.field === 'Bull') return t.scored === 50 ? 'Double Bull' : 'Bull fünfundzwanzig';
      if (t.mod === 'triple') return 'Dreifach ' + t.field;
      if (t.mod === 'double') return 'Doppel ' + t.field;
      return String(t.field);
    }).join(', ');
    speak(throwText);
  }
  // Sum mode: nothing to speak on open — user already knows what they entered
}

function confirmYes() {
  document.getElementById('confirm-modal').classList.remove('show');
  if (!pendingConfirm) return;
  const d = pendingConfirm;
  pendingConfirm = null;
  window.speechSynthesis && window.speechSynthesis.cancel();
  if (d.mode === 'dart') {
    applyDartRound(d);
  } else {
    applySumRound(d);
  }
}

function confirmFix() {
  window.speechSynthesis && window.speechSynthesis.cancel();
  const isSum = pendingConfirm && pendingConfirm.mode === 'sum';
  document.getElementById('confirm-main-btns').style.display = 'none';
  if (isSum) {
    fixSumStr = '';
    updateFixSumDisplay();
    document.getElementById('confirm-fix-sum').style.display = 'block';
    document.getElementById('confirm-listening').style.display = 'none';
    if (micActive) {
      document.getElementById('confirm-listening').style.display = 'flex';
      document.getElementById('confirm-listen-txt').textContent = 'Sage die korrekte Punktzahl';
    }
  } else {
    document.getElementById('confirm-fix-dart').style.display = 'block';
    if (micActive) {
      document.getElementById('confirm-listening').style.display = 'flex';
      document.getElementById('confirm-listen-txt').textContent = 'Sage „Dart 1", „Dart 2" oder „Dart 3"';
    }
  }
}

function confirmFixBack() {
  document.getElementById('confirm-fix-dart').style.display = 'none';
  document.getElementById('confirm-fix-sum').style.display = 'none';
  document.getElementById('confirm-main-btns').style.display = 'grid';
  if (micActive) {
    document.getElementById('confirm-listening').style.display = 'flex';
    document.getElementById('confirm-listen-txt').textContent = 'Sage „Ja" oder „Korrigieren"';
  }
}

function fixDart(idx) {
  // Remove dart at idx-1 from pending throws, close modal, re-enter that dart
  document.getElementById('confirm-modal').classList.remove('show');
  window.speechSynthesis && window.speechSynthesis.cancel();
  if (!pendingConfirm) return;
  const d = pendingConfirm;
  pendingConfirm = null;
  // Restore game state: remove throws from idx onwards
  gameState.dartInRound = idx - 1;
  // Restore remaining to before those darts
  let restoredRemaining = d.remainingBefore;
  for (let i = 0; i < idx - 1; i++) {
    restoredRemaining -= d.throws[i].scored;
  }
  gameState.remaining = restoredRemaining;
  gameState.throwsThisRound = d.throws.slice(0, idx - 1);
  updateScoreDisplay();
  updateDarts();
  speak('Dart ' + idx + ' neu eingeben.');
}

// ── Fix sum mode ──
function updateFixSumDisplay() {
  const el = document.getElementById('fix-sum-display');
  if (!fixSumStr) { el.textContent = '—'; el.style.color = 'var(--muted)'; return; }
  const n = parseInt(fixSumStr);
  const valid = isValidScore(n) && n <= (pendingConfirm ? pendingConfirm.remainingBefore : 180);
  el.textContent = fixSumStr;
  el.style.color = valid ? 'var(--text)' : 'var(--danger)';
}
function fixSumDigit(d) { if (fixSumStr.length < 3) { fixSumStr += d; updateFixSumDisplay(); } }
function fixSumDel() { fixSumStr = fixSumStr.slice(0,-1); updateFixSumDisplay(); }
function fixSumClear() { fixSumStr = ''; updateFixSumDisplay(); }

function fixSumCommit() {
  if (!fixSumStr) return;
  const n = parseInt(fixSumStr);
  if (!pendingConfirm) return;
  const before = pendingConfirm.remainingBefore;
  if (!isValidScore(n) || n > before) {
    document.getElementById('fix-sum-display').style.color = 'var(--danger)';
    return;
  }
  const newRem = before - n;
  pendingConfirm.actualScore = n;
  pendingConfirm.newRemaining = newRem;
  fixSumStr = '';
  // Show updated confirmation
  document.getElementById('confirm-fix-sum').style.display = 'none';
  document.getElementById('confirm-main-btns').style.display = 'grid';
  document.getElementById('confirm-sum-val').textContent = n;
  document.getElementById('confirm-sum-rest').textContent = newRem;
  document.getElementById('confirm-title').textContent = 'Wurf bestätigen';
  if (micActive) {
    document.getElementById('confirm-listening').style.display = 'flex';
    document.getElementById('confirm-listen-txt').textContent = 'Sage „Ja" oder „Korrigieren"';
  }
  speak(n + ' Punkte. Rest ' + newRem + '. Bestätigen?');
}

// ── Apply confirmed rounds ──
function applyDartRound(d) {
  const gs = gameState;
  gs.remaining = d.newRemaining;
  gs.throwsThisRound = d.throws;
  gs.dartInRound = d.throws.length;
  gs.totalDarts += d.throws.length;
  if (d.actualScore > gs.highestRound) gs.highestRound = d.actualScore;
  updateScoreDisplay(true);
  updateDarts();
  updateStats();
  if (d.won) {
    const winner = (gameConfig.playerMode !== 'solo' && gs.currentTurn === 'opponent') ? 'opponent' : 'human';
    announceWin(winner);
    setTimeout(() => showWin(winner), 800);
    return;
  }
  // Speak total + rest AFTER confirmation (darts were already announced in modal)
  if (d.busted) {
    speak('Bust', () => endRound(d.busted, d.won, true));
  } else {
    speak('Gesamt ' + d.actualScore + ', Rest ' + d.newRemaining, () => endRound(d.busted, d.won, true));
  }
}

function applySumRound(d) {
  const gs = gameState;
  gs.remaining = d.newRemaining;
  updateScoreDisplay(true);
  updateStats();
  if (d.won) {
    // Show checkout dart modal
    gs.sumPendingScore = { scored: d.actualScore, newRemaining: 0 };
    showCheckoutModal();
    return;
  }
  if (d.busted) {
    showBust();
    setTimeout(() => showBustDartModal(d.actualScore), 850);
    return;
  }
  gs.totalDarts += 3;
  gs.throwsThisRound = [{ scored: d.actualScore, field: d.actualScore, mod: 'sum', busted: false }];
  speak(d.actualScore + ' Punkte, Rest ' + d.newRemaining, () => endRoundSum(false, d.actualScore, 3, false, true));
}

// ── Speech input for confirmation modal ──
function handleConfirmSpeech(text) {
  const t = text.toLowerCase().trim();
  const fixDartVisible = document.getElementById('confirm-fix-dart').style.display !== 'none';
  const fixSumVisible = document.getElementById('confirm-fix-sum').style.display !== 'none';

  if (fixDartVisible) {
    // Expect "Dart 1/2/3" or "erster/zweiter/dritter" or "1/2/3"
    if (/dart\s*1|erst|one|1/.test(t)) { fixDart(1); return true; }
    if (/dart\s*2|zweit|two|2/.test(t)) { fixDart(2); return true; }
    if (/dart\s*3|dritt|three|3/.test(t)) { fixDart(3); return true; }
    if (/zurück|back|nein/.test(t)) { confirmFixBack(); return true; }
    return false;
  }

  if (fixSumVisible) {
    // Try to parse a number
    const numMatch = t.match(/\d+/);
    if (numMatch) {
      fixSumStr = numMatch[0];
      updateFixSumDisplay();
      fixSumCommit();
      return true;
    }
    const spoken = parseSpokenNumber(t.replace(/punkte?|rest|übrig/g,'').trim());
    if (spoken !== null) {
      fixSumStr = String(spoken);
      updateFixSumDisplay();
      fixSumCommit();
      return true;
    }
    return false;
  }

  // Main confirm view
  if (/^(ja|yes|jo|genau|stimmt|richtig|okay|ok|bestätigen?)/.test(t)) { confirmYes(); return true; }
  if (/korrigier|falsch|nein|no|änder|fix/.test(t)) { confirmFix(); return true; }
  return false;
}

// ════════════════════════════════════════════
//  SPEECH HELPERS
// ════════════════════════════════════════════

/**
 * Pause-based completion detection.
 * Instead of guessing if a command is complete, we wait for a short
 * silence after the last interim result. If no new result arrives
 * within PAUSE_MS, we treat the last interim as the final input.
 * This avoids firing too early (e.g. "dreifach" before "8" is spoken).
 */
// ─── Speech dedup: one result per recognition session ───────────────────────
// _sessionDone is set to true as soon as we process any result (interim or final)
// It resets to false on the next onstart — guaranteeing exactly-once execution.
let _sessionDone = false;
const PAUSE_MS = 600;
let _pauseTimer = null;

function speechProcess(text, handler) {
  if (_sessionDone) return;   // already handled this session
  _sessionDone = true;
  cancelPauseTimer();
  handler(text);
}

function scheduleFromInterim(text, handler) {
  if (_sessionDone) return;
  if (_pauseTimer) clearTimeout(_pauseTimer);
  _pauseTimer = setTimeout(() => {
    _pauseTimer = null;
    speechProcess(text, handler);
  }, PAUSE_MS);
}

function cancelPauseTimer() {
  if (_pauseTimer) { clearTimeout(_pauseTimer); _pauseTimer = null; }
}

function resetSpeechSession() {
  _sessionDone = false;
  _pauseTimer && clearTimeout(_pauseTimer);
  _pauseTimer = null;
}

// ════════════════════════════════════════════
//  MULTIPLAYER HELPERS
// ════════════════════════════════════════════

function updateTurnIndicator() {
  const gs = gameState;
  const isHuman = gs.currentTurn === 'human';
  const p1Name = gameConfig.player1Name || 'Spieler 1';
  const p2Name = gameConfig.playerMode === 'cpu'
    ? 'KI'
    : (gameConfig.player2Name || 'Spieler 2');
  const activeName = isHuman ? p1Name : p2Name;
  document.getElementById('turn-player-name').textContent = activeName;

  // Update mcard highlights
  const mc1 = document.getElementById('mcard-human');
  const mc2 = document.getElementById('mcard-opp');
  if (mc1 && mc2) {
    if (isHuman) {
      mc1.className = 'score-col active-player';
      mc2.className = 'score-col';
    } else {
      mc1.className = 'score-col';
      mc2.className = gameConfig.playerMode === 'cpu' ? 'score-col active-ai' : 'score-col active-player';
    }
    document.getElementById('mcard-p1-sub').textContent = isHuman ? 'Am Zug' : 'Wartet';
    document.getElementById('mcard-p2-sub').textContent = !isHuman ? 'Am Zug' : 'Wartet';
  }
}

function updateDualScores() {
  const gs = gameState;
  const p1El = document.getElementById('mcard-p1-score');
  const p2El = document.getElementById('mcard-p2-score');
  if (p1El) p1El.textContent = gs.humanRemaining;
  if (p2El) p2El.textContent = gs.opponentRemaining;
}

function switchToOpponent() {
  const gs = gameState;
  updateTurnIndicator();
  if (gameConfig.playerMode === 'cpu') {
    // Speech is already finished when we get here (called from onDone callback)
    // Just add a short pause so the transition feels natural
    setTimeout(() => runAiTurn(), 600);
  } else {
    // PvP: switch display, player 2 enters
    gs.remaining = gs.opponentRemaining;
    updateScoreDisplay();
    updateDarts();
  }
}

// ════════════════════════════════════════════
//  AI ENGINE
// ════════════════════════════════════════════

/**
 * AI throw profiles per difficulty.
 * Each difficulty defines:
 *   - accuracy: probability of hitting the intended segment
 *   - preferredTargets: weighted field preferences
 *   - doubleAccuracy: probability of hitting double for checkout
 *   - bustRate: extra probability of busting near checkout
 */
const AI_PROFILES = {
  easy: {
    // Leicht: Ø ~35 Punkte pro Runde (Anfänger)
    singleProb: 0.60,   // prob single (vs double/triple)
    doubleProb: 0.15,
    tripleProb: 0.05,
    missProb: 0.20,      // complete miss
    preferredFields: [5,1,12,9,14,11,8,16,7,19], // common beginner misses
    doubleCheckoutAccuracy: 0.12,
    maxSingleTarget: 14,
  },
  medium: {
    // Mittel: Ø ~55 Punkte pro Runde (Hobbyspieler)
    singleProb: 0.55,
    doubleProb: 0.20,
    tripleProb: 0.12,
    missProb: 0.13,
    preferredFields: [20,19,18,17,16,15,14,13,12,11],
    doubleCheckoutAccuracy: 0.28,
    maxSingleTarget: 20,
  },
  hard: {
    // Schwer: Ø ~80 Punkte pro Runde (Fortgeschrittener)
    singleProb: 0.35,
    doubleProb: 0.22,
    tripleProb: 0.35,
    missProb: 0.08,
    preferredFields: [20,19,18,17,16,15],
    doubleCheckoutAccuracy: 0.48,
    maxSingleTarget: 20,
  },
};

// Standard checkout table (best single path to finish)
const CHECKOUT_TABLE = {
  170:[['T20','T20','Bull']],  160:[['T20','T20','D20']], 161:[['T17','T18','D20']],
  164:[['T20','T18','D20']], 167:[['T20','T19','D20']], 168:[['T20','T20','D14']],
  100:[['T20','D20']],  99:[['T19','D21']],  98:[['T20','D19']],
  97:[['T19','D20']], 96:[['T20','D18']], 95:[['T19','D19']], 94:[['T18','D20']],
  93:[['T19','D18']], 92:[['T20','D16']], 91:[['T17','D20']], 90:[['T18','D18']],
  89:[['T19','D16']], 88:[['T20','D14']], 87:[['T17','D18']], 86:[['T18','D16']],
  85:[['T15','D20']], 84:[['T20','D12']], 83:[['T17','D16']], 82:[['T14','D20']],
  81:[['T19','D12']], 80:[['T20','D10']], 79:[['T13','D20']], 78:[['T18','D12']],
  77:[['T19','D10']], 76:[['T20','D8']],  75:[['T17','D12']], 74:[['T14','D16']],
  73:[['T19','D8']],  72:[['T16','D12']], 71:[['T13','D16']], 70:[['T10','D20']],
  69:[['T19','D6']],  68:[['T20','D4']],  67:[['T17','D8']],  66:[['T10','D18']],
  65:[['T19','D4']],  64:[['T16','D8']],  63:[['T13','D12']], 62:[['T10','D16']],
  61:[['T15','D8']],  60:[['20','D20']],  59:[['19','D20']], 58:[['18','D20']],
  57:[['17','D20']], 56:[['16','D20']], 55:[['15','D20']], 54:[['14','D20']],
  53:[['13','D20']], 52:[['12','D20']], 51:[['11','D20']], 50:[['Bull']],
  49:[['9','D20']],  48:[['8','D20']],   47:[['7','D20']],  46:[['6','D20']],
  45:[['5','D20']],  44:[['4','D20']],   43:[['3','D20']],  42:[['10','D16']],
  41:[['9','D16']],  40:[['D20']],       39:[['7','D16']],  38:[['D19']],
  37:[['5','D16']],  36:[['D18']],       35:[['3','D16']],  34:[['D17']],
  33:[['1','D16']],  32:[['D16']],       31:[['7','D12']],  30:[['D15']],
  29:[['5','D12']],  28:[['D14']],       27:[['3','D12']],  26:[['D13']],
  25:[['5','D10']],  24:[['D12']],       23:[['7','D8']],   22:[['D11']],
  21:[['5','D8']],   20:[['D10']],       19:[['3','D8']],   18:[['D9']],
  17:[['1','D8']],   16:[['D8']],        15:[['7','D4']],   14:[['D7']],
  13:[['5','D4']],   12:[['D6']],        11:[['3','D4']],   10:[['D5']],
  9:[['1','D4']],    8:[['D4']],         7:[['3','D2']],    6:[['D3']],
  5:[['1','D2']],    4:[['D2']],         3:[['1','D1']],    2:[['D1']],
};

function rnd() { return Math.random(); }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function gauss(mean, sd) {
  // Box-Muller
  let u = 0, v = 0;
  while(u === 0) u = rnd();
  while(v === 0) v = rnd();
  return mean + sd * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function aiSingleThrow(remaining, profile, isLastDart) {
  // Returns { scored, label, mod }
  const r = rnd();

  // Near checkout?
  if (remaining <= 170 && CHECKOUT_TABLE[remaining]) {
    const checkout = CHECKOUT_TABLE[remaining][0];
    const targetStr = checkout[0]; // e.g. "T20", "D16", "Bull"
    return aiAttemptCheckout(targetStr, remaining, profile, isLastDart, checkout.length);
  }

  // Go for big scores
  if (r < profile.missProb) {
    return { scored: 0, label: 'MISS', mod: 'miss' };
  }

  const fields = profile.preferredFields;
  const field = pick(fields);

  const r2 = rnd();
  if (r2 < profile.tripleProb) {
    // Attempt triple
    const hit = rnd() < 0.55; // 55% chance of actually hitting triple
    if (hit) return { scored: field * 3, label: field.toString(), mod: 'triple' };
    // Miss triple → single or adjacent
    return { scored: field, label: field.toString(), mod: 'single' };
  } else if (r2 < profile.tripleProb + profile.doubleProb) {
    const hit = rnd() < 0.45;
    if (hit) return { scored: field * 2, label: field.toString(), mod: 'double' };
    return { scored: field, label: field.toString(), mod: 'single' };
  } else {
    // Single — add some noise
    const actualField = rnd() < 0.75 ? field : pick([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]);
    return { scored: actualField, label: actualField.toString(), mod: 'single' };
  }
}

function aiAttemptCheckout(targetStr, remaining, profile, isLast, checkoutLength) {
  const isDouble = targetStr.startsWith('D');
  const isTriple = targetStr.startsWith('T');
  const isBull = targetStr === 'Bull';

  if (isBull) {
    const hit = rnd() < profile.doubleCheckoutAccuracy;
    if (hit) return { scored: 50, label: 'Bull', mod: 'double' };
    // Miss Bull → 25 or 1
    const alt = rnd() < 0.6 ? 25 : pick([1,5,20]);
    return { scored: alt, label: alt === 25 ? 'Bull' : alt.toString(), mod: alt === 25 ? 'single' : 'single' };
  }

  const num = parseInt(targetStr.replace(/[DT]/, ''));

  if (isDouble) {
    if (!isLast || checkoutLength > 1) {
      // Not the finishing dart — just hit it accurately
      const hit = rnd() < 0.58;
      if (hit) return { scored: num * 2, label: num.toString(), mod: 'double' };
      return { scored: num, label: num.toString(), mod: 'single' };
    }
    // Finishing on double
    const hit = rnd() < profile.doubleCheckoutAccuracy;
    if (hit) return { scored: num * 2, label: num.toString(), mod: 'double' };
    // Miss: single or miss entirely
    if (rnd() < 0.5) return { scored: num, label: num.toString(), mod: 'single' }; // bust if remaining===num*2
    return { scored: 0, label: 'MISS', mod: 'miss' };
  }

  if (isTriple) {
    const hit = rnd() < (profile.tripleProb + 0.3);
    if (hit) return { scored: num * 3, label: num.toString(), mod: 'triple' };
    return { scored: num, label: num.toString(), mod: 'single' };
  }

  // Single target
  const hit = rnd() < 0.78;
  if (hit) return { scored: num, label: num.toString(), mod: 'single' };
  return { scored: Math.max(1, num + (rnd() < 0.5 ? 1 : -1)), label: num.toString(), mod: 'single' };
}

function runAiTurn() {
  const gs = gameState;
  const profile = AI_PROFILES[gameConfig.difficulty];

  // Show AI overlay
  const overlay = document.getElementById('ai-overlay');
  overlay.classList.add('show');
  document.getElementById('ai-overlay-title').textContent = 'KI wirft…';

  // Reset AI dart boxes
  [1,2,3].forEach(i => {
    const box = document.getElementById('ai-dbox-' + i);
    const val = document.getElementById('ai-dbox-val-' + i);
    box.className = 'ai-dart-box';
    val.textContent = '—';
  });
  document.getElementById('ai-round-score').textContent = '—';
  document.getElementById('ai-remaining-display').textContent = gs.opponentRemaining;

  let aiRemaining = gs.opponentRemaining;
  const throws = [];
  let busted = false;

  // Simulate 3 throws
  function doThrow(idx) {
    if (idx >= 3) {
      // Done — calculate
      finishAiTurn(throws, busted, aiRemaining);
      return;
    }

    const isLast = idx === 2;
    const t = aiSingleThrow(aiRemaining, profile, isLast);
    const newRem = aiRemaining - t.scored;

    // Bust check
    let isBust = false;
    if (newRem < 0 || newRem === 1) isBust = true;
    if (newRem === 0 && gameConfig.outRule === 'double' && t.mod !== 'double' && !(t.label === 'Bull' && t.mod === 'double')) isBust = true;

    throws.push({ ...t, busted: isBust });

    // Show in overlay
    const box = document.getElementById('ai-dbox-' + (idx+1));
    const val = document.getElementById('ai-dbox-val-' + (idx+1));
    // Build field label: D16, T20, BULL, MISS, or plain number
    function fieldLabel(throw_) {
      if (throw_.scored === 0) return 'MISS';
      if (throw_.label === 'Bull') return throw_.mod === 'double' ? 'BULL 50' : 'Bull 25';
      if (throw_.mod === 'double') return 'D' + throw_.label + '<br><small style="font-size:0.65rem;color:var(--accent2)">' + throw_.scored + '</small>';
      if (throw_.mod === 'triple') return 'T' + throw_.label + '<br><small style="font-size:0.65rem;color:var(--danger)">' + throw_.scored + '</small>';
      return throw_.label;
    }
    if (isBust) {
      box.classList.add('busted');
      val.innerHTML = fieldLabel(t);
    } else {
      box.classList.add('filled');
      val.innerHTML = fieldLabel(t);
    }

    if (isBust) {
      busted = true;
      document.getElementById('ai-overlay-title').textContent = 'BUST!';
      setTimeout(() => finishAiTurn(throws, true, aiRemaining), 700);
      return;
    }

    aiRemaining = newRem;
    document.getElementById('ai-remaining-display').textContent = aiRemaining;

    if (aiRemaining === 0) {
      // Win!
      throws.splice(idx + 1); // truncate remaining
      finishAiTurn(throws, false, aiRemaining, true);
      return;
    }

    setTimeout(() => doThrow(idx + 1), 550);
  }

  setTimeout(() => doThrow(0), 400);
}

function finishAiTurn(throws, busted, finalRemaining, won = false) {
  const roundScore = busted ? 0 : throws.reduce((s,t) => s + (t.busted ? 0 : t.scored), 0);
  document.getElementById('ai-round-score').textContent = busted ? 'BUST' : roundScore;
  document.getElementById('ai-remaining-display').textContent = busted ? gameState.opponentRemaining : finalRemaining;

  setTimeout(() => {
    const overlay = document.getElementById('ai-overlay');
    overlay.classList.remove('show');

    const gs = gameState;
    if (!busted) gs.opponentRemaining = finalRemaining;
    document.getElementById('ps-opponent').textContent = gs.opponentRemaining;

    gs.opponentHistory.push({ round: gs.round - 1, total: roundScore, remain: gs.opponentRemaining });

    if (won) {
      announceWin('opponent');
      setTimeout(() => showWin('opponent'), 400);
      return;
    }

    // Switch back to human
    gs.currentTurn = 'human';
    gs.remaining = gs.humanRemaining;
    updateScoreDisplay();
    updateDualScores();
    updateTurnIndicator();
    updateDarts();
    updateStats();

    if (settings.speech) {
      speak(busted ? 'KI: Bust!' : 'KI: ' + roundScore + ' Punkte. Rest ' + gs.opponentRemaining);
    }
  }, 900);
}
