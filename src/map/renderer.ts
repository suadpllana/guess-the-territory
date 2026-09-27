// Canvas 2D drawing of the map. Paths live in unit coords × K; each draw sets
// a transform per horizontal world copy so views across the antimeridian work.
import { K, type BBox, type Feature, type World } from '../geo/world';
import { scaleOf, type Rect, type View } from './camera';
import type { Theme } from './themes';

export interface Surface {
  ctx: CanvasRenderingContext2D;
  w: number; // CSS px
  h: number;
  dpr: number;
}

export interface Highlight {
  feature: Feature;
  fill: string;
  stroke: string;
  width: number; // CSS px
  dash: boolean;
  dashOffset: number;
  glow?: number; // 0..1 pulse
}

interface Visible {
  f: Feature;
  k: number;
}

export class Renderer {
  constructor(public world: World) {}

  /** Unit-space rectangle visible on the surface. */
  visibleRect(surf: Surface, view: View, vp: Rect): BBox {
    const s = scaleOf(view);
    return [
      view.x - (vp.x + vp.w / 2) / s,
      view.y - (vp.y + vp.h / 2) / s,
      view.x + (surf.w - vp.x - vp.w / 2) / s,
      view.y + (surf.h - vp.y - vp.h / 2) / s,
    ];
  }

  private transform(surf: Surface, view: View, vp: Rect, k: number): void {
    const s = scaleOf(view);
    const a = (surf.dpr * s) / K;
    const tx = vp.x + vp.w / 2 + (k - view.x) * s;
    const ty = vp.y + vp.h / 2 - view.y * s;
    surf.ctx.setTransform(a, 0, 0, a, surf.dpr * tx, surf.dpr * ty);
  }

  private visibleFeatures(rect: BBox, pick?: (f: Feature) => boolean): Visible[] {
    const out: Visible[] = [];
    const k0 = Math.floor(rect[0]) - 1;
    const k1 = Math.floor(rect[2]) + 1;
    for (let k = k0; k <= k1; k++) {
      for (const f of this.world.features) {
        if (pick && !pick(f)) continue;
        const b = f.bbox;
        if (b[0] + k <= rect[2] && b[2] + k >= rect[0] && b[1] <= rect[3] && b[3] >= rect[1]) out.push({ f, k });
      }
    }
    return out;
  }

  /** Water, land and borders. fast: lighter drawing while the camera moves. */
  drawBase(surf: Surface, view: View, vp: Rect, theme: Theme, fast = false): void {
    const { ctx, w, h, dpr } = surf;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.water;
    ctx.fillRect(0, 0, w, h);

    const s = scaleOf(view);
    const lod = Math.max(0, this.world.lodFor(s) - (fast ? 1 : 0));
    const rect = this.visibleRect(surf, view, vp);
    const vis = this.visibleFeatures(rect);
    const px = K / s;

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (theme.halo && !fast) {
      ctx.strokeStyle = theme.halo;
      ctx.lineWidth = theme.haloWidth * px;
      for (const { f, k } of vis) {
        this.transform(surf, view, vp, k);
        ctx.stroke(this.world.path(f, lod));
      }
    }
    for (const { f, k } of vis) {
      this.transform(surf, view, vp, k);
      ctx.fillStyle = f.neutral ? theme.neutral : theme.land;
      ctx.fill(this.world.path(f, lod));
    }

    const chunks = this.world.borderChunks(lod);
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = theme.borderWidth * px;
    const k0 = Math.floor(rect[0]) - 1;
    const k1 = Math.floor(rect[2]) + 1;
    for (let k = k0; k <= k1; k++) {
      this.transform(surf, view, vp, k);
      for (const c of chunks) {
        const b = c.bbox;
        if (!(b[0] + k <= rect[2] && b[2] + k >= rect[0] && b[1] <= rect[3] && b[3] >= rect[1])) continue;
        for (const p of c.solid) ctx.stroke(p);
        if (c.dashed.length) {
          ctx.setLineDash([4 * px, 3.5 * px]);
          for (const p of c.dashed) ctx.stroke(p);
          ctx.setLineDash([]);
        }
      }
    }
  }

  /** Soft edge vignette for still images (the live game uses a CSS layer). */
  vignette(surf: Surface): void {
    const { ctx, w, h, dpr } = surf;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(10,40,90,0.10)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /** Plain background for silhouette rounds. */
  drawPaper(surf: Surface, theme: Theme, t: number): void {
    const { ctx, w, h, dpr } = surf;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.paper;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = theme.paperLine;
    ctx.lineWidth = 1;
    const step = Math.max(28, Math.min(w, h) / 12);
    const off = (t * 6) % step;
    ctx.beginPath();
    for (let x = -step + off; x < w + step; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = -step + off; y < h + step; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  }

  highlight(surf: Surface, view: View, vp: Rect, hl: Highlight): void {
    const { ctx } = surf;
    const s = scaleOf(view);
    const lod = this.world.lodFor(s);
    const px = K / s;
    const rect = this.visibleRect(surf, view, vp);
    const b = hl.feature.bbox;
    const path = this.world.path(hl.feature, lod);
    const outline = this.world.outline(hl.feature, Math.max(0, lod - 1), 12 / s);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let k = Math.floor(rect[0]) - 1; k <= Math.floor(rect[2]) + 1; k++) {
      if (!(b[0] + k <= rect[2] && b[2] + k >= rect[0] && b[1] <= rect[3] && b[3] >= rect[1])) continue;
      this.transform(surf, view, vp, k);
      ctx.fillStyle = hl.fill;
      ctx.fill(path);
      if (hl.glow) {
        ctx.strokeStyle = hl.stroke;
        ctx.globalAlpha = 0.18 * hl.glow;
        ctx.lineWidth = (hl.width + 9 * hl.glow) * px;
        ctx.stroke(outline);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = (hl.width + 2.5) * px;
      ctx.stroke(outline);
      ctx.strokeStyle = hl.stroke;
      ctx.lineWidth = hl.width * px;
      if (hl.dash) {
        ctx.setLineDash([9 * px, 6 * px]);
        ctx.lineDashOffset = -hl.dashOffset * px;
      }
      ctx.stroke(outline);
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
  }

  /** Plain fill of one feature (atlas view). */
  fill(surf: Surface, view: View, vp: Rect, f: Feature, color: string): void {
    const s = scaleOf(view);
    const path = this.world.path(f, this.world.lodFor(s));
    const rect = this.visibleRect(surf, view, vp);
    const b = f.bbox;
    surf.ctx.fillStyle = color;
    for (let k = Math.floor(rect[0]) - 1; k <= Math.floor(rect[2]) + 1; k++) {
      if (!(b[0] + k <= rect[2] && b[2] + k >= rect[0] && b[1] <= rect[3] && b[3] >= rect[1])) continue;
      this.transform(surf, view, vp, k);
      surf.ctx.fill(path);
    }
  }

  /** Solid country shape with a soft shadow (silhouette rounds, tiles). */
  shape(surf: Surface, view: View, vp: Rect, f: Feature, color: string): void {
    const { ctx } = surf;
    const s = scaleOf(view);
    const lod = this.world.lodFor(s);
    const rect = this.visibleRect(surf, view, vp);
    const b = f.bbox;
    const path = this.world.path(f, lod);
    for (let k = Math.floor(rect[0]) - 1; k <= Math.floor(rect[2]) + 1; k++) {
      if (!(b[0] + k <= rect[2] && b[2] + k >= rect[0] && b[1] <= rect[3] && b[3] >= rect[1])) continue;
      this.transform(surf, view, vp, k);
      ctx.save();
      ctx.shadowColor = 'rgba(30, 20, 80, 0.28)';
      ctx.shadowBlur = 14 * surf.dpr;
      ctx.shadowOffsetY = 6 * surf.dpr;
      ctx.fillStyle = color;
      ctx.fill(path);
      ctx.restore();
    }
  }
}

// ---------- pin, ripple, clouds (screen space) ----------

export type Mood = 'idle' | 'happy' | 'sad';

/**
 * The mascot: a map pin with a face, tip at (x, y). drop: pixels above the
 * ground; squash: 1 = normal; look: -1..1 pupils left/right; blink: 0..1.
 */
export function drawPin(
  surf: Surface,
  x: number,
  y: number,
  size: number,
  drop: number,
  squash: number,
  theme: Theme,
  alpha = 1,
  mood: Mood = 'idle',
  blink = 0,
  look = 0
): void {
  const { ctx, dpr } = surf;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = alpha;
  // shadow shrinks as the pin rises
  const sh = Math.max(0.25, 1 - drop / (size * 4));
  ctx.fillStyle = `rgba(20, 30, 50, ${0.26 * sh})`;
  ctx.beginPath();
  ctx.ellipse(x, y, size * 0.28 * sh, size * 0.085 * sh, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y - drop);
  ctx.scale(1 / Math.sqrt(squash), squash);
  drawPinBody(ctx, size, theme, mood, blink, look);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Pin outline with its tip at the origin. */
export function pinPath(ctx: CanvasRenderingContext2D, size: number): void {
  const r = size * 0.36;
  const cy = -size + r;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-r * 0.35, -size * 0.28, -r, cy + r * 0.62, -r, cy);
  ctx.arc(0, cy, r, Math.PI, 0);
  ctx.bezierCurveTo(r, cy + r * 0.62, r * 0.35, -size * 0.28, 0, 0);
  ctx.closePath();
}

/** Pin body, shine and face with the tip at the origin (no ground shadow). */
export function drawPinBody(
  ctx: CanvasRenderingContext2D,
  size: number,
  theme: Theme,
  mood: Mood = 'idle',
  blink = 0,
  look = 0
): void {
  const r = size * 0.36;
  const cy = -size + r;
  pinPath(ctx, size);
  const grad = ctx.createLinearGradient(-r, cy - r, r, 0);
  grad.addColorStop(0, theme.pin);
  grad.addColorStop(1, theme.pinDark);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.045);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.55, cy - r * 0.55, r * 0.2, r * 0.12, -0.7, 0, Math.PI * 2);
  ctx.fill();
  drawFace(ctx, cy, r, mood, blink, look);
}

function drawFace(ctx: CanvasRenderingContext2D, cy: number, r: number, mood: Mood, blink: number, look: number): void {
  const ex = r * 0.36;
  const ey = cy - r * 0.08;
  const ink = '#2a1320';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1.2, r * 0.13);
  if (mood === 'happy') {
    // ^ ^ eyes
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * ex - r * 0.17, ey + r * 0.06);
      ctx.quadraticCurveTo(s * ex, ey - r * 0.2, s * ex + r * 0.17, ey + r * 0.06);
      ctx.stroke();
    }
  } else {
    for (const s of [-1, 1]) {
      const open = 1 - blink;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(s * ex, ey, r * 0.2, Math.max(r * 0.03, r * 0.25 * open), 0, 0, Math.PI * 2);
      ctx.fill();
      if (open > 0.3) {
        ctx.fillStyle = ink;
        ctx.beginPath();
        const py = mood === 'sad' ? ey + r * 0.08 : ey + r * 0.02;
        ctx.arc(s * ex + look * r * 0.07, py, r * 0.11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(s * ex + look * r * 0.07 + r * 0.04, py - r * 0.05, r * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
      if (mood === 'sad') {
        // worried brows
        ctx.beginPath();
        ctx.moveTo(s * ex - s * r * 0.2, ey - r * 0.36);
        ctx.lineTo(s * ex + s * r * 0.14, ey - r * 0.28);
        ctx.stroke();
      }
    }
  }
  // mouth
  const my = cy + r * 0.34;
  ctx.beginPath();
  if (mood === 'happy') {
    ctx.fillStyle = ink;
    ctx.moveTo(-r * 0.24, my - r * 0.04);
    ctx.quadraticCurveTo(0, my + r * 0.34, r * 0.24, my - r * 0.04);
    ctx.closePath();
    ctx.fill();
  } else if (mood === 'sad') {
    ctx.moveTo(-r * 0.14, my + r * 0.08);
    ctx.quadraticCurveTo(0, my - r * 0.06, r * 0.14, my + r * 0.08);
    ctx.stroke();
  } else {
    ctx.moveTo(-r * 0.15, my - r * 0.02);
    ctx.quadraticCurveTo(0, my + r * 0.13, r * 0.15, my - r * 0.02);
    ctx.stroke();
  }
  // cheeks
  ctx.fillStyle = 'rgba(255, 170, 190, 0.55)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * r * 0.62, cy + r * 0.2, r * 0.13, r * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawRipple(surf: Surface, x: number, y: number, r: number, alpha: number, color: string): void {
  const { ctx, dpr } = surf;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.38, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

const frac = (v: number): number => v - Math.floor(v);

let cloudSprites: HTMLCanvasElement[] | null = null;
function makeClouds(): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  for (let i = 0; i < 4; i++) {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 160;
    const g = c.getContext('2d');
    if (!g) continue;
    let seed = i * 97 + 13;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let b = 0; b < 9; b++) {
      const x = 60 + rnd() * 200;
      const y = 70 + (rnd() - 0.5) * 50;
      const r = 30 + rnd() * 40;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)');
      gr.addColorStop(0.6, 'rgba(255,255,255,0.7)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    out.push(c);
  }
  return out;
}

/** Clouds that appear while the camera is high up during flights. */
export function drawClouds(surf: Surface, view: View, altitude: number, count = 9): void {
  if (altitude <= 0.02 || count <= 0) return;
  cloudSprites ||= makeClouds();
  const { ctx, w, h, dpr } = surf;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const span = Math.max(w, h) * 1.6;
  for (let i = 0; i < count; i++) {
    const sprite = cloudSprites[i % cloudSprites.length];
    // parallax: clouds drift with the camera centre, faster than the ground
    const px = frac(i * 0.37 + view.x * 3.1) * span - span * 0.3;
    const py = frac(i * 0.61 + view.y * 2.3) * span - span * 0.3;
    const sc = (0.9 + (i % 3) * 0.35) * Math.max(w, h) * 0.0026;
    ctx.globalAlpha = Math.min(1, altitude) * (0.55 + (i % 2) * 0.25);
    ctx.drawImage(sprite, px, py, 320 * sc, 160 * sc);
  }
  ctx.globalAlpha = 1;
}
