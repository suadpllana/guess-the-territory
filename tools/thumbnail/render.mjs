// Renders store assets with the game's own renderer (dev server must run):
// store/thumbnail-*.png (no text, as Poki asks), store/thumbnail.mp4, store/logo*.png
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devServer, launch } from '../test/harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'store');
const server = await devServer();
const base = server.url;
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
fs.mkdirSync(OUT, { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror', e.message));

// static thumbnails
for (const size of [1080, 628, 512]) {
  await page.goto(`${base}/tools/thumbnail/thumb.html?size=${size}`);
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 30000 });
  await page.evaluate(() => window.renderAt(2.35));
  await (await page.$('#c')).screenshot({ path: path.join(OUT, `thumbnail-${size}.png`) });
}
// a second static variant: the celebration moment
await page.goto(`${base}/tools/thumbnail/thumb.html?size=1080`);
await page.waitForFunction(() => document.title === 'ready', null, { timeout: 30000 });
await page.evaluate(() => window.renderAt(2.85));
await (await page.$('#c')).screenshot({ path: path.join(OUT, 'thumbnail-1080-correct.png') });

// animated thumbnail: 4 s at 30 fps
const frames = path.join(ROOT, 'tools', '.cache', 'frames');
fs.rmSync(frames, { recursive: true, force: true });
fs.mkdirSync(frames, { recursive: true });
const canvas = await page.$('#c');
for (let i = 0; i < 120; i++) {
  await page.evaluate((t) => window.renderAt(t), i / 30);
  await canvas.screenshot({ path: path.join(frames, `f${String(i).padStart(3, '0')}.png`) });
}
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(frames, 'f%03d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', path.join(OUT, 'thumbnail.mp4')]);

// logos (transparent)
for (const [name, q] of [['logo.png', ''], ['logo-tagline.png', '?tagline=' + encodeURIComponent('Guess the country!')]]) {
  await page.goto(`${base}/tools/thumbnail/logo.html${q}`);
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 30000 });
  await (await page.$('#c')).screenshot({ path: path.join(OUT, name), omitBackground: true });
}
await browser.close();
await server.close();
for (const f of fs.readdirSync(OUT)) console.log(f, (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + ' KB');
