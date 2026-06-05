import { PERSONALITY_DESCRIPTIONS } from './init.js';
import { getRoleInfo } from '../game/roles.js';

function sharedNightHeader(player, state) {
  const role = getRoleInfo(player.role);
  const pk = state.private_knowledge[player.id];
  const personalityDesc = PERSONALITY_DESCRIPTIONS[player.personality] ?? player.personality;
  const mafiaTeamStr = pk?.known_mafia_teammates?.length
    ? pk.known_mafia_teammates.map(m => `${m.name} (${m.role})`).join(', ')
    : 'None';

  const livingNames = state.players.filter(p => p.alive && p.id !== player.id).map(p => p.name).join(', ');
  const deadStr = state.death_log.length
    ? state.death_log.map(d => {
        const p = state.players.find(pl => pl.id === d.player_id);
        return `${p?.name}(${d.role_revealed ?? '?'})`;
      }).join(', ')
    : 'None';

  return `YOUR IDENTITY:
- Name: ${player.name}
- Role: ${player.role}
- Win Condition: ${role?.winCondition ?? 'Unknown'}
- Mafia Teammates (if Mafia): ${mafiaTeamStr}
- Private Notes: ${pk?.private_notes || 'None.'}
- Investigation History: ${pk?.investigation_results?.length ? JSON.stringify(pk.investigation_results) : 'None'}
- Personality: ${player.personality} — ${personalityDesc}

CURRENT GAME STATE:
- Cycle: Night ${state.cycle}
- Living Players (excluding you): ${livingNames}
- Dead Players: ${deadStr}`;
}

export function buildMafiaChat(mafiaPlayers, state) {
  const memberStr = mafiaPlayers.map(p => `${p.name} (${p.role})`).join(', ');
  const livingStr = state.players.filter(p => p.alive && !state.mafia_team.includes(p.id)).map(p => p.name).join(', ');
  const deadStr = state.death_log.length
    ? state.death_log.map(d => {
        const p = state.players.find(pl => pl.id === d.player_id);
        return `${p?.name}(${d.role_revealed ?? '?'})`;
      }).join(', ')
    : 'None';

  const chatSummary = state.public_chat_log
    .filter(c => c.cycle === state.cycle)
    .slice(-15)
    .map(c => {
      const name = state.players.find(p => p.id === c.player_id)?.name ?? 'Unknown';
      return `[${name}]: ${c.message}`;
    }).join('\n');

  const system = `You are generating the private Mafia chat for Night ${state.cycle}.

Mafia team: ${memberStr}
Living Town/Neutral targets: ${livingStr}
Dead players: ${deadStr}

Today's public discussion highlights:
${chatSummary || 'No public chat today.'}

Generate SHORT, realistic chat messages between Mafia members as they coordinate. They are scheming — make it feel like real player chat. Consider:
- Who is most suspicious of them?
- Who should they kill (Doctor? Sheriff? high-suspicion player?)
- What cover story to push tomorrow?

OUTPUT — return ONLY this JSON:
{
  "mafia_chat": [
    { "player_name": "string", "message": "string" }
  ],
  "agreed_kill_target": "PlayerName | null",
  "backup_kill_target": "PlayerName | null",
  "cover_story_plan": "string"
}`;

  return { system, user: 'Generate the Mafia night chat.' };
}

export function buildNightActionPrompt(player, state, mafiaKillTarget = null) {
  const role = getRoleInfo(player.role);
  const pk = state.private_knowledge[player.id];
  const targets = state.players.filter(p => p.alive && p.id !== player.id).map(p => p.name);

  const roleGuidance = {
    Sheriff: 'Investigate the player you find most suspicious. You will learn if they are Suspicious or Not Suspicious.',
    Doctor: 'Heal whoever you think is most likely to be killed tonight. You cannot self-heal two nights in a row.',
    Investigator: 'Investigate to confirm or rule out suspicions. You will get a list of possible roles.',
    Escort: 'Roleblock whoever you think is Mafia or Serial Killer — cancels their night action.',
    Vigilante: 'Only shoot if highly confident. Killing a Town member gives you guilt and you die the following night.',
    Godfather: `Confirm or override the kill target. Mafia agreed target: ${mafiaKillTarget ?? 'None yet'}. You appear Not Suspicious to Sheriff.`,
    Mafioso: `Execute the Godfather's chosen target: ${mafiaKillTarget ?? 'None — wait for Godfather'}. If Godfather is dead, choose independently.`,
    Consigliere: 'Investigate the player whose role would be most useful to know. You get their EXACT role.',
    'Serial Killer': 'Kill whoever poses the most threat or seems least noticed. You are immune to roleblocking.',
    Mayor: 'You have no night action. You may choose to reveal as Mayor during the day instead.',
    Jester: 'You have no night action.',
  };

  const wasRoleblocked = state.private_knowledge[player.id]?.was_roleblocked_last_night ?? false;

  const system = `You are playing Town of Salem as a specific character during the night phase.

${sharedNightHeader(player, state)}
- Were you roleblocked last night: ${wasRoleblocked}
- Mafia agreed kill target (if Mafia): ${mafiaKillTarget ?? 'N/A'}

YOUR ROLE GUIDANCE: ${roleGuidance[player.role] ?? 'No night action available.'}

Available targets: ${targets.join(', ')}

TASK: Choose your night action target (or null to skip).

OUTPUT — return ONLY this JSON:
{
  "action_target": "PlayerName | null",
  "private_reasoning": "string",
  "last_will_update": "string"
}`;

  return { system, user: `What does ${player.name} do tonight?` };
}
