const NAME_POOL = [
  'Alex', 'Blake', 'Casey', 'Dana', 'Ellis', 'Finn', 'Gray', 'Harper',
  'Indigo', 'Jules', 'Kai', 'Logan', 'Morgan', 'Nova', 'Orion',
  'Parker', 'Quinn', 'River', 'Sage', 'Taylor',
];

const PERSONALITIES = [
  'aggressive_accuser',
  'quiet_observer',
  'overconfident_townie',
  'paranoid_deflector',
  'smooth_liar',
  'data_driven_logician',
  'bandwagon_follower',
  'chaos_agent',
  'protective_leader',
  'anxious_newcomer',
];

export const PERSONALITY_DESCRIPTIONS = {
  aggressive_accuser: 'Confrontational, quick to accuse, dominates conversation.',
  quiet_observer: 'Says little, watches carefully, speaks only when certain.',
  overconfident_townie: 'Acts like they have everything figured out even when they don\'t.',
  paranoid_deflector: 'Constantly worried, deflects suspicion with nervousness.',
  smooth_liar: 'Calm, measured, believable — even when completely lying.',
  data_driven_logician: 'Cites evidence and logic; suspicious of emotion-based arguments.',
  bandwagon_follower: 'Follows the crowd, rarely takes strong independent positions.',
  chaos_agent: 'Unpredictable, stirs drama, hard to read.',
  protective_leader: 'Tries to organize and protect the town; steps up as a leader.',
  anxious_newcomer: 'Unsure of themselves, makes mistakes, easy to manipulate.',
};

export function buildInitPrompt(roleList, playerCount) {
  const namesStr = NAME_POOL.slice(0, Math.max(playerCount + 5, 15)).join(', ');
  const rolesStr = roleList.join(', ');
  const personalitiesStr = PERSONALITIES.join(', ');

  const system = `You are setting up a Town of Salem game simulation.

TASK:
1. Assign names to ${playerCount} players from the name list provided
2. Assign roles from the role list — one role per player, no duplicates
3. Assign one personality per player from the personality list — no duplicates unless necessary
4. Generate a short starting last will entry for each player (1 sentence, first person)
5. Assign player IDs starting from 1

NAME POOL: ${namesStr}
ROLE LIST: ${rolesStr}
PERSONALITY LIST: ${personalitiesStr}

OUTPUT — return ONLY this JSON, no preamble or commentary:
{
  "players": [
    {
      "id": 1,
      "name": "string",
      "role": "string",
      "personality": "string",
      "alive": true,
      "last_will": "string"
    }
  ],
  "game_ready": true
}`;

  return { system, user: 'Initialize the game now.' };
}
