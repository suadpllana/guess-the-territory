// Drives the dev build in headless Chromium and saves screenshots of a short session.
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.env.BASE || 'http://localhost:5173/';
const out = process.argv[2] || '/tmp/play';
const [w, h] = (process.env.SIZE || '390x844').split('x').map(Number);
const query = process.env.Q || '?home=DE&lang=en';
const touch = process.env.TOUCH === '1';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
const requests = [];
page.on('request', (r) => requests.push(r.url()));
await page.goto(base + query);
const shot = async (name) => page.screenshot({ path: `${out}/${name}.png` });
await page.waitForTimeout(600);
await shot('01-load');
await page.waitForTimeout(1800);
await shot('02-first-question');
// answer: pick the button whose text matches the target (cheat via dev handle)
const answer = async (correct = true) => {
  const idx = await page.evaluate((correct) => {
    const g = window.__game;
    const q = g && g.currentQ;
    if (!q) return 0;
    const i = q.options.indexOf(q.target);
    return correct ? i : (i + 1) % q.options.length;
  }, correct);
  const buttons = await page.$$('.answer, .tile');
  if (buttons[idx]) await buttons[idx].click();
  return idx;
};
await answer(true);
await page.waitForTimeout(350);
await shot('03-correct');
await page.waitForTimeout(1600);
await shot('04-second-question');
await answer(false);
await page.waitForTimeout(400);
await shot('05-wrong');
console.log('errors:', errors.length ? errors : 'none');
const external = [...new Set(requests.filter((u) => !u.startsWith(base) && !u.startsWith('data:')))];
console.log('external requests:', external);
await browser.close();
