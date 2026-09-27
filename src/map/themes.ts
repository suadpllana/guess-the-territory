export interface Theme {
  id: string;
  unlock: number; // countries collected to unlock
  water: string;
  waterEdge: string;
  land: string;
  neutral: string;
  border: string;
  borderWidth: number;
  halo: string; // shallow-water glow along coasts ('' = none)
  haloWidth: number;
  target: string; // highlight outline
  targetFill: string;
  good: string;
  goodFill: string;
  bad: string;
  badFill: string;
  candidate: string;
  candidateFill: string;
  pin: string;
  pinDark: string;
  label: string;
  labelHalo: string;
  paper: string; // silhouette mode background
  paperLine: string;
  shape: string; // silhouette fill
  swatch: [string, string]; // theme picker preview
}

const base = {
  good: '#1faa59',
  goodFill: 'rgba(38, 194, 105, 0.42)',
  bad: '#e8412c',
  badFill: 'rgba(255, 82, 82, 0.30)',
  candidate: '#f59f00',
  candidateFill: 'rgba(255, 196, 0, 0.30)',
  pin: '#ff4757',
  pinDark: '#c0283a',
};

export const THEMES: Theme[] = [
  {
    ...base,
    id: 'classic',
    unlock: 0,
    water: '#a6d4fa',
    waterEdge: '#8ec3f2',
    land: '#f7f4ed',
    neutral: '#ebe6dc',
    border: '#b9a8d0',
    borderWidth: 1.3,
    halo: 'rgba(255,255,255,0.55)',
    haloWidth: 7,
    target: '#ff4757',
    targetFill: 'rgba(255, 71, 87, 0.16)',
    label: '#2d3436',
    labelHalo: '#ffffff',
    paper: '#eef3fb',
    paperLine: '#dde6f4',
    shape: '#5b4bdb',
    swatch: ['#a6d4fa', '#f7f4ed'],
  },
  {
    ...base,
    id: 'terrain',
    unlock: 25,
    water: '#3f86cf',
    waterEdge: '#2d6fb6',
    land: '#a9cf86',
    neutral: '#c9d7a8',
    border: 'rgba(255,255,255,0.85)',
    borderWidth: 1.2,
    halo: 'rgba(170, 225, 255, 0.45)',
    haloWidth: 8,
    target: '#ffe14d',
    targetFill: 'rgba(255, 225, 77, 0.22)',
    label: '#ffffff',
    labelHalo: '#20303f',
    paper: '#e8f1e0',
    paperLine: '#d3e4c4',
    shape: '#2f7d46',
    swatch: ['#3f86cf', '#a9cf86'],
  },
  {
    ...base,
    id: 'night',
    unlock: 60,
    water: '#0d1b33',
    waterEdge: '#07122a',
    land: '#1f3252',
    neutral: '#243653',
    border: '#4f73a8',
    borderWidth: 1.2,
    halo: 'rgba(90, 170, 255, 0.16)',
    haloWidth: 8,
    target: '#ff6b81',
    targetFill: 'rgba(255, 107, 129, 0.2)',
    label: '#eaf2ff',
    labelHalo: '#0d1b33',
    paper: '#101d36',
    paperLine: '#1a2b4b',
    shape: '#7ec8ff',
    swatch: ['#0d1b33', '#1f3252'],
  },
  {
    ...base,
    id: 'vintage',
    unlock: 100,
    water: '#d8c7a0',
    waterEdge: '#c8b489',
    land: '#f4e8c8',
    neutral: '#eadcb8',
    border: '#9b7b4c',
    borderWidth: 1.1,
    halo: 'rgba(120, 90, 40, 0.16)',
    haloWidth: 6,
    target: '#b3261e',
    targetFill: 'rgba(179, 38, 30, 0.14)',
    label: '#4b3a2a',
    labelHalo: '#f4e8c8',
    paper: '#f1e5c6',
    paperLine: '#e4d4ac',
    shape: '#8a5a2b',
    swatch: ['#d8c7a0', '#f4e8c8'],
  },
  {
    ...base,
    id: 'candy',
    unlock: 150,
    water: '#c9ecff',
    waterEdge: '#b3e1fb',
    land: '#ffe4f2',
    neutral: '#f6d9e8',
    border: '#d39be8',
    borderWidth: 1.3,
    halo: 'rgba(255,255,255,0.7)',
    haloWidth: 8,
    target: '#7b5cff',
    targetFill: 'rgba(123, 92, 255, 0.16)',
    label: '#5a3d7a',
    labelHalo: '#ffffff',
    paper: '#fff0f8',
    paperLine: '#ffdcef',
    shape: '#ff5fa2',
    swatch: ['#c9ecff', '#ffe4f2'],
  },
];

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
