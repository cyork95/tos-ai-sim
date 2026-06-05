/* ── Town of Salem Dashboard — GitHub Pages / Browser Edition ─────── */

const PERSONALITIES = {
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

// ── State ─────────────────────────────────────────────────────────────

let state = {
  players: {},
  spectatorMode: true,
  queue: [],
  processing: false,
  running: false,
};

// ── DOM ───────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);
const feed        = $('chat-feed');
const eventLog    = $('event-log');
const playerCards = $('player-cards');
const phaseIcon   = $('phase-icon');
const phaseText   = $('phase-text');
const cycleText   = $('cycle-text');
const aliveCount  = $('alive-count');
const startBtn    = $('start-btn');
const statusMsg   = $('status-msg');
const spectatorBtn = $('spectator-btn');
const keyIndicator = $('key-indicator');

// ── API Key Management ────────────────────────────────────────────────

function getApiKey() { return localStorage.getItem('anthropic_api_key') ?? ''; }
function saveApiKey(k) { localStorage.setItem('anthropic_api_key', k.trim()); updateKeyIndicator(); }

function updateKeyIndicator() {
  const key = getApiKey();
  if (key) {
    keyIndicator.textContent = `🔑 …${key.slice(-6)}`;
    keyIndicator.classList.add('has-key');
  } else {
    keyIndicator.textContent = '🔑 No key';
    keyIndicator.classList.remove('has-key');
  }
}

function showSettingsModal() { $('settings-overlay').classList.remove('hidden'); $('api-key-input').value = getApiKey(); }
function hideSettingsModal() { $('settings-overlay').classList.add('hidden'); }

$('settings-save').addEventListener('click', () => {
  const k = $('api-key-input').value.trim();
  if (!k.startsWith('sk-ant-')) { alert('That doesn\'t look like an Anthropic key (should start with sk-ant-).'); return; }
  saveApiKey(k);
  hideSettingsModal();
  setStatus('API key saved. Click Start to run a simulation.');
});

$('settings-cancel').addEventListener('click', hideSettingsModal);
keyIndicator.addEventListener('click', showSettingsModal);

// Show modal on first visit (no key stored)
if (!getApiKey()) showSettingsModal();
else hideSettingsModal();
updateKeyIndicator();

// ── Helpers ───────────────────────────────────────────────────────────

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function sanitize(str) { const d = document.createElement('div'); d.textContent = str ?? ''; return d.innerHTML; }
function setStatus(msg, color = '') { statusMsg.textContent = msg; statusMsg.style.color = color || ''; }

// ── Feed Rendering ────────────────────────────────────────────────────

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
  const defLabel  = isDefense ? '<span class="label">🪢 On Trial</span>' : '';
  const mafLabel  = isMafia   ? '<span class="label">🔴 MAFIA (secret)</span>' : '';
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

// ── Event Log ─────────────────────────────────────────────────────────

function addEventLog(type, description) {
  const el = document.createElement('div');
  el.className = `event-item ${type.toLowerCase().replace('_','-')}`;
  el.innerHTML = `<span class="event-icon">${EVENT_ICONS[type]??'•'}</span><span class="event-desc">${sanitize(description)}</span>`;
  eventLog.prepend(el);
}

// ── Player Cards ──────────────────────────────────────────────────────

function renderPlayerCard(p) {
  const faction = FACTION_ROLES[p.role] ?? 'town';
  const icon = ROLE_ICONS[p.role] ?? '👤';
  const personality = PERSONALITIES[p.personality] ?? p.personality;
  let card = document.getElementById(`player-card-${p.id}`);
  if (!card) { card = document.createElement('div'); card.id = `player-card-${p.id}`; playerCards.appendChild(card); }
  card.className = `player-card ${faction} ${p.alive ? '' : 'dead'}`;
  const roleDisplay = state.spectatorMode ? `${icon} ${p.role}` : (p.alive ? '???' : `${icon} ${p.role}`);
  const deathLine = !p.alive && p.cause ? `<div class="player-death-cause">${sanitize(p.cause)}</div>` : '';
  card.innerHTML = `
    <div class="player-name"><span>${sanitize(p.name)}</span><span class="player-status-icon">${p.alive?'🟢':'💀'}</span></div>
    <div class="player-role">${roleDisplay}</div>
    <div class="player-personality">${sanitize(personality)}</div>
    ${deathLine}
  `;
}

function markPlayerDead(playerId, role, cause) {
  const p = state.players[playerId];
  if (!p) return;
  p.alive = false; p.role = role ?? p.role; p.cause = cause;
  const card = document.getElementById(`player-card-${playerId}`);
  if (card) { card.classList.add('just-died'); setTimeout(()=>card.classList.remove('just-died'), 1200); }
  renderPlayerCard(p);
  updateAliveCount();
}

function updateAliveCount() {
  const alive = Object.values(state.players).filter(p=>p.alive).length;
  const total = Object.values(state.players).length;
  aliveCount.textContent = `${alive} / ${total} alive`;
}

function updatePhaseDisplay(phase, cycle) {
  const isNight = phase === 'NIGHT';
  phaseIcon.textContent = isNight ? '🌙' : (phase === 'DAY_VOTING' ? '⚖' : '☀');
  phaseText.textContent  = isNight ? 'Night' : (phase === 'DAY_VOTING' ? 'Voting' : 'Day');
  cycleText.textContent  = `Cycle ${cycle}`;
}

// ── Spectator Mode ────────────────────────────────────────────────────

function applySpectatorMode() {
  const show = state.spectatorMode;
  document.querySelectorAll('.spectator-hidden').forEach(el => { el.style.display = show ? '' : 'none'; });
  spectatorBtn.textContent = `👁 Spectator: ${show ? 'ON' : 'OFF'}`;
  spectatorBtn.classList.toggle('active', show);
  Object.values(state.players).forEach(p => renderPlayerCard(p));
}

spectatorBtn.addEventListener('click', () => { state.spectatorMode = !state.spectatorMode; applySpectatorMode(); });

// ── Event Queue ───────────────────────────────────────────────────────

function getEventDelay({ type, payload }) {
  if (type === 'game_over')  return 2000;
  if (type === 'phase')      return 1200;
  if (type === 'narration')  return 1500;
  if (type === 'chat')       return payload?.channel === 'mafia' ? 800 : 2000;
  if (type === 'private')    return 800;
  if (type === 'night_action') return 400;
  if (type === 'info')       return 500;
  if (type === 'event') {
    if (payload?.eventType === 'DEATH')    return 2500;
    if (payload?.eventType === 'LYNCH')    return 2000;
    if (payload?.eventType === 'TRIAL')    return 1800;
    if (payload?.eventType === 'SPARED')   return 1800;
    if (payload?.eventType === 'LAST_WILL') return 2000;
    if (payload?.eventType === 'SAVE')     return 1200;
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
      if (state.spectatorMode && payload.targetName) {
        appendFeed(makeInfoLine(`🌙 ${payload.playerName} (${payload.role}) → ${payload.targetName}`));
      }
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
      } else if (eventType === 'SAVE')       appendFeed(makeInfoLine(`🛡️ ${description}`));
      else if (eventType === 'ROLEBLOCK')    appendFeed(makeInfoLine(`🚫 ${description}`));
      else if (eventType === 'LAST_WILL') {
        const el = document.createElement('div');
        el.className = 'feed-item feed-chat';
        el.innerHTML = `<div class="speaker" style="color:var(--text-dim)">📜 Last Will</div><div class="message-text" style="font-style:italic">${sanitize(payload.will)}</div>`;
        appendFeed(el);
      } else if (eventType === 'TALLY')  appendFeed(makeInfoLine(`📊 ${description}`));
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
      setStatus('Game over!', 'var(--gold)');
      break;

    case 'error':
      setStatus(`Error: ${payload.message}`, 'var(--mafia)');
      startBtn.disabled = false;
      state.running = false;
      break;
  }
}

// ── Game Over Modal ───────────────────────────────────────────────────

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

// ── Start Game ────────────────────────────────────────────────────────

async function startGame() {
  const apiKey = getApiKey();
  if (!apiKey) { showSettingsModal(); return; }

  const playerCount = parseInt($('player-select').value);

  // Reset UI
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

  // Run entirely in browser
  try {
    await window.GameEngine.run(
      apiKey,
      playerCount,
      (type, payload) => enqueue({ type, payload, ts: Date.now() })
    );
  } catch (err) {
    enqueue({ type:'error', payload:{ message: err.message } });
  }
}

startBtn.addEventListener('click', startGame);

// ── Init ──────────────────────────────────────────────────────────────

applySpectatorMode();
