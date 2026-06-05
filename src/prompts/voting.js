import { PERSONALITY_DESCRIPTIONS } from './init.js';
import { getRoleInfo } from '../game/roles.js';

function sharedHeader(player, state) {
  const role = getRoleInfo(player.role);
  const pk = state.private_knowledge[player.id];
  const personalityDesc = PERSONALITY_DESCRIPTIONS[player.personality] ?? player.personality;
  const mafiaTeamStr = pk?.known_mafia_teammates?.length
    ? pk.known_mafia_teammates.map(m => `${m.name} (${m.role})`).join(', ')
    : 'None';

  const livingNames = state.players.filter(p => p.alive).map(p => {
    const tag = p.mayor_revealed ? ' [MAYOR]' : '';
    return `${p.name}${tag}`;
  }).join(', ');

  const deadStr = state.death_log.length
    ? state.death_log.map(d => {
        const p = state.players.find(pl => pl.id === d.player_id);
        return `${p?.name}(${d.role_revealed ?? '?'})`;
      }).join(', ')
    : 'None';

  const chatSummary = state.public_chat_log
    .filter(c => c.cycle === state.cycle)
    .slice(-20)
    .map(c => {
      const name = state.players.find(p => p.id === c.player_id)?.name ?? 'Unknown';
      return `[${name}]: ${c.message}`;
    }).join('\n');

  return `YOUR IDENTITY:
- Name: ${player.name}
- Role: ${player.role}
- Win Condition: ${role?.winCondition ?? 'Unknown'}
- Mafia Teammates (if Mafia): ${mafiaTeamStr}
- Private Notes: ${pk?.private_notes || 'None.'}
- Personality: ${player.personality} — ${personalityDesc}

CURRENT GAME STATE:
- Cycle: Day ${state.cycle}
- Living Players: ${livingNames}
- Dead Players: ${deadStr}
- Today's Discussion:
${chatSummary || 'None.'}`;
}

export function buildNominationPrompt(player, state) {
  const livingNominees = state.players
    .filter(p => p.alive && p.id !== player.id)
    .map(p => p.name).join(', ');

  const system = `You are playing Town of Salem as a specific character.

${sharedHeader(player, state)}

TASK: It is now the voting phase. Nominate someone to put on trial (or pass).
- Town: vote based on suspicion from discussion and investigations
- Mafia: coordinate votes toward an innocent Town target; protect teammates
- Jester: try to get yourself nominated
- You CANNOT nominate yourself (except Jester — pick the next best option to draw attention)

Eligible targets: ${livingNominees}

OUTPUT — return ONLY this JSON:
{
  "nominate": "PlayerName | null",
  "nomination_reason_public": "string | null",
  "private_reasoning": "string"
}`;

  return { system, user: `Who does ${player.name} nominate?` };
}

export function buildDefensePrompt(player, state) {
  const system = `You are playing Town of Salem as a specific character.

${sharedHeader(player, state)}

TASK: You have been put on trial. Give your defense statement.
- Town: be truthful, share investigation results, cite your role
- Mafia: lie convincingly, claim a Town role, accuse someone else
- Jester: appear guilty on purpose — say suspicious things but seem like you're just bad at the game
- Serial Killer: blend in, claim innocence, act confused/offended

OUTPUT — return ONLY this JSON:
{
  "defense_statement": "string (2-5 sentences spoken to the town)",
  "role_claim": "string | null",
  "private_reasoning": "string"
}`;

  return { system, user: `${player.name} defends themselves.` };
}

export function buildVerdictPrompt(player, defendant, defenseStatement, state) {
  const system = `You are playing Town of Salem as a specific character.

${sharedHeader(player, state)}

ON TRIAL: ${defendant.name}
Defense Statement: "${defenseStatement}"
${defendant.revealed_role ? `Revealed Role: ${defendant.revealed_role}` : ''}

TASK: Vote guilty or innocent.
- Town: reason carefully — a wrong lynch can cost the game
- Mafia: vote guilty on Town players; protect teammates
- Jester: if this is you, you can't vote on yourself. Otherwise vote as seems strategic.
- Consider their defense, behavior today, and what you know privately.

OUTPUT — return ONLY this JSON:
{
  "verdict": "guilty | innocent | abstain",
  "public_statement": "string | null",
  "private_reasoning": "string"
}`;

  return { system, user: `${player.name} votes on ${defendant.name}'s trial.` };
}
