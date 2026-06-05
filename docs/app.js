/* ── Town of Salem Dashboard — GitHub Pages Edition ─────────────── */

const PERSONALITY_LABELS = {
  aggressive_accuser:   'Aggressive Accuser',
  quiet_observer:       'Quiet Observer',
  overconfident_townie: 'Overconfident',
  paranoid_deflector:   'Paranoid',
  smooth_liar:          'Smooth Liar',
  data_driven_logician: 'Logician',
  bandwagon_follower:   'Bandwagon',
  chaos_agent:          'Chaos Agent',
  protective_leader:    'Protector',
  anxious_newcomer:     'Anxious',
};

const FACTION_ROLES = {
  Godfather:'mafia', Mafioso:'mafia', Consigliere:'mafia',
  Jester:'jester', 'Serial Killer':'neutral',
};

const ROLE_ICONS = {
  Sheriff:'🔍', Doctor:'🏥', Investigator:'🕵️', Escort:'💃',
  Vigilante:'🔫', Mayor:'🎩', Godfather:'💼', Mafioso:'🗡️',
  Consigliere:'📋', Jester:'🃏', 'Serial Killer':'🪓',
};

const EVENT_ICONS = {
  DEATH:'💀', SAVE:'🛡️', ROLEBLOCK:'🚫', INVESTIGATION:'🔍',
  VOTE:'🗳️', VERDICT:'⚖️', LYNCH:'🪢', TRIAL:'⚖️',
  TALLY:'📊', CLAIM:'💬', SPARED:'🕊️', LAST_WILL:'📜',
  JESTER_WIN:'🃏', GUILT:'😰', INFO:'ℹ️',
};

const COST_ESTIMATES = { '7':'~$0.10–0.15', '9':'~$0.20–0.28', '11':'~$0.35–0.45' };

// ── DOM helpers ───────────────────────────────────────────────────

const $ = id => document.getElementById(id);
function sanitize(str) { const d = document.createElement('div'); d.textContent = str ?? ''; return d.innerHTML; }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── API Key ───────────────────────────────────────────────────────

function getApiKey() { return localStorage.getItem('anthropic_api_key') ?? ''; }
function saveApiKey(k) { localStorage.setItem('anthropic_api_key', k.trim()); }

// ── Landing / Game visibility ─────────────────────────────────────

function showGame() {
  $('landing').classList.add('hidden');
  document.querySelectorAll('.game-ui').forEach(el => el.classList.remove('hidden'));
  updateKeyChip();
}

function showLanding() {
  document.querySelectorAll('.game-ui').forEach(el => el.classList.add('hidden'));
  $('landing').classList.remove('hidden');
  $('landing-key-input').value = getApiKey();
  $('landing-error').textContent = '';
}

function updateKeyChip() {
  const key = getApiKey();
  const chip = $('key-chip');
  if (!chip) return;
  if (key) {
    chip.textContent = `🔑 …${key.slice(-6)}`;
    chip.classList.add('has-key');
  } else {
    chip.textContent = '🔑 No key';
    chip.classList.remove('has-key');
  }
}

// ── Landing interactions ──────────────────────────────────────────

// Exposed as a global so the inline onclick on the button always fires,
// even if an earlier JS error prevented addEventListener from running.
window.handleContinue = function () {
  const key = ($('landing-key-input').value || '').trim();
  const errEl = $('landing-error');

  if (!key) {
    errEl.textContent = 'Please paste your Anthropic API key above.';
    $('landing-key-input').focus();
    return;
  }

  errEl.textContent = '';
  saveApiKey(key);
  showGame();
};

// Enter key submits
$('landing-key-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') window.handleContinue();
});

// Key chip in header → back to landing (to change key)
$('key-chip').addEventListener('click', showLanding);

// ── Initial routing ───────────────────────────────────────────────

if (getApiKey()) showGame();
else showLanding();

// ── Game state ────────────────────────────────────────────────────

let state = {
  players: {},
  spectatorMode: true,
  queue: [],
  processing: false,
  running: false,
};

// ── Feed rendering ────────────────────────────────────────────────

const feed        = $('chat-feed');
const eventLog    = $('event-log');
const playerCards = $('player-cards');
const phaseIcon   = $('phase-icon');
const phaseText   = $('phase-text');
const cycleText   = $('cycle-text');
const aliveCount  = $('alive-count');
const startBtn    = $('start-btn');
const statusMsg   = $('status-msg');

function setStatus(msg, color = '') { statusMsg.textContent = msg; statusMsg.style.color = color || ''; }

function appendFeed(el) {
  feed.appendChild(el);
  if ($('autoscroll-check').checked) feed.scrollTop = feed.scrollHeight;
}

function makePhaseBanner(phase, cycle) {
  const isNight = phase === 'NIGHT';
  const icon = isNight ? '🌙' : (phase === 'DAY_VOTING' ? '⚖' : '☀');
  const label = isNight ? 'Night' : (phase === 'DAY_VOTING' ? 'Trial' : 'Day');
  const el = document.createElement('div');
  el.className = `feed-item feed-phase ${isNight ? 'night-phase' : ''}`;
  el.innerHTML = `<div class="phase-banner">${icon} ${label} ${cycle}</div>`;
  return el;
}

function makeChatBubble(playerName, message, channel) {
  const isDefense = channel === 'defense', isMafia = channel === 'mafia';
  const el = document.createElement('div');
  el.className = `feed-item feed-chat ${isMafia ? 'mafia-speaker spectator-hidden' : ''} ${isDefense ? 'defense-speaker' : ''}`;
  const defLabel = isDefense ? '<span class="label">🪢 On Trial</span>' : '';
  const mafLabel = isMafia   ? '<span class="label">🔴 MAFIA (secret)</span>' : '';
  el.innerHTML = `<div class="speaker">${sanitize(playerName)} ${defLabel}${mafLabel}</div><div class="message-text">${sanitize(message)}</div>`;
  if (!state.spectatorMode && isMafia) el.style.display = 'none';
  return el;
}

function makePrivateBubble(playerName, reasoning) {
  const el = document.createElement('div');
  el.className = 'feed-item feed-private spectator-hidden';
  el.innerHTML = `<div class="speaker">${sanitize(playerName)} <span class="label">💭 thinks:</span></div><div class="message-text">${sanitize(reasoning)}</div>`;
  if (!state.spectatorMode) el.style.display = 'none';
  return el;
}

function makeNarration(text) {
  const el = document.createElement('div');
  el.className = 'feed-item feed-narration';
  el.innerHTML = `<div class="narration-text">${sanitize(text)}</div>`;
  return el;
}

function makeInfoLine(msg) {
  const el = document.createElement('div');
  el.className = 'feed-item feed-info';
  el.textContent = msg;
  return el;
}

// ── Event log ─────────────────────────────────────────────────────

function addEventLog(type, description) {
  const el = document.createElement('div');
  el.className = `event-item ${type.toLowerCase().replace('_','-')}`;
  el.innerHTML = `<span class="event-icon">${EVENT_ICONS[type]??'•'}</span><span class="event-desc">${sanitize(description)}</span>`;
  eventLog.prepend(el);
}

// ── Player cards ──────────────────────────────────────────────────

function renderPlayerCard(p) {
  const faction = FACTION_ROLES[p.role] ?? 'town';
  const icon = ROLE_ICONS[p.role] ?? '👤';
  const personality = PERSONALITY_LABELS[p.personality] ?? p.personality;
  let card = $(`player-card-${p.id}`);
  if (!card) { card = document.createElement('div'); card.id = `player-card-${p.id}`; playerCards.appendChild(card); }
  card.className = `player-card ${faction} ${p.alive ? '' : 'dead'}`;
  const roleDisplay = state.spectatorMode ? `${icon} ${p.role}` : (p.alive ? '???' : `${icon} ${p.role}`);
  const deathLine = !p.alive && p.cause ? `<div class="player-death-cause">${sanitize(p.cause)}</div>` : '';
  card.innerHTML = `
    <div class="player-name"><span>${sanitize(p.name)}</span><span class="player-status-icon">${p.alive?'🟢':'💀'}</span></div>
    <div class="player-role">${roleDisplay}</div>
    <div class="player-personality">${sanitize(personality)}</div>
    ${deathLine}`;
}

function markPlayerDead(playerId, role, cause) {
  const p = state.players[playerId];
  if (!p) return;
  p.alive = false; p.role = role ?? p.role; p.cause = cause;
  const card = $(`player-card-${playerId}`);
  if (card) { card.classList.add('just-died'); setTimeout(()=>card.classList.remove('just-died'), 1200); }
  renderPlayerCard(p);
  updateAliveCount();
}

function updateAliveCount() {
  const alive = Object.values(state.players).filter(p=>p.alive).length;
  aliveCount.textContent = `${alive} / ${Object.values(state.players).length} alive`;
}

function updatePhaseDisplay(phase, cycle) {
  const isNight = phase === 'NIGHT';
  phaseIcon.textContent = isNight ? '🌙' : (phase === 'DAY_VOTING' ? '⚖' : '☀');
  phaseText.textContent = isNight ? 'Night' : (phase === 'DAY_VOTING' ? 'Voting' : 'Day');
  cycleText.textContent = `Cycle ${cycle}`;
}

// ── Spectator mode ────────────────────────────────────────────────

const spectatorBtn = $('spectator-btn');

function applySpectatorMode() {
  const show = state.spectatorMode;
  document.querySelectorAll('.spectator-hidden').forEach(el => { el.style.display = show ? '' : 'none'; });
  spectatorBtn.textContent = `👁 Spectator: ${show ? 'ON' : 'OFF'}`;
  spectatorBtn.classList.toggle('active', show);
  Object.values(state.players).forEach(p => renderPlayerCard(p));
}

spectatorBtn.addEventListener('click', () => { state.spectatorMode = !state.spectatorMode; applySpectatorMode(); });

// ── Event queue ───────────────────────────────────────────────────

function getEventDelay({ type, payload }) {
  if (type === 'game_over')    return 2000;
  if (type === 'phase')        return 1200;
  if (type === 'narration')    return 1500;
  if (type === 'chat')         return payload?.channel === 'mafia' ? 800 : 2000;
  if (type === 'private')      return 800;
  if (type === 'night_action') return 400;
  if (type === 'info')         return 500;
  if (type === 'event') {
    if (payload?.eventType === 'DEATH')     return 2500;
    if (payload?.eventType === 'LYNCH')     return 2000;
    if (payload?.eventType === 'TRIAL')     return 1800;
    if (payload?.eventType === 'SPARED')    return 1800;
    if (payload?.eventType === 'LAST_WILL') return 2000;
    if (payload?.eventType === 'SAVE')      return 1200;
    if (['VERDICT','TALLY'].includes(payload?.eventType)) return 1000;
    return 700;
  }
  return 400;
}

async function processQueue() {
  state.processing = true;
  while (state.queue.length > 0) { const ev = state.queue.shift(); processEvent(ev); await delay(getEventDelay(ev)); }
  state.processing = false;
}

function enqueue(ev) { state.queue.push(ev); if (!state.processing) processQueue(); }

function processEvent({ type, payload }) {
  switch (type) {
    case 'setup':
      for (const p of payload.players) { state.players[p.id] = { ...p, cause:null }; renderPlayerCard(state.players[p.id]); }
      updateAliveCount();
      appendFeed(makeInfoLine(`⚔ Game starting — ${payload.players.length} players`));
      break;

    case 'phase':
      updatePhaseDisplay(payload.phase, payload.cycle);
      appendFeed(makePhaseBanner(payload.phase, payload.cycle));
      break;

    case 'chat':
      appendFeed(makeChatBubble(payload.playerName, payload.message, payload.channel));
      break;

    case 'private':
      appendFeed(makePrivateBubble(payload.playerName, payload.reasoning));
      break;

    case 'narration':
      appendFeed(makeNarration(payload.text));
      break;

    case 'info':
      appendFeed(makeInfoLine(payload.message));
      break;

    case 'night_action':
      if (state.spectatorMode && payload.targetName)
        appendFeed(makeInfoLine(`🌙 ${payload.playerName} (${payload.role}) → ${payload.targetName}`));
      break;

    case 'event': {
      const { eventType, description, playerId, role, cause } = payload;
      addEventLog(eventType, description);
      if (eventType === 'DEATH') {
        const el = document.createElement('div');
        el.className = 'feed-item feed-narration';
        el.innerHTML = `<div class="narration-text" style="color:var(--mafia)">💀 ${sanitize(description)}</div>`;
        appendFeed(el);
        markPlayerDead(playerId, role, cause);
      } else if (['TRIAL','SPARED'].includes(eventType)) {
        const el = document.createElement('div');
        el.className = 'feed-item feed-narration';
        el.innerHTML = `<div class="narration-text" style="color:var(--gold)">⚖ ${sanitize(description)}</div>`;
        appendFeed(el);
      } else if (eventType === 'SAVE')    appendFeed(makeInfoLine(`🛡️ ${description}`));
      else if (eventType === 'ROLEBLOCK') appendFeed(makeInfoLine(`🚫 ${description}`));
      else if (eventType === 'LAST_WILL') {
        const el = document.createElement('div');
        el.className = 'feed-item feed-chat';
        el.innerHTML = `<div class="speaker" style="color:var(--text-dim)">📜 Last Will</div><div class="message-text" style="font-style:italic">${sanitize(payload.will)}</div>`;
        appendFeed(el);
      } else if (eventType === 'TALLY') appendFeed(makeInfoLine(`📊 ${description}`));
      else if (eventType === 'VERDICT') {
        const vColor = { guilty:'var(--mafia)', innocent:'var(--town)', abstain:'var(--text-dim)' }[payload.verdict] ?? '';
        const el = document.createElement('div');
        el.className = 'feed-item feed-info';
        el.style.color = vColor;
        el.textContent = `⚖ ${description}`;
        appendFeed(el);
      } else if (eventType === 'JESTER_WIN') appendFeed(makeNarration(`🃏 ${description}`));
      break;
    }

    case 'game_over':
      showGameOverModal(payload);
      startBtn.disabled = false;
      startBtn.textContent = '▶ Start New Game';
      state.running = false;
      setStatus('Game complete!', 'var(--gold)');
      break;

    case 'error':
      setStatus(`Error: ${payload.message}`, 'var(--mafia)');
      startBtn.disabled = false;
      state.running = false;
      break;
  }
}

// ── Game over modal ───────────────────────────────────────────────

function showGameOverModal({ winner, reason, players }) {
  const icons = { Town:'🏛️', Mafia:'🔪', 'Serial Killer':'🪓', Jester:'🃏', Draw:'⚖️' };
  $('modal-icon').textContent = icons[winner] ?? '🏁';
  $('modal-winner').textContent = `${winner} Wins!`;
  $('modal-reason').textContent = reason;
  const rosterEl = $('modal-roster');
  rosterEl.innerHTML = '';
  for (const p of players) {
    const div = document.createElement('div');
    div.className = `modal-player ${p.alive ? '' : 'dead'}`;
    div.innerHTML = `<div class="mp-name">${sanitize(p.name)}</div><div class="mp-role">${ROLE_ICONS[p.role]??'👤'} ${sanitize(p.role)}</div><div class="mp-status">${p.alive?'✅':'💀'}</div>`;
    rosterEl.appendChild(div);
  }
  $('modal-overlay').classList.remove('hidden');
}

$('modal-close').addEventListener('click', () => $('modal-overlay').classList.add('hidden'));

// ── Start game ────────────────────────────────────────────────────

async function startGame() {
  const apiKey = getApiKey();
  if (!apiKey) { showLanding(); return; }

  const playerCount = parseInt($('player-select').value);
  feed.innerHTML = '';
  eventLog.innerHTML = '';
  playerCards.innerHTML = '';
  state.players = {};
  state.queue = [];
  state.processing = false;
  state.running = true;
  aliveCount.textContent = '';
  phaseIcon.textContent = '🏛';
  phaseText.textContent = 'Starting…';
  cycleText.textContent = '';
  $('modal-overlay').classList.add('hidden');

  startBtn.disabled = true;
  startBtn.textContent = '⏳ Running…';
  setStatus(`Running ${playerCount}-player simulation…`);

  try {
    await window.GameEngine.run(apiKey, playerCount, (type, payload) => enqueue({ type, payload }));
  } catch (err) {
    enqueue({ type:'error', payload:{ message: err.message } });
  }
}

startBtn.addEventListener('click', startGame);

// ── Cost estimate dropdown ────────────────────────────────────────

function updateCostEstimate() {
  const el = $('cost-estimate');
  if (el) el.textContent = COST_ESTIMATES[$('player-select').value] ?? '';
}
$('player-select').addEventListener('change', updateCostEstimate);
updateCostEstimate();

// ── Init ──────────────────────────────────────────────────────────

applySpectatorMode();
