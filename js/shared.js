// ════════════════════════════════════════════
//  APP STATE
// ════════════════════════════════════════════
// Load persisted settings & config
function loadPersisted() {
  try {
    const s = JSON.parse(localStorage.getItem('dartsSettings') || '{}');
    if (s.speech !== undefined) settings.speech = s.speech;
    if (s.haptic !== undefined) settings.haptic = s.haptic;
    if (s.volume !== undefined) settings.volume = s.volume;
    if (s.theme)  settings.theme  = s.theme;
    const c = JSON.parse(localStorage.getItem('dartsConfig') || '{}');
    if (c.points) gameConfig.points = c.points;
    if (c.inRule) gameConfig.inRule = c.inRule;
    if (c.outRule) gameConfig.outRule = c.outRule;
    if (c.limit !== undefined) gameConfig.limit = c.limit;
    if (c.playerMode) gameConfig.playerMode = c.playerMode;
    if (c.difficulty) gameConfig.difficulty = c.difficulty;
    if (c.inputMode) gameConfig.inputMode = c.inputMode;
  } catch(e) {}
}
function persistSettings() {
  try {
    localStorage.setItem('dartsSettings', JSON.stringify({
      speech: settings.speech, haptic: settings.haptic, volume: settings.volume,
      theme: settings.theme
    }));
  } catch(e) {}
}

function setTheme(theme) {
  settings.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const darkBtn  = document.getElementById('theme-dark-btn');
  const lightBtn = document.getElementById('theme-light-btn');
  if (darkBtn && lightBtn) {
    const activeStyle  = 'padding:0.3rem 0.65rem;border-radius:var(--radius-sm);border:1.5px solid var(--accent);background:rgba(232,200,74,0.12);color:var(--accent);font-family:var(--font-body);font-size:0.72rem;font-weight:600;cursor:pointer;letter-spacing:0.06em';
    const inactiveStyle = 'padding:0.3rem 0.65rem;border-radius:var(--radius-sm);border:1.5px solid var(--border);background:transparent;color:var(--muted);font-family:var(--font-body);font-size:0.72rem;font-weight:600;cursor:pointer;letter-spacing:0.06em';
    darkBtn.style.cssText  = theme === 'dark'  ? activeStyle : inactiveStyle;
    lightBtn.style.cssText = theme === 'light' ? activeStyle : inactiveStyle;
  }
  persistSettings();
}
function persistConfig() {
  try {
    localStorage.setItem('dartsConfig', JSON.stringify({
      points: gameConfig.points, inRule: gameConfig.inRule, outRule: gameConfig.outRule,
      limit: gameConfig.limit, playerMode: gameConfig.playerMode, difficulty: gameConfig.difficulty, inputMode: gameConfig.inputMode
    }));
  } catch(e) {}
}
const settings = { speech: true, haptic: true, volume: 0.8, theme: 'dark' };

const gameConfig = { points: 501, inRule: 'straight', outRule: 'double', limit: 0, playerMode: 'solo', difficulty: 'easy', player1Name: 'Spieler 1', player2Name: 'Spieler 2', inputMode: 'dart' };

let gameState = {
  startPoints: 501,
  remaining: 501,
  round: 1,
  dartInRound: 0,
  throwsThisRound: [],
  modifier: 'single',
  history: [],
  totalDarts: 0,
  highestRound: 0,
  inGame: false,
  inputMode: 'dart',   // 'dart' | 'sum'
  sumInputStr: '',     // digit string being built in sum mode
  sumPendingScore: null, // null or {scored, newRemaining}
  micActive: false,
  micMuted: false,
  // Multiplayer
  currentTurn: 'human',
  humanRemaining: 501,
  opponentRemaining: 501,
  humanHistory: [],
  opponentHistory: [],
  winner: null,
};

// ── Valid scores with 3 darts (impossible scores) ──
const IMPOSSIBLE_3DART = new Set([179,178,176,175,173,172,169,166,163,162,159]);
function isValidScore(n) {
  if (n < 0 || n > 180) return false;
  if (IMPOSSIBLE_3DART.has(n)) return false;
  return true;
}

// ════════════════════════════════════════════
//  PAGES
// ════════════════════════════════════════════
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  page.classList.add('active');
}

function selectMode(mode) {
  if (mode === 'bobs27') { showPage('bobs-setup'); return; }
  if (mode === 'atc')    { showPage('atc-setup'); return; }
  if (mode === 'cricket') { showPage('cricket-setup'); return; }
  if (mode !== 'x01') return;
  showPage('setup');
}

function selectPlayerMode(val, btn) {
  const grp = document.getElementById('grp-playermode');
  grp.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  gameConfig.playerMode = val;
  const diffGroup = document.getElementById('grp-difficulty-group');
  diffGroup.classList.toggle('visible', val === 'cpu');
  const p2Input = document.getElementById('input-p2-name');
  const p1Input = document.getElementById('input-p1-name');
  p2Input.style.display = val === 'pvp' ? 'block' : 'none';
  p1Input.placeholder = val === 'pvp' ? 'Name Spieler 1' : 'Dein Name';
}

// ════════════════════════════════════════════
//  SETUP
// ════════════════════════════════════════════
function selectOption(group, val, btn) {
  const grp = document.getElementById('grp-' + group);
  grp.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  if (group === 'points') gameConfig.points = val;
  else if (group === 'in') gameConfig.inRule = val;
  else if (group === 'out') gameConfig.outRule = val;
  else if (group === 'limit') gameConfig.limit = val;
  else if (group === 'difficulty') gameConfig.difficulty = val;
  else if (group === 'inputmode') { gameConfig.inputMode = val; gameState.inputMode = val; }
}

function startGame() {
  haptic(10);
  const isMulti = gameConfig.playerMode !== 'solo';
  gameState = {
    startPoints: gameConfig.points,
    remaining: gameConfig.points,
    round: 1,
    dartInRound: 0,
    throwsThisRound: [],
    modifier: 'single',
    history: [],
    totalDarts: 0,
    highestRound: 0,
    inGame: gameConfig.inRule === 'straight',
    currentTurn: 'human',
    humanRemaining: gameConfig.points,
    opponentRemaining: gameConfig.points,
    humanHistory: [],
    opponentHistory: [],
    winner: null,
  };

  // Update UI labels
  document.getElementById('game-mode-tag').textContent = gameConfig.points;
  const outLabel = gameConfig.outRule === 'double' ? 'DOUBLE OUT' : 'SINGLE OUT';
  const inLabel = gameConfig.inRule === 'double' ? ' / DOUBLE IN' : '';
  document.getElementById('game-rule-tag').textContent = outLabel + inLabel;

  // Multiplayer UI
  const turnInd = document.getElementById('turn-indicator');
  const p1Name = gameConfig.player1Name || 'Spieler 1';
  const p2Name = gameConfig.playerMode === 'cpu'
    ? 'KI (' + {easy:'Leicht',medium:'Mittel',hard:'Schwer'}[gameConfig.difficulty] + ')'
    : (gameConfig.player2Name || 'Spieler 2');

  if (isMulti) {
    // Show multi score cards, hide solo card
    document.getElementById('score-col-solo').style.display = 'none';
    document.getElementById('mcard-human').style.display = 'flex';
    document.getElementById('mcard-opp').style.display = 'flex';
    document.getElementById('score-row').classList.add('multi');
    document.getElementById('mcard-p1-label').textContent = p1Name;
    document.getElementById('mcard-p2-label').textContent = p2Name;
    document.getElementById('mcard-p1-score').textContent = gameConfig.points;
    document.getElementById('mcard-p2-score').textContent = gameConfig.points;
    document.getElementById('mcard-p1-sub').textContent = 'Am Zug';
    document.getElementById('mcard-p2-sub').textContent = 'Wartet';
    document.getElementById('round-label-multi').textContent = '1';
    turnInd.classList.add('active');
    document.getElementById('turn-player-name').textContent = p1Name;
  } else {
    // Solo: show solo card, hide multi cards
    document.getElementById('score-col-solo').style.display = 'flex';
    document.getElementById('mcard-human').style.display = 'none';
    document.getElementById('mcard-opp').style.display = 'none';
    document.getElementById('score-row').classList.remove('multi');
    turnInd.classList.remove('active');
  }

  updateScoreDisplay();
  updateDarts();
  updateRoundScores();
  setModifier('single');
  document.getElementById('history-list').innerHTML = '';
  [1,2,3].forEach(i => {
    const val = document.getElementById('dbox-val-' + i);
    val.innerHTML = '—';
    val.style.display = '';
    const box = document.getElementById('dbox-' + i);
    box.className = 'dart-box' + (i === 1 ? ' active' : '');
  });
  document.getElementById('stat-avg-total').textContent = '—';
  document.getElementById('stat-best').textContent = '—';

  // Reset input mode UI
  setInputMode(gameConfig.inputMode || 'dart');
  // Mic init (if previously active, reopen)
  if (micActive) {
    try { speechRecognition && speechRecognition.abort(); } catch(e) {}
    micActive = false;
    document.getElementById('mic-btn').classList.remove('listening');
    document.getElementById('mic-btn').classList.add('muted');
    document.getElementById('speech-status').classList.remove('active');
  }
  if (!speechRecognition) initSpeech();
  sumClear();
  persistConfig();
  showPage('game');
}

// ════════════════════════════════════════════
//  GAME LOGIC
// ════════════════════════════════════════════
function setModifier(mod) {
  gameState.modifier = mod;
  ['single','double','triple'].forEach(m => {
    document.getElementById('mod-' + m).classList.toggle('active', m === mod);
  });
  // Bull is impossible with triple — grey it out
  const bullBtn = document.getElementById('btn-bull');
  if (bullBtn) {
    bullBtn.disabled = mod === 'triple';
    bullBtn.style.opacity = mod === 'triple' ? '0.35' : '';
    bullBtn.style.cursor  = mod === 'triple' ? 'not-allowed' : '';
  }
  updateInputDisplay();
}

function numPress(n) {
  haptic(8);
  if (gameState.dartInRound >= 3) return;

  const mod = gameState.modifier;
  const multiplier = mod === 'single' ? 1 : mod === 'double' ? 2 : 3;
  const scored = n * multiplier;

  processThrow(scored, n, mod);
}

function throwMiss() {
  haptic(8);
  if (gameState.dartInRound >= 3) return;
  processThrow(0, 0, 'miss');
}

function throwBull() {
  haptic(8);
  if (gameState.dartInRound >= 3) return;
  if (gameState.modifier === 'triple') return; // Triple Bull does not exist

  const mod = gameState.modifier;
  let scored;
  if (mod === 'double') {
    scored = 50; // Double Bull
    processThrow(scored, 'Bull', 'double');
  } else {
    scored = 25; // Single Bull
    processThrow(scored, 'Bull', 'single');
  }
}

function processThrow(scored, field, mod) {
  const gs = gameState;
  const prev = gs.remaining;

  // Double-In check
  if (!gs.inGame) {
    if (mod !== 'double' && !(field === 'Bull' && mod === 'double')) {
      // Miss for double-in
      gs.throwsThisRound.push({ scored: 0, field, mod, busted: false, missedIn: true });
      gs.dartInRound++;
      gs.totalDarts++;
      setModifier('single');
      updateDarts();
      if (gs.dartInRound >= 3) endRound(false);
      return;
    }
    gs.inGame = true;
  }

  const newRemaining = prev - scored;

  // BUST conditions
  let busted = false;
  if (newRemaining < 0) busted = true;
  if (newRemaining === 1) busted = true; // Can't finish on 1
  if (newRemaining === 0 && gameConfig.outRule === 'double' && mod !== 'double' && !(field === 'Bull' && mod === 'double')) {
    busted = true;
  }

  if (busted) {
    gs.throwsThisRound.push({ scored, field, mod, busted: true });
    gs.dartInRound++;
    gs.totalDarts++;
    updateDarts();
    updateStats();
    showBust();
    if (micActive) {
      const remainBefore = gs.remaining + gs.throwsThisRound.reduce((s,t) => s + (t.busted?0:t.scored), 0) + scored;
      setTimeout(() => {
        showConfirmModal({
          mode: 'dart',
          throws: [...gs.throwsThisRound],
          actualScore: 0,
          newRemaining: gs.remaining,
          remainingBefore: remainBefore,
          won: false,
          busted: true,
        });
        gs.dartInRound = 0;
        gs.throwsThisRound = [];
      }, 850);
    } else {
      setTimeout(() => endRound(true), 850);
    }
    return;
  }

  gs.remaining = newRemaining;
  gs.throwsThisRound.push({ scored, field, mod, busted: false });
  gs.dartInRound++;
  gs.totalDarts++;

  setModifier('single');
  updateScoreDisplay(true);
  updateDarts();
  updateStats();

  // WIN condition
  if (gs.remaining === 0) {
    endRound(false, true);
    return;
  }

  // Auto-advance round after 3 darts
  if (gs.dartInRound >= 3) {
    if (micActive) {
      // Show confirmation modal instead of immediately committing
      const remainBefore = gs.remaining + gs.throwsThisRound.reduce((s,t) => s + (t.busted?0:t.scored), 0);
      // Restore remaining to before this round for the modal
      showConfirmModal({
        mode: 'dart',
        throws: [...gs.throwsThisRound],
        actualScore: gs.throwsThisRound.reduce((s,t) => s + (t.busted?0:t.scored), 0),
        newRemaining: gs.remaining,
        remainingBefore: remainBefore,
        won: false,
        busted: false,
      });
      // Reset dart state for potential re-entry
      gs.dartInRound = 0;
      gs.throwsThisRound = [];
    } else {
      endRound(false);
    }
  }
}

function endRound(busted, won = false, skipSpeak = false) {
  const gs = gameState;
  const throws = gs.throwsThisRound;
  const roundScore = throws.reduce((s, t) => s + (busted ? 0 : t.busted ? 0 : t.scored), 0);

  // Actually we want the total non-bust thrown this round
  const actualScore = busted
    ? 0
    : throws.reduce((s, t) => s + (t.busted ? 0 : t.scored), 0);

  const remainAfter = busted ? (gs.history.length > 0 ? gs.history[gs.history.length-1].remainAfter : gs.startPoints) : gs.remaining;

  if (busted) {
    gs.remaining = gs.history.length > 0
      ? gs.history[gs.history.length-1].remainAfter
      : gs.startPoints;
    updateScoreDisplay();
  }

  gs.history.push({
    round: gs.round,
    throws: throws.map(t => t.scored),
    total: actualScore,
    remainAfter: gs.remaining,
  });

  if (actualScore > gs.highestRound) gs.highestRound = actualScore;

  addHistoryEntry(gs.round, actualScore, busted);

  if (won) {
    const winner = (gameConfig.playerMode !== 'solo' && gs.currentTurn === 'opponent') ? 'opponent' : 'human';
    announceWin(winner);
    setTimeout(() => showWin(winner), 800);
    return;
  }

  // Speech after round (skip if confirmation modal already announced)
  if (!skipSpeak) {
    if (settings.speech && !busted) speakRound(actualScore, gs.remaining);
    else if (settings.speech && busted) speak('Bust!');
  }

  // Multiplayer: switch turns
  if (gameConfig.playerMode !== 'solo') {
    if (gs.currentTurn === 'human') {
      gs.humanRemaining = gs.remaining;
      gs.humanHistory.push({ round: gs.round, total: actualScore, remain: gs.remaining });
      updateDualScores();
      gs.currentTurn = 'opponent';
      gs.round++;
      gs.dartInRound = 0;
      gs.throwsThisRound = [];
      setModifier('single');
      updateRoundScores();
      updateDarts();
      updateStats();
      switchToOpponent();
      return;
    } else {
      gs.opponentRemaining = gs.remaining;
      gs.opponentHistory.push({ round: gs.round, total: actualScore, remain: gs.remaining });
      updateDualScores();
      gs.currentTurn = 'human';
      gs.remaining = gs.humanRemaining;
      gs.round++;
      gs.dartInRound = 0;
      gs.throwsThisRound = [];
      setModifier('single');
      updateScoreDisplay();
      updateRoundScores();
      updateDarts();
      updateStats();
      updateTurnIndicator();
      return;
    }
  }

  // Next round (solo)
  gs.round++;
  gs.dartInRound = 0;
  gs.throwsThisRound = [];
  setModifier('single');
  updateRoundScores();
  updateDarts();
  updateStats();
}

function undoLast() {
  haptic(15);
  const gs = gameState;
  if (gs.dartInRound === 0) {
    // Undo last completed round
    if (gs.history.length === 0) return;
    const last = gs.history.pop();
    gs.round--;
    gs.dartInRound = 0;
    gs.throwsThisRound = [];
    gs.remaining = last.remainAfter + last.total; // restore
    // Re-check from previous history
    if (gs.history.length > 0) {
      gs.remaining = gs.history[gs.history.length-1].remainAfter;
    } else {
      gs.remaining = gs.startPoints;
    }
    gs.totalDarts = Math.max(0, gs.totalDarts - 3);
    removeLastHistoryEntry();
    updateScoreDisplay();
    updateRoundScores();
    updateDarts();
    updateStats();
    return;
  }
  // Undo last throw in current round
  const last = gs.throwsThisRound.pop();
  if (!last) return;
  if (!last.busted && !last.missedIn) {
    gs.remaining += last.scored;
  }
  gs.dartInRound--;
  gs.totalDarts--;
  updateScoreDisplay();
  updateDarts();
  updateStats();
}

// ════════════════════════════════════════════
//  UI UPDATES
// ════════════════════════════════════════════
function updateScoreDisplay(animate = false) {
  const el = document.getElementById('score-display');
  el.textContent = gameState.remaining;
  if (animate) {
    el.classList.remove('updated');
    void el.offsetWidth;
    el.classList.add('updated');
  }
}

function updateDarts() {
  const gs = gameState;
  const n = gs.dartInRound;
  [1,2,3].forEach(i => {
    const box = document.getElementById('dbox-' + i);
    const val = document.getElementById('dbox-val-' + i);
    const throw_ = gs.throwsThisRound[i - 1];
    box.className = 'dart-box';
    if (throw_) {
      if (throw_.busted) {
        box.classList.add('busted');
      } else {
        box.classList.add('filled');
      }
      // Build label
      const fieldLabel = throw_.field === 0 ? 'MISS' : (throw_.field === 'Bull' ? 'BULL' : throw_.field.toString());
      const modPrefix = throw_.mod === 'double' ? 'D' : throw_.mod === 'triple' ? 'T' : '';
      if (modPrefix) {
        val.innerHTML = `<span class="dart-box-mod ${throw_.mod}">${modPrefix}</span><span>${throw_.scored}</span>`;
        val.style.display = 'flex';
        val.style.flexDirection = 'column';
        val.style.alignItems = 'center';
        val.style.gap = '2px';
      } else {
        val.innerHTML = throw_.scored === 0 ? 'MISS' : throw_.scored.toString();
        val.style.display = '';
      }
    } else {
      val.innerHTML = '—';
      val.style.display = '';
      if (i === n + 1) box.classList.add('active');
    }
  });
  // First box active when no throws yet
  if (n === 0) document.getElementById('dbox-1').classList.add('active');
}

function updateRoundScores() {
  const el = document.getElementById('round-label');
  if (el) el.textContent = 'Runde ' + gameState.round;
  const el2 = document.getElementById('round-label-multi');
  if (el2) el2.textContent = gameState.round;
}

function updateStats() {
  const gs = gameState;
  // Avg of current round throws so far
  // Overall average per 3 darts across completed rounds
  const completedRounds = gs.history.filter(r => r.total > 0 || gs.history.length > 0);
  if (gs.history.length > 0) {
    const totalScored = gs.startPoints - gs.remaining;
    const totalRounds = gs.history.length;
    const avgTotal = Math.round((totalScored / totalRounds) * 10) / 10;
    document.getElementById('stat-avg-total').textContent = avgTotal.toFixed(1);
  } else {
    document.getElementById('stat-avg-total').textContent = '—';
  }

  document.getElementById('stat-best').textContent = gs.highestRound > 0 ? gs.highestRound : '—';
}

function updateInputDisplay(field, mod, scored) {
  // No-op: display is now handled by updateDarts()
}

function showBust() {
  const overlay = document.getElementById('bust-overlay');
  const scoreEl = document.getElementById('score-display');
  overlay.classList.add('show');
  scoreEl.classList.add('bust');
  setTimeout(() => {
    overlay.classList.remove('show');
    scoreEl.classList.remove('bust');
  }, 800);
}

function addHistoryEntry(round, score, busted) {
  const list = document.getElementById('history-list');
  const chip = document.createElement('div');
  chip.className = 'history-entry';
  chip.id = 'hist-' + round;
  const color = busted ? 'var(--danger)' : score >= 100 ? 'var(--accent)' : score >= 60 ? 'var(--success)' : 'var(--text)';
  chip.innerHTML = `R${round}<span style="color:${color}">${busted ? 'BUST' : score}</span>`;
  list.appendChild(chip);
  list.scrollLeft = list.scrollWidth;
}

function removeLastHistoryEntry() {
  const list = document.getElementById('history-list');
  const last = list.lastElementChild;
  if (last) last.remove();
}

// ════════════════════════════════════════════
//  WIN PAGE
// ════════════════════════════════════════════
function showWin(winner = 'human') {
  const gs = gameState;
  const isMulti = gameConfig.playerMode !== 'solo';
  const rounds = gs.round;
  const darts = gs.totalDarts;
  const avg = rounds > 0 ? Math.round((gs.startPoints / rounds) * 10) / 10 : 0;

  document.getElementById('ws-rounds').textContent = rounds;
  document.getElementById('ws-darts').textContent = darts;
  document.getElementById('ws-avg').textContent = avg.toFixed(1);
  document.getElementById('ws-best').textContent = gs.highestRound;

  let title = 'SPIEL GEWONNEN!';
  let sub = '';
  if (isMulti) {
    const p1Name = gameConfig.player1Name || 'Spieler 1';
    const p2Name = gameConfig.playerMode === 'cpu' ? 'KI' : (gameConfig.player2Name || 'Spieler 2');
    if (winner === 'human') {
      title = p1Name.toUpperCase() + ' GEWINNT!';
      sub = gameConfig.playerMode === 'cpu' ? 'KI besiegt! Gut gespielt! 🎯' : p2Name + ' verliert!';
    } else {
      title = p2Name.toUpperCase() + ' GEWINNT!';
      sub = gameConfig.playerMode === 'cpu' ? 'Nächstes Mal klappt es!' : p1Name + ' verliert!';
    }
  } else {
    const subTexts = ['Perfekter Abschluss! 🎯', 'Stark gespielt!', 'Gut gemacht!', 'Weiter so!'];
    sub = darts <= 9 ? subTexts[0] : darts <= 18 ? subTexts[1] : darts <= 27 ? subTexts[2] : subTexts[3];
  }

  document.querySelector('.win-title').textContent = title;
  document.getElementById('win-sub').textContent = sub;

  showPage('win');
  startCountdown();
}

function startCountdown() {
  let n = 5;
  const numEl = document.getElementById('countdown-num');
  const circle = document.getElementById('countdown-circle');
  const circumference = 150.8;

  numEl.textContent = n;
  circle.style.transition = 'none';
  circle.style.strokeDashoffset = 0;
  // Force reflow
  void circle.getBoundingClientRect();
  circle.style.transition = 'stroke-dashoffset 1s linear';

  const interval = setInterval(() => {
    n--;
    numEl.textContent = n;
    // offset goes from 0 (full) to circumference (empty) as n goes 5→0
    circle.style.strokeDashoffset = circumference * ((5 - n) / 5);
    if (n <= 0) {
      clearInterval(interval);
      setTimeout(() => showPage('start'), 1000);
    }
  }, 1000);
}

function announceWin(winner = 'human') {
  if (!settings.speech) return;
  if (winner === 'human') speak('Glückwunsch! Du hast gewonnen!');
  else speak(gameConfig.playerMode === 'cpu' ? 'Die KI hat gewonnen!' : 'Spieler zwei hat gewonnen!');
}

// ════════════════════════════════════════════
//  SPEECH
// ════════════════════════════════════════════
function speak(text, onDone) {
  if (!settings.speech || !window.speechSynthesis) { if (onDone) onDone(); return; }
  // Chrome bug workaround: resume if paused/stuck
  if (window.speechSynthesis.paused) window.speechSynthesis.resume();
  window.speechSynthesis.cancel();
  // Small delay after cancel to avoid Chrome swallowing the next utterance
  setTimeout(() => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'de-DE';
    utter.volume = settings.volume;
    utter.rate = 1.0;
    if (onDone) utter.onend = onDone;
    // Chrome fix: keep synthesis alive with a periodic resume
    const keepAlive = setInterval(() => {
      if (!window.speechSynthesis.speaking) { clearInterval(keepAlive); return; }
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }, 10000);
    utter.onend = () => { clearInterval(keepAlive); if (onDone) onDone(); };
    utter.onerror = () => { clearInterval(keepAlive); if (onDone) onDone(); };
    window.speechSynthesis.speak(utter);
  }, 80);
}

function speakRound(scored, remaining) {
  let msg = '';
  if (scored === 0) {
    msg = 'Null Punkte. Rest ' + remaining;
  } else {
    msg = scored + ' Punkte. Rest ' + remaining;
    if (remaining <= 50 && remaining > 0) {
      const checkout = getCheckoutHint(remaining);
      if (checkout) msg += '. Checkout ' + checkout;
    }
  }
  speak(msg);
}

function getCheckoutHint(n) {
  const checkouts = {
    2: 'Double 1', 4: 'Double 2', 6: 'Double 3', 8: 'Double 4',
    10: 'Double 5', 12: 'Double 6', 14: 'Double 7', 16: 'Double 8',
    18: 'Double 9', 20: 'Double 10', 22: 'Double 11', 24: 'Double 12',
    26: 'Double 13', 28: 'Double 14', 30: 'Double 15', 32: 'Double 16',
    50: 'Bull', 40: 'Double 20', 36: 'Double 18',
  };
  if (gameConfig.outRule === 'single') return null;
  return checkouts[n] || null;
}
