import dotenv from 'dotenv';
dotenv.config({ override: true });
import { runGame } from './src/game/gameLoop.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf8'));

// Parse CLI arguments
const args = process.argv.slice(2);
let playerCount = config.playerCount;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--players' && args[i + 1]) {
    playerCount = parseInt(args[i + 1], 10);
  }
}

const validCounts = [7, 9, 11];
if (!validCounts.includes(playerCount)) {
  console.error(`Invalid player count ${playerCount}. Choose 7, 9, or 11.`);
  process.exit(1);
}

const roleList = config.roleSets[String(playerCount)];
if (!roleList) {
  console.error(`No role set defined for ${playerCount} players.`);
  process.exit(1);
}

console.log(`\nStarting Town of Salem AI Simulation`);
console.log(`Players: ${playerCount} | Roles: ${roleList.join(', ')}`);
console.log(`LLM: ${config.llm.playerModel} (players) / ${config.llm.gameMasterModel} (GM)\n`);

runGame(roleList, playerCount).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
