import './styles.css';
import { sound } from './audio';
import { DEV } from './config';
import { clock } from './core/clock';
import { DIFFICULTY } from './game/countries';
import { Game } from './game/game';
import { detectHome } from './game/home';
import { World } from './geo/world';
import { LOCALE, RTL } from './i18n';
import { MapView } from './map/mapview';
import { themeById } from './map/themes';
import { Poki } from './poki';
import { loadSave } from './storage';
import { Fx } from './ui/fx';
import { UI } from './ui/ui';

function fail(message: string): void {
  const boot = document.getElementById('boot');
  if (boot) {
    boot.classList.add('error');
    boot.innerHTML = `<p>${message}</p>`;
  }
}

function isTouchPrimary(): boolean {
  const coarse = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  return coarse && !fine;
}

async function boot(): Promise<void> {
  window.addEventListener('error', (e) => Poki.captureError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => Poki.captureError(e.reason));

  const sdkReady = Poki.init();
  const app = document.getElementById('app') as HTMLElement;
  const baseCanvas = document.getElementById('map-base') as HTMLCanvasElement;
  const fxCanvas = document.getElementById('map-fx') as HTMLCanvasElement;
  const topCanvas = document.getElementById('fx') as HTMLCanvasElement;
  const labels = document.getElementById('labels') as HTMLElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;
  if (!baseCanvas.getContext('2d')) {
    fail('Your browser cannot draw the map (Canvas 2D is unavailable).');
    return;
  }
  // Text runs use dir="auto"; the layout itself stays LTR so the pause button
  // never moves under Poki's pill (top-left on mobile).
  document.documentElement.lang = LOCALE; // enables hyphenation of long names
  if (RTL) document.documentElement.lang = 'ar';

  const save = loadSave();
  const home = detectHome((c) => DIFFICULTY.has(c));
  const world = new World(home);
  const map = new MapView(world, baseCanvas, fxCanvas, labels);
  const ui = new UI(uiRoot);
  ui.setTouch(isTouchPrimary());
  const fx = new Fx(topCanvas);
  const theme = themeById(save.theme);
  map.setTheme(theme);
  document.body.style.background = theme.water;
  sound.setSound(save.sound);
  sound.setMusic(save.music);

  const game = new Game(world, map, ui, fx, save, home);
  ui.shakeTarget = app; // shake the whole scene, not just the UI

  let dprCap = 2;
  const resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    ui.layout(w, h);
    map.resize(w, h, dpr);
    fx.resize(w, h, dpr);
    game.onResize();
  };
  resize();
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);

  // First frame already moving: the world, turning slowly towards home.
  const homeF = home ? world.byCode.get(home) : undefined;
  const wv = map.worldView();
  map.jump({ ...wv, x: homeF ? homeF.label[0] - 0.12 : 0.45, y: homeF ? Math.min(0.5, Math.max(0.3, homeF.label[1])) : 0.42 });

  // Input: gameplay starts on the first real input; block browser gestures.
  const onFirst = (e: Event): void => {
    if (e.type === 'touchstart' && !ui.touch) {
      ui.setTouch(true);
      resize();
    }
    game.firstInput();
  };
  window.addEventListener('pointerdown', onFirst, { capture: true });
  window.addEventListener('keydown', onFirst, { capture: true });
  window.addEventListener('touchstart', onFirst, { capture: true, passive: true });
  // Browsers only allow audio after an activating gesture (pointerup /
  // touchend / click on touch screens), so retry the unlock on each one.
  for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) {
    window.addEventListener(ev, () => {
      if (game.started) sound.unlock();
    }, { capture: true, passive: true });
  }
  window.addEventListener('keydown', (e) => {
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(e.key)) e.preventDefault();
    if (e.repeat) return;
    game.onKey(e);
  });
  for (const ev of ['contextmenu', 'gesturestart', 'dblclick']) window.addEventListener(ev, (e) => e.preventDefault());
  fxCanvas.addEventListener('pointerup', () => game.skipWait());
  document.addEventListener('visibilitychange', () => game.setHidden(document.hidden));
  window.addEventListener('pagehide', () => game.setHidden(true));
  Poki.onAdStart = () => game.adStarted();
  Poki.onAdEnd = () => game.adEnded();

  // The world turns slowly until the first flight starts.
  let drifting = true;
  game.onStart = () => {
    drifting = false;
  };

  // Frame loop with a gentle quality step-down on slow devices.
  const speed = DEV ? Number(new URLSearchParams(location.search).get('speed')) || 1 : 1;
  let last = performance.now();
  let slow = 0;
  let frames = 0;
  const frame = (now: number): void => {
    const dt = Math.min(100, now - last);
    last = now;
    clock.tick(dt * speed);
    if (drifting) map.jump({ ...map.view, x: map.view.x + dt * 0.000012 }, false);
    game.tick();
    map.update(dt);
    if (!clock.paused || map.dirty) map.draw();
    fx.update(dt);
    fx.draw();
    if (!clock.paused && !document.hidden) {
      frames++;
      if (dt > 30) slow++;
      if (frames >= 90) {
        if (slow > 45) {
          if (dprCap > 1) {
            dprCap = Math.max(1, dprCap - 0.5);
            resize();
          } else map.quality = 0;
        }
        frames = 0;
        slow = 0;
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  await sdkReady;
  Poki.loadingProgress(100);
  Poki.loadingFinished();
  document.getElementById('boot')?.classList.add('gone');
  window.setTimeout(() => document.getElementById('boot')?.remove(), 600);
  if (DEV) (window as unknown as { __game: Game }).__game = game;
  // Let the turning world be seen for a beat, then dive in.
  await new Promise((r) => window.setTimeout(r, 450));
  await game.run();
}

boot().catch((e) => {
  Poki.captureError(e);
  fail('Something went wrong. Please reload.');
  if (DEV) console.error(e);
});
