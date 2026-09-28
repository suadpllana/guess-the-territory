// Game flow: levels made of rounds, each level teaching one new way to play
// the same core rule (match a territory with its name), then mixed levels,
// boss levels and blitz bonus rounds in an endless ladder.
import { sound } from '../audio';
import { ADS, BUILD } from '../config';
import { clock } from '../core/clock';
import { kmPerUnit, type Feature, type World } from '../geo/world';
import { FLAGS } from '../data/flags';
import { countryName, praise, t } from '../i18n';
import { ease, fitBox, type View } from '../map/camera';
import type { Look, MapView } from '../map/mapview';
import { THEMES, themeById } from '../map/themes';
import { Poki } from '../poki';
import { flushSave, freshSave, writeSave, type SaveData } from '../storage';
import type { Fx } from '../ui/fx';
import { ICON } from '../ui/icons';
import type { UI } from '../ui/ui';
import { Picker, shuffle, type Mode, type Question } from './picker';

type Intro = Mode | 'mixed' | 'boss';

interface Plan {
  level: number;
  rounds: number;
  modes: Mode[];
  cap: number;
  bonus: boolean;
  intro: Intro;
  pool?: (f: Feature) => boolean;
}

const MODE_ICON: Record<Intro, string> = {
  classic: ICON.map,
  shape: ICON.puzzle,
  find: ICON.hand,
  silhouette: ICON.shape,
  blitz: ICON.timer,
  mixed: ICON.star,
  boss: ICON.crown,
};

const MODE_TEXT = {
  classic: 'm_classic',
  shape: 'm_shape',
  find: 'm_find',
  silhouette: 'm_silhouette',
  blitz: 'm_blitz',
  mixed: 'm_mixed',
  boss: 'm_boss',
} as const;

const BOSS_POOLS: ((f: Feature) => boolean)[] = [
  (f) => f.continent === 'Europe',
  (f) => f.continent === 'Africa',
  (f) => f.continent === 'Asia',
  (f) => f.continent === 'North America' || f.continent === 'South America',
  (f) => f.area < 60000,
];

const MIXED: Mode[] = ['classic', 'find', 'classic', 'shape', 'classic', 'silhouette', 'find', 'shape'];

export function planFor(level: number): Plan {
  switch (level) {
    case 1:
      return { level, rounds: 5, modes: ['classic'], cap: 2.5, bonus: false, intro: 'classic' };
    case 2:
      return { level, rounds: 6, modes: ['shape'], cap: 3, bonus: false, intro: 'shape' };
    case 3:
      return { level, rounds: 7, modes: ['find'], cap: 3.5, bonus: true, intro: 'find' };
    case 4:
      return { level, rounds: 7, modes: ['silhouette'], cap: 4, bonus: false, intro: 'silhouette' };
  }
  const boss = level >= 10 && level % 5 === 0;
  const rot = level % MIXED.length;
  return {
    level,
    rounds: boss ? 10 : 8,
    modes: [...MIXED.slice(rot), ...MIXED.slice(0, rot)],
    cap: Math.min(8, 4.5 + (level - 5) * 0.25),
    bonus: level % 3 === 0,
    intro: boss ? 'boss' : 'mixed',
    pool: boss ? BOSS_POOLS[Math.floor(level / 5) % BOSS_POOLS.length] : undefined,
  };
}

const pad = (n: number): string => String(n).padStart(2, '0');

let haptics = true;
/** Short vibration on Android phones (no-op elsewhere). */
function buzz(ms: number): void {
  if (!haptics) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // unsupported
  }
}

export class Game {
  paused = false;
  started = false;
  private hidden = false;
  private picker: Picker;
  private level = 1;
  private hearts = 3;
  private streak = 0;
  private mistakes = 0;
  private hintUsed = false;
  private hintEligible = false;
  private currentQ: Question | null = null;
  private skip: (() => void) | null = null;
  private collected: Set<string>;
  private recordShown = false;
  private blitzEnd = 0;
  private lastTick = -1;
  private tileStyle: 'map' | 'shape' = 'map';
  private tileLooks: Look[] = [];
  private roundIdx = 0;
  private lastRound = false;
  private cap = 2.5;

  constructor(
    private world: World,
    private map: MapView,
    private ui: UI,
    private fx: Fx,
    private save: SaveData,
    private home: string | null
  ) {
    this.collected = new Set(save.collected.filter((c) => world.byCode.has(c)));
    haptics = save.sound;
    this.picker = new Picker(world, save, home);
    ui.onPause = () => this.togglePause();
    ui.onHint = () => void this.useHint();
    ui.onLocate = () => {
      if (this.map.home) void this.map.flyTo(this.map.home, 600);
      this.ui.setLocate(false);
    };
    map.onUserMove = () => this.ui.setLocate(this.map.isAway());
  }

  // ---------- lifecycle ----------

  /** Called when the first round begins (stops the idle world drift). */
  onStart?: () => void;

  async run(): Promise<void> {
    this.onStart?.();
    this.save.sessions++;
    this.level = Math.max(1, this.save.level);
    this.ui.setPoints(this.save.points, false);
    this.ui.setHearts(3);
    writeSave(this.save);
    if (this.save.sessions > 1 && this.save.answered > 0) this.ui.toast(`${ICON.globe}${t('welcome')}`);
    await this.loop();
  }

  private async loop(): Promise<void> {
    for (;;) {
      const plan = planFor(this.level);
      const result = await this.playLevel(plan);
      if (result === 'gameover') {
        // Out of hearts: the run is over and the next one starts at level 1.
        const reached = this.level;
        this.level = 1;
        this.save.level = 1;
        this.save.points = 0;
        this.ui.setPoints(0, false);
        flushSave(this.save);
        await this.naturalBreak(reached);
        continue;
      }
      if (plan.bonus) await this.playBlitz();
      this.level++;
      await this.naturalBreak(this.level);
    }
  }

  /** Called once on the first real input: gameplay starts on input, never on load. */
  firstInput(): void {
    if (this.started) return;
    this.started = true;
    this.ui.showTapHint(false);
    sound.unlock();
    if (this.save.music) sound.startMusic();
    this.syncGameplay();
    Poki.measure('game', 'input', 'first');
  }

  private syncGameplay(): void {
    const active = this.started && !this.paused && !this.hidden && !Poki.inAd && !this.ui.overlayOpen;
    if (active) Poki.gameplayStart();
    else Poki.gameplayStop();
    clock.setPaused(this.paused || this.hidden || Poki.inAd);
  }

  setHidden(h: boolean): void {
    this.hidden = h;
    sound.setMuted(h || Poki.inAd);
    if (h) {
      flushSave(this.save);
      if (this.started && !this.ui.overlayOpen) this.pause(false);
    }
    this.syncGameplay();
  }

  adStarted(): void {
    sound.setMuted(true);
    this.ui.setBlocked(true);
    this.syncGameplay();
  }

  adEnded(): void {
    sound.setMuted(this.hidden);
    this.ui.setBlocked(false);
    this.syncGameplay();
  }

  togglePause(): void {
    if (this.paused) this.resume();
    else this.pause();
  }

  pause(manual = true): void {
    if (this.paused || Poki.inAd || this.ui.overlayOpen) return;
    this.paused = true;
    if (manual) Poki.measure('menu', 'pause', 'open');
    this.ui.showPause(
      {
        collected: this.collected.size,
        total: this.world.quiz.length,
        bestStreak: this.save.bestStreak,
        sound: this.save.sound,
        music: this.save.music,
        theme: this.save.theme,
        themes: THEMES.map((th) => ({
          id: th.id,
          swatch: th.swatch,
          unlocked: this.collected.size >= th.unlock,
          need: th.unlock,
        })),
        build: BUILD,
        drawAtlas: (c) => this.drawAtlas(c),
      },
      {
        resume: () => this.resume(),
        sound: () => {
          this.save.sound = !this.save.sound;
          haptics = this.save.sound;
          sound.setSound(this.save.sound);
          writeSave(this.save);
          return this.save.sound;
        },
        music: () => {
          this.save.music = !this.save.music;
          sound.setMusic(this.save.music);
          if (this.save.music) sound.startMusic();
          writeSave(this.save);
          return this.save.music;
        },
        theme: (id) => {
          this.applyTheme(id);
          Poki.measure('menu', 'theme', id);
        },
        restart: () => this.restart(),
      }
    );
    this.syncGameplay();
  }

  /** Wipes progress (sound and music settings stay) and starts over at level 1, without reloading. */
  private restart(): void {
    Poki.measure('game', 'restart', `level-${pad(this.level)}`);
    const keep = { sound: this.save.sound, music: this.save.music, sessions: this.save.sessions };
    // Mutate in place: the picker and main.ts hold this same object.
    Object.assign(this.save, freshSave(), keep);
    flushSave(this.save);
    // Abandon the run in progress: its pending waits, flights and taps never resume.
    clock.cancelAll();
    this.skip = null;
    this.map.onTap = undefined;
    this.map.jump({ ...this.map.view });
    this.map.clearLabels();
    this.map.setCandidates([]);
    this.map.hidePin();
    this.map.setSilhouette(false);
    this.ui.resetRound();
    this.applyTheme(this.save.theme);
    this.collected = new Set();
    this.picker = new Picker(this.world, this.save, this.home);
    this.level = 1;
    this.streak = 0;
    this.blitzEnd = 0;
    this.currentQ = null;
    this.recordShown = false;
    this.hintUsed = false;
    this.hintEligible = false;
    this.ui.setPoints(0, false);
    this.ui.hideOverlay();
    this.paused = false;
    sound.tap();
    this.syncGameplay();
    void this.loop();
  }

  resume(): void {
    if (!this.paused) return;
    this.ui.hideOverlay();
    this.paused = false;
    sound.tap();
    this.syncGameplay();
  }

  applyTheme(id: string): void {
    const th = themeById(id);
    this.save.theme = th.id;
    this.map.setTheme(th);
    document.body.style.background = th.water;
    writeSave(this.save);
  }

  /** Space / Enter / tap on the map skips the post-answer pause. */
  skipWait(): void {
    this.skip?.();
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (this.paused) this.resume();
      else this.pause();
      return;
    }
    if (this.paused) {
      if (e.key === 'Enter' || e.key === ' ') this.resume();
      return;
    }
    const n = '1234'.indexOf(e.key);
    const a = 'abcd'.indexOf(e.key.toLowerCase());
    const idx = n >= 0 ? n : a;
    if (idx >= 0 && this.ui.picking) {
      this.ui.pick(idx);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') this.skipWait();
    if ((e.key === 'h' || e.key === 'H') && this.hintEligible) void this.useHint();
  }

  onResize(): void {
    this.relayout();
    const f = this.map.target;
    if (f && this.map.home) {
      const q = this.currentQ;
      const home = q?.mode === 'find' ? this.map.frameMany(this.map.candidates, 0.85) : this.map.frame(f, this.map.silhouette ? 0.78 : 0.72);
      this.map.home = home;
      this.map.jump(home);
    } else if (this.currentQ?.mode === 'find' && this.map.candidates.length) {
      const home = this.map.frameMany(this.map.candidates, 0.85);
      this.map.home = home;
      this.map.jump(home);
    }
    const q = this.currentQ;
    if (q?.mode === 'shape') this.ui.rerenderTiles((c, i) => this.renderTile(c, q.options[i], this.tileLooks[i] ?? 'ask'));
  }

  relayout(): void {
    const r = this.ui.mapRect(window.innerWidth, window.innerHeight);
    this.map.setViewport(r);
    this.ui.placeFabs(r);
  }

  /** Per-frame work driven by game time. */
  tick(): void {
    if (clock.paused) return;
    if (this.blitzEnd) {
      const left = this.blitzEnd - clock.now;
      this.ui.setTimer(left / 20000, left < 5000);
      const sec = Math.ceil(left / 1000);
      if (left < 5000 && sec !== this.lastTick && left > 0) {
        this.lastTick = sec;
        sound.tick();
      }
      if (left <= 0 && this.ui.picking) this.ui.cancelPick(-1);
    }
  }

  // ---------- levels ----------

  private async playLevel(plan: Plan): Promise<'done' | 'gameover'> {
    this.hearts = 3;
    this.mistakes = 0;
    this.ui.setHearts(3, 3, plan.level > 1 ? 'gain' : null);
    this.ui.setLevel(plan.level, plan.rounds, t('level', { n: plan.level }));
    Poki.measure('level', pad(plan.level), 'start');
    if (plan.level > 1) this.levelIntro(plan);
    this.syncGameplay();
    for (let r = 0; r < plan.rounds; r++) {
      this.roundIdx = r;
      this.lastRound = r === plan.rounds - 1;
      this.cap = plan.cap;
      this.ui.setDot(r, 'cur');
      await this.playRound(plan.modes[r % plan.modes.length], plan);
      if (this.hearts <= 0) {
        const choice = await this.outOfHearts(plan.level);
        if (choice === 'gameover') return 'gameover';
      }
    }
    await this.levelComplete(plan);
    return 'done';
  }

  private levelIntro(plan: Plan): void {
    const key = plan.intro;
    const first = !this.save.seenModes.includes(key);
    if (first) {
      this.save.seenModes.push(key);
      Poki.measure('mode', key, 'first');
    }
    void this.ui.showBanner({
      icon: MODE_ICON[key],
      kicker: t('level', { n: plan.level }),
      title: t(MODE_TEXT[key]),
      ms: first ? 1500 : 1050,
      tone: key === 'boss' ? 'gold' : '',
    });
  }

  private async levelComplete(plan: Plan): Promise<void> {
    const stars = this.mistakes === 0 ? 3 : this.mistakes === 1 ? 2 : 1;
    this.save.stars[plan.level] = Math.max(this.save.stars[plan.level] ?? 0, stars);
    this.save.level = plan.level + 1;
    const gain = this.save.hints < 5;
    if (gain) this.save.hints++;
    flushSave(this.save);
    Poki.measure('level', pad(plan.level), 'complete');
    this.ui.setPrompt(null);
    this.ui.setLocate(false);
    this.hintEligible = false;
    this.refreshHint(false);
    sound.levelUp();
    this.fx.rain(stars === 3 ? 120 : 70);
    await this.ui.showBanner({
      icon: ICON.star,
      kicker: t('level', { n: plan.level }),
      title: t('level_done'),
      stars,
      sub: gain ? `+1 <span class="inline-icon">${ICON.bulb}</span>` : '',
      // keep early cards short: every card is an exit point
      ms: plan.level <= 2 ? 1000 : 1350,
      tone: 'gold',
    });
  }

  /** Midroll at a natural break, only once the player has had real fun (level 4+). */
  private async naturalBreak(reached: number): Promise<void> {
    if (!ADS || reached <= 3) return;
    Poki.gameplayStop();
    await Poki.commercialBreak();
    this.syncGameplay();
  }

  private async outOfHearts(level: number): Promise<'continue' | 'gameover'> {
    Poki.measure('level', pad(level), 'fail');
    const score = this.save.points;
    const record = score > this.save.bestPoints;
    this.save.bestPoints = Math.max(this.save.bestPoints, score);
    this.save.bestLevel = Math.max(this.save.bestLevel, level);
    flushSave(this.save);
    for (;;) {
      const pending = this.ui.showGameOver({
        level,
        score,
        best: this.save.bestPoints,
        bestLevel: this.save.bestLevel,
        record,
        canAd: Poki.canReward(),
      });
      this.syncGameplay();
      const choice = await pending;
      this.ui.hideOverlay();
      if (choice === 'ad') {
        const ok = await Poki.rewardedBreak();
        if (ok) {
          Poki.measure('reward', 'continue', 'granted');
          this.hearts = 2;
          this.ui.setHearts(2, 3, 'gain');
          this.syncGameplay();
          return 'continue';
        }
        continue;
      }
      Poki.measure('game', 'over', `level-${pad(level)}`);
      this.syncGameplay();
      return 'gameover';
    }
  }

  // ---------- rounds ----------

  private async playRound(mode: Mode, plan: Plan): Promise<boolean> {
    const q = this.picker.question(mode, plan.cap, plan.pool);
    this.currentQ = q;
    this.hintUsed = false;
    this.map.clearLabels();
    this.map.setCandidates([]);
    this.map.hidePin();
    this.ui.setLocate(false);
    if (q.mode === 'shape') return this.roundShape(q);
    if (q.mode === 'find') return this.roundFind(q);
    return this.roundOptions(q);
  }

  private async roundOptions(q: Question): Promise<boolean> {
    const f = q.target;
    const names = q.options.map((o) => countryName(o.code, o.name));
    this.ui.setPrompt(t('q_classic'));
    this.ui.showOptions(names, !this.ui.touch, q.options.map((o) => FLAGS[o.code] ?? ''));
    this.refreshHint(true);
    this.relayout();
    const sil = q.mode === 'silhouette';
    this.map.setSilhouette(sil);
    this.map.limits = null;
    const home = this.map.frame(f, sil ? 0.78 : 0.72);
    this.map.home = home;
    let arrived: Promise<void>;
    if (sil) {
      this.map.setTarget(f, 'ask');
      this.map.jump({ ...home, z: home.z - 0.6 });
      arrived = this.map.zoomTo(home, 450, ease.outBack);
    } else {
      this.map.setTarget(f, 'ask');
      sound.whoosh();
      arrived = this.map.flyTo(home).then(() => {
        this.map.dropPin();
        sound.pin();
        if (this.ui.picking) this.map.limits = this.limitsFor(home);
      });
    }
    let seenAt = sil ? clock.now : Infinity;
    void arrived.then(() => {
      seenAt = Math.min(seenAt, clock.now);
    });
    // First question of a first visit: if nothing is tapped for a few seconds,
    // a small hand points at the answers.
    const hintTimer =
      !this.started && this.save.answered === 0
        ? window.setTimeout(() => {
            if (!this.started && this.ui.picking) this.ui.showTapHint(true);
          }, 4000)
        : 0;
    const pick = await this.ui.waitPick();
    window.clearTimeout(hintTimer);
    this.ui.showTapHint(false);
    const elapsed = Math.max(0, clock.now - seenAt);
    this.map.limits = null;
    this.ui.setLocate(false);
    this.refreshHint(false);
    const correct = q.options[pick] === f;
    this.ui.markOption(pick, correct ? 'good' : 'bad');
    const right = q.options.indexOf(f);
    if (!correct) this.ui.markOption(right, 'reveal');
    q.options.forEach((_, i) => {
      if (i !== pick && i !== right) this.ui.markOption(i, 'dim');
    });
    this.feedback(f, correct, this.ui.optionCenter(pick), { fast: elapsed < 3000 });
    await arrived;
    if (!sil && (this.map.isAway() || Math.abs(this.map.view.z - home.z) > 0.05)) await this.map.flyTo(home, 650);
    return this.settle(f, correct, true, false, q.options[pick]);
  }

  /** Deepest zoom that still shows at least 140 km (finer detail is not bundled). */
  private zCap(y: number): number {
    const minSpan = 140 / kmPerUnit(y);
    return Math.log2(Math.min(this.map.vp.w, this.map.vp.h) / minSpan);
  }

  private async roundShape(q: Question): Promise<boolean> {
    const f = q.target;
    const name = countryName(f.code, f.name);
    this.ui.setPrompt(t('q_shape', { c: '{c}' }), name, FLAGS[f.code]);
    this.map.setSilhouette(false);
    this.map.setTarget(null);
    this.map.limits = null;
    this.tileStyle = q.easy || this.save.skill < 3.4 ? 'map' : 'shape';
    this.tileLooks = q.options.map(() => 'ask' as Look);
    this.ui.showTiles(4, (c, i) => this.renderTile(c, q.options[i], 'ask'));
    this.refreshHint(true);
    this.relayout();
    const wv = this.map.worldView();
    void this.map.flyTo({ ...wv, x: Math.random(), z: wv.z + 0.4 }, 1200);
    const t0 = clock.now;
    const pick = await this.ui.waitPick();
    this.refreshHint(false);
    const correct = q.options[pick] === f;
    const right = q.options.indexOf(f);
    this.tileLooks[pick] = correct ? 'good' : 'bad';
    this.tileLooks[right] = 'good';
    this.ui.markOption(pick, correct ? 'good' : 'bad');
    if (!correct) this.ui.markOption(right, 'reveal');
    this.ui.rerenderTiles((c, i) => this.renderTile(c, q.options[i], this.tileLooks[i]));
    this.feedback(f, correct, this.ui.optionCenter(pick), { fast: clock.now - t0 < 3000 });
    this.map.setTarget(f, 'good');
    const home = this.map.frame(f);
    this.map.home = home;
    await this.map.flyTo(home, 1000);
    this.map.dropPin();
    sound.pin();
    return this.settle(f, correct, true, true, q.options[pick]);
  }

  private async roundFind(q: Question): Promise<boolean> {
    const f = q.target;
    const name = countryName(f.code, f.name);
    this.ui.setPrompt(t('q_find', { c: '{c}' }), name, FLAGS[f.code]);
    this.ui.setPanel('none');
    this.refreshHint(false);
    this.relayout();
    this.map.setSilhouette(false);
    this.map.setTarget(null);
    this.map.limits = null;
    this.map.setCandidates(q.options);
    const home = this.map.frameMany(q.options, 0.85);
    this.map.home = home;
    sound.whoosh();
    await this.map.flyTo(home);
    if (!this.save.seenModes.includes('find-tip')) {
      this.save.seenModes.push('find-tip');
      this.ui.toast(`${ICON.hand}${t('tap_map')}`);
    }
    const t0 = clock.now;
    const picked = await this.waitMapPick();
    const correct = picked === f;
    this.map.candidateLook.set(picked, correct ? 'good' : 'bad');
    if (!correct) this.map.candidateLook.set(f, 'good');
    for (const c of q.options) if (c !== f) this.map.showLabel(c, countryName(c.code, c.name), 'hint', FLAGS[c.code]);
    const [x, y] = this.map.screenOf(picked.label[0], picked.label[1]);
    this.feedback(f, correct, [x, y], { fast: clock.now - t0 < 3000 });
    this.map.showLabel(f, name, correct ? 'good' : 'bad', FLAGS[f.code]);
    await this.hold(correct ? 1100 : 1900, correct ? 400 : 800);
    this.map.setCandidates([]);
    return correct;
  }

  private waitMapPick(): Promise<Feature> {
    return new Promise((resolve) => {
      this.map.onTap = (x, y) => {
        const c = this.map.hitCandidate(x, y);
        if (!c || this.paused) return;
        this.map.onTap = undefined;
        this.map.onHover = undefined;
        document.body.style.cursor = '';
        resolve(c);
      };
      this.map.onHover = (x, y) => {
        const c = this.map.hitCandidate(x, y);
        for (const k of this.map.candidates) this.map.candidateLook.set(k, k === c ? 'hover' : 'ask');
        document.body.style.cursor = c ? 'pointer' : '';
      };
    });
  }

  // ---------- blitz bonus ----------

  private async playBlitz(): Promise<void> {
    Poki.measure('bonus', 'blitz', 'start');
    await this.ui.showBanner({ icon: ICON.timer, kicker: t('m_blitz'), title: t('ready'), ms: 900, tone: 'hot' });
    void this.ui.showBanner({ icon: ICON.bolt, title: t('go'), ms: 450, tone: 'hot' });
    sound.streak(5);
    this.blitzEnd = clock.now + 20000;
    this.lastTick = -1;
    let count = 0;
    let combo = 0;
    let total = 0;
    while (clock.now < this.blitzEnd) {
      const q = this.picker.question('blitz', Math.max(2, Math.min(this.cap - 0.5, this.save.skill)));
      const f = q.target;
      this.currentQ = q;
      this.ui.setPrompt(t('q_classic'));
      this.ui.showOptions(
        q.options.map((o) => countryName(o.code, o.name)),
        !this.ui.touch,
        q.options.map((o) => FLAGS[o.code] ?? '')
      );
      this.refreshHint(false);
      this.relayout();
      this.map.setSilhouette(false);
      this.map.clearLabels();
      this.map.hidePin();
      this.map.setTarget(f, 'ask');
      const home = this.map.frame(f);
      this.map.home = home;
      void this.map.flyTo(home, 600);
      const pick = await this.ui.waitPick();
      if (pick < 0) break;
      const correct = q.options[pick] === f;
      this.ui.markOption(pick, correct ? 'good' : 'bad');
      if (!correct) this.ui.markOption(q.options.indexOf(f), 'reveal');
      this.picker.record(f, correct, true);
      this.save.answered++;
      if (correct) {
        this.save.correct++;
        count++;
        combo++;
        const pts = 50 + Math.min(combo, 10) * 10;
        total += pts;
        this.save.points += pts;
        this.ui.setPoints(this.save.points);
        const [x, y] = this.ui.optionCenter(pick);
        this.ui.float(x, y, `+${pts}`);
        this.fx.burst(x, y, 18, 0.7);
        sound.correct(combo);
        this.map.setLook('good');
        if (!this.collected.has(f.code)) this.collect(f, [x, y]);
        await clock.wait(260);
      } else {
        combo = 0;
        this.blitzEnd -= 2000;
        sound.wrong();
        buzz(40);
        this.map.setLook('good');
        this.map.showLabel(f, countryName(f.code, f.name), 'bad', FLAGS[f.code]);
        await clock.wait(650);
      }
    }
    this.ui.cancelPick(-1);
    this.blitzEnd = 0;
    this.ui.setTimer(null);
    this.ui.setPrompt(null);
    writeSave(this.save);
    Poki.measure('bonus', 'blitz', `score-${Math.min(count, 20)}`);
    sound.levelUp();
    this.fx.rain(60);
    await this.ui.showBanner({
      icon: ICON.timer,
      kicker: t('time_up'),
      title: t('correct_n', { n: count }),
      sub: `<b>+${total}</b>`,
      ms: 1500,
      tone: 'gold',
    });
  }

  // ---------- feedback ----------

  private multiplier(): number {
    return Math.min(5, 1 + Math.floor(this.streak / 3));
  }

  /** Immediate reaction to an answer: sound, points, hearts, particles. */
  private feedback(f: Feature, correct: boolean, from: [number, number], o: { points?: number; fast: boolean }): void {
    this.save.answered++;
    this.picker.record(f, correct, o.fast);
    if (!this.blitzEnd) this.ui.setDot(this.roundIdx, correct ? 'ok' : 'no');
    if (correct) {
      this.save.correct++;
      this.streak++;
      const mult = this.multiplier();
      const pts = (o.points ?? 100 + (o.fast ? 50 : 0)) * mult;
      this.save.points += pts;
      this.ui.float(from[0], from[1] - 8, `+${pts}`);
      window.setTimeout(() => this.ui.setPoints(this.save.points), 380);
      sound.correct(this.streak);
      buzz(12);
      this.fx.burst(from[0], from[1], 34);
      if (!this.collected.has(f.code)) this.collect(f, from);
      this.streakFeedback();
      this.ui.setStreak(this.streak, mult);
    } else {
      this.streak = 0;
      this.ui.setStreak(0, 1);
      this.hearts = Math.max(0, this.hearts - 1);
      this.mistakes++;
      this.ui.setHearts(this.hearts, 3, 'lose');
      sound.wrong();
      buzz(45);
      window.setTimeout(() => sound.heart(), 180);
      this.ui.shake();
    }
    writeSave(this.save);
  }

  /** Map shows the answer; short pause (skippable) before the next round. */
  private async settle(f: Feature, correct: boolean, label: boolean, keepLook = false, chosen?: Feature): Promise<boolean> {
    if (!keepLook) this.map.setLook('good');
    const name = countryName(f.code, f.name);
    if (label) this.map.showLabel(f, correct ? name : t('it_is', { c: name }), correct ? 'good' : 'bad', FLAGS[f.code]);
    if (label && !this.map.silhouette) this.labelNeighbours(f, chosen);
    if (!correct && chosen && chosen !== f && !this.map.silhouette && this.onScreen(chosen)) {
      // show where the wrongly chosen country really is
      this.map.setCandidates([chosen]);
      this.map.candidateLook.set(chosen, 'bad');
      this.map.showLabel(chosen, countryName(chosen.code, chosen.name), 'hint', FLAGS[chosen.code]);
    }
    await this.hold(correct ? 950 : 1800, correct ? 350 : 750);
    this.map.setCandidates([]);
    return correct;
  }

  /** Names of a few sizeable neighbours, as on a real map (passive learning). */
  private labelNeighbours(f: Feature, skip?: Feature): void {
    const near = f.neighbours
      .map((c) => this.world.byCode.get(c))
      .filter((n): n is Feature => !!n && n.quiz && n !== skip && n.area > f.area / 12 && this.onScreen(n, 0.08))
      .sort((a, b) => b.area - a.area)
      .slice(0, 4);
    for (const n of near) this.map.showLabel(n, countryName(n.code, n.name), 'near', FLAGS[n.code]);
  }

  private onScreen(f: Feature, margin = 0): boolean {
    const [x, y] = this.map.screenOf(f.label[0], f.label[1]);
    const r = this.map.vp;
    const mx = r.w * margin;
    const my = r.h * margin;
    return x > r.x + mx && x < r.x + r.w - mx && y > r.y + my && y < r.y + r.h - my;
  }

  private async hold(ms: number, min: number): Promise<void> {
    await clock.wait(min);
    await Promise.race([
      clock.wait(Math.max(0, ms - min)),
      new Promise<void>((resolve) => {
        this.skip = resolve;
      }),
    ]);
    this.skip = null;
  }

  private collect(f: Feature, from: [number, number]): void {
    this.collected.add(f.code);
    this.save.collected.push(f.code);
    this.picker.markCollected(f.code);
    window.setTimeout(() => {
      this.ui.float(from[0], from[1] - this.ui.u * 5, `${t('new')} ${ICON.globe}${this.collected.size}`, 'new');
      sound.sparkle();
    }, 280);
    const count = this.collected.size;
    const unlocked = THEMES.find((th) => th.unlock > 0 && th.unlock === count);
    if (!unlocked && (count === 10 || count === 50 || count === 75 || count === 125 || count === 175 || count === this.world.quiz.length)) {
      window.setTimeout(() => {
        this.ui.toast(`${ICON.globe}${count} · ${t('atlas')}`, 'green');
        sound.sparkle();
        Poki.measure('atlas', String(count), 'reached');
      }, 650);
    }
    if (unlocked) {
      window.setTimeout(() => {
        this.ui.toast(`${ICON.star}${t('unlocked')}`, 'gold');
        this.applyTheme(unlocked.id);
        sound.levelUp();
        Poki.measure('unlock', 'theme', unlocked.id);
      }, 700);
    }
  }

  private streakFeedback(): void {
    const s = this.streak;
    if (s > this.save.bestStreak) {
      const old = this.save.bestStreak;
      this.save.bestStreak = s;
      if (!this.recordShown && old >= 4 && s === old + 1) {
        this.recordShown = true;
        this.ui.toast(`${ICON.fire}${t('record')}`, 'gold');
      }
    }
    const milestones = [3, 5, 10, 15, 20, 25, 30, 40, 50];
    const idx = milestones.indexOf(s);
    if (idx >= 0 && !this.lastRound) {
      const r = this.ui.mapRect(window.innerWidth, window.innerHeight);
      window.setTimeout(() => {
        this.ui.float(r.x + r.w / 2, r.y + r.h * 0.35, praise(idx), 'praise');
        sound.streak(s);
      }, 250);
      if (s >= 10) this.fx.rain(40 + s * 2);
      Poki.measure('streak', String(s), 'reached');
    }
  }

  // ---------- hints ----------

  private refreshHint(eligible: boolean): void {
    this.hintEligible = eligible && this.level >= 2 && !this.hintUsed;
    const video = this.save.hints <= 0 && Poki.canReward();
    this.ui.setHint(this.save.hints, video, this.hintEligible && (this.save.hints > 0 || video));
  }

  private async useHint(): Promise<void> {
    const q = this.currentQ;
    if (!q || !this.hintEligible || !this.ui.picking || this.paused) return;
    if (this.save.hints > 0) {
      this.save.hints--;
      Poki.measure('hint', 'token', 'used');
    } else if (Poki.canReward()) {
      const ok = await Poki.rewardedBreak();
      this.syncGameplay();
      if (!ok || !this.ui.picking || this.currentQ !== q) return;
      Poki.measure('hint', 'rewarded', 'used');
    } else return;
    this.hintUsed = true;
    const wrong = q.options.map((o, i) => (o === q.target ? -1 : i)).filter((i) => i >= 0);
    for (const i of shuffle(wrong).slice(0, 2)) this.ui.markOption(i, 'gone');
    sound.pop();
    this.refreshHint(false);
    writeSave(this.save);
  }

  // ---------- drawing helpers ----------

  private limitsFor(home: View): { minZ: number; maxZ: number; box: [number, number, number, number] } {
    const s = 2 ** home.z;
    const span = Math.max(this.map.vp.w, this.map.vp.h) / s;
    return {
      minZ: home.z - 1.6,
      maxZ: Math.max(home.z + 0.5, Math.min(home.z + 1.8, this.zCap(home.y))),
      box: [home.x - span * 1.2, home.y - span * 1.2, home.x + span * 1.2, home.y + span * 1.2],
    };
  }

  private renderTile(c: HTMLCanvasElement, f: Feature, look: Look): void {
    const w = Math.max(10, c.offsetWidth);
    const h = Math.max(10, c.offsetHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const surf = { ctx, w, h, dpr };
    const vp = { x: 0, y: 0, w, h };
    const th = this.map.theme;
    const renderer = this.map.renderer;
    const cy = (f.frame[1] + f.frame[3]) / 2;
    if (this.tileStyle === 'map') {
      const view = fitBox(f.frame, vp, 0.6, Math.max(350, f.ctx) / kmPerUnit(cy));
      renderer.drawBase(surf, view, vp, th);
      renderer.vignette(surf);
      const [stroke, fill] = look === 'good' ? [th.good, th.goodFill] : look === 'bad' ? [th.bad, th.badFill] : [th.target, th.targetFill];
      renderer.highlight(surf, view, vp, { feature: f, fill, stroke, width: 2, dash: look === 'ask', dashOffset: 0 });
    } else {
      const view = fitBox(f.frame, vp, 0.78, 0);
      renderer.drawPaper(surf, th, 0);
      renderer.shape(surf, view, vp, f, look === 'good' ? th.good : look === 'bad' ? th.bad : th.shape);
    }
  }

  private drawAtlas(c: HTMLCanvasElement): void {
    const w = Math.max(10, c.offsetWidth);
    const h = Math.max(10, c.offsetHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const surf = { ctx, w, h, dpr };
    const vp = { x: 0, y: 0, w, h };
    const view = fitBox([0, 0.2, 1, 0.74], vp, 1, 0);
    view.x = 0.5;
    const th = this.map.theme;
    this.map.renderer.drawBase(surf, view, vp, th);
    for (const code of this.collected) {
      const f = this.world.byCode.get(code);
      if (f) this.map.renderer.fill(surf, view, vp, f, th.good);
    }
  }
}
