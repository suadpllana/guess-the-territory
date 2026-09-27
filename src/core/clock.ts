// Game time: stops while paused, in an ad, or when the tab is hidden, so
// every timer, tween and camera flight freezes with it.

type Tween = { t0: number; dur: number; fn: (t: number) => void; resolve: () => void };
type Timer = { at: number; resolve: () => void };

let now = 0;
let paused = false;
const tweens = new Set<Tween>();
const timers = new Set<Timer>();

export const clock = {
  get now(): number {
    return now;
  },
  get paused(): boolean {
    return paused;
  },
  setPaused(p: boolean): void {
    paused = p;
  },
  /** Advance by a real frame delta (ms). Big gaps (tab switches) are capped. */
  tick(dt: number): void {
    if (paused) return;
    now += Math.min(dt, 100);
    for (const tw of [...tweens]) {
      const t = Math.min(1, (now - tw.t0) / tw.dur);
      tw.fn(t);
      if (t >= 1) {
        tweens.delete(tw);
        tw.resolve();
      }
    }
    for (const tm of [...timers]) {
      if (now >= tm.at) {
        timers.delete(tm);
        tm.resolve();
      }
    }
  },
  wait(ms: number): Promise<void> {
    return new Promise((resolve) => timers.add({ at: now + ms, resolve }));
  },
  tween(ms: number, fn: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      fn(0);
      tweens.add({ t0: now, dur: Math.max(1, ms), fn, resolve });
    });
  },
};
