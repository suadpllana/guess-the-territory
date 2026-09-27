// Safe wrapper around the Poki HTML5 SDK. Every call no-ops when the SDK is
// blocked (ad blockers, offline) so the game always stays playable.
import { ADS, DEV } from './config';

type Fn = () => void;

interface PokiSDKGlobal {
  init(): Promise<unknown>;
  setDebug?(on: boolean): void;
  gameLoadingStart?(): void;
  gameLoadingProgress?(p: { percentageDone: number }): void;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(onStart?: Fn): Promise<void>;
  rewardedBreak(onStart?: Fn): Promise<boolean>;
  captureError?(e: unknown): void;
  measure?(category: string, what: string, action: string): void;
}

function sdk(): PokiSDKGlobal | null {
  const g = (window as unknown as { PokiSDK?: PokiSDKGlobal }).PokiSDK;
  return g && typeof g.init === 'function' ? g : null;
}

function timeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

export const Poki = {
  ready: false,
  adBlocked: false,
  inAd: false,
  onAdStart: undefined as Fn | undefined,
  onAdEnd: undefined as Fn | undefined,
  playing: false,
  breaks: 0,

  async init(): Promise<void> {
    const s = sdk();
    if (!s) {
      this.adBlocked = true;
      this.ready = true;
      return;
    }
    if (DEV) s.setDebug?.(true);
    try {
      const ok = await timeout(
        s.init().then(() => true),
        6000,
        false
      );
      if (!ok) this.adBlocked = true;
    } catch {
      this.adBlocked = true;
    }
    this.ready = true;
    try {
      s.gameLoadingStart?.();
    } catch {
      // ignore
    }
  },

  loadingProgress(percent: number): void {
    try {
      sdk()?.gameLoadingProgress?.({ percentageDone: Math.max(0, Math.min(100, percent)) });
    } catch {
      // ignore
    }
  },

  loadingFinished(): void {
    try {
      sdk()?.gameLoadingFinished();
    } catch {
      // ignore
    }
  },

  gameplayStart(): void {
    if (this.playing || this.inAd) return;
    this.playing = true;
    try {
      sdk()?.gameplayStart();
    } catch {
      // ignore
    }
  },

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    try {
      sdk()?.gameplayStop();
    } catch {
      // ignore
    }
  },

  measure(category: string, what: string, action: string): void {
    const s = sdk();
    if (!s?.measure) return;
    const clean = (v: string): string => String(v).replace(/[/^]/g, '-').slice(0, 60);
    try {
      s.measure(clean(category), clean(what), clean(action));
    } catch {
      // ignore
    }
  },

  /** Midroll at a natural break, right before the player resumes. */
  async commercialBreak(): Promise<void> {
    const s = sdk();
    if (!s || !ADS) return;
    this.gameplayStop();
    this.inAd = true;
    this.breaks++;
    try {
      await timeout(
        s.commercialBreak(() => this.onAdStart?.()),
        45000,
        undefined
      );
    } catch {
      // ignore
    } finally {
      this.inAd = false;
      this.onAdEnd?.();
    }
  },

  /** True only when a rewarded ad is possible (never reward with an ad blocker). */
  canReward(): boolean {
    return ADS && !!sdk() && !this.adBlocked;
  },

  async rewardedBreak(): Promise<boolean> {
    const s = sdk();
    if (!s || !this.canReward()) return false;
    this.gameplayStop();
    this.inAd = true;
    try {
      const r = await timeout(
        s.rewardedBreak(() => this.onAdStart?.()),
        60000,
        false
      );
      return r === true;
    } catch {
      return false;
    } finally {
      this.inAd = false;
      this.onAdEnd?.();
    }
  },

  captureError(e: unknown): void {
    try {
      sdk()?.captureError?.(e);
    } catch {
      // ignore
    }
  },
};
