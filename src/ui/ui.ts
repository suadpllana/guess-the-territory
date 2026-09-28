// DOM user interface: HUD, prompt, answer sheet, tiles, banners, toasts and
// modal cards. Sizes derive from one unit (--u) computed from the screen.
import { clock } from '../core/clock';
import { LOCALE, t } from '../i18n';
import type { Rect } from '../map/camera';
import { ICON } from './icons';

let compact: Intl.NumberFormat | null = null;
try {
  compact = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });
} catch {
  compact = null;
}
/** 9,999 stays as is; larger scores become 12.5K so the HUD fits on phones. */
function formatPoints(n: number): string {
  if (n < 10000 || !compact) return n.toLocaleString(LOCALE);
  return compact.format(n);
}

type Tag = keyof HTMLElementTagNameMap;
function el<K extends Tag>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export type OptionState = 'good' | 'bad' | 'reveal' | 'dim' | 'gone';

export interface PauseData {
  collected: number;
  total: number;
  bestStreak: number;
  sound: boolean;
  music: boolean;
  theme: string;
  themes: { id: string; swatch: [string, string]; unlocked: boolean; need: number }[];
  build: string;
  drawAtlas: (canvas: HTMLCanvasElement) => void;
}

export interface PauseHandlers {
  resume: () => void;
  sound: () => boolean;
  music: () => boolean;
  theme: (id: string) => void;
  restart: () => void;
}

export class UI {
  readonly root: HTMLElement;
  shakeTarget: HTMLElement;
  u = 14;
  landscape = false;
  touch = false;
  onPause?: () => void;
  onHint?: () => void;
  onLocate?: () => void;

  private hud = el('div', 'hud');
  private hearts = el('div', 'chip hearts');
  private levelChip = el('div', 'chip level');
  private levelName = el('span', 'level-name');
  private dots = el('div', 'dots');
  private points = el('div', 'chip points');
  private pointsNum = el('b');
  private streak = el('div', 'chip streak hide');
  private pauseBtn = el('button', 'chip round pause', ICON.pause);
  private prompt = el('div', 'prompt hide');
  private promptText = el('span', 'prompt-text');

  private timer = el('div', 'timer hide');
  private timerFill = el('i');
  private panel = el('div', 'panel hide');
  private answers = el('div', 'answers');
  private hintBtn = el('button', 'fab hint hide');
  private hintBadge = el('span', 'badge');
  private locateBtn = el('button', 'fab locate hide', ICON.locate);
  private fabs = el('div', 'fabs');
  private banner = el('div', 'banner');
  private toasts = el('div', 'toasts');
  private floats = el('div', 'floats');
  private overlay = el('div', 'overlay hide');
  private blocker = el('div', 'blocker hide');
  private tapHint = el('div', 'tap-hint hide', ICON.hand);
  private pickResolve: ((i: number) => void) | null = null;
  private shownPoints = 0;
  private pointsAnim = 0;
  private buttons: HTMLButtonElement[] = [];
  private panelMode: 'none' | 'options' | 'tiles' = 'none';

  constructor(root: HTMLElement) {
    this.root = root;
    this.shakeTarget = root;
    const left = el('div', 'hud-left');
    const center = el('div', 'hud-center');
    const right = el('div', 'hud-right');
    left.append(this.hearts);
    this.levelChip.append(this.levelName, this.dots);
    center.append(this.levelChip);
    this.points.innerHTML = ICON.star;
    this.points.append(this.pointsNum);
    right.append(this.points, this.pauseBtn);
    this.hud.append(left, center, right);
    this.prompt.innerHTML = ICON.search;
    this.promptText.dir = 'auto';
    this.prompt.append(this.promptText);
    this.timer.append(this.timerFill);
    this.panel.append(el('div', 'handle'), this.answers, this.tapHint);
    this.hintBtn.innerHTML = ICON.bulb;
    this.hintBtn.append(this.hintBadge);
    this.fabs.append(this.locateBtn, this.hintBtn);
    root.append(this.hud, this.prompt, this.timer, this.panel, this.fabs, this.streak, this.banner, this.toasts, this.floats, this.overlay, this.blocker);
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.addEventListener('click', () => this.onPause?.());
    this.hintBtn.addEventListener('click', () => this.onHint?.());
    this.locateBtn.addEventListener('click', () => this.onLocate?.());
    this.setPoints(0, false);
  }

  // ---------- layout ----------

  /** Sizes the UI for the screen; returns the map area not covered by UI. */
  layout(w: number, h: number): Rect {
    this.u = Math.max(11, Math.min(19, Math.min(w / 27.5, h / 24)));
    this.landscape = w / h > 1.05;
    const r = document.documentElement;
    r.style.setProperty('--u', `${this.u.toFixed(2)}px`);
    r.classList.toggle('landscape', this.landscape);
    r.classList.toggle('portrait', !this.landscape);
    r.classList.toggle('touch', this.touch);
    return this.mapRect(w, h);
  }

  mapRect(w: number, h: number): Rect {
    // Layout offsets, not getBoundingClientRect: entry animations (sheet slide,
    // prompt pop) must not change where the camera frames the country.
    const u = this.u;
    const hudB = this.hud.offsetTop + this.hud.offsetHeight;
    const pr = this.prompt.classList.contains('hide') ? 0 : this.prompt.offsetTop + this.prompt.offsetHeight;
    const top = Math.max(hudB, pr) + u * 0.5;
    let left = u * 0.5;
    let right = w - u * 0.5;
    let bottom = h - u * 0.6;
    if (this.panelMode !== 'none') {
      if (this.landscape) right = this.panel.offsetLeft - u * 0.6;
      else bottom = this.panel.offsetTop - u * 0.4;
    }
    if (this.landscape) left = u * 0.6;
    return { x: left, y: top, w: Math.max(40, right - left), h: Math.max(40, bottom - top) };
  }

  /** Floating buttons sit in the bottom-right corner of the map area. */
  placeFabs(r: Rect): void {
    const u = this.u;
    this.fabs.style.left = `${Math.round(r.x + r.w - u * 3.2)}px`;
    this.fabs.style.top = `${Math.round(r.y + r.h - u * 6.8)}px`;
    this.streak.style.left = `${Math.round(r.x + u * 0.2)}px`;
    this.streak.style.top = `${Math.round(r.y + r.h - u * 2.4)}px`;
    this.banner.style.top = `${Math.round(r.y + r.h * 0.42)}px`;
    this.banner.style.left = `${Math.round(r.x)}px`;
    this.banner.style.width = `${Math.round(r.w)}px`;
  }

  setTouch(on: boolean): void {
    this.touch = on;
    document.documentElement.classList.toggle('touch', on);
  }

  showHud(parts: { hearts?: boolean; level?: boolean; points?: boolean }): void {
    this.hearts.classList.toggle('hide', parts.hearts === false);
    this.levelChip.classList.toggle('hide', parts.level === false);
    this.points.classList.toggle('hide', parts.points === false);
  }

  // ---------- HUD ----------

  setHearts(n: number, max = 3, anim: 'lose' | 'gain' | null = null): void {
    this.hearts.innerHTML = '';
    for (let i = 0; i < max; i++) {
      const s = el('i', i < n ? 'on' : 'off', ICON.heart);
      if (anim === 'lose' && i === n) s.classList.add('break');
      if (anim === 'gain' && i < n) {
        s.classList.add('gain');
        s.style.animationDelay = `${i * 90}ms`;
      }
      this.hearts.append(s);
    }
  }

  setLevel(n: number, rounds: number, label: string): void {
    this.levelName.textContent = label || t('level', { n });
    this.dots.style.setProperty('--dot', `${Math.min(0.62, 5.2 / rounds).toFixed(3)}`);
    this.dots.innerHTML = '';
    for (let i = 0; i < rounds; i++) this.dots.append(el('i'));
    this.levelChip.classList.remove('bump');
    void this.levelChip.offsetWidth;
    this.levelChip.classList.add('bump');
  }

  setDot(i: number, state: 'cur' | 'ok' | 'no'): void {
    const d = this.dots.children[i] as HTMLElement | undefined;
    if (d) d.className = state;
  }

  setPoints(n: number, animate = true): void {
    const from = this.shownPoints;
    this.shownPoints = n;
    cancelAnimationFrame(this.pointsAnim);
    if (!animate || n <= from) {
      this.pointsNum.textContent = formatPoints(n);
      return;
    }
    const t0 = performance.now();
    const step = (): void => {
      const k = Math.min(1, (performance.now() - t0) / 450);
      this.pointsNum.textContent = formatPoints(Math.round(from + (n - from) * (1 - (1 - k) ** 3)));
      if (k < 1) this.pointsAnim = requestAnimationFrame(step);
    };
    step();
    this.points.classList.remove('bump');
    void this.points.offsetWidth;
    this.points.classList.add('bump');
  }

  pointsCenter(): [number, number] {
    const r = this.points.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }

  setStreak(n: number, mult: number): void {
    if (n < 3) {
      this.streak.classList.add('hide');
      return;
    }
    this.streak.innerHTML = `${ICON.fire}<b>${n}</b>${mult > 1 ? `<small>×${mult}</small>` : ''}`;
    this.streak.classList.remove('hide', 'bump');
    void this.streak.offsetWidth;
    this.streak.classList.add('bump');
  }

  setHint(count: number, video: boolean, visible: boolean): void {
    this.hintBtn.classList.toggle('hide', !visible);
    this.hintBtn.classList.toggle('video', video);
    this.hintBadge.innerHTML = video ? ICON.video : String(count);
  }

  showTapHint(on: boolean): void {
    this.tapHint.classList.toggle('hide', !on);
  }

  setLocate(visible: boolean): void {
    this.locateBtn.classList.toggle('hide', !visible);
  }

  // ---------- prompt & timer ----------

  setPrompt(text: string | null, name?: string, flag?: string): void {
    if (text === null) {
      this.prompt.classList.add('hide');
      return;
    }
    this.promptText.textContent = '';
    if (name && text.includes('{c}')) {
      const [a, b] = text.split('{c}');
      const strong = el('b');
      // the flag stays glued to the first word of the name when the line wraps
      const cut = name.indexOf(' ');
      const glue = el('span', 'glue');
      if (flag) glue.append(el('span', 'pflag', flag));
      glue.append(cut > 0 ? name.slice(0, cut) : name);
      strong.append(glue);
      if (cut > 0) strong.append(name.slice(cut));
      this.promptText.append(document.createTextNode(a), strong, document.createTextNode(b));
    } else this.promptText.textContent = text;
    this.prompt.classList.remove('hide', 'pop');
    void this.prompt.offsetWidth;
    this.prompt.classList.add('pop');
  }

  setTimer(frac: number | null, urgent = false): void {
    if (frac === null) {
      this.timer.classList.add('hide');
      return;
    }
    this.timer.classList.remove('hide');
    this.timer.classList.toggle('urgent', urgent);
    this.timerFill.style.transform = `scaleX(${Math.max(0, Math.min(1, frac)).toFixed(4)})`;
  }

  // ---------- answers ----------

  setPanel(mode: 'none' | 'options' | 'tiles'): void {
    this.panelMode = mode;
    this.panel.classList.toggle('hide', mode === 'none');
    this.panel.classList.toggle('tiles-mode', mode === 'tiles');
  }

  showOptions(labels: string[], keys: boolean, flags: string[] = []): void {
    this.answers.innerHTML = '';
    this.answers.className = `answers n${labels.length}`;
    this.buttons = labels.map((label, i) => {
      const b = el('button', 'answer enter');
      b.style.setProperty('--i', String(i));
      if (keys) b.append(el('span', 'key', String(i + 1)));
      if (flags[i]) b.append(el('span', 'flag', flags[i]));
      const txt = el('span', 'txt');
      txt.textContent = label;
      txt.dir = 'auto';
      if (label.length > 22) b.classList.add('long');
      b.append(txt);
      b.addEventListener('click', () => this.pick(i));
      return b;
    });
    this.answers.append(...this.buttons);
    this.setPanel('options');
  }

  showTiles(n: number, render: (c: HTMLCanvasElement, i: number) => void): void {
    this.answers.innerHTML = '';
    this.answers.className = 'answers tiles';
    this.buttons = [];
    for (let i = 0; i < n; i++) {
      const b = el('button', 'tile enter');
      b.style.setProperty('--i', String(i));
      const c = el('canvas');
      b.append(c);
      b.addEventListener('click', () => this.pick(i));
      this.buttons.push(b);
    }
    this.answers.append(...this.buttons);
    this.setPanel('tiles');
    requestAnimationFrame(() => this.buttons.forEach((b, i) => render(b.querySelector('canvas') as HTMLCanvasElement, i)));
  }

  rerenderTiles(render: (c: HTMLCanvasElement, i: number) => void): void {
    if (this.panelMode !== 'tiles') return;
    this.buttons.forEach((b, i) => render(b.querySelector('canvas') as HTMLCanvasElement, i));
  }

  markOption(i: number, state: OptionState): void {
    const b = this.buttons[i];
    if (!b) return;
    b.classList.remove('enter');
    b.classList.add(state);
    if (state === 'good' || state === 'reveal') b.insertAdjacentHTML('beforeend', `<span class="mark">${ICON.check}</span>`);
    if (state === 'bad') b.insertAdjacentHTML('beforeend', `<span class="mark">${ICON.cross}</span>`);
  }

  optionCenter(i: number): [number, number] {
    const b = this.buttons[i];
    if (!b) return [window.innerWidth / 2, window.innerHeight / 2];
    const r = b.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }

  lockOptions(): void {
    for (const b of this.buttons) b.disabled = true;
  }

  pick(i: number): void {
    const b = this.buttons[i];
    if (!this.pickResolve || !b || b.disabled || b.classList.contains('gone')) return;
    const r = this.pickResolve;
    this.pickResolve = null;
    this.lockOptions();
    r(i);
  }

  waitPick(): Promise<number> {
    return new Promise((resolve) => {
      this.pickResolve = resolve;
    });
  }

  cancelPick(value = -1): void {
    const r = this.pickResolve;
    this.pickResolve = null;
    r?.(value);
  }

  get picking(): boolean {
    return !!this.pickResolve;
  }

  // ---------- banners, toasts, floats ----------

  async showBanner(o: { icon?: string; kicker?: string; title: string; sub?: string; stars?: number; ms?: number; tone?: string }): Promise<void> {
    const b = this.banner;
    b.className = `banner ${o.tone ?? ''}`;
    b.innerHTML = '';
    const card = el('div', 'banner-card');
    if (o.icon) card.append(el('div', 'banner-icon', o.icon));
    if (o.kicker) card.append(el('div', 'banner-kicker', o.kicker));
    const title = el('div', 'banner-title');
    title.dir = 'auto';
    title.textContent = o.title;
    card.append(title);
    if (o.stars !== undefined) {
      const s = el('div', 'banner-stars');
      for (let i = 0; i < 3; i++) {
        const star = el('i', i < (o.stars ?? 0) ? 'on' : 'off', ICON.star);
        star.style.animationDelay = `${180 + i * 140}ms`;
        s.append(star);
      }
      card.append(s);
    }
    if (o.sub) {
      const sub = el('div', 'banner-sub');
      sub.innerHTML = o.sub;
      card.append(sub);
    }
    b.append(card);
    void b.offsetWidth;
    b.classList.add('show');
    await clock.wait(o.ms ?? 1200);
    b.classList.remove('show');
    b.classList.add('out');
    await clock.wait(220);
  }

  toast(html: string, tone = ''): void {
    const t = el('div', `toast ${tone}`, html);
    this.toasts.append(t);
    setTimeout(() => t.classList.add('out'), 1700);
    setTimeout(() => t.remove(), 2100);
  }

  float(x: number, y: number, html: string, tone = ''): void {
    const f = el('div', `float ${tone}`, html);
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    this.floats.append(f);
    setTimeout(() => f.remove(), 1200);
  }

  shake(): void {
    const t = this.shakeTarget;
    t.classList.remove('shake');
    void t.offsetWidth;
    t.classList.add('shake');
  }

  setBlocked(on: boolean): void {
    this.blocker.classList.toggle('hide', !on);
  }

  // ---------- modal cards ----------

  hideOverlay(): void {
    this.overlay.classList.add('hide');
    this.overlay.innerHTML = '';
  }

  get overlayOpen(): boolean {
    return !this.overlay.classList.contains('hide');
  }

  showPause(d: PauseData, h: PauseHandlers): void {
    const o = this.overlay;
    o.innerHTML = '';
    o.classList.remove('hide');
    const card = el('div', 'card pause-card');
    const title = el('div', 'card-title');
    title.textContent = t('paused');
    const atlas = el('div', 'atlas');
    const canvas = el('canvas');
    atlas.append(canvas);
    const stats = el(
      'div',
      'stats',
      `<span>${ICON.globe}<b>${d.collected}</b>/${d.total}</span><span>${ICON.fire}<b>${d.bestStreak}</b></span>`
    );
    stats.title = `${t('atlas')} · ${t('best')}`;
    const statsLabel = el('div', 'stats-label');
    statsLabel.textContent = `${t('atlas')} · ${t('best')}`;
    const toggles = el('div', 'toggles');
    const mk = (on: boolean, iconOn: string, iconOff: string, label: string, fn: () => boolean): HTMLButtonElement => {
      const b = el('button', `toggle ${on ? 'on' : 'off'}`);
      const paint = (v: boolean): void => {
        b.className = `toggle ${v ? 'on' : 'off'}`;
        b.innerHTML = `${v ? iconOn : iconOff}<span>${label}</span>`;
      };
      paint(on);
      b.addEventListener('click', () => paint(fn()));
      return b;
    };
    toggles.append(
      mk(d.sound, ICON.sound, ICON.mute, t('sound'), h.sound),
      mk(d.music, ICON.music, ICON.mute, t('music'), h.music)
    );
    const themeLabel = el('div', 'stats-label');
    themeLabel.textContent = t('style');
    const themes = el('div', 'themes');
    for (const th of d.themes) {
      const b = el('button', `swatch ${th.id === d.theme ? 'sel' : ''} ${th.unlocked ? '' : 'locked'}`);
      b.style.background = `linear-gradient(135deg, ${th.swatch[0]} 0 50%, ${th.swatch[1]} 50% 100%)`;
      if (!th.unlocked) b.innerHTML = `${ICON.lock}<small>${ICON.globe}${th.need}</small>`;
      b.addEventListener('click', () => {
        if (!th.unlocked) {
          b.classList.remove('nope');
          void b.offsetWidth;
          b.classList.add('nope');
          return;
        }
        themes.querySelectorAll('.swatch').forEach((s) => s.classList.remove('sel'));
        b.classList.add('sel');
        h.theme(th.id);
        d.drawAtlas(canvas);
      });
      themes.append(b);
    }
    const resume = el('button', 'btn primary big', `${ICON.play}<span></span>`);
    (resume.querySelector('span') as HTMLElement).textContent = t('resume');
    resume.addEventListener('click', h.resume);
    const restart = el('button', 'btn restart', `${ICON.retry}<span></span>`);
    (restart.querySelector('span') as HTMLElement).textContent = t('restart');
    restart.addEventListener('click', () => this.confirmRestart(d, h));
    const build = el('div', 'build');
    build.textContent = `v${d.build}`;
    card.append(title, atlas, stats, statsLabel, toggles, themeLabel, themes, resume, restart, build);
    o.append(card);
    requestAnimationFrame(() => d.drawAtlas(canvas));
  }

  /** "Are you sure?" step before wiping progress; Cancel goes back to the pause card. */
  private confirmRestart(d: PauseData, h: PauseHandlers): void {
    const o = this.overlay;
    o.innerHTML = '';
    const card = el('div', 'card confirm-card');
    card.append(el('div', 'confirm-icon', ICON.retry));
    const title = el('div', 'card-title');
    title.textContent = t('restart_q');
    const text = el('p', 'confirm-text');
    text.textContent = t('restart_txt');
    const yes = el('button', 'btn danger big', `${ICON.retry}<span></span>`);
    (yes.querySelector('span') as HTMLElement).textContent = t('restart_yes');
    // Ignore taps for a moment so a double tap on "Restart game" can't confirm it.
    const armedAt = performance.now() + 450;
    yes.addEventListener('click', () => {
      if (performance.now() >= armedAt) h.restart();
    });
    const cancel = el('button', 'btn secondary big');
    cancel.textContent = t('cancel');
    cancel.addEventListener('click', () => this.showPause(d, h));
    const actions = el('div', 'confirm-actions');
    actions.append(yes, cancel);
    card.append(title, text, actions);
    o.append(card);
  }

  /** Clears whatever an abandoned round left on screen (used by restart). */
  resetRound(): void {
    this.pickResolve = null;
    this.buttons = [];
    this.answers.innerHTML = '';
    this.setPanel('none');
    this.setPrompt(null);
    this.setTimer(null);
    this.setStreak(0, 1);
    this.setLocate(false);
    this.setHint(0, false, false);
    this.banner.className = 'banner';
    this.banner.innerHTML = '';
    this.toasts.innerHTML = '';
    this.floats.innerHTML = '';
  }

  showGameOver(o: { level: number; score: number; best: number; bestLevel: number; record: boolean; canAd: boolean }): Promise<'ad' | 'retry'> {
    return new Promise((resolve) => {
      const ov = this.overlay;
      ov.innerHTML = '';
      ov.classList.remove('hide');
      const card = el('div', 'card hearts-card');
      card.append(el('div', 'big-heart', ICON.heart));
      const title = el('div', 'card-title');
      title.textContent = t('out_title');
      const lvl = el('div', 'stats-label');
      lvl.textContent = t('level', { n: o.level });
      const score = el('div', 'final-score', `${ICON.star}<b></b>`);
      (score.querySelector('b') as HTMLElement).textContent = formatPoints(o.score);
      card.append(title, lvl, score);
      if (o.record && o.score > 0) {
        const rec = el('div', 'record-badge', `${ICON.crown}<span></span>`);
        (rec.querySelector('span') as HTMLElement).textContent = t('record');
        card.append(rec);
      } else {
        const best = el('div', 'stats', `<span>${ICON.crown}<b></b></span>`);
        (best.querySelector('b') as HTMLElement).textContent = formatPoints(o.best);
        card.append(best);
      }
      if (o.canAd) {
        const ad = el('button', 'btn reward big', `${ICON.video}<span></span><em>+${ICON.heart}${ICON.heart}</em>`);
        (ad.querySelector('span') as HTMLElement).textContent = t('continue');
        ad.addEventListener('click', () => resolve('ad'));
        card.append(ad);
      }
      const retry = el('button', `btn ${o.canAd ? 'secondary' : 'primary'} big`, `${ICON.retry}<span></span>`);
      (retry.querySelector('span') as HTMLElement).textContent = `${t('retry')} · ${t('level', { n: 1 })}`;
      retry.addEventListener('click', () => resolve('retry'));
      card.append(retry);
      ov.append(card);
    });
  }
}
