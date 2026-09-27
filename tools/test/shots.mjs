// Screenshots of the first question at Poki's reference sizes (npm run shots).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, devServer, launch } from './harness.mjs';

const out = path.join(ROOT, 'tools', '.cache', 'shots');
fs.mkdirSync(out, { recursive: true });
const sizes = [
  [640, 360, false],
  [836, 470, false],
  [1031, 580, false],
  [1280, 720, false],
  [390, 844, true],
  [844, 390, true],
];
const server = await devServer();
const browser = await launch();
for (const [w, h, touch] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 });
  await page.goto(`${server.url}/?home=BR&lang=en`);
  await page.waitForSelector('.answers .answer', { timeout: 20000 });
  await page.waitForTimeout(2200);
  const file = path.join(out, `${w}x${h}${touch ? '-touch' : ''}.png`);
  await page.screenshot({ path: file });
  console.log(path.relative(ROOT, file));
  await page.close();
}
await browser.close();
await server.close();
