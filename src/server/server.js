import dotenv from 'dotenv';
dotenv.config({ override: true });

import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { gameEvents } from './events.js';
import { runGame } from '../game/gameLoop.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../');
const config = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8'));

const app = express();
app.use(express.json());
app.use(express.static(join(ROOT, 'public')));

// ── Game State ────────────────────────────────────────────────────────────────

let currentGame = null; // { id, running, events: [], clients: Set }

function createGameSession(id) {
  return { id, running: true, events: [], clients: new Set() };
}

function broadcast(game, eventData) {
  const line = `data: ${JSON.stringify(eventData)}\n\n`;
  for (const res of game.clients) {
    try { res.write(line); } catch (_) {}
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/config  — role sets and player counts
app.get('/api/config', (_req, res) => {
  res.json({
    roleSets: config.roleSets,
    defaultPlayers: config.playerCount,
  });
});

// GET /api/status
app.get('/api/status', (_req, res) => {
  if (!currentGame) return res.json({ running: false });
  res.json({ running: currentGame.running, gameId: currentGame.id, eventCount: currentGame.events.length });
});

// POST /api/start  — kick off a new simulation
app.post('/api/start', async (req, res) => {
  if (currentGame?.running) {
    return res.status(409).json({ error: 'A game is already running. Wait for it to finish.' });
  }

  const playerCount = Number(req.body.players ?? config.playerCount);
  const validCounts = [7, 9, 11];
  if (!validCounts.includes(playerCount)) {
    return res.status(400).json({ error: 'Player count must be 7, 9, or 11.' });
  }

  const roleList = config.roleSets[String(playerCount)];
  const gameId = `game_${Date.now()}`;
  currentGame = createGameSession(gameId);

  res.json({ gameId, message: 'Game started!', playerCount, roles: roleList });

  // Subscribe to game events and forward to SSE clients
  const handler = (eventData) => {
    currentGame.events.push(eventData);
    broadcast(currentGame, eventData);
  };
  gameEvents.on('game', handler);

  // Run async — don't await in the request handler
  runGame(roleList, playerCount)
    .then(() => {
      currentGame.running = false;
      gameEvents.off('game', handler);
      // Send a final close signal
      broadcast(currentGame, { type: 'stream_end', payload: {} });
    })
    .catch((err) => {
      console.error('[Server] Game error:', err.message);
      currentGame.running = false;
      gameEvents.off('game', handler);
      broadcast(currentGame, { type: 'error', payload: { message: err.message } });
    });
});

// GET /api/stream/:gameId  — SSE endpoint
app.get('/api/stream/:gameId', (req, res) => {
  const game = currentGame;
  if (!game || game.id !== req.params.gameId) {
    return res.status(404).json({ error: 'Game not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Replay all buffered events so late-connecting clients catch up
  for (const e of game.events) {
    res.write(`data: ${JSON.stringify(e)}\n\n`);
  }
  if (!game.running) {
    res.write(`data: ${JSON.stringify({ type: 'stream_end', payload: {} })}\n\n`);
    res.end();
    return;
  }

  game.clients.add(res);

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) {}
  }, 15000);

  req.on('close', () => {
    game.clients.delete(res);
    clearInterval(heartbeat);
  });
});

// GET /api/events/:gameId  — fetch all buffered events as JSON (for replays)
app.get('/api/events/:gameId', (req, res) => {
  if (!currentGame || currentGame.id !== req.params.gameId) {
    return res.status(404).json({ error: 'Game not found' });
  }
  res.json({ events: currentGame.events, running: currentGame.running });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3000;
const server = createServer(app);
server.listen(PORT, () => {
  console.log(`\n  🏛  Town of Salem Dashboard`);
  console.log(`  Open: http://localhost:${PORT}\n`);
});
