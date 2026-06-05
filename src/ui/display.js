import { PERSONALITY_DESCRIPTIONS } from '../prompts/init.js';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgBlue: '\x1b[44m',
};

const c = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;

export function printHeader(text) {
  const bar = '═'.repeat(60);
  console.log(`\n${c('cyan', bar)}`);
  console.log(c('bold', `  ${text}`));
  console.log(`${c('cyan', bar)}\n`);
}

export function printPhaseHeader(phase, cycle) {
  const icons = { DAY_DISCUSSION: '☀', DAY_VOTING: '⚖', NIGHT: '🌙', GAME_OVER: '🏁' };
  const icon = icons[phase] ?? '•';
  console.log(`\n${c('yellow', `── ${icon} ${phase.replace('_', ' ')} | Cycle ${cycle} ──────────────────────`)}`);
}

export function printNarration(text) {
  console.log(`\n${c('dim', `  "${text}"`)}\n`);
}

export function printChat(playerName, message, isMafia = false) {
  const prefix = isMafia ? c('red', `[MAFIA] ${playerName}`) : c('green', playerName);
  console.log(`  ${prefix}: ${message}`);
}

export function printEvent(type, description) {
  const icons = {
    DEATH: c('red', '💀'),
    SAVE: c('green', '🛡'),
    ROLEBLOCK: c('yellow', '🚫'),
    INVESTIGATION: c('blue', '🔍'),
    LYNCH: c('magenta', '⚖'),
    VOTE: c('dim', '🗳'),
    WIN: c('bold', '🏆'),
  };
  const icon = icons[type] ?? '•';
  console.log(`  ${icon} ${description}`);
}

export function printPlayerCard(player) {
  const personalityDesc = PERSONALITY_DESCRIPTIONS[player.personality] ?? player.personality;
  const faction = ['Godfather', 'Mafioso', 'Consigliere'].includes(player.role) ? c('red', 'Mafia')
    : ['Jester', 'Serial Killer'].includes(player.role) ? c('yellow', 'Neutral')
    : c('green', 'Town');
  console.log(`  ${c('bold', player.name.padEnd(10))} | ${player.role.padEnd(15)} | ${faction} | ${c('dim', player.personality)}`);
  console.log(`  ${' '.repeat(12)} ${c('dim', personalityDesc)}`);
}

export function printGameSetup(players) {
  printHeader('TOWN OF SALEM — AI SIMULATION');
  console.log(c('bold', '  Cast of Characters:\n'));
  for (const p of players) {
    printPlayerCard(p);
    console.log();
  }
}

export function printPrivateReasoning(playerName, reasoning) {
  console.log(`  ${c('dim', `[${playerName} thinks]: ${reasoning}`)}`);
}

export function printGameOver(winner, reason, players, lastWills, privateLogs) {
  printHeader(`GAME OVER — ${winner.toUpperCase()} WINS`);
  console.log(c('bold', `  ${reason}\n`));

  console.log(c('bold', '  Final Roles:'));
  for (const p of players) {
    const status = p.alive ? c('green', 'ALIVE') : c('red', 'DEAD');
    console.log(`  ${p.name.padEnd(10)} — ${p.role.padEnd(15)} [${status}]`);
  }

  console.log(c('bold', '\n  Last Wills:'));
  for (const p of players) {
    const will = lastWills[p.id];
    if (will) {
      console.log(`  ${c('cyan', p.name)}: ${will}`);
    }
  }

  console.log(c('bold', '\n  Private Reasoning Log (Full):'));
  for (const entry of privateLogs) {
    console.log(`  ${c('dim', `[${entry.name} | ${entry.phase} C${entry.cycle}]:`)} ${entry.reasoning}`);
  }
}

export function printSeparator() {
  console.log(c('dim', '  ' + '·'.repeat(56)));
}

export function printInfo(msg) {
  console.log(c('dim', `  ${msg}`));
}
