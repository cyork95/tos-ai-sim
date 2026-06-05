/**
 * GameState — single source of truth for the entire simulation.
 * All mutations go through the methods here so the markdown reporter
 * can observe a clean event log.
 */
export class GameState {
  constructor() {
    this.game_id = `game_${Date.now()}`;
    this.phase = 'DAY_DISCUSSION';
    this.cycle = 1;
    this.players = [];
    this.mafia_team = [];

    this.death_log = [];
    this.public_chat_log = [];
    this.mafia_chat_log = [];
    this.event_log = [];       // structured game events for the markdown report
    this.private_logs = [];    // private reasoning — shown only at game end

    this.trial = {
      defendant_id: null,
      votes_guilty: [],
      votes_innocent: [],
      abstain: [],
    };

    this.night_actions = {
      kill_target: null,
      heal_target: null,
      sheriff_target: null,
      investigator_target: null,
      escort_target: null,
      consigliere_target: null,
      vigilante_target: null,
    };

    this.last_will = {};
    this.private_knowledge = {}; // keyed by player_id

    // Per-player state for Doctor self-heal tracking
    this.doctor_last_healed_self = false;
    this.vigilante_guilt = {}; // player_id -> true if has guilt
  }

  // ── Initialisation ──────────────────────────────────────────────────────

  initPlayers(players) {
    this.players = players;
    this.mafia_team = players.filter(p => ['Godfather', 'Mafioso', 'Consigliere'].includes(p.role)).map(p => p.id);
    for (const p of players) {
      this.last_will[p.id] = p.last_will ?? '';
      this.private_knowledge[p.id] = {
        player_id: p.id,
        role: p.role,
        private_notes: '',
        investigation_results: [],
        known_mafia_teammates: this.mafia_team.includes(p.id)
          ? players.filter(m => this.mafia_team.includes(m.id) && m.id !== p.id).map(m => ({ id: m.id, name: m.name, role: m.role }))
          : [],
        suspicion_levels: {},
        last_will: p.last_will ?? '',
      };
    }
    this.logEvent('SETUP', `Game initialized with ${players.length} players.`);
    for (const p of players) {
      this.logEvent('SETUP', `${p.name} — Role: ${p.role} | Personality: ${p.personality}`);
    }
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  getPlayer(id) { return this.players.find(p => p.id === id) ?? null; }
  getPlayerByName(name) { return this.players.find(p => p.name === name) ?? null; }
  getLivingPlayers() { return this.players.filter(p => p.alive); }
  getDeadPlayers() { return this.players.filter(p => !p.alive); }

  getMafiaTeamNames() {
    return this.mafia_team.map(id => {
      const p = this.getPlayer(id);
      return p ? `${p.name} (${p.role})` : `Unknown(${id})`;
    });
  }

  getPublicSummary() {
    return {
      living: this.getLivingPlayers().map(p => ({
        id: p.id,
        name: p.name,
        revealed_role: p.revealed_role ?? null,
        mayor_revealed: p.mayor_revealed ?? false,
        vote_count: p.vote_count ?? 0,
      })),
      dead: this.getDeadPlayers().map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        cause: this.death_log.find(d => d.player_id === p.id)?.cause ?? 'Unknown',
      })),
    };
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  killPlayer(playerId, cause, revealRole = true) {
    const p = this.getPlayer(playerId);
    if (!p || !p.alive) return;
    p.alive = false;
    const entry = {
      cycle: this.cycle,
      phase: this.phase,
      player_id: playerId,
      cause,
      role_revealed: revealRole ? p.role : null,
    };
    this.death_log.push(entry);
    this.logEvent('DEATH', `${p.name} has died. Cause: ${cause}. Role revealed: ${revealRole ? p.role : 'Unknown'}`);
  }

  addPublicChat(playerId, message) {
    this.public_chat_log.push({ cycle: this.cycle, phase: this.phase, player_id: playerId, message });
    const name = this.getPlayer(playerId)?.name ?? `Player ${playerId}`;
    this.logEvent('CHAT', `[${name}]: ${message}`);
  }

  addMafiaChat(playerId, message) {
    this.mafia_chat_log.push({ cycle: this.cycle, phase: this.phase, player_id: playerId, message });
    const name = this.getPlayer(playerId)?.name ?? `Player ${playerId}`;
    this.logEvent('MAFIA_CHAT', `[MAFIA - ${name}]: ${message}`);
  }

  logEvent(type, description) {
    this.event_log.push({
      cycle: this.cycle,
      phase: this.phase,
      type,
      description,
      timestamp: Date.now(),
    });
  }

  logPrivate(playerId, reasoning) {
    const name = this.getPlayer(playerId)?.name ?? `Player ${playerId}`;
    this.private_logs.push({ cycle: this.cycle, phase: this.phase, playerId, name, reasoning });
  }

  updateLastWill(playerId, will) {
    if (will) {
      this.last_will[playerId] = will;
      if (this.private_knowledge[playerId]) {
        this.private_knowledge[playerId].last_will = will;
      }
    }
  }

  updatePrivateKnowledge(playerId, updates) {
    if (!this.private_knowledge[playerId]) return;
    Object.assign(this.private_knowledge[playerId], updates);
    if (updates.private_notes !== undefined) {
      this.private_knowledge[playerId].private_notes = updates.private_notes;
    }
  }

  addInvestigationResult(investigatorId, targetId, result) {
    const k = this.private_knowledge[investigatorId];
    if (!k) return;
    k.investigation_results.push({ cycle: this.cycle, target_id: targetId, result });
    k.private_notes += `\nN${this.cycle}: Investigated ${this.getPlayer(targetId)?.name} — ${result}.`;
  }

  resetNightActions() {
    this.night_actions = {
      kill_target: null,
      heal_target: null,
      sheriff_target: null,
      investigator_target: null,
      escort_target: null,
      consigliere_target: null,
      vigilante_target: null,
    };
  }

  resetTrial() {
    this.trial = { defendant_id: null, votes_guilty: [], votes_innocent: [], abstain: [] };
    this.getLivingPlayers().forEach(p => { p.vote_count = 0; p.on_trial = false; });
  }

  toPublicJSON() {
    return {
      game_id: this.game_id,
      phase: this.phase,
      cycle: this.cycle,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        alive: p.alive,
        revealed_role: p.revealed_role ?? null,
        mayor_revealed: p.mayor_revealed ?? false,
        vote_count: p.vote_count ?? 0,
        on_trial: p.on_trial ?? false,
      })),
      death_log: this.death_log,
      public_chat_log: this.public_chat_log,
      trial: this.trial,
    };
  }
}
