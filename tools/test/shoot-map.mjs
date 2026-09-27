// Screenshots of the map renderer for a list of countries (dev server must run).
import { devServer, launch } from './harness.mjs';
const server = await devServer();
const base = server.url;
const out = process.argv[2] || '/tmp/shots';
const codes = (process.argv[3] || 'IT,US,RU,VA,FR,NO,ID,CL,FJ,NR,GB,IN').split(',');
const size = (process.env.SIZE || '800x600').split('x').map(Number);
const extra = process.env.Q || '';
import fs from 'node:fs';
fs.mkdirSync(out, { recursive: true });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
page.on('console', (m) => console.log('console:', m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
for (const c of codes) {
  await page.goto(`${base}/tools/test/mapdebug.html?c=${c}${extra}`);
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 30000 });
  const stats = await page.evaluate(() => window.__stats);
  console.log(c, JSON.stringify(stats));
  await page.screenshot({ path: `${out}/${c}.png` });
}
await browser.close();
await server.close();
