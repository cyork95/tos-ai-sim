import { isMafia, isKiller } from './roles.js';

/**
 * Check win conditions after every death.
 * Returns { winner, reason } or null if the game continues.
 * Jester win is handled separately (returns { winner: 'Jester', jesterId }) without ending the game.
 */
export function checkWinConditions(players, justLynchedId = null) {
  const living = players.filter(p => p.alive);

  const livingMafia = living.filter(p => isMafia(p.role));
  const livingSK = living.filter(p => p.role === 'Serial Killer');
  const livingJester = living.filter(p => p.role === 'Jester');
  const livingTown = living.filter(p => !isMafia(p.role) && p.role !== 'Jester' && p.role !== 'Serial Killer');

  // Jester win: triggered immediately on lynch
  if (justLynchedId !== null) {
    const lynched = players.find(p => p.id === justLynchedId);
    if (lynched?.role === 'Jester') {
      return { winner: 'Jester', jesterId: justLynchedId, endsGame: false, reason: `${lynched.name} was lynched — and they were the Jester! The Jester wins!` };
    }
  }

  // Draw: everyone is dead
  if (living.length === 0) {
    return { winner: 'Draw', endsGame: true, reason: 'All players have died. The game ends in a draw.' };
  }

  // Serial Killer win: SK alive, all other killers dead
  if (livingSK.length > 0 && livingMafia.length === 0) {
    const sk = livingSK[0];
    if (living.length === 1 || living.every(p => p.role === 'Serial Killer')) {
      return { winner: 'Serial Killer', endsGame: true, reason: `${sk.name} is the last one standing. The Serial Killer wins!` };
    }
    // SK wins if only Town remains and Mafia is gone — per spec "last non-Town player alive"
    // More accurately: SK wins if they are sole non-Town player
    const nonSK = living.filter(p => p.role !== 'Serial Killer');
    const nonSKKillers = nonSK.filter(p => isKiller(p.role));
    if (nonSKKillers.length === 0 && livingMafia.length === 0) {
      return { winner: 'Serial Killer', endsGame: true, reason: `${sk.name} has outlasted all other threats. The Serial Killer wins!` };
    }
  }

  // Mafia win: mafia count >= town + neutrals (excluding Jester)
  const nonMafiaLiving = living.filter(p => !isMafia(p.role) && p.role !== 'Jester');
  if (livingMafia.length > 0 && livingMafia.length >= nonMafiaLiving.length) {
    return { winner: 'Mafia', endsGame: true, reason: `The Mafia has taken control of Salem. The Mafia wins!` };
  }

  // Town win: all Mafia dead AND all Serial Killers dead
  if (livingMafia.length === 0 && livingSK.length === 0) {
    return { winner: 'Town', endsGame: true, reason: 'All threats have been eliminated. The Town wins!' };
  }

  return null;
}
