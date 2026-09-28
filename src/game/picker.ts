// Chooses questions: the player's home country and Poki's biggest audiences
// first, then adaptive difficulty around the player's skill, with missed
// countries coming back a few rounds later.
import { kmPerUnit, type Feature, type World } from '../geo/world';
import type { SaveData } from '../storage';
import { DIFFICULTY, MAX_DIFFICULTY, POKI_AUDIENCE } from './countries';

export type Mode = 'classic' | 'shape' | 'find' | 'silhouette' | 'blitz';

export interface Question {
  mode: Mode;
  target: Feature;
  options: Feature[]; // includes the target, shuffled
  easy: boolean; // opening question: obvious distractors
}

export function shuffle<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function weighted<T>(items: T[], w: (x: T) => number): T | undefined {
  let total = 0;
  const ws = items.map((x) => {
    const v = Math.max(0, w(x));
    total += v;
    return v;
  });
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function gauss(): number {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
}

/** Ground distance between two label points in km. */
export function distanceKm(a: Feature, b: Feature): number {
  let dx = b.label[0] - a.label[0];
  if (dx > 0.5) dx -= 1;
  if (dx < -0.5) dx += 1;
  const dy = b.label[1] - a.label[1];
  return Math.hypot(dx, dy) * kmPerUnit((a.label[1] + b.label[1]) / 2);
}

const MODE_OK: Record<Mode, (f: Feature) => boolean> = {
  classic: () => true,
  blitz: () => true,
  silhouette: (f) => f.area >= 1500,
  shape: (f) => f.area >= 1500,
  find: (f) => f.area >= 4000,
};

export class Picker {
  private recent: string[] = [];
  private opening: string[] = [];
  private round = 0;
  private revenge: { code: string; due: number }[] = [];
  /** Countries just named on the map, and the last round they must not be asked in. */
  private named = new Map<string, number>();
  private levelAsked: string[] = [];
  private collected: Set<string>;

  constructor(
    private world: World,
    private save: SaveData,
    home: string | null
  ) {
    this.collected = new Set(save.collected);
    const ok = (c: string | null): c is string => !!c && !!world.byCode.get(c)?.quiz && !this.collected.has(c);
    // Until a player has answered 12 questions, open with their home country and
    // Poki's biggest audiences (skipping ones they already know).
    const left = 12 - save.answered;
    if (left > 0) {
      const seq = [home, ...POKI_AUDIENCE.filter((c) => (DIFFICULTY.get(c) ?? 9) <= 2.5)];
      this.opening = [...new Set(seq.filter(ok))].slice(0, left);
    } else if (ok(home)) {
      this.opening = [home];
    }
    save.missed.forEach((code, i) => this.revenge.push({ code, due: 4 + i * 3 }));
  }

  /** True while the scripted opening (home + Poki audience) is running. */
  get inOpening(): boolean {
    return this.opening.length > 0;
  }

  private usable(f: Feature | undefined, mode: Mode): f is Feature {
    return !!f && f.quiz && !this.isRecent(f.code) && !this.isNamed(f.code) && MODE_OK[mode](f);
  }

  /**
   * A country whose name was just shown on the map (a neighbour label, a
   * wrong pick, a find-mode candidate) would give the answer away if asked
   * next, so it waits a few rounds.
   */
  noteNamed(code: string): void {
    this.named.set(code, this.round + 3);
  }

  private isNamed(code: string): boolean {
    const until = this.named.get(code);
    return until !== undefined && this.round <= until;
  }

  /** Novices see familiar countries again sooner; experts get more variety. */
  private isRecent(code: string): boolean {
    const span = Math.round(8 + Math.min(32, this.save.skill * 5));
    const i = this.recent.lastIndexOf(code);
    return i >= 0 && this.recent.length - i <= span;
  }

  private target(mode: Mode, cap: number, pool?: (f: Feature) => boolean): { f: Feature; easy: boolean } {
    this.round++;
    const first = this.round === 1;
    let i = 0;
    while (i < this.opening.length) {
      const code = this.opening[i];
      if (this.isNamed(code)) {
        i++; // keep it for a later round
        continue;
      }
      this.opening.splice(i, 1);
      const f = this.world.byCode.get(code);
      if (this.usable(f, mode) && (!pool || pool(f))) return { f, easy: first || f.difficulty <= 1.5 };
    }
    const dueIdx = this.revenge.findIndex((r) => r.due <= this.round && !this.isNamed(r.code));
    if (dueIdx >= 0) {
      const f = this.world.byCode.get(this.revenge[dueIdx].code);
      this.revenge.splice(dueIdx, 1);
      if (this.usable(f, mode) && (!pool || pool(f))) return { f, easy: false };
    }
    const s = this.save.skill;
    // Aim a little below the estimate so most questions feel fair.
    const aim = Math.min(cap, s - 0.35 + gauss() * 0.6);
    let list = this.world.quiz.filter((f) => this.usable(f, mode) && f.difficulty <= Math.max(1.5, cap) && (!pool || pool(f)));
    if (!list.length) list = this.world.quiz.filter((f) => MODE_OK[mode](f) && (!pool || pool(f)));
    if (!list.length) list = this.world.quiz;
    const f = weighted(list, (x) => {
      const d = x.difficulty - aim;
      return Math.exp(-(d * d) / 1.1) * (this.collected.has(x.code) ? 0.7 : 1.3);
    }) as Feature;
    return { f, easy: false };
  }

  distractors(target: Feature, n: number, easy: boolean): Feature[] {
    const s = easy ? 1 : this.save.skill;
    const pool = this.world.quiz.filter((f) => f !== target);
    const chosen: Feature[] = [];
    const add = (list: Feature[], max = n): void => {
      let added = 0;
      for (const f of shuffle(list)) {
        if (chosen.length >= n || added >= max) break;
        if (!chosen.includes(f)) {
          chosen.push(f);
          added++;
        }
      }
    };
    const known = (f: Feature): boolean => f.difficulty <= Math.max(2.5, s + 1.5);
    if (s < 2.3) {
      add(pool.filter((f) => f.continent !== target.continent && f.difficulty <= 2));
    } else if (s < 4) {
      add(pool.filter((f) => f.continent === target.continent && known(f)), 1);
      add(pool.filter(known));
    } else {
      add(pool.filter((f) => target.neighbours.includes(f.code)), 2);
      add(pool.filter((f) => f.subregion === target.subregion), 2);
      add(pool.filter((f) => f.continent === target.continent && known(f)));
    }
    add(pool.filter(known));
    add(pool);
    return chosen.slice(0, n);
  }

  /** Nearby countries of comparable size to tap between on the map. */
  findCandidates(target: Feature): Feature[] | null {
    const near = this.world.quiz
      .filter((f) => f !== target && f.area >= target.area / 7 && f.area <= target.area * 7 && f.area >= 3000)
      .map((f) => ({ f, d: distanceKm(target, f) }))
      .filter((x) => x.d < Math.max(1400, Math.sqrt(target.area) * 5))
      .sort((a, b) => a.d - b.d)
      .slice(0, 5);
    if (near.length < 2) return null;
    const picked = shuffle(near).slice(0, 3).map((x) => x.f);
    return shuffle([target, ...picked]);
  }

  shapeOptions(target: Feature, easy: boolean): Feature[] {
    const s = easy ? 1 : this.save.skill;
    const ok = (f: Feature): boolean => f !== target && f.area >= 1500 && f.difficulty <= Math.max(3, s + 2);
    let list = this.world.quiz.filter(ok);
    if (s >= 3.2) {
      const close = list.filter(
        (f) => f.continent === target.continent && f.area > target.area / 6 && f.area < target.area * 6
      );
      if (close.length >= 3) list = close;
    } else {
      const far = list.filter((f) => f.continent !== target.continent);
      if (far.length >= 3) list = far;
    }
    return shuffle([target, ...shuffle(list).slice(0, 3)]);
  }

  question(mode: Mode, cap: number, pool?: (f: Feature) => boolean): Question {
    for (let attempt = 0; attempt < 6; attempt++) {
      const { f, easy } = this.target(mode, cap, pool);
      if (mode === 'find') {
        const cands = this.findCandidates(f);
        if (!cands) continue;
        return { mode, target: f, options: cands, easy };
      }
      if (mode === 'shape') return { mode, target: f, options: this.shapeOptions(f, easy), easy };
      const n = mode === 'blitz' ? 1 : 3;
      return { mode, target: f, options: shuffle([f, ...this.distractors(f, n, easy)]), easy };
    }
    return this.question('classic', cap, pool);
  }

  /**
   * The player ran out of hearts and replays the level: it should bring other
   * countries, so the failed level's countries (and missed ones due to come
   * back) wait until after the replay.
   */
  retryLevel(): void {
    for (const code of this.levelAsked) this.named.set(code, this.round + 12);
    for (const r of this.revenge) r.due = Math.max(r.due, this.round + 12);
  }

  /** A level begins: remember what it asks, in case it has to be replayed. */
  startLevel(): void {
    this.levelAsked = [];
  }

  record(f: Feature, correct: boolean, fast: boolean): void {
    const s = this.save.skill;
    if (correct) {
      // gain/loss ratio sets the success rate the game settles at:
      // p = loss / (gain + loss) ~ 0.78
      const gain = f.difficulty >= s - 0.6 ? (fast ? 0.24 : 0.16) : 0.06;
      this.save.skill = Math.min(MAX_DIFFICULTY, s + gain);
      this.save.missed = this.save.missed.filter((c) => c !== f.code);
    } else {
      this.save.skill = Math.max(1, s - 0.62);
      this.revenge.push({ code: f.code, due: this.round + 3 + Math.floor(Math.random() * 3) });
      this.save.missed = [...new Set([...this.save.missed, f.code])].slice(-12);
    }
    this.recent.push(f.code);
    if (this.recent.length > 60) this.recent.shift();
    this.levelAsked.push(f.code);
  }

  markCollected(code: string): void {
    this.collected.add(code);
  }
}
