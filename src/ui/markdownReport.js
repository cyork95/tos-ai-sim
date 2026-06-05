import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PERSONALITY_DESCRIPTIONS } from '../prompts/init.js';
import { OUTPUT_CONFIG } from '../llm/config.js';

/**
 * Generate a full markdown game report and write it to the output directory.
 * Returns the file path.
 */
export function generateMarkdownReport(state, winner, winReason, narratorLog) {
  const lines = [];
  const { players, death_log, public_chat_log, mafia_chat_log, event_log, private_logs, last_will, cycle } = state;

  // ── Title ──────────────────────────────────────────────────────────────────
  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  lines.push(`# Town of Salem — AI Simulation Report`);
  lines.push(`**Game ID:** \`${state.game_id}\`  `);
  lines.push(`**Date:** ${new Date().toLocaleString()}  `);
  lines.push(`**Cycles:** ${cycle}  `);
  lines.push(`**Winner:** ${winner}  `);
  lines.push(`**Result:** ${winReason}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Cast of Characters ─────────────────────────────────────────────────────
  lines.push('## Cast of Characters');
  lines.push('');
  lines.push('| # | Name | Role | Faction | Personality | Status |');
  lines.push('|---|------|------|---------|-------------|--------|');
  for (const p of players) {
    const faction = ['Godfather', 'Mafioso', 'Consigliere'].includes(p.role) ? '🔴 Mafia'
      : ['Jester', 'Serial Killer'].includes(p.role) ? '🟡 Neutral'
      : '🟢 Town';
    const status = p.alive ? '✅ Survived' : '💀 Dead';
    const personalityLabel = p.personality.replace(/_/g, ' ');
    lines.push(`| ${p.id} | **${p.name}** | ${p.role} | ${faction} | ${personalityLabel} | ${status} |`);
  }
  lines.push('');
  lines.push('### Personality Descriptions');
  lines.push('');
  for (const p of players) {
    const desc = PERSONALITY_DESCRIPTIONS[p.personality] ?? p.personality;
    lines.push(`- **${p.name}** *(${p.personality.replace(/_/g, ' ')})*: ${desc}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Game Timeline ─────────────────────────────────────────────────────────
  lines.push('## Game Timeline');
  lines.push('');

  let currentCycle = 0;
  let currentPhase = '';

  for (let c = 1; c <= cycle; c++) {
    // Find narration for this cycle's day phase
    const dayNarration = narratorLog.find(n => n.cycle === c && n.phase === 'DAY_DISCUSSION');
    const nightNarration = narratorLog.find(n => n.cycle === c && n.phase === 'NIGHT');

    // ── Day Discussion ───────────────────────────────────────────────────────
    lines.push(`### ☀️ Day ${c} — Discussion`);
    lines.push('');
    if (dayNarration) {
      lines.push(`> ${dayNarration.text}`);
      lines.push('');
    }

    const dayChats = public_chat_log.filter(ch => ch.cycle === c && ch.phase === 'DAY_DISCUSSION');
    if (dayChats.length > 0) {
      lines.push('**Public Discussion:**');
      lines.push('');
      for (const ch of dayChats) {
        const p = players.find(pl => pl.id === ch.player_id);
        lines.push(`> **${p?.name ?? 'Unknown'}**: ${ch.message}`);
      }
      lines.push('');
    }

    // Day events (deaths from lynches, votes, etc.)
    const dayEvents = event_log.filter(e => e.cycle === c && e.phase === 'DAY_VOTING');
    if (dayEvents.length > 0) {
      lines.push('**⚖️ Voting & Trial:**');
      lines.push('');
      for (const ev of dayEvents) {
        if (ev.type === 'DEATH') lines.push(`- 💀 ${ev.description}`);
        else if (ev.type === 'CHAT') lines.push(`> ${ev.description}`);
        else lines.push(`- ${ev.description}`);
      }
      lines.push('');
    }

    // Deaths on this day
    const dayDeaths = death_log.filter(d => d.cycle === c && d.phase === 'DAY_VOTING');
    if (dayDeaths.length > 0) {
      for (const d of dayDeaths) {
        const p = players.find(pl => pl.id === d.player_id);
        lines.push(`**Lynch:** ${p?.name} was executed. Role revealed: **${d.role_revealed ?? 'Unknown'}**`);
        const will = last_will[d.player_id];
        if (will) {
          lines.push('');
          lines.push(`*${p?.name}'s Last Will:*`);
          lines.push(`> ${will}`);
        }
        lines.push('');
      }
    }

    // ── Night ────────────────────────────────────────────────────────────────
    if (c < cycle || death_log.some(d => d.cycle === c && d.phase === 'NIGHT')) {
      lines.push(`### 🌙 Night ${c}`);
      lines.push('');
      if (nightNarration) {
        lines.push(`> ${nightNarration.text}`);
        lines.push('');
      }

      // Mafia chat
      const mafChats = mafia_chat_log.filter(ch => ch.cycle === c && ch.phase === 'NIGHT');
      if (mafChats.length > 0) {
        lines.push('<details>');
        lines.push('<summary>🔴 Mafia Chat (hidden during game)</summary>');
        lines.push('');
        for (const ch of mafChats) {
          const p = players.find(pl => pl.id === ch.player_id);
          lines.push(`> **${p?.name ?? 'Unknown'}**: ${ch.message}`);
        }
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }

      // Night events
      const nightEvents = event_log.filter(e => e.cycle === c && e.phase === 'NIGHT' && ['DEATH', 'SAVE', 'ROLEBLOCK', 'INVESTIGATION'].includes(e.type));
      if (nightEvents.length > 0) {
        lines.push('**Night Outcomes:**');
        lines.push('');
        for (const ev of nightEvents) {
          const icons = { DEATH: '💀', SAVE: '🛡️', ROLEBLOCK: '🚫', INVESTIGATION: '🔍' };
          lines.push(`- ${icons[ev.type] ?? '•'} ${ev.description}`);
        }
        lines.push('');
      }

      const nightDeaths = death_log.filter(d => d.cycle === c && d.phase === 'NIGHT');
      if (nightDeaths.length > 0) {
        for (const d of nightDeaths) {
          const p = players.find(pl => pl.id === d.player_id);
          lines.push(`**Death:** ${p?.name} was killed (${d.cause}). Role revealed: **${d.role_revealed ?? 'Unknown'}**`);
          const will = last_will[d.player_id];
          if (will) {
            lines.push('');
            lines.push(`*${p?.name}'s Last Will:*`);
            lines.push(`> ${will}`);
          }
          lines.push('');
        }
      }
    }
  }

  lines.push('---');
  lines.push('');

  // ── Final Results ──────────────────────────────────────────────────────────
  lines.push('## Final Results');
  lines.push('');
  lines.push(`**Winner: ${winner}**  `);
  lines.push(`${winReason}`);
  lines.push('');
  lines.push('### Survivor Breakdown');
  lines.push('');
  lines.push('| Name | Role | Status |');
  lines.push('|------|------|--------|');
  for (const p of players) {
    const status = p.alive ? '✅ Survived' : '💀 Eliminated';
    lines.push(`| ${p.name} | ${p.role} | ${status} |`);
  }
  lines.push('');

  // ── Last Wills ─────────────────────────────────────────────────────────────
  lines.push('## Last Wills');
  lines.push('');
  for (const p of players) {
    const will = last_will[p.id];
    if (will) {
      lines.push(`### ${p.name} *(${p.role})*`);
      lines.push(`> ${will}`);
      lines.push('');
    }
  }
  lines.push('---');
  lines.push('');

  // ── Private Reasoning ─────────────────────────────────────────────────────
  lines.push('## Private Reasoning Log');
  lines.push('*(Hidden during the game — full internal monologues revealed)*');
  lines.push('');

  const cycleGroups = {};
  for (const entry of private_logs) {
    const key = `${entry.cycle}-${entry.phase}`;
    if (!cycleGroups[key]) cycleGroups[key] = { cycle: entry.cycle, phase: entry.phase, entries: [] };
    cycleGroups[key].entries.push(entry);
  }

  for (const key of Object.keys(cycleGroups).sort()) {
    const group = cycleGroups[key];
    lines.push(`### ${group.phase.replace('_', ' ')} — Cycle ${group.cycle}`);
    lines.push('');
    for (const entry of group.entries) {
      lines.push(`**${entry.name}** thinks:`);
      lines.push(`> ${entry.reasoning}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('*Generated by Town of Salem AI Simulator*');

  // ── Write file ─────────────────────────────────────────────────────────────
  const outputDir = OUTPUT_CONFIG.directory;
  mkdirSync(outputDir, { recursive: true });
  const filename = `game_${date}_${winner.replace(/\s+/g, '_').toLowerCase()}_wins.md`;
  const filepath = join(outputDir, filename);
  writeFileSync(filepath, lines.join('\n'), 'utf8');

  return filepath;
}
