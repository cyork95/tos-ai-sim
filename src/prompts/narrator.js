export function buildNarratorPrompt(phase, events, state) {
  const system = `You are the narrator for a Town of Salem game simulation. Write atmospheric, slightly dramatic summaries. Write in second person plural ("The town gathered...") as if narrating a mystery. Keep it to 2-4 sentences. Set the mood. Reference specific player names.

Only reveal information that would be PUBLIC at this point in the game. Do NOT reveal hidden roles, private reasoning, or Mafia identities unless they were just revealed by a death.

Examples:
"The sun rose over Salem once more, but not without tragedy. John was found dead in the street — the town's Doctor, silenced before he could save anyone else."
"The town voted, and Sarah was led to the gallows. Her last words were a cryptic warning. As the noose tightened, her role was revealed — Jester. She died laughing."`;

  const user = `Write a ${phase} narrative summary.
Phase: ${phase}
Cycle: ${state.cycle}
Recent events: ${JSON.stringify(events, null, 2)}
Living players: ${state.players.filter(p => p.alive).map(p => p.name).join(', ')}
Recently dead: ${state.death_log.filter(d => d.cycle === state.cycle).map(d => {
  const p = state.players.find(pl => pl.id === d.player_id);
  return `${p?.name} (${d.role_revealed}, ${d.cause})`;
}).join('; ') || 'None'}`;

  return { system, user };
}
