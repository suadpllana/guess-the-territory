// Plays several levels automatically (dev server, ?speed=) and screenshots each new situation.
import fs from 'node:fs';
import { devServer, launch } from './harness.mjs';

const server = await devServer();
const base = server.url + '/';
const out = process.argv[2] || '/tmp/session';
const [w, h] = (process.env.SIZE || '390x844').split('x').map(Number);
const levels = Number(process.env.LEVELS || 7);
const accuracy = Number(process.env.ACC || 0.85);
const query = process.env.Q || '?home=BR&lang=en&speed=3';
const touch = process.env.TOUCH === '1';
fs.mkdirSync(out, { recursive: true });

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL')) errors.push(m.text()); });
await page.goto(base + query);
await page.waitForFunction(() => window.__game, null, { timeout: 20000 });

const seen = new Set();
let n = 0;
const snap = async (tag) => {
  if (seen.has(tag)) return;
  seen.add(tag);
  await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${tag}.png` });
};
const state = () => page.evaluate(() => {
  const g = window.__game;
  const q = g.currentQ;
  const banner = document.querySelector('.banner.show .banner-title')?.textContent || '';
  const overlay = !document.querySelector('.overlay').classList.contains('hide');
  return {
    level: g.level, mode: q?.mode, picking: g.ui.picking, hearts: g.hearts, streak: g.streak,
    target: q?.target.code, idx: q ? q.options.indexOf(q.target) : -1, n: q?.options.length,
    banner, overlay, candidates: g.map.candidates.length, blitz: !!g.blitzEnd,
  };
});

const t0 = Date.now();
let answered = 0;
while (Date.now() - t0 < 420000) {
  const s = await state();
  if (s.level > levels) break;
  if (s.banner) await snap(`banner-${s.banner.replace(/[^a-z0-9]+/gi, '_').slice(0, 24)}`);
  if (s.overlay) {
    await snap('overlay');
    const btn = await page.$('.overlay .btn');
    if (btn) await btn.click();
    await page.waitForTimeout(300);
    continue;
  }
  if (s.mode === 'find' && s.candidates && !s.picking) {
    // find mode waits for a map tap
    await page.waitForTimeout(250);
    const pos = await page.evaluate((correct) => {
      const g = window.__game;
      const q = g.currentQ;
      if (!q || !g.map.onTap) return null;
      const f = correct ? q.target : q.options.find((o) => o !== q.target);
      const [x, y] = g.map.screenOf(f.label[0], f.label[1]);
      return { x, y };
    }, Math.random() < accuracy);
    if (pos) {
      await snap(`L${s.level}-find-ask`);
      await page.mouse.click(pos.x, pos.y);
      answered++;
      await page.waitForTimeout(300);
      await snap(`L${s.level}-find-result`);
    }
    continue;
  }
  if (s.picking) {
    await page.waitForTimeout(250);
    await snap(`L${s.level}-${s.blitz ? 'blitz' : s.mode}-ask`);
    const correct = Math.random() < accuracy;
    const idx = correct ? s.idx : (s.idx + 1) % s.n;
    const buttons = await page.$$('.answers .answer, .answers .tile');
    if (buttons[idx]) {
      await buttons[idx].click().catch(() => {});
      answered++;
      await page.waitForTimeout(200);
      await snap(`L${s.level}-${s.blitz ? 'blitz' : s.mode}-${correct ? 'good' : 'bad'}`);
    }
    continue;
  }
  await page.waitForTimeout(120);
}
const final = await state();
console.log('answered', answered, 'final', JSON.stringify(final), 'secs', Math.round((Date.now() - t0) / 1000));
console.log('errors:', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
await server.close();
