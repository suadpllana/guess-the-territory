// Shared helpers for the browser tools: start a Vite dev server and launch Chrome.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Uses BASE if set, otherwise starts a dev server on a free port. */
export async function devServer() {
  if (process.env.BASE) return { url: process.env.BASE.replace(/\/$/, ''), close: async () => {} };
  const { createServer } = await import('vite');
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
  const addr = server.httpServer.address();
  return { url: `http://127.0.0.1:${addr.port}`, close: () => server.close() };
}

/** Local Chromium: CHROME env, the Playwright cache, or an installed Google Chrome. */
export async function launch() {
  const candidates = [process.env.CHROME, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  const exe = candidates.find((p) => fs.existsSync(p));
  return exe ? chromium.launch({ executablePath: exe }) : chromium.launch({ channel: 'chrome' });
}
