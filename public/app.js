/* ── Town of Salem Dashboard — Frontend ─────────────────────────────── */

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
  Godfather: 'mafia', Mafioso: 'mafia', Consigliere: 'mafia',
  Jester: 'jester',
  'Serial Killer': 'neutral',
};

const ROLE_ICONS = {
  Sheriff: '🔍', Doctor: '🏥', Investigator: '🕵️', Escort: '💃',
  Vigilante: '🔫', Mayor: '🎩',
  Godfather: '💼', Mafioso: '🗡️', Consigliere: '📋',
  Jester: '🃏', 'Serial Killer': '🪓',
};

const EVENT_ICONS = {
  DEATH: '💀', SAVE: '🛡️', ROLEBLOCK: '🚫', INVESTIGATION: '🔍',
  VOTE: '🗳️', VERDICT: '⚖️', LYNCH: '🪢', TRIAL: '⚖️',
  TALLY: '📊', CLAIM: '💬', SPARED: '🕊️', LAST_WILL: '📜',
  JESTER_WIN: '🃏', GUILT: '😰', INFO: 'ℹ️',
};

// ── State ─────────────────────────────────────────────────────────────

let state = {
  gameId: null,
  players: {},        // id → { name, role, personality, alive, cause }
  phase: null,
  cycle: 0,
  spectatorMode: true,
  evtSource: null,
  queue: [],
  processing: false,
};

// ── DOM Refs ──────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);
const feed       = $('chat-feed');
const eventLog   = $('event-log');
const playerCards = $('player-cards');
const phaseIcon  = $('phase-icon');
const phaseText  = $('phase-text');
const cycleText  = $('cycle-text');
const aliveCount = $('alive-count');
const startBtn   = $('start-btn');
const spectatorBtn = $('spectator-btn');
const statusMsg  = $('status-msg');
const modalOverlay = $('modal-overlay');

// ── Helpers ───────────────────────────────────────────────────────────

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function factionFor(role) {
  return FACTION_ROLES[role] ?? 'town';
}

function sanitize(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function setStatus(msg, color = '') {
  statusMsg.textContent = msg;
  statusMsg.style.color = color || '';
}

// ── Feed rendering ────────────────────────────────────────────────────

function appendFeed(el) {
  feed.appendChild(el);
  if ($('autoscroll-check').checked) {
    feed.scrollTop = feed.scrollHeight;
  }
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
  const el = document.createElement('div');
  const isDefense = channel === 'defense';
  const isMafia   = channel === 'mafia';
  el.className = `feed-item feed-chat ${isMafia ? 'mafia-speaker spectator-hidden' : ''} ${isDefense ? 'defense-speaker' : ''}`;

  const label = isMafia ? '<span class="label">🔴 MAFIA (secret)</span>' : '';
  const defLabel = isDefense ? '<span class="label">🪢 On Trial</span>' : '';
  el.innerHTML = `
    <div class="speaker">${sanitize(playerName)} ${defLabel}${label}</div>
    <div class="message-text">${sanitize(message)}</div>
  `;
  return el;
}

function makePrivateBubble(playerName, reasoning) {
  const el = document.createElement('div');
  el.className = 'feed-item feed-private spectator-hidden';
  el.innerHTML = `
    <div class="speaker">${sanitize(playerName)} <span class="label">💭 thinks:</span></div>
    <div class="message-text">${sanitize(reasoning)}</div>
  `;
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
  const cls = type.toLowerCase().replace('_', '-');
  el.className = `event-item ${cls}`;
  const icon = EVENT_ICONS[type] ?? '•';
  el.innerHTML = `<span class="event-icon">${icon}</span><span class="event-desc">${sanitize(description)}</span>`;
  eventLog.prepend(el); // newest at top
}

// ── Player Cards ──────────────────────────────────────────────────────

function renderPlayerCard(p) {
  const faction = factionFor(p.role);
  const icon = ROLE_ICONS[p.role] ?? '👤';
  const personalityLabel = PERSONALITIES[p.personality] ?? p.personality;

  let card = document.getElementById(`player-card-${p.id}`);
  const isNew = !card;
  if (isNew) {
    card = document.createElement('div');
    card.id = `player-card-${p.id}`;
    playerCards.appendChild(card);
  }

  card.className = `player-card ${faction} ${p.alive ? '' : 'dead'}`;
  const statusIcon = p.alive ? '🟢' : '💀';
  const deathLine = !p.alive && p.cause
    ? `<div class="player-death-cause">${sanitize(p.cause)}</div>`
    : '';
  const roleDisplay = state.spectatorMode ? `${icon} ${p.role}` : (p.alive ? '???' : `${icon} ${p.role}`);

  card.innerHTML = `
    <div class="player-name">
      <span>${sanitize(p.name)}</span>
      <span class="player-status-icon">${statusIcon}</span>
    </div>
    <div class="player-role">${roleDisplay}</div>
    <div class="player-personality">${sanitize(personalityLabel)}</div>
    ${deathLine}
  `;
}

function renderAllCards() {
  for (const p of Object.values(state.players)) renderPlayerCard(p);
}

function markPlayerDead(playerId, role, cause) {
  const p = state.players[playerId];
  if (!p) return;
  p.alive = false;
  p.role = role ?? p.role;
  p.cause = cause;
  const card = document.getElementById(`player-card-${playerId}`);
  if (card) {
    card.classList.add('just-died');
    setTimeout(() => card.classList.remove('just-died'), 1200);
  }
  renderPlayerCard(p);
  updateAliveCount();
}

function updateAliveCount() {
  const alive = Object.values(state.players).filter(p => p.alive).length;
  const total = Object.values(state.players).length;
  aliveCount.textContent = `${alive} / ${total} alive`;
}

function updatePhaseDisplay(phase, cycle) {
  const isNight = phase === 'NIGHT';
  state.phase = phase;
  state.cycle = cycle;
  phaseIcon.textContent = isNight ? '🌙' : (phase === 'DAY_VOTING' ? '⚖' : '☀');
  phaseText.textContent = isNight ? 'Night' : (phase === 'DAY_VOTING' ? 'Voting' : 'Day');
  cycleText.textContent = `Cycle ${cycle}`;
  document.body.style.setProperty('--active-accent', isNight ? 'var(--night-accent)' : 'var(--day-accent)');
}

// ── Spectator Mode ────────────────────────────────────────────────────

function applySpectatorMode() {
  const hidden = !state.spectatorMode;
  document.querySelectorAll('.spectator-hidden').forEach(el => {
    el.style.display = hidden ? 'none' : '';
  });
  spectatorBtn.textContent = `👁 Spectator: ${state.spectatorMode ? 'ON' : 'OFF'}`;
  spectatorBtn.classList.toggle('active', state.spectatorMode);
  renderAllCards(); // re-render to show/hide roles
}

// ── Event Processing Queue ────────────────────────────────────────────

function getEventDelay(ev) {
  switch (ev.type) {
    case 'setup':       return 400;
    case 'phase':       return 600;
    case 'chat':        return ev.payload.channel === 'mafia' ? 200 : 700;
    case 'private':     return 100;
    case 'narration':   return 800;
    case 'event':
      if (ev.payload.eventType === 'DEATH') return 1200;
      if (ev.payload.eventType === 'LYNCH') return 1000;
      if (['VERDICT','TALLY'].includes(ev.payload.eventType)) return 500;
      return 350;
    case 'night_action': return 150;
    case 'info':        return 200;
    case 'game_over':   return 1500;
    default:            return 200;
  }
}

async function processQueue() {
  state.processing = true;
  while (state.queue.length > 0) {
    const ev = state.queue.shift();
    processEvent(ev);
    await delay(getEventDelay(ev));
  }
  state.processing = false;
}

function enqueue(ev) {
  state.queue.push(ev);
  if (!state.processing) processQueue();
}

function processEvent(ev) {
  const { type, payload } = ev;

  switch (type) {
    case 'setup': {
      // Init players
      for (const p of payload.players) {
        state.players[p.id] = { ...p, cause: null };
        renderPlayerCard(state.players[p.id]);
      }
      updateAliveCount();
      appendFeed(makeInfoLine(`⚔ Game starting — ${payload.players.length} players`));
      break;
    }

    case 'phase': {
      updatePhaseDisplay(payload.phase, payload.cycle);
      appendFeed(makePhaseBanner(payload.phase, payload.cycle));
      break;
    }

    case 'chat': {
      appendFeed(makeChatBubble(payload.playerName, payload.message, payload.channel));
      if (!state.spectatorMode && (payload.channel === 'mafia')) break;
      break;
    }

    case 'private': {
      appendFeed(makePrivateBubble(payload.playerName, payload.reasoning));
      break;
    }

    case 'narration': {
      appendFeed(makeNarration(payload.text));
      break;
    }

    case 'info': {
      appendFeed(makeInfoLine(payload.message));
      break;
    }

    case 'night_action': {
      // Only show in spectator mode; shown as quiet info
      if (state.spectatorMode) {
        const action = payload.targetName
          ? `${payload.playerName} (${payload.role}) → ${payload.targetName}`
          : `${payload.playerName} (${payload.role}) → no action`;
        appendFeed(makeInfoLine(`🌙 ${action}`));
      }
      break;
    }

    case 'event': {
      const { eventType, description, playerId, role, cause } = payload;
      addEventLog(eventType, description);

      if (eventType === 'DEATH') {
        appendFeed((() => {
          const el = document.createElement('div');
          el.className = 'feed-item feed-narration';
          el.innerHTML = `<div class="narration-text" style="color:var(--mafia)">💀 ${sanitize(description)}</div>`;
          return el;
        })());
        markPlayerDead(playerId, role, cause);
      } else if (['TRIAL','SPARED','LYNCH'].includes(eventType)) {
        appendFeed((() => {
          const el = document.createElement('div');
          el.className = 'feed-item feed-narration';
          el.innerHTML = `<div class="narration-text" style="color:var(--gold)">⚖ ${sanitize(description)}</div>`;
          return el;
        })());
      } else if (eventType === 'SAVE') {
        appendFeed(makeInfoLine(`🛡️ ${description}`));
      } else if (eventType === 'ROLEBLOCK') {
        appendFeed(makeInfoLine(`🚫 ${description}`));
      } else if (eventType === 'LAST_WILL') {
        const el = document.createElement('div');
        el.className = 'feed-item feed-chat';
        el.innerHTML = `
          <div class="speaker" style="color:var(--text-dim)">📜 Last Will</div>
          <div class="message-text" style="font-style:italic">${sanitize(payload.will)}</div>
        `;
        appendFeed(el);
      } else if (eventType === 'TALLY') {
        appendFeed(makeInfoLine(`📊 ${description}`));
      } else if (eventType === 'VERDICT') {
        const vColor = { guilty: 'var(--mafia)', innocent: 'var(--town)', abstain: 'var(--text-dim)' }[payload.verdict] ?? '';
        const el = document.createElement('div');
        el.className = 'feed-item feed-info';
        el.style.color = vColor;
        el.textContent = `⚖ ${description}`;
        appendFeed(el);
      } else if (eventType === 'JESTER_WIN') {
        appendFeed(makeNarration(`🃏 ${description}`));
      }
      break;
    }

    case 'game_over': {
      showGameOverModal(payload);
      startBtn.disabled = false;
      startBtn.textContent = '▶ Start New Game';
      setStatus('Game over!', 'var(--gold)');
      break;
    }

    case 'error': {
      setStatus(`Error: ${payload.message}`, 'var(--mafia)');
      startBtn.disabled = false;
      break;
    }

    case 'stream_end': {
      if (!state.players || Object.keys(state.players).length === 0) break;
      setStatus('Stream ended.', '');
      break;
    }
  }
}

// ── Game Over Modal ───────────────────────────────────────────────────

function showGameOverModal({ winner, reason, players }) {
  const icons = { Town: '🏛️', Mafia: '🔪', 'Serial Killer': '🪓', Jester: '🃏', Draw: '⚖️' };
  $('modal-icon').textContent = icons[winner] ?? '🏁';
  $('modal-winner').textContent = `${winner} Wins!`;
  $('modal-reason').textContent = reason;

  const rosterEl = $('modal-roster');
  rosterEl.innerHTML = '';
  for (const p of players) {
    const div = document.createElement('div');
    div.className = `modal-player ${p.alive ? '' : 'dead'}`;
    const icon = ROLE_ICONS[p.role] ?? '👤';
    div.innerHTML = `
      <div class="mp-name">${sanitize(p.name)}</div>
      <div class="mp-role">${icon} ${sanitize(p.role)}</div>
      <div class="mp-status">${p.alive ? '✅' : '💀'}</div>
    `;
    rosterEl.appendChild(div);
  }

  modalOverlay.classList.remove('hidden');
}

$('modal-close').addEventListener('click', () => {
  modalOverlay.classList.add('hidden');
});

// ── Start Game ────────────────────────────────────────────────────────

async function startGame() {
  const playerCount = parseInt($('player-select').value);

  // Reset UI
  feed.innerHTML = '';
  eventLog.innerHTML = '';
  playerCards.innerHTML = '';
  state.players = {};
  state.queue = [];
  state.processing = false;
  state.gameId = null;
  aliveCount.textContent = '';
  phaseText.textContent = 'Starting…';
  cycleText.textContent = '';
  modalOverlay.classList.add('hidden');

  startBtn.disabled = true;
  startBtn.textContent = '⏳ Running…';
  setStatus('Starting simulation…');

  // POST /api/start
  let startData;
  try {
    const res = await fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ players: playerCount }),
    });
    startData = await res.json();
    if (!res.ok) throw new Error(startData.error ?? 'Failed to start');
  } catch (e) {
    setStatus(`Error: ${e.message}`, 'var(--mafia)');
    startBtn.disabled = false;
    startBtn.textContent = '▶ Start Simulation';
    return;
  }

  state.gameId = startData.gameId;
  setStatus(`Game ${startData.gameId} — ${playerCount} players`);

  // Connect SSE
  if (state.evtSource) state.evtSource.close();
  const evtSource = new EventSource(`/api/stream/${state.gameId}`);
  state.evtSource = evtSource;

  evtSource.onmessage = (e) => {
    let ev;
    try { ev = JSON.parse(e.data); } catch (_) { return; }
    enqueue(ev);
  };

  evtSource.onerror = () => {
    evtSource.close();
  };
}

// ── Controls ──────────────────────────────────────────────────────────

startBtn.addEventListener('click', startGame);

spectatorBtn.addEventListener('click', () => {
  state.spectatorMode = !state.spectatorMode;
  applySpectatorMode();
  // Retroactively show/hide existing spectator items
  document.querySelectorAll('.spectator-hidden').forEach(el => {
    el.style.display = state.spectatorMode ? '' : 'none';
  });
});

// ── Init ──────────────────────────────────────────────────────────────

// Apply initial spectator mode visibility
applySpectatorMode();
setStatus('Ready — choose a player count and click Start');
phaseIcon.textContent = '🏛';
phaseText.textContent = 'Salem';
