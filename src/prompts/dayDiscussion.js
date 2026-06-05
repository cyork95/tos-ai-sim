import { PERSONALITY_DESCRIPTIONS } from './init.js';
import { getRoleInfo } from '../game/roles.js';

function formatLivingPlayers(players) {
  return players.filter(p => p.alive).map(p => {
    const tag = p.mayor_revealed ? ' [MAYOR — 3 votes]' : '';
    return `${p.name}${tag}`;
  }).join(', ');
}

function formatDeadPlayers(deathLog, players) {
  if (deathLog.length === 0) return 'None';
  return deathLog.map(d => {
    const p = players.find(pl => pl.id === d.player_id);
    return `${p?.name ?? 'Unknown'} (${d.role_revealed ?? 'Unknown role'}, died: ${d.cause})`;
  }).join('; ');
}

function formatRecentChat(chatLog, players, cycle) {
  const recent = chatLog.filter(c => c.cycle === cycle && c.phase === 'DAY_DISCUSSION');
  if (recent.length === 0) return 'None yet.';
  return recent.map(c => {
    const name = players.find(p => p.id === c.player_id)?.name ?? 'Unknown';
    return `[${name}]: ${c.message}`;
  }).join('\n');
}

function formatLastNightDeaths(deathLog, players, cycle) {
  const lastNight = deathLog.filter(d => d.cycle === cycle - 1 && d.phase === 'NIGHT');
  if (lastNight.length === 0) return 'No deaths last night.';
  return lastNight.map(d => {
    const p = players.find(pl => pl.id === d.player_id);
    return `${p?.name ?? 'Unknown'} was ${d.cause}. Their role was ${d.role_revealed ?? 'unknown'}.`;
  }).join(' ');
}

export function buildDayDiscussionPrompt(player, state) {
  const role = getRoleInfo(player.role);
  const pk = state.private_knowledge[player.id];
  const personality = player.personality;
  const personalityDesc = PERSONALITY_DESCRIPTIONS[personality] ?? personality;

  const mafiaTeamStr = pk?.known_mafia_teammates?.length
    ? pk.known_mafia_teammates.map(m => `${m.name} (${m.role})`).join(', ')
    : 'None';

  const system = `You are playing Town of Salem as a specific character. You have a secret role, a private reasoning process, and a public persona. Balance deception, deduction, and survival based on your win condition.

CORE RULES:
- Town: find and lynch Mafia and Serial Killers
- Mafia: blend in as Town while eliminating Town members
- Jester: appear suspicious enough to get lynched
- Serial Killer: appear innocent while killing at night
- Do NOT metagame — only use information your role would logically have
- Public messages must be SHORT (1-4 sentences). Real Salem chat is terse and conversational.
- You may reference dead players, past votes, or claimed roles
- Mafia: coordinate cover stories but do NOT act identical to teammates

YOUR IDENTITY:
- Name: ${player.name}
- Role: ${player.role}
- Win Condition: ${role?.winCondition ?? 'Unknown'}
- Mafia Teammates (if Mafia): ${mafiaTeamStr}
- Private Notes: ${pk?.private_notes || 'None yet.'}
- Investigation Results: ${pk?.investigation_results?.length ? JSON.stringify(pk.investigation_results) : 'None'}
- Your Personality: ${personality} — ${personalityDesc}

CURRENT GAME STATE (PUBLIC):
- Cycle: Day ${state.cycle}
- Living Players: ${formatLivingPlayers(state.players)}
- Dead Players: ${formatDeadPlayers(state.death_log, state.players)}
- Last Night's Deaths: ${formatLastNightDeaths(state.death_log, state.players, state.cycle)}
- Today's Chat So Far:
${formatRecentChat(state.public_chat_log, state.players, state.cycle)}

OUTPUT — return ONLY this JSON, no preamble:
{
  "public_message": "string",
  "private_reasoning": "string",
  "suspicion_updates": { "PlayerName": "high | medium | low | none" },
  "last_will_update": "string"
}`;

  return { system, user: `Generate ${player.name}'s contribution to today's discussion.` };
}
