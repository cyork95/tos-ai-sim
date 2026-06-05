import { callLLM } from '../llm/client.js';
import { LLM_CONFIG } from '../llm/config.js';
import { buildInitPrompt } from '../prompts/init.js';
import { buildDayDiscussionPrompt } from '../prompts/dayDiscussion.js';
import { buildNominationPrompt, buildDefensePrompt, buildVerdictPrompt } from '../prompts/voting.js';
import { buildMafiaChat, buildNightActionPrompt } from '../prompts/night.js';
import { buildGameMasterPrompt } from '../prompts/gameMaster.js';
import { buildNarratorPrompt } from '../prompts/narrator.js';
import { checkWinConditions } from './winConditions.js';
import { GameState } from './state.js';
import { getRoleInfo } from './roles.js';
import * as display from '../ui/display.js';
import { generateMarkdownReport } from '../ui/markdownReport.js';
import { gameEvents } from '../server/events.js';

const GM_MODEL = LLM_CONFIG.gameMasterModel;
const GM_TEMP = LLM_CONFIG.gameMasterTemperature;
const GM_MAX = LLM_CONFIG.gameMasterMaxTokens;
const PLAYER_MODEL = LLM_CONFIG.playerModel;

// ── Event helpers ─────────────────────────────────────────────────────────────

function emit(type, payload) {
  gameEvents.emit('game', { type, payload, ts: Date.now() });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Phase: Initialization ─────────────────────────────────────────────────────

export async function initGame(roleList, playerCount) {
  emit('info', { message: `Setting up ${playerCount}-player game…` });
  display.printInfo(`Calling LLM to generate ${playerCount} players...`);

  const { system, user } = buildInitPrompt(roleList, playerCount);
  const result = await callLLM({ system, user, model: PLAYER_MODEL, maxTokens: 1200 });

  const state = new GameState();
  state.initPlayers(result.players);
  display.printGameSetup(result.players);

  emit('setup', {
    players: result.players.map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      personality: p.personality,
      alive: true,
    })),
  });

  return state;
}

// ── Phase: Day Discussion ─────────────────────────────────────────────────────

async function runDayDiscussion(state) {
  display.printPhaseHeader('DAY_DISCUSSION', state.cycle);
  state.phase = 'DAY_DISCUSSION';
  emit('phase', { phase: 'DAY_DISCUSSION', cycle: state.cycle, living: state.getLivingPlayers().map(p => p.id) });

  const living = shuffle(state.getLivingPlayers());
  display.printInfo(`Running day discussion for ${living.length} players...`);
  emit('info', { message: `Day ${state.cycle} discussion — ${living.length} players speaking…` });

  const calls = living.map(player =>
    callLLM({ ...buildDayDiscussionPrompt(player, state), model: PLAYER_MODEL })
      .then(result => ({ player, result }))
      .catch(e => {
        console.error(`  [Day Discussion] ${player.name} error: ${e.message}`);
        return { player, result: { public_message: `I'm watching carefully.`, private_reasoning: 'Error', suspicion_updates: {}, last_will_update: '' } };
      })
  );

  const responses = await Promise.all(calls);

  for (const { player, result } of responses) {
    state.addPublicChat(player.id, result.public_message);
    state.logPrivate(player.id, result.private_reasoning);
    state.updateLastWill(player.id, result.last_will_update);

    display.printChat(player.name, result.public_message);
    display.printPrivateReasoning(player.name, result.private_reasoning);

    emit('chat', { playerId: player.id, playerName: player.name, message: result.public_message, channel: 'public' });
    emit('private', { playerId: player.id, playerName: player.name, reasoning: result.private_reasoning });

    if (result.suspicion_updates) {
      const suspicion = state.private_knowledge[player.id]?.suspicion_levels ?? {};
      Object.assign(suspicion, result.suspicion_updates);
    }
  }

  const narratorText = await narrate('DAY_DISCUSSION', state);
  if (narratorText) emit('narration', { text: narratorText, phase: 'DAY_DISCUSSION', cycle: state.cycle });
}

// ── Phase: Day Voting ─────────────────────────────────────────────────────────

async function runDayVoting(state) {
  display.printPhaseHeader('DAY_VOTING', state.cycle);
  state.phase = 'DAY_VOTING';
  emit('phase', { phase: 'DAY_VOTING', cycle: state.cycle });

  const living = state.getLivingPlayers();
  display.printInfo('Collecting nominations...');
  emit('info', { message: 'Nominations opening…' });

  const nomCalls = living.map(player =>
    callLLM({ ...buildNominationPrompt(player, state), model: PLAYER_MODEL })
      .then(r => ({ player, result: r }))
      .catch(() => ({ player, result: { nominate: null, nomination_reason_public: null, private_reasoning: 'Error' } }))
  );

  const nominations = await Promise.all(nomCalls);
  const tally = {};

  for (const { player, result } of nominations) {
    state.logPrivate(player.id, result.private_reasoning);
    emit('private', { playerId: player.id, playerName: player.name, reasoning: result.private_reasoning });

    if (result.nominate) {
      tally[result.nominate] = (tally[result.nominate] ?? 0) + 1;
      const reason = result.nomination_reason_public;
      if (reason) {
        state.addPublicChat(player.id, reason);
        display.printChat(player.name, reason);
        emit('chat', { playerId: player.id, playerName: player.name, message: reason, channel: 'public' });
      }
      display.printEvent('VOTE', `${player.name} nominates ${result.nominate}`);
      emit('event', { eventType: 'VOTE', description: `${player.name} nominates ${result.nominate}`, playerId: player.id });
    }
  }

  let defendant = null;
  let maxVotes = 0;
  for (const [name, count] of Object.entries(tally)) {
    const target = state.getPlayerByName(name);
    const weight = target?.mayor_revealed ? count * 3 : count;
    if (weight > maxVotes) { maxVotes = weight; defendant = target; }
  }

  const majority = Math.floor(living.length / 2) + 1;
  if (!defendant || maxVotes < majority) {
    display.printEvent('LYNCH', 'No majority reached — no trial today.');
    state.logEvent('VOTE', 'No majority nomination — no trial this cycle.');
    emit('event', { eventType: 'INFO', description: 'No majority reached — no trial today.' });
    return null;
  }

  display.printEvent('LYNCH', `${defendant.name} is put on trial! (${maxVotes} nominations)`);
  state.logEvent('VOTE', `${defendant.name} put on trial with ${maxVotes} nominations.`);
  emit('event', { eventType: 'TRIAL', description: `${defendant.name} is put on trial!`, targetId: defendant.id, targetName: defendant.name });
  defendant.on_trial = true;

  // Defense statement
  let defenseStatement = 'I am innocent, please believe me!';
  try {
    const defResult = await callLLM({ ...buildDefensePrompt(defendant, state), model: PLAYER_MODEL });
    defenseStatement = defResult.defense_statement;
    state.logPrivate(defendant.id, defResult.private_reasoning);
    emit('private', { playerId: defendant.id, playerName: defendant.name, reasoning: defResult.private_reasoning });
    if (defResult.role_claim) {
      state.logEvent('CHAT', `${defendant.name} claims to be: ${defResult.role_claim}`);
      emit('event', { eventType: 'CLAIM', description: `${defendant.name} claims: ${defResult.role_claim}`, targetId: defendant.id });
    }
    state.addPublicChat(defendant.id, defenseStatement);
    display.printSeparator();
    display.printChat(defendant.name, defenseStatement);
    display.printSeparator();
    emit('chat', { playerId: defendant.id, playerName: defendant.name, message: defenseStatement, channel: 'defense' });
  } catch (e) {
    emit('chat', { playerId: defendant.id, playerName: defendant.name, message: defenseStatement, channel: 'defense' });
  }

  // Verdict votes in parallel
  const voters = living.filter(p => p.id !== defendant.id);
  const verdictCalls = voters.map(voter =>
    callLLM({ ...buildVerdictPrompt(voter, defendant, defenseStatement, state), model: PLAYER_MODEL })
      .then(r => ({ voter, result: r }))
      .catch(() => ({ voter, result: { verdict: 'abstain', public_statement: null, private_reasoning: 'Error' } }))
  );

  const verdicts = await Promise.all(verdictCalls);
  let guiltyCount = 0;
  let innocentCount = 0;

  for (const { voter, result } of verdicts) {
    state.logPrivate(voter.id, result.private_reasoning);
    emit('private', { playerId: voter.id, playerName: voter.name, reasoning: result.private_reasoning });
    const voteWeight = voter.mayor_revealed ? 3 : 1;

    if (result.public_statement) {
      state.addPublicChat(voter.id, result.public_statement);
      display.printChat(voter.name, result.public_statement);
      emit('chat', { playerId: voter.id, playerName: voter.name, message: result.public_statement, channel: 'public' });
    }

    if (result.verdict === 'guilty') {
      guiltyCount += voteWeight;
      state.trial.votes_guilty.push(voter.id);
      display.printEvent('VOTE', `${voter.name} votes GUILTY`);
      emit('event', { eventType: 'VERDICT', description: `${voter.name} votes GUILTY`, verdict: 'guilty', voterId: voter.id });
    } else if (result.verdict === 'innocent') {
      innocentCount += voteWeight;
      state.trial.votes_innocent.push(voter.id);
      display.printEvent('VOTE', `${voter.name} votes INNOCENT`);
      emit('event', { eventType: 'VERDICT', description: `${voter.name} votes INNOCENT`, verdict: 'innocent', voterId: voter.id });
    } else {
      state.trial.abstain.push(voter.id);
      display.printEvent('VOTE', `${voter.name} abstains`);
      emit('event', { eventType: 'VERDICT', description: `${voter.name} abstains`, verdict: 'abstain', voterId: voter.id });
    }
  }

  display.printInfo(`Guilty: ${guiltyCount} | Innocent: ${innocentCount}`);
  emit('event', { eventType: 'TALLY', description: `Votes — Guilty: ${guiltyCount} | Innocent: ${innocentCount}`, guiltyCount, innocentCount });

  if (guiltyCount > innocentCount) {
    display.printEvent('LYNCH', `${defendant.name} has been EXECUTED by the town!`);
    state.killPlayer(defendant.id, 'Executed', true);
    emit('event', { eventType: 'DEATH', description: `${defendant.name} was EXECUTED! Role: ${defendant.role}`, playerId: defendant.id, playerName: defendant.name, role: defendant.role, cause: 'Executed' });

    const will = state.last_will[defendant.id];
    if (will) {
      display.printEvent('LYNCH', `${defendant.name}'s Last Will: "${will}"`);
      emit('event', { eventType: 'LAST_WILL', description: `${defendant.name}'s Last Will: "${will}"`, playerId: defendant.id, will });
    }

    const narratorText = await narrate('DAY_VOTING', state, [{ type: 'LYNCH', description: `${defendant.name} was executed. Role: ${defendant.role}` }]);
    if (narratorText) emit('narration', { text: narratorText, phase: 'DAY_VOTING', cycle: state.cycle });
    return defendant.id;
  } else {
    display.printEvent('LYNCH', `${defendant.name} has been found INNOCENT and spared!`);
    state.logEvent('VOTE', `${defendant.name} survived the trial.`);
    emit('event', { eventType: 'SPARED', description: `${defendant.name} was found INNOCENT and spared!`, playerId: defendant.id });
    defendant.on_trial = false;
    return null;
  }
}

// ── Phase: Night ──────────────────────────────────────────────────────────────

async function runNight(state) {
  display.printPhaseHeader('NIGHT', state.cycle);
  state.phase = 'NIGHT';
  state.resetNightActions();
  emit('phase', { phase: 'NIGHT', cycle: state.cycle, living: state.getLivingPlayers().map(p => p.id) });
  emit('info', { message: 'Night falls over Salem…' });

  const living = state.getLivingPlayers();
  const mafiaMembers = living.filter(p => state.mafia_team.includes(p.id));

  let agreedKillTarget = null;
  if (mafiaMembers.length > 0) {
    try {
      display.printInfo('Mafia is scheming...');
      emit('info', { message: 'The Mafia meets in secret…' });
      const mafResult = await callLLM({ ...buildMafiaChat(mafiaMembers, state), model: PLAYER_MODEL, maxTokens: 800 });

      for (const chat of mafResult.mafia_chat) {
        const p = state.getPlayerByName(chat.player_name);
        if (p) {
          state.addMafiaChat(p.id, chat.message);
          display.printChat(chat.player_name, chat.message, true);
          emit('chat', { playerId: p.id, playerName: chat.player_name, message: chat.message, channel: 'mafia' });
        }
      }

      agreedKillTarget = mafResult.agreed_kill_target;
      state.logEvent('MAFIA_CHAT', `Agreed kill target: ${agreedKillTarget}. Plan: ${mafResult.cover_story_plan}`);
      emit('info', { message: `Mafia targets: ${agreedKillTarget ?? 'undecided'}` });
    } catch (e) {
      console.error(`  [Mafia Chat] Error: ${e.message}`);
    }
  }

  const actionPlayers = living.filter(p => getRoleInfo(p.role)?.hasNightAction === true);
  display.printInfo(`Processing night actions for ${actionPlayers.length} players...`);

  const actionCalls = actionPlayers.map(player =>
    callLLM({ ...buildNightActionPrompt(player, state, agreedKillTarget), model: PLAYER_MODEL })
      .then(r => ({ player, result: r }))
      .catch(e => {
        console.error(`  [Night Action] ${player.name} error: ${e.message}`);
        return { player, result: { action_target: null, private_reasoning: 'Error', last_will_update: '' } };
      })
  );

  const actionResults = await Promise.all(actionCalls);

  for (const { player, result } of actionResults) {
    state.logPrivate(player.id, result.private_reasoning);
    emit('private', { playerId: player.id, playerName: player.name, reasoning: result.private_reasoning });
    state.updateLastWill(player.id, result.last_will_update);

    const target = result.action_target ? state.getPlayerByName(result.action_target) : null;
    const targetId = target?.id ?? null;
    display.printInfo(`${player.name} (${player.role}) targets: ${result.action_target ?? 'nobody'}`);
    emit('night_action', { playerId: player.id, playerName: player.name, role: player.role, targetName: result.action_target ?? null });

    switch (player.role) {
      case 'Godfather': state.night_actions.kill_target = targetId; break;
      case 'Mafioso': if (!state.night_actions.kill_target) state.night_actions.kill_target = targetId; break;
      case 'Doctor': state.night_actions.heal_target = targetId; break;
      case 'Sheriff': state.night_actions.sheriff_target = targetId; break;
      case 'Investigator': state.night_actions.investigator_target = targetId; break;
      case 'Escort': state.night_actions.escort_target = targetId; break;
      case 'Consigliere': state.night_actions.consigliere_target = targetId; break;
      case 'Vigilante': state.night_actions.vigilante_target = targetId; break;
      case 'Serial Killer': state.night_actions.kill_target = targetId; break;
    }
  }

  // Game Master resolution
  display.printInfo('Resolving night actions...');
  emit('info', { message: 'Dawn approaches — resolving night actions…' });

  let gmResult;
  try {
    gmResult = await callLLM({
      ...buildGameMasterPrompt(state),
      model: GM_MODEL,
      temperature: GM_TEMP,
      maxTokens: GM_MAX,
    });
  } catch (e) {
    console.error(`  [Game Master] Error: ${e.message}`);
    gmResult = { deaths: [], saves: [], roleblocks: [], investigation_results: [], state_updates: { player_guilt: [], mayor_revealed: [] } };
  }

  // Saves
  const savedIds = new Set((gmResult.saves ?? []).map(s => s.player_id));
  for (const save of gmResult.saves ?? []) {
    const p = state.getPlayer(save.player_id);
    if (p) {
      display.printEvent('SAVE', `${p.name} was protected by the Doctor and survived!`);
      state.logEvent('SAVE', `${p.name} was healed by the Doctor and survived the night.`);
      emit('event', { eventType: 'SAVE', description: `${p.name} was protected by the Doctor tonight!`, playerId: p.id, playerName: p.name });
    }
  }

  // Roleblocks
  for (const rb of gmResult.roleblocks ?? []) {
    const p = state.getPlayer(rb.player_id);
    if (p) {
      display.printEvent('ROLEBLOCK', `${p.name}'s ${rb.action_cancelled} was blocked by the Escort.`);
      state.logEvent('ROLEBLOCK', `${p.name} was roleblocked — ${rb.action_cancelled} cancelled.`);
      emit('event', { eventType: 'ROLEBLOCK', description: `${p.name} was roleblocked — their action was cancelled.`, playerId: p.id, playerName: p.name });
      if (state.private_knowledge[p.id]) state.private_knowledge[p.id].was_roleblocked_last_night = true;
    }
  }
  for (const p of living) {
    if (!gmResult.roleblocks?.find(rb => rb.player_id === p.id)) {
      if (state.private_knowledge[p.id]) state.private_knowledge[p.id].was_roleblocked_last_night = false;
    }
  }

  // Deaths
  for (const death of gmResult.deaths ?? []) {
    if (savedIds.has(death.player_id)) continue;
    const p = state.getPlayer(death.player_id);
    if (p && p.alive) {
      state.killPlayer(death.player_id, death.cause, true);
      display.printEvent('DEATH', `${p.name} has died! Cause: ${death.cause}. Role: ${p.role}`);
      emit('event', { eventType: 'DEATH', description: `${p.name} was found dead. ${death.cause}. Role: ${p.role}`, playerId: p.id, playerName: p.name, role: p.role, cause: death.cause });

      const will = state.last_will[p.id];
      if (will) emit('event', { eventType: 'LAST_WILL', description: `${p.name}'s Last Will: "${will}"`, playerId: p.id, will });
    }
  }

  // Investigations
  for (const inv of gmResult.investigation_results ?? []) {
    const investigator = state.getPlayer(inv.investigator_id);
    const target = state.getPlayer(inv.target_id);
    if (investigator && target) {
      state.addInvestigationResult(inv.investigator_id, inv.target_id, inv.result);
      display.printEvent('INVESTIGATION', `${investigator.name} investigated ${target.name}: "${inv.result}"`);
      state.logEvent('INVESTIGATION', `${investigator.name} investigated ${target.name} — result: ${inv.result}`);
      emit('event', { eventType: 'INVESTIGATION', description: `${investigator.name} investigated ${target.name}: "${inv.result}"`, investigatorId: investigator.id, targetId: target.id, result: inv.result, investigatorRole: inv.investigator_role });
    }
  }

  // Guilt
  for (const id of gmResult.state_updates?.player_guilt ?? []) {
    state.vigilante_guilt[id] = true;
    const p = state.getPlayer(id);
    if (p) {
      state.logEvent('GUILT', `${p.name} shot a Town member and will die of guilt.`);
      emit('event', { eventType: 'GUILT', description: `${p.name} (Vigilante) shot a Town member and will die tomorrow night!`, playerId: p.id });
    }
  }

  const narratorText = await narrate('NIGHT', state);
  if (narratorText) emit('narration', { text: narratorText, phase: 'NIGHT', cycle: state.cycle });
  return gmResult;
}

// ── Narrator ──────────────────────────────────────────────────────────────────

async function narrate(phase, state, extraEvents = []) {
  try {
    const text = await callLLM({
      ...buildNarratorPrompt(phase, extraEvents, state),
      expectJson: false,
    });
    display.printNarration(text);
    return text;
  } catch (e) {
    console.error(`  [Narrator] Error: ${e.message}`);
    return '';
  }
}

// ── Main Game Loop ────────────────────────────────────────────────────────────

export async function runGame(roleList, playerCount) {
  const narratorLog = [];
  const state = await initGame(roleList, playerCount);
  let gameOver = false;
  let winner = null;
  let winReason = '';
  const MAX_CYCLES = 15;

  while (!gameOver && state.cycle <= MAX_CYCLES) {
    await runDayDiscussion(state);

    const earlyCheck = checkWinConditions(state.players);
    if (earlyCheck?.endsGame) { winner = earlyCheck.winner; winReason = earlyCheck.reason; break; }

    const lynchedId = await runDayVoting(state);
    state.resetTrial();

    const postLynch = checkWinConditions(state.players, lynchedId);
    if (postLynch) {
      if (postLynch.endsGame) { winner = postLynch.winner; winReason = postLynch.reason; gameOver = true; }
      else {
        display.printEvent('WIN', postLynch.reason);
        state.logEvent('WIN', postLynch.reason);
        emit('event', { eventType: 'JESTER_WIN', description: postLynch.reason });
      }
      if (gameOver) break;
    }

    await runNight(state);

    const postNight = checkWinConditions(state.players);
    if (postNight?.endsGame) {
      winner = postNight.winner;
      winReason = postNight.reason;
      gameOver = true;
      break;
    }

    for (const [idStr, hasGuilt] of Object.entries(state.vigilante_guilt)) {
      if (hasGuilt) {
        const p = state.getPlayer(Number(idStr));
        if (p?.alive) {
          state.killPlayer(p.id, 'Died of guilt', true);
          display.printEvent('DEATH', `${p.name} died of guilt for killing a Town member!`);
          emit('event', { eventType: 'DEATH', description: `${p.name} died of guilt!`, playerId: p.id, playerName: p.name, role: p.role, cause: 'Died of guilt' });
          delete state.vigilante_guilt[idStr];
        }
      }
    }

    state.cycle++;
  }

  if (!winner) { winner = 'Draw'; winReason = 'Maximum cycles reached — game ended in a draw.'; }

  display.printGameOver(winner, winReason, state.players, state.last_will, state.private_logs);

  emit('game_over', {
    winner,
    reason: winReason,
    players: state.players.map(p => ({ id: p.id, name: p.name, role: p.role, alive: p.alive })),
    lastWills: state.last_will,
    privateLogs: state.private_logs,
  });

  display.printInfo('Generating markdown report...');
  const reportPath = generateMarkdownReport(state, winner, winReason, narratorLog);
  console.log(`\n  📄 Report saved to: ${reportPath}\n`);
  emit('info', { message: `Game complete! Report saved to ${reportPath}` });

  return { state, winner, winReason, reportPath };
}
