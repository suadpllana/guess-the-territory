// npm test: SDK call order with a recording mock + a quick multi-level playthrough.
import { ROOT, devServer, launch } from './harness.mjs';

const server = await devServer();
const browser = await launch();
let failed = false;
const fail = (m) => {
  failed = true;
  console.log('FAIL', m);
};

// 1) SDK call order
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const MOCK = `window.__calls=[];const log=(n)=>window.__calls.push(n);window.PokiSDK={init:()=>{log('init');return new Promise(r=>setTimeout(r,200))},setDebug(){},gameLoadingStart:()=>log('gameLoadingStart'),gameLoadingProgress(){},gameLoadingFinished:()=>log('gameLoadingFinished'),gameplayStart:()=>log('gameplayStart'),gameplayStop:()=>log('gameplayStop'),commercialBreak:(cb)=>{log('commercialBreak');cb&&cb();return Promise.resolve()},rewardedBreak:(cb)=>{log('rewardedBreak');cb&&cb();return Promise.resolve(true)},measure:(c,w,a)=>log('measure:'+[c,w,a].join('|')),captureError:()=>log('captureError')};`;
  await page.route('**/poki-sdk.js', (r) => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  await page.goto(`${server.url}/?home=FR&lang=fr`);
  await page.waitForSelector('.answers .answer', { timeout: 20000 });
  await page.waitForTimeout(1500);
  const pre = await page.evaluate(() => window.__calls.slice());
  if (pre.includes('gameplayStart')) fail('gameplayStart fired before the first input');
  await (await page.$$('.answers .answer'))[0].click();
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.click('.overlay .btn.primary');
  await page.waitForTimeout(300);
  const calls = await page.evaluate(() => window.__calls.slice());
  const order = ['init', 'gameLoadingStart', 'gameLoadingFinished', 'gameplayStart', 'gameplayStop', 'gameplayStart'];
  let i = 0;
  for (const c of calls) if (c === order[i]) i++;
  if (i < order.length) fail('SDK order: ' + calls.filter((c) => !c.startsWith('measure')).join(' > '));
  let playing = false;
  for (const c of calls) {
    if (c === 'gameplayStart') {
      if (playing) fail('double gameplayStart');
      playing = true;
    }
    if (c === 'gameplayStop') playing = false;
  }
  if (calls.some((c) => c.startsWith('measure:') && /[/^]/.test(c.slice(8)))) fail('measure value contains / or ^');
  if (errors.length) fail('page errors: ' + errors.join('; '));
  console.log('sdk flow:', calls.filter((c) => !c.startsWith('measure')).join(' > '));
  await page.close();
}

// 2) Play levels 1-4 quickly (dev-only ?speed) answering mostly right.
{
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/?home=US&lang=en&speed=4`);
  await page.waitForFunction(() => window.__game, null, { timeout: 20000 });
  // Log every question target and every country named on the map, by question number.
  await page.evaluate(() => {
    const g = window.__game;
    const log = (window.__named = []);
    const asked = (window.__asked = []);
    const q = g.picker.question.bind(g.picker);
    g.picker.question = (...a) => {
      const r = q(...a);
      asked.push(r.target.code);
      return r;
    };
    const show = g.map.showLabel.bind(g.map);
    g.map.showLabel = (f, ...rest) => {
      log.push({ code: f.code, n: asked.length });
      return show(f, ...rest);
    };
  });
  const t0 = Date.now();
  let answered = 0;
  const modes = new Set();
  while (Date.now() - t0 < 150000) {
    const s = await page.evaluate(() => {
      const g = window.__game;
      const q = g.currentQ;
      return { level: g.level, mode: q?.mode, picking: g.ui.picking, idx: q ? q.options.indexOf(q.target) : -1, tap: !!g.map.onTap, overlay: g.ui.overlayOpen, blitz: !!g.blitzEnd };
    });
    if (s.level > 4) break;
    if (s.overlay) {
      await page.click('.overlay .btn').catch(() => {});
      continue;
    }
    const right = Math.random() < 0.95;
    if (s.mode === 'find' && s.tap) {
      const pos = await page.evaluate((right) => {
        const g = window.__game;
        const q = g.currentQ;
        const f = right ? q.target : q.options.find((o) => o !== q.target);
        return g.map.screenOf(f.label[0], f.label[1]);
      }, right);
      await page.mouse.click(pos[0], pos[1]);
      answered++;
      modes.add('find');
    } else if (s.picking) {
      const b = await page.$$('.answers .answer, .answers .tile');
      const n = b.length;
      const idx = right ? s.idx : (s.idx + 1) % n;
      if (b[idx]) {
        await b[idx].click().catch(() => {});
        answered++;
        modes.add(s.blitz ? 'blitz' : s.mode);
      }
    }
    await page.waitForTimeout(150);
  }
  const leaks = await page.evaluate(() =>
    window.__asked
      .map((code, i) => ({ code, k: i + 1 }))
      .filter(({ code, k }) => window.__named.some((l) => l.code === code && l.n < k && l.n >= k - 3))
      .map(({ code, k }) => `${code}@${k}`)
  );
  if (leaks.length) fail('asked a country just named on the map: ' + leaks.join(', '));
  const level = await page.evaluate(() => window.__game.level);
  console.log(`playthrough: reached level ${level} after ${answered} answers; modes seen: ${[...modes].join(', ')}`);
  if (level < 5) fail('did not reach level 5');
  for (const m of ['classic', 'shape', 'blitz', 'find', 'silhouette']) if (!modes.has(m)) fail('mode never played: ' + m);

  // 3) Restart from the pause menu: Cancel keeps the run; confirming wipes it.
  await page.waitForFunction(() => window.__game.ui.picking || window.__game.map.onTap, null, { timeout: 20000 });
  const before = await page.evaluate(() => ({ pts: window.__game.save.points, atlas: window.__game.save.collected.length }));
  if (!before.pts || !before.atlas) fail('no progress to reset before restart test');
  await page.keyboard.press('Escape');
  await page.click('.overlay .restart');
  if (!(await page.$('.overlay .confirm-card'))) fail('restart asked no confirmation');
  await page.click('.overlay .confirm-card .btn.secondary');
  if (!(await page.$('.overlay .pause-card'))) fail('cancel did not return to the pause card');
  if ((await page.evaluate(() => window.__game.level)) < 5) fail('cancel changed the level');
  await page.click('.overlay .restart');
  await page.click('.overlay .btn.danger'); // too soon: a double tap must not confirm
  if (!(await page.$('.overlay .confirm-card'))) fail('restart confirmed by an instant double tap');
  await page.waitForTimeout(500);
  await page.click('.overlay .btn.danger');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => {
    const g = window.__game;
    const s = g.save;
    return { overlay: g.ui.overlayOpen, paused: g.paused, level: g.level, saved: s.level, pts: s.points, atlas: s.collected.length, answered: s.answered, best: s.bestPoints, sound: s.sound, hud: document.querySelector('.points b')?.textContent };
  });
  if (after.overlay || after.paused) fail('pause card still open after restart');
  if (after.level !== 1 || after.saved !== 1) fail(`restart left level ${after.level}/${after.saved}`);
  if (after.pts || after.atlas || after.answered || after.best) fail('restart kept stats: ' + JSON.stringify(after));
  if (after.hud !== '0') fail('HUD score not reset: ' + after.hud);
  if (!after.sound) fail('restart changed the sound setting');
  // The fresh run opens with the home country again and keeps playing.
  await page.waitForFunction(() => window.__game.ui.picking, null, { timeout: 20000 });
  const q = await page.evaluate(() => ({ code: window.__game.currentQ.target.code, idx: window.__game.currentQ.options.indexOf(window.__game.currentQ.target) }));
  if (q.code !== 'US') fail('fresh run did not open with the home country: ' + q.code);
  await (await page.$$('.answers .answer'))[q.idx].click();
  await page.waitForTimeout(1200);
  const played = await page.evaluate(() => ({ answered: window.__game.save.answered, pts: window.__game.save.points, level: window.__game.level }));
  if (played.answered !== 1 || !played.pts || played.level !== 1) fail('run after restart is broken: ' + JSON.stringify(played));
  console.log(`restart: level ${after.level}, score ${after.pts}, atlas ${after.atlas}; next question ${q.code}, then ${played.pts} pts`);
  if (errors.length) fail('page errors: ' + errors.join('; '));
  await page.close();
}

// 4) Out of hearts: the same level starts again, with other countries and its starting score.
{
  const page = await browser.newPage({ viewport: { width: 1031, height: 580 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/?home=US&lang=en&speed=4`);
  await page.waitForFunction(() => window.__game, null, { timeout: 20000 });
  await page.evaluate(() => {
    const g = window.__game;
    window.__asked = [];
    const q = g.picker.question.bind(g.picker);
    g.picker.question = (...a) => {
      const r = q(...a);
      window.__asked.push({ code: r.target.code, level: g.level });
      return r;
    };
  });
  const answer = async (right) => {
    const s = await page.evaluate(() => { const g = window.__game, q = g.currentQ; return { picking: g.ui.picking, tap: !!g.map.onTap, idx: q ? q.options.indexOf(q.target) : -1 }; });
    if (s.tap) {
      const p = await page.evaluate((right) => { const g = window.__game, q = g.currentQ; const f = right ? q.target : q.options.find((o) => o !== q.target); return g.map.screenOf(f.label[0], f.label[1]); }, right);
      await page.mouse.click(p[0], p[1]);
    } else if (s.picking) {
      const b = await page.$$('.answers .answer:not(.gone), .answers .tile');
      const i = right ? s.idx : (s.idx + 1) % b.length;
      await b[i]?.click().catch(() => {});
    }
    await page.waitForTimeout(150);
  };
  let t0 = Date.now();
  while ((await page.evaluate(() => window.__game.level)) < 2 && Date.now() - t0 < 60000) await answer(true);
  await page.waitForFunction(() => window.__game.ui.picking, null, { timeout: 20000 });
  const startPts = await page.evaluate(() => window.__game.save.points);
  t0 = Date.now();
  while (!(await page.evaluate(() => window.__game.ui.overlayOpen)) && Date.now() - t0 < 60000) await answer(false);
  const card = await page.evaluate(() => document.querySelector('.overlay .hearts-card .btn:last-child span')?.textContent);
  if (!/Level 2/.test(card || '')) fail('retry button does not name the current level: ' + card);
  const failedSet = await page.evaluate(() => window.__asked.filter((a) => a.level === 2).map((a) => a.code));
  const n = failedSet.length;
  await page.click('.overlay .hearts-card .btn:last-child');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ level: window.__game.level, saved: window.__game.save.level, pts: window.__game.save.points }));
  if (after.level !== 2 || after.saved !== 2) fail(`retry moved to level ${after.level}/${after.saved}`);
  if (after.pts !== startPts) fail(`retry score ${after.pts}, level started with ${startPts}`);
  t0 = Date.now();
  while ((await page.evaluate(() => window.__game.level)) === 2 && Date.now() - t0 < 60000) await answer(true);
  const replay = await page.evaluate((n) => window.__asked.filter((a) => a.level === 2).slice(n).map((a) => a.code), n);
  const repeats = replay.filter((c) => failedSet.includes(c));
  if (repeats.length) fail('replayed level asked the same countries again: ' + repeats.join(', '));
  console.log(`retry: level 2 again from ${startPts} pts; failed with ${failedSet.join(' ')}, replayed with ${replay.join(' ')}`);
  if (errors.length) fail('page errors: ' + errors.join('; '));
  await page.close();
}

await browser.close();
await server.close();
console.log(failed ? 'E2E FAILED' : 'E2E OK');
process.exit(failed ? 1 : 0);
