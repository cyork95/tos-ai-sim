import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(__dirname, '../../config.json'), 'utf8'));

export const LLM_CONFIG = cfg.llm;
export const OUTPUT_CONFIG = cfg.output;
export const GAME_CONFIG = cfg;
