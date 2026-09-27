// Contact sheets of every quiz country as the game frames it (QA for framing/data).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, devServer, launch } from './harness.mjs';

const out = path.join(ROOT, 'tools', '.cache', 'contact');
fs.mkdirSync(out, { recursive: true });
const server = await devServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 240, height: 240 }, deviceScaleFactor: 1 });
await page.goto(`${server.url}/tools/test/mapdebug.html?c=FR`);
await page.waitForFunction(() => document.title === 'ready', null, { timeout: 30000 });
const codes = process.argv[2] ? process.argv[2].split(',') : await page.evaluate(() => window.__quiz);
for (const c of codes) {
  await page.goto(`${server.url}/tools/test/mapdebug.html?c=${c}`);
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 30000 });
  await page.screenshot({ path: path.join(out, `${c}.png`) });
}
console.log('rendered', codes.length);
await browser.close();
await server.close();
