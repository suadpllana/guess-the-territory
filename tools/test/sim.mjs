// Headless simulation of the adaptive difficulty with synthetic players.
import { createServer } from 'vite';
import { ROOT } from './harness.mjs';

globalThis.location = { search: '' };
const server = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true } });
const { World } = await server.ssrLoadModule('/src/geo/world.ts');
const { Picker } = await server.ssrLoadModule('/src/game/picker.ts');
const { DEFAULT_SAVE } = await server.ssrLoadModule('/src/storage.ts');
const { planFor } = await server.ssrLoadModule('/src/game/game.ts');

const world = new World(null);
const players = {
  novice: (d) => (d <= 1.5 ? 0.85 : d <= 2.5 ? 0.5 : 0.28),
  average: (d) => (d <= 2.5 ? 0.92 : d <= 3.5 ? 0.65 : d <= 4.5 ? 0.42 : 0.27),
  expert: (d) => (d <= 4.5 ? 0.96 : d <= 6 ? 0.75 : 0.4),
};
for (const [name, know] of Object.entries(players)) {
  const runs = 200;
  const windows = Array.from({ length: 8 }, () => ({ ok: 0, n: 0, d: 0 }));
  let finalSkill = 0;
  for (let r = 0; r < runs; r++) {
    const save = structuredClone(DEFAULT_SAVE);
    const picker = new Picker(world, save, 'US');
    const seen = new Set();
    let level = 1, q = 0;
    while (q < 80) {
      const plan = planFor(level);
      for (let i = 0; i < plan.rounds && q < 80; i++, q++) {
        const mode = plan.modes[i % plan.modes.length];
        const question = picker.question(mode, plan.cap, plan.pool);
        const f = question.target;
        // players learn from each reveal: a country seen before is easier
        const base = know(f.difficulty);
        const p = seen.has(f.code) ? base + (1 - base) * 0.45 : base;
        seen.add(f.code);
        const ok = Math.random() < p;
        picker.record(f, ok, ok && Math.random() < 0.5);
        save.answered++;
        if (ok && !save.collected.includes(f.code)) { save.collected.push(f.code); picker.markCollected(f.code); }
        const w = windows[Math.floor(q / 10)];
        w.n++; w.ok += ok ? 1 : 0; w.d += f.difficulty;
      }
      level++;
    }
    finalSkill += save.skill;
  }
  console.log(`${name.padEnd(8)} success by 10-question window: ${windows.map((w) => Math.round((w.ok / w.n) * 100) + '%').join(' ')}`);
  console.log(`${' '.repeat(9)}avg difficulty asked:          ${windows.map((w) => (w.d / w.n).toFixed(1)).join('  ')}   final skill ${(finalSkill / runs).toFixed(2)}`);
}
await server.close();
