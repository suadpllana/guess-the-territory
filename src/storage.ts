// Progress saved in localStorage. Every access is guarded: storage throws in
// some private modes, and the game must work without it.

const KEY = 'mappop.v1'; // keep stable between versions or players lose progress

export interface SaveData {
  level: number; // next level to play
  skill: number; // adaptive difficulty estimate
  points: number;
  bestStreak: number;
  collected: string[]; // country codes answered correctly at least once
  missed: string[]; // recently missed, asked again later
  seenModes: string[];
  hints: number;
  sound: boolean;
  music: boolean;
  theme: string;
  sessions: number;
  answered: number;
  correct: number;
  stars: Record<string, number>;
}

export const DEFAULT_SAVE: SaveData = {
  level: 1,
  skill: 1.4,
  points: 0,
  bestStreak: 0,
  collected: [],
  missed: [],
  seenModes: [],
  hints: 2,
  sound: true,
  music: true,
  theme: 'classic',
  sessions: 0,
  answered: 0,
  correct: 0,
  stars: {},
};

export function loadSave(): SaveData {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SAVE };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return { ...DEFAULT_SAVE, ...parsed };
  } catch {
    return { ...DEFAULT_SAVE };
  }
}

let pending = 0;
export function writeSave(data: SaveData): void {
  // Coalesce bursts of writes into one.
  if (pending) return;
  pending = window.setTimeout(() => {
    pending = 0;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // storage unavailable: play on without saving
    }
  }, 250);
}

export function flushSave(data: SaveData): void {
  if (pending) {
    clearTimeout(pending);
    pending = 0;
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}
