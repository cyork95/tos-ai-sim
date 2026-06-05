/* ═══════════════════════════════════════════════════════════════════
   TOWN OF SALEM — Browser Game Engine
   Runs entirely client-side; calls Anthropic API directly via fetch().
   ═══════════════════════════════════════════════════════════════════ */

// ── Configuration ─────────────────────────────────────────────────────

const CFG = {
  playerModel:     'claude-haiku-4-5-20251001',
  gmModel:         'claude-sonnet-4-6',
  playerTemp:      0.9,
  gmTemp:          0.0,
  playerMaxTokens: 400,
  gmMaxTokens:     700,
  initMaxTokens:   1200,
  mafiaMaxTokens:  800,
  maxRetries:      3,
};

const ROLE_SETS = {
  7:  ['Sheriff','Doctor','Investigator','Escort','Godfather','Mafioso','Jester'],
  9:  ['Sheriff','Doctor','Investigator','Escort','Vigilante','Godfather','Mafioso','Consigliere','Jester'],
  11: ['Sheriff','Doctor','Investigator','Escort','Vigilante','Mayor','Godfather','Mafioso','Consigliere','Jester','Serial Killer'],
};

// ── Anthropic API Client ───────────────────────────────────────────────

async function callAPI(apiKey, { system, user, model, temperature, maxTokens, expectJson = true }) {
  const maxRetries = CFG.maxRetries;
  let lastErr;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const userMsg = attempt > 1
      ? `${user}\n\nIMPORTANT: Return ONLY valid JSON. No markdown fences, no preamble.`
      : user;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature, system, messages: [{ role: 'user', content: userMsg }] }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error?.message ?? `API error ${res.status}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? '';
    if (!expectJson) return text;

    try { return extractJson(text); }
    catch (e) { lastErr = e; }
  }
  throw new Error(`JSON parse failed after ${maxRetries} attempts: ${lastErr?.message}`);
}

// ── JSON Extraction ────────────────────────────────────────────────────

function extractJson(text) {
  if (!text) throw new Error('Empty LLM response');
  let s = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(s); } catch (_) {}
  const fb = s.indexOf('{'), fb2 = s.indexOf('[');
  let start = -1, endChar = '';
  if (fb === -1 && fb2 === -1) throw new Error('No JSON found');
  if (fb === -1) { start = fb2; endChar = ']'; }
  else if (fb2 === -1) { start = fb; endChar = '}'; }
  else if (fb < fb2) { start = fb; endChar = '}'; }
  else { start = fb2; endChar = ']'; }
  const end = s.lastIndexOf(endChar);
  if (end < start) throw new Error('Malformed JSON');
  return JSON.parse(s.slice(start, end + 1));
}

// ── Utilities ──────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Roles ──────────────────────────────────────────────────────────────

const ROLES = {
  Sheriff:        { faction:'Town',    hasNightAction:true,  winCondition:'All Mafia and Serial Killers must die.' },
  Doctor:         { faction:'Town',    hasNightAction:true,  winCondition:'All Mafia and Serial Killers must die.' },
  Investigator:   { faction:'Town',    hasNightAction:true,  winCondition:'All Mafia and Serial Killers must die.' },
  Escort:         { faction:'Town',    hasNightAction:true,  winCondition:'All Mafia and Serial Killers must die.' },
  Vigilante:      { faction:'Town',    hasNightAction:true,  winCondition:'All Mafia and Serial Killers must die.' },
  Mayor:          { faction:'Town',    hasNightAction:false, winCondition:'All Mafia and Serial Killers must die.' },
  Godfather:      { faction:'Mafia',   hasNightAction:true,  winCondition:'Mafia must equal or outnumber Town and Neutrals.', isMafia:true, isKiller:true },
  Mafioso:        { faction:'Mafia',   hasNightAction:true,  winCondition:'Mafia must equal or outnumber Town and Neutrals.', isMafia:true, isKiller:true },
  Consigliere:    { faction:'Mafia',   hasNightAction:true,  winCondition:'Mafia must equal or outnumber Town and Neutrals.', isMafia:true },
  Jester:         { faction:'Neutral', hasNightAction:false, winCondition:'Get lynched by the town.' },
  'Serial Killer':{ faction:'Neutral', hasNightAction:true,  winCondition:'Be the last player standing.', isKiller:true },
};

const PERSONALITIES = {
  aggressive_accuser:   'Confrontational, quick to accuse, dominates conversation.',
  quiet_observer:       'Says little, watches carefully, speaks only when certain.',
  overconfident_townie: 'Acts like they have everything figured out even when they don\'t.',
  paranoid_deflector:   'Constantly worried, deflects suspicion with nervousness.',
  smooth_liar:          'Calm, measured, believable — even when completely lying.',
  data_driven_logician: 'Cites evidence and logic; suspicious of emotion-based arguments.',
  bandwagon_follower:   'Follows the crowd, rarely takes strong independent positions.',
  chaos_agent:          'Unpredictable, stirs drama, hard to read.',
  protective_leader:    'Tries to organize and protect the town; steps up as a leader.',
  anxious_newcomer:     'Unsure of themselves, makes mistakes, easy to manipulate.',
};

// ── Win Conditions ─────────────────────────────────────────────────────

function checkWinConditions(players, justLynchedId = null) {
  const living = players.filter(p => p.alive);
  const livingMafia = living.filter(p => ROLES[p.role]?.isMafia);
  const livingSK   = living.filter(p => p.role === 'Serial Killer');
  const livingTown = living.filter(p => !ROLES[p.role]?.isMafia && p.role !== 'Jester' && p.role !== 'Serial Killer');

  if (justLynchedId !== null) {
    const lynched = players.find(p => p.id === justLynchedId);
    if (lynched?.role === 'Jester') {
      return { winner:'Jester', jesterId:justLynchedId, endsGame:false, reason:`${lynched.name} was lynched — they were the Jester! The Jester wins!` };
    }
  }
  if (living.length === 0) return { winner:'Draw', endsGame:true, reason:'All players have died. Draw.' };

  if (livingSK.length > 0 && livingMafia.length === 0) {
    const nonSKKillers = living.filter(p => ROLES[p.role]?.isKiller && p.role !== 'Serial Killer');
    if (nonSKKillers.length === 0) {
      return { winner:'Serial Killer', endsGame:true, reason:`${livingSK[0].name} has outlasted all other threats. Serial Killer wins!` };
    }
  }
  const nonMafiaLiving = living.filter(p => !ROLES[p.role]?.isMafia && p.role !== 'Jester');
  if (livingMafia.length > 0 && livingMafia.length >= nonMafiaLiving.length) {
    return { winner:'Mafia', endsGame:true, reason:'The Mafia has taken control of Salem. Mafia wins!' };
  }
  if (livingMafia.length === 0 && livingSK.length === 0) {
    return { winner:'Town', endsGame:true, reason:'All threats eliminated. The Town wins!' };
  }
  return null;
}

// ── Game State ─────────────────────────────────────────────────────────

class GameState {
  constructor() {
    this.game_id = `game_${Date.now()}`;
    this.phase = 'DAY_DISCUSSION';
    this.cycle = 1;
    this.players = [];
    this.mafia_team = [];
    this.death_log = [];
    this.public_chat_log = [];
    this.mafia_chat_log = [];
    this.private_knowledge = {};
    this.last_will = {};
    this.night_actions = {};
    this.trial = { defendant_id:null, votes_guilty:[], votes_innocent:[], abstain:[] };
    this.vigilante_guilt = {};
  }

  initPlayers(players) {
    this.players = players;
    this.mafia_team = players.filter(p => ROLES[p.role]?.isMafia).map(p => p.id);
    for (const p of players) {
      this.last_will[p.id] = p.last_will ?? '';
      this.private_knowledge[p.id] = {
        player_id: p.id, role: p.role, private_notes: '',
        investigation_results: [],
        known_mafia_teammates: this.mafia_team.includes(p.id)
          ? players.filter(m => this.mafia_team.includes(m.id) && m.id !== p.id).map(m => ({ id:m.id, name:m.name, role:m.role }))
          : [],
        suspicion_levels: {},
        last_will: p.last_will ?? '',
        was_roleblocked_last_night: false,
      };
    }
  }

  getPlayer(id) { return this.players.find(p => p.id === id) ?? null; }
  getPlayerByName(name) { return this.players.find(p => p.name === name) ?? null; }
  getLivingPlayers() { return this.players.filter(p => p.alive); }

  killPlayer(id, cause) {
    const p = this.getPlayer(id);
    if (!p || !p.alive) return;
    p.alive = false;
    this.death_log.push({ cycle:this.cycle, phase:this.phase, player_id:id, cause, role_revealed:p.role });
  }

  addInvestigationResult(investigatorId, targetId, result) {
    const k = this.private_knowledge[investigatorId];
    if (!k) return;
    k.investigation_results.push({ cycle:this.cycle, target_id:targetId, result });
    k.private_notes += `\nN${this.cycle}: Investigated ${this.getPlayer(targetId)?.name} — ${result}.`;
  }

  resetNightActions() {
    this.night_actions = { kill_target:null, heal_target:null, sheriff_target:null, investigator_target:null, escort_target:null, consigliere_target:null, vigilante_target:null };
  }

  resetTrial() {
    this.trial = { defendant_id:null, votes_guilty:[], votes_innocent:[], abstain:[] };
    this.getLivingPlayers().forEach(p => { p.vote_count = 0; p.on_trial = false; });
  }

  toPublicJSON() {
    return {
      game_id: this.game_id, phase: this.phase, cycle: this.cycle,
      players: this.players.map(p => ({ id:p.id, name:p.name, alive:p.alive, revealed_role:p.revealed_role??null, mayor_revealed:p.mayor_revealed??false })),
      death_log: this.death_log, trial: this.trial,
    };
  }
}

// ── Prompt Builders ────────────────────────────────────────────────────

function buildInitPrompt(roleList, playerCount) {
  const names = ['Alex','Blake','Casey','Dana','Ellis','Finn','Gray','Harper','Indigo','Jules','Kai','Logan','Morgan','Nova'];
  const personalities = Object.keys(PERSONALITIES);
  const system = `You are setting up a Town of Salem game simulation.
TASK: Assign names, roles, and personalities to ${playerCount} players, then create a short starting last will for each.
NAME POOL: ${names.join(', ')}
ROLE LIST: ${roleList.join(', ')}
PERSONALITY LIST: ${personalities.join(', ')}
OUTPUT — return ONLY this JSON, no preamble:
{"players":[{"id":1,"name":"string","role":"string","personality":"string","alive":true,"last_will":"string"}],"game_ready":true}`;
  return { system, user:'Initialize the game now.' };
}

function sharedDayHeader(player, state) {
  const pk = state.private_knowledge[player.id];
  const mafStr = pk?.known_mafia_teammates?.length ? pk.known_mafia_teammates.map(m=>`${m.name}(${m.role})`).join(', ') : 'None';
  const livingStr = state.players.filter(p=>p.alive).map(p=>p.name+(p.mayor_revealed?' [MAYOR]':'')).join(', ');
  const deadStr = state.death_log.length ? state.death_log.map(d=>{const p=state.getPlayer(d.player_id);return `${p?.name}(${d.role_revealed})`;}).join(', ') : 'None';
  const recentChat = state.public_chat_log.filter(c=>c.cycle===state.cycle&&c.phase==='DAY_DISCUSSION').slice(-15).map(c=>{const n=state.getPlayer(c.player_id)?.name??'?';return `[${n}]: ${c.message}`;}).join('\n');
  const lastNightDeaths = state.death_log.filter(d=>d.cycle===state.cycle-1&&d.phase==='NIGHT').map(d=>{const p=state.getPlayer(d.player_id);return `${p?.name} was ${d.cause}. Role: ${d.role_revealed}.`;}).join(' ') || 'No deaths last night.';
  const pDesc = PERSONALITIES[player.personality] ?? player.personality;
  return `YOUR IDENTITY:
Name: ${player.name} | Role: ${player.role} | Win: ${ROLES[player.role]?.winCondition??''}
Mafia Teammates: ${mafStr}
Private Notes: ${pk?.private_notes||'None.'}
Investigation Results: ${pk?.investigation_results?.length?JSON.stringify(pk.investigation_results):'None'}
Personality: ${player.personality} — ${pDesc}
GAME STATE:
Cycle: Day ${state.cycle} | Living: ${livingStr} | Dead: ${deadStr}
Last Night: ${lastNightDeaths}
Today's Chat:\n${recentChat||'None yet.'}`;
}

function buildDayDiscussionPrompt(player, state) {
  const system = `You are playing Town of Salem as ${player.name}. Balance deception, deduction, and survival.
RULES: Keep public messages SHORT (1-4 sentences). Only use info your role would know. Mafia: coordinate cover stories.
${sharedDayHeader(player, state)}
OUTPUT — return ONLY this JSON:
{"public_message":"string","private_reasoning":"string","suspicion_updates":{"PlayerName":"high|medium|low|none"},"last_will_update":"string"}`;
  return { system, user:`Generate ${player.name}'s Day ${state.cycle} discussion message.` };
}

function buildNominationPrompt(player, state) {
  const eligible = state.players.filter(p=>p.alive&&p.id!==player.id).map(p=>p.name).join(', ');
  const chatSummary = state.public_chat_log.filter(c=>c.cycle===state.cycle).slice(-20).map(c=>{const n=state.getPlayer(c.player_id)?.name??'?';return `[${n}]: ${c.message}`;}).join('\n');
  const system = `You are playing Town of Salem as ${player.name}. It is voting time.
${sharedDayHeader(player, state)}
Today's full discussion:\n${chatSummary||'None.'}
Eligible targets: ${eligible}
Town: vote based on suspicion. Mafia: target innocent Town. Jester: try to get yourself nominated.
OUTPUT — return ONLY this JSON:
{"nominate":"PlayerName|null","nomination_reason_public":"string|null","private_reasoning":"string"}`;
  return { system, user:`Who does ${player.name} nominate?` };
}

function buildDefensePrompt(player, state) {
  const chatSummary = state.public_chat_log.filter(c=>c.cycle===state.cycle).slice(-20).map(c=>{const n=state.getPlayer(c.player_id)?.name??'?';return `[${n}]: ${c.message}`;}).join('\n');
  const system = `You are playing Town of Salem as ${player.name}. You are on trial — give your defense.
${sharedDayHeader(player, state)}
Discussion today:\n${chatSummary||'None.'}
Town: be truthful. Mafia: lie convincingly, claim a Town role. Jester: say suspicious things. SK: act confused.
OUTPUT — return ONLY this JSON:
{"defense_statement":"string","role_claim":"string|null","private_reasoning":"string"}`;
  return { system, user:`${player.name} defends themselves.` };
}

function buildVerdictPrompt(voter, defendant, defense, state) {
  const system = `You are playing Town of Salem as ${voter.name}. Vote on ${defendant.name}'s trial.
${sharedDayHeader(voter, state)}
DEFENDANT: ${defendant.name}
Defense: "${defense}"
Town: reason carefully. Mafia: vote guilty on Town. Jester: vote strategically.
OUTPUT — return ONLY this JSON:
{"verdict":"guilty|innocent|abstain","public_statement":"string|null","private_reasoning":"string"}`;
  return { system, user:`${voter.name} votes on ${defendant.name}.` };
}

function buildMafiaChat(mafiaPlayers, state) {
  const living = state.players.filter(p=>p.alive&&!state.mafia_team.includes(p.id)).map(p=>p.name).join(', ');
  const chatSummary = state.public_chat_log.filter(c=>c.cycle===state.cycle).slice(-12).map(c=>{const n=state.getPlayer(c.player_id)?.name??'?';return `[${n}]: ${c.message}`;}).join('\n');
  const system = `Generate private Mafia chat for Night ${state.cycle}.
Mafia: ${mafiaPlayers.map(p=>`${p.name}(${p.role})`).join(', ')}
Living targets: ${living}
Today's discussion:\n${chatSummary||'None.'}
Generate SHORT realistic chat. Who to kill? What cover story for tomorrow? Keep messages under 20 words each.
OUTPUT — return ONLY this JSON (keep mafia_chat to 2-3 short messages):
{"mafia_chat":[{"player_name":"string","message":"string"}],"agreed_kill_target":"PlayerName|null","backup_kill_target":"PlayerName|null","cover_story_plan":"string"}`;
  return { system, user:'Generate Mafia night chat.' };
}

function buildNightActionPrompt(player, state, mafiaKillTarget) {
  const pk = state.private_knowledge[player.id];
  const targets = state.players.filter(p=>p.alive&&p.id!==player.id).map(p=>p.name).join(', ');
  const GUIDANCE = {
    Sheriff:`Investigate who you find most suspicious. Result: Suspicious or Not Suspicious. (Godfather always returns Not Suspicious)`,
    Doctor:`Heal the player most likely to be killed. Cannot self-heal two nights in a row.`,
    Investigator:`Investigate to get a list of possible roles for your target.`,
    Escort:`Roleblock whoever you think is Mafia or Serial Killer — cancels their night action.`,
    Vigilante:`Only shoot if very confident. Killing Town gives you guilt and you die next night.`,
    Godfather:`Confirm the kill target: ${mafiaKillTarget??'not set'}. You appear Not Suspicious to Sheriff.`,
    Mafioso:`Execute Godfather's target: ${mafiaKillTarget??'choose independently if GF is dead'}.`,
    Consigliere:`Investigate to get the EXACT role of your target.`,
    'Serial Killer':`Kill whoever poses the most threat. You are immune to roleblocking.`,
    Mayor:`No night action. You may reveal as Mayor during the day.`,
    Jester:`No night action.`,
  };
  const system = `You are playing Town of Salem as ${player.name} (${player.role}) on Night ${state.cycle}.
Living players (excluding you): ${targets}
Dead: ${state.death_log.map(d=>`${state.getPlayer(d.player_id)?.name}(${d.role_revealed})`).join(', ')||'None'}
Private Notes: ${pk?.private_notes||'None.'}
Investigation History: ${pk?.investigation_results?.length?JSON.stringify(pk.investigation_results):'None'}
Roleblocked last night: ${pk?.was_roleblocked_last_night?'YES':'No'}
Mafia agreed kill target: ${mafiaKillTarget??'N/A'}
GUIDANCE: ${GUIDANCE[player.role]??'No night action.'}
OUTPUT — return ONLY this JSON:
{"action_target":"PlayerName|null","private_reasoning":"string","last_will_update":"string"}`;
  return { system, user:`What does ${player.name} do tonight?` };
}

function buildGMPrompt(state) {
  const system = `You are the impartial Game Master for Town of Salem. Process night actions with perfect accuracy.
RESOLUTION ORDER:
1. Escort ROLEBLOCK cancels target's action
2. Doctor HEAL protects target from kills
3. All KILLS fire simultaneously
4. Heals cancel kills on protected targets
5. Investigations resolve after kills
RULES:
- Godfather → Sheriff investigation returns "Not Suspicious"
- Serial Killer immune to Escort roleblock
- If Mafioso roleblocked but Godfather not → Godfather executes kill
- Vigilante kills Town member → gains guilt, dies next night
- Investigator gets POSSIBLE ROLE LIST (e.g. "Sheriff, Executioner, or Werewolf")
- Consigliere gets EXACT role
- Sheriff gets "Suspicious" for Mafia (except Godfather = "Not Suspicious")
OUTPUT — return ONLY this JSON:
{"deaths":[{"player_id":0,"cause":"Killed by Mafia|Killed by Serial Killer|Killed by Vigilante","role_revealed":"string","saved":false}],"saves":[{"player_id":0,"saved_by":"Doctor"}],"roleblocks":[{"player_id":0,"action_cancelled":"string"}],"investigation_results":[{"investigator_id":0,"target_id":0,"result":"string","investigator_role":"Sheriff|Investigator|Consigliere"}],"state_updates":{"player_guilt":[],"mayor_revealed":[]}}`;
  const user = `Resolve night actions for Cycle ${state.cycle}:\n${JSON.stringify(state.night_actions,null,2)}\nPlayer roster (with roles):\n${JSON.stringify(state.players.map(p=>({id:p.id,name:p.name,role:p.role,alive:p.alive})),null,2)}`;
  return { system, user };
}

function buildNarratorPrompt(phase, state) {
  const deaths = state.death_log.filter(d=>d.cycle===state.cycle).map(d=>{const p=state.getPlayer(d.player_id);return `${p?.name}(${d.role_revealed},${d.cause})`;}).join('; ')||'None';
  const living = state.players.filter(p=>p.alive).map(p=>p.name).join(', ');
  const system = `You are the narrator for a Town of Salem simulation. Write 2-4 atmospheric sentences. Second person plural ("The town gathered…"). Set the mood. Only reveal PUBLIC information. Reference specific player names.`;
  return { system, user:`Phase: ${phase} | Cycle: ${state.cycle}\nRecent deaths: ${deaths}\nLiving: ${living}` };
}

// ── Game Loop ──────────────────────────────────────────────────────────

async function runInit(apiKey, roleList, playerCount, emit) {
  emit('info', { message:`Setting up ${playerCount}-player game…` });
  const result = await callAPI(apiKey, { ...buildInitPrompt(roleList, playerCount), model:CFG.playerModel, temperature:CFG.playerTemp, maxTokens:CFG.initMaxTokens });
  const state = new GameState();
  state.initPlayers(result.players);
  emit('setup', { players: result.players.map(p=>({ id:p.id, name:p.name, role:p.role, personality:p.personality, alive:true })) });
  return state;
}

async function runDayDiscussion(apiKey, state, emit) {
  state.phase = 'DAY_DISCUSSION';
  emit('phase', { phase:'DAY_DISCUSSION', cycle:state.cycle });

  const living = shuffle(state.getLivingPlayers());
  emit('info', { message:`Day ${state.cycle} — ${living.length} players speaking…` });

  const calls = living.map(player =>
    callAPI(apiKey, { ...buildDayDiscussionPrompt(player, state), model:CFG.playerModel, temperature:CFG.playerTemp, maxTokens:CFG.playerMaxTokens })
      .then(r => ({ player, result:r }))
      .catch(() => ({ player, result:{ public_message:`I'm watching carefully.`, private_reasoning:'(error)', suspicion_updates:{}, last_will_update:'' } }))
  );
  const responses = await Promise.all(calls);

  for (const { player, result } of responses) {
    state.public_chat_log.push({ cycle:state.cycle, phase:'DAY_DISCUSSION', player_id:player.id, message:result.public_message });
    if (result.last_will_update) state.last_will[player.id] = result.last_will_update;
    emit('chat', { playerId:player.id, playerName:player.name, message:result.public_message, channel:'public' });
    emit('private', { playerId:player.id, playerName:player.name, reasoning:result.private_reasoning });
  }

  const narration = await callAPI(apiKey, { ...buildNarratorPrompt('DAY_DISCUSSION', state), model:CFG.playerModel, temperature:0.8, maxTokens:200, expectJson:false }).catch(()=>'');
  if (narration) emit('narration', { text:narration, phase:'DAY_DISCUSSION', cycle:state.cycle });
}

async function runDayVoting(apiKey, state, emit) {
  state.phase = 'DAY_VOTING';
  emit('phase', { phase:'DAY_VOTING', cycle:state.cycle });

  const living = state.getLivingPlayers();
  emit('info', { message:'Nominations opening…' });

  const nomCalls = living.map(p =>
    callAPI(apiKey, { ...buildNominationPrompt(p, state), model:CFG.playerModel, temperature:CFG.playerTemp, maxTokens:CFG.playerMaxTokens })
      .then(r => ({ player:p, result:r }))
      .catch(() => ({ player:p, result:{ nominate:null, nomination_reason_public:null, private_reasoning:'(error)' } }))
  );
  const nominations = await Promise.all(nomCalls);
  const tally = {};

  for (const { player, result } of nominations) {
    emit('private', { playerId:player.id, playerName:player.name, reasoning:result.private_reasoning });
    if (result.nominate) {
      tally[result.nominate] = (tally[result.nominate]??0) + 1;
      if (result.nomination_reason_public) {
        state.public_chat_log.push({ cycle:state.cycle, phase:'DAY_VOTING', player_id:player.id, message:result.nomination_reason_public });
        emit('chat', { playerId:player.id, playerName:player.name, message:result.nomination_reason_public, channel:'public' });
      }
      emit('event', { eventType:'VOTE', description:`${player.name} nominates ${result.nominate}` });
    }
  }

  let defendant = null, maxVotes = 0;
  for (const [name, count] of Object.entries(tally)) {
    const target = state.getPlayerByName(name);
    const weight = target?.mayor_revealed ? count * 3 : count;
    if (weight > maxVotes) { maxVotes = weight; defendant = target; }
  }

  const majority = Math.floor(living.length / 2) + 1;
  if (!defendant || maxVotes < majority) {
    emit('event', { eventType:'INFO', description:'No majority reached — no trial today.' });
    return null;
  }

  defendant.on_trial = true;
  emit('event', { eventType:'TRIAL', description:`${defendant.name} is put on trial!`, targetId:defendant.id, targetName:defendant.name });

  let defenseStatement = 'I am innocent!';
  try {
    const defResult = await callAPI(apiKey, { ...buildDefensePrompt(defendant, state), model:CFG.playerModel, temperature:CFG.playerTemp, maxTokens:CFG.playerMaxTokens });
    defenseStatement = defResult.defense_statement;
    state.public_chat_log.push({ cycle:state.cycle, phase:'DAY_VOTING', player_id:defendant.id, message:defenseStatement });
    emit('private', { playerId:defendant.id, playerName:defendant.name, reasoning:defResult.private_reasoning });
    emit('chat', { playerId:defendant.id, playerName:defendant.name, message:defenseStatement, channel:'defense' });
    if (defResult.role_claim) emit('event', { eventType:'CLAIM', description:`${defendant.name} claims: ${defResult.role_claim}` });
  } catch (_) {
    emit('chat', { playerId:defendant.id, playerName:defendant.name, message:defenseStatement, channel:'defense' });
  }

  const voters = living.filter(p => p.id !== defendant.id);
  const verdictCalls = voters.map(v =>
    callAPI(apiKey, { ...buildVerdictPrompt(v, defendant, defenseStatement, state), model:CFG.playerModel, temperature:CFG.playerTemp, maxTokens:CFG.playerMaxTokens })
      .then(r => ({ voter:v, result:r }))
      .catch(() => ({ voter:v, result:{ verdict:'abstain', public_statement:null, private_reasoning:'(error)' } }))
  );
  const verdicts = await Promise.all(verdictCalls);

  let guiltyCount = 0, innocentCount = 0;
  for (const { voter, result } of verdicts) {
    emit('private', { playerId:voter.id, playerName:voter.name, reasoning:result.private_reasoning });
    const w = voter.mayor_revealed ? 3 : 1;
    if (result.public_statement) {
      state.public_chat_log.push({ cycle:state.cycle, phase:'DAY_VOTING', player_id:voter.id, message:result.public_statement });
      emit('chat', { playerId:voter.id, playerName:voter.name, message:result.public_statement, channel:'public' });
    }
    if (result.verdict === 'guilty')        { guiltyCount += w;   emit('event', { eventType:'VERDICT', description:`${voter.name} votes GUILTY`,   verdict:'guilty',   voterId:voter.id }); }
    else if (result.verdict === 'innocent') { innocentCount += w; emit('event', { eventType:'VERDICT', description:`${voter.name} votes INNOCENT`, verdict:'innocent', voterId:voter.id }); }
    else                                    {                      emit('event', { eventType:'VERDICT', description:`${voter.name} abstains`,        verdict:'abstain',  voterId:voter.id }); }
  }

  emit('event', { eventType:'TALLY', description:`Guilty: ${guiltyCount} | Innocent: ${innocentCount}`, guiltyCount, innocentCount });

  if (guiltyCount > innocentCount) {
    state.killPlayer(defendant.id, 'Executed');
    emit('event', { eventType:'DEATH', description:`${defendant.name} was EXECUTED! Role: ${defendant.role}`, playerId:defendant.id, playerName:defendant.name, role:defendant.role, cause:'Executed' });
    const will = state.last_will[defendant.id];
    if (will) emit('event', { eventType:'LAST_WILL', description:`${defendant.name}'s Last Will: "${will}"`, playerId:defendant.id, will });
    const narration = await callAPI(apiKey, { ...buildNarratorPrompt('DAY_VOTING', state), model:CFG.playerModel, temperature:0.8, maxTokens:200, expectJson:false }).catch(()=>'');
    if (narration) emit('narration', { text:narration, phase:'DAY_VOTING', cycle:state.cycle });
    return defendant.id;
  } else {
    defendant.on_trial = false;
    emit('event', { eventType:'SPARED', description:`${defendant.name} was found INNOCENT and spared!`, playerId:defendant.id });
    return null;
  }
}

async function runNight(apiKey, state, emit) {
  state.phase = 'NIGHT';
  state.resetNightActions();
  emit('phase', { phase:'NIGHT', cycle:state.cycle });
  emit('info', { message:'Night falls over Salem…' });

  const living = state.getLivingPlayers();
  const mafiaMembers = living.filter(p => state.mafia_team.includes(p.id));

  let agreedKillTarget = null;
  if (mafiaMembers.length > 0) {
    try {
      emit('info', { message:'The Mafia meets in secret…' });
      const mafResult = await callAPI(apiKey, { ...buildMafiaChat(mafiaMembers, state), model:CFG.playerModel, temperature:CFG.playerTemp, maxTokens:CFG.mafiaMaxTokens });
      for (const chat of mafResult.mafia_chat ?? []) {
        const p = state.getPlayerByName(chat.player_name);
        if (p) {
          state.mafia_chat_log.push({ cycle:state.cycle, phase:'NIGHT', player_id:p.id, message:chat.message });
          emit('chat', { playerId:p.id, playerName:chat.player_name, message:chat.message, channel:'mafia' });
        }
      }
      agreedKillTarget = mafResult.agreed_kill_target;
    } catch (_) {}
  }

  const actionPlayers = living.filter(p => ROLES[p.role]?.hasNightAction);
  const actionCalls = actionPlayers.map(player =>
    callAPI(apiKey, { ...buildNightActionPrompt(player, state, agreedKillTarget), model:CFG.playerModel, temperature:CFG.playerTemp, maxTokens:CFG.playerMaxTokens })
      .then(r => ({ player, result:r }))
      .catch(() => ({ player, result:{ action_target:null, private_reasoning:'(error)', last_will_update:'' } }))
  );
  const actionResults = await Promise.all(actionCalls);

  for (const { player, result } of actionResults) {
    emit('private', { playerId:player.id, playerName:player.name, reasoning:result.private_reasoning });
    emit('night_action', { playerId:player.id, playerName:player.name, role:player.role, targetName:result.action_target??null });
    if (result.last_will_update) state.last_will[player.id] = result.last_will_update;

    const target = result.action_target ? state.getPlayerByName(result.action_target) : null;
    const tid = target?.id ?? null;
    switch (player.role) {
      case 'Godfather':      state.night_actions.kill_target = tid; break;
      case 'Mafioso':        if (!state.night_actions.kill_target) state.night_actions.kill_target = tid; break;
      case 'Doctor':         state.night_actions.heal_target = tid; break;
      case 'Sheriff':        state.night_actions.sheriff_target = tid; break;
      case 'Investigator':   state.night_actions.investigator_target = tid; break;
      case 'Escort':         state.night_actions.escort_target = tid; break;
      case 'Consigliere':    state.night_actions.consigliere_target = tid; break;
      case 'Vigilante':      state.night_actions.vigilante_target = tid; break;
      case 'Serial Killer':  state.night_actions.kill_target = tid; break;
    }
  }

  emit('info', { message:'Dawn approaches — resolving night actions…' });
  let gmResult = { deaths:[], saves:[], roleblocks:[], investigation_results:[], state_updates:{ player_guilt:[], mayor_revealed:[] } };
  try {
    gmResult = await callAPI(apiKey, { ...buildGMPrompt(state), model:CFG.gmModel, temperature:CFG.gmTemp, maxTokens:CFG.gmMaxTokens });
  } catch (_) {}

  const savedIds = new Set((gmResult.saves??[]).map(s=>s.player_id));
  for (const save of gmResult.saves??[]) {
    const p = state.getPlayer(save.player_id);
    if (p) emit('event', { eventType:'SAVE', description:`${p.name} was protected by the Doctor!`, playerId:p.id, playerName:p.name });
  }
  for (const rb of gmResult.roleblocks??[]) {
    const p = state.getPlayer(rb.player_id);
    if (p) {
      emit('event', { eventType:'ROLEBLOCK', description:`${p.name} was roleblocked — action cancelled.`, playerId:p.id, playerName:p.name });
      if (state.private_knowledge[p.id]) state.private_knowledge[p.id].was_roleblocked_last_night = true;
    }
  }
  for (const p of living) {
    if (!gmResult.roleblocks?.find(rb=>rb.player_id===p.id) && state.private_knowledge[p.id])
      state.private_knowledge[p.id].was_roleblocked_last_night = false;
  }
  for (const death of gmResult.deaths??[]) {
    if (savedIds.has(death.player_id)) continue;
    const p = state.getPlayer(death.player_id);
    if (p?.alive) {
      state.killPlayer(p.id, death.cause);
      emit('event', { eventType:'DEATH', description:`${p.name} was found dead. ${death.cause}. Role: ${p.role}`, playerId:p.id, playerName:p.name, role:p.role, cause:death.cause });
      const will = state.last_will[p.id];
      if (will) emit('event', { eventType:'LAST_WILL', description:`${p.name}'s Last Will: "${will}"`, playerId:p.id, will });
    }
  }
  for (const inv of gmResult.investigation_results??[]) {
    const investigator = state.getPlayer(inv.investigator_id);
    const target = state.getPlayer(inv.target_id);
    if (investigator && target) {
      state.addInvestigationResult(inv.investigator_id, inv.target_id, inv.result);
      emit('event', { eventType:'INVESTIGATION', description:`${investigator.name} investigated ${target.name}: "${inv.result}"`, investigatorId:investigator.id, targetId:target.id, result:inv.result });
    }
  }
  for (const id of gmResult.state_updates?.player_guilt??[]) {
    state.vigilante_guilt[id] = true;
    const p = state.getPlayer(id);
    if (p) emit('event', { eventType:'GUILT', description:`${p.name} (Vigilante) shot a Town member — will die of guilt!`, playerId:p.id });
  }

  const narration = await callAPI(apiKey, { ...buildNarratorPrompt('NIGHT', state), model:CFG.playerModel, temperature:0.8, maxTokens:200, expectJson:false }).catch(()=>'');
  if (narration) emit('narration', { text:narration, phase:'NIGHT', cycle:state.cycle });
}

// ── Main Entry Point ───────────────────────────────────────────────────

window.GameEngine = {
  ROLE_SETS,
  async run(apiKey, playerCount, emit) {
    const roleList = ROLE_SETS[playerCount];
    if (!roleList) throw new Error(`No role set for ${playerCount} players`);

    const state = await runInit(apiKey, roleList, playerCount, emit);
    let winner = null, winReason = '', gameOver = false;
    const MAX_CYCLES = 15;

    while (!gameOver && state.cycle <= MAX_CYCLES) {
      await runDayDiscussion(apiKey, state, emit);

      const earlyCheck = checkWinConditions(state.players);
      if (earlyCheck?.endsGame) { winner = earlyCheck.winner; winReason = earlyCheck.reason; break; }

      const lynchedId = await runDayVoting(apiKey, state, emit);
      state.resetTrial();

      const postLynch = checkWinConditions(state.players, lynchedId);
      if (postLynch) {
        if (postLynch.endsGame) { winner = postLynch.winner; winReason = postLynch.reason; gameOver = true; }
        else emit('event', { eventType:'JESTER_WIN', description:postLynch.reason });
        if (gameOver) break;
      }

      await runNight(apiKey, state, emit);

      const postNight = checkWinConditions(state.players);
      if (postNight?.endsGame) { winner = postNight.winner; winReason = postNight.reason; gameOver = true; break; }

      for (const [idStr, hasGuilt] of Object.entries(state.vigilante_guilt)) {
        if (hasGuilt) {
          const p = state.getPlayer(Number(idStr));
          if (p?.alive) {
            state.killPlayer(p.id, 'Died of guilt');
            emit('event', { eventType:'DEATH', description:`${p.name} died of guilt!`, playerId:p.id, playerName:p.name, role:p.role, cause:'Died of guilt' });
            delete state.vigilante_guilt[idStr];
          }
        }
      }
      state.cycle++;
    }

    if (!winner) { winner = 'Draw'; winReason = 'Maximum cycles reached — draw.'; }
    emit('game_over', {
      winner, reason:winReason,
      players: state.players.map(p=>({ id:p.id, name:p.name, role:p.role, alive:p.alive })),
      lastWills: state.last_will,
    });
  },
};
