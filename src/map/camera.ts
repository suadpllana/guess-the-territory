import type { BBox } from '../geo/world';

/** Camera: centre in unit coords, zoom as log2(pixels per unit). */
export interface View {
  x: number;
  y: number;
  z: number;
}

/** Screen rectangle (CSS px) the camera centres on: the map area not covered by UI. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const scaleOf = (v: View): number => 2 ** v.z;

export function toScreen(v: View, vp: Rect, x: number, y: number): [number, number] {
  const s = scaleOf(v);
  return [vp.x + vp.w / 2 + (x - v.x) * s, vp.y + vp.h / 2 + (y - v.y) * s];
}

export function toWorld(v: View, vp: Rect, sx: number, sy: number): [number, number] {
  const s = scaleOf(v);
  return [v.x + (sx - vp.x - vp.w / 2) / s, v.y + (sy - vp.y - vp.h / 2) / s];
}

/** View showing `b` filling `fill` of the viewport, never closer than minSpan units. */
export function fitBox(b: BBox, vp: Rect, fill: number, minSpan = 0): View {
  const w = Math.max(b[2] - b[0], 1e-9);
  const h = Math.max(b[3] - b[1], 1e-9);
  let s = Math.min((vp.w * fill) / w, (vp.h * fill) / h);
  if (minSpan > 0) s = Math.min(s, Math.min(vp.w, vp.h) / minSpan);
  return { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, z: Math.log2(s) };
}

export function wrapX(x: number): number {
  return x - Math.floor(x);
}

/**
 * Smooth zoom-and-pan (van Wijk & Nuij 2003, as in d3.interpolateZoom): the
 * camera rises, travels and descends. Returns a sampler and a natural length.
 */
export function flight(a: View, b: View, vp: Rect): { at: (t: number) => View; length: number } {
  let bx = b.x;
  while (bx - a.x > 0.5) bx -= 1;
  while (bx - a.x < -0.5) bx += 1;
  const rho = Math.SQRT2;
  const w0 = vp.w / scaleOf(a);
  const w1 = vp.w / scaleOf(b);
  const ux0 = a.x;
  const uy0 = a.y;
  const dx = bx - ux0;
  const dy = b.y - uy0;
  const d2 = dx * dx + dy * dy;
  const toView = (ux: number, uy: number, w: number): View => ({ x: ux, y: uy, z: Math.log2(vp.w / w) });
  if (d2 < 1e-18) {
    const S = Math.log(w1 / w0) / rho;
    return {
      at: (t) => toView(ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(rho * t * S)),
      length: Math.abs(S),
    };
  }
  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + 4 * d2) / (2 * w0 * 2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - 4 * d2) / (2 * w1 * 2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / rho;
  const coshr0 = Math.cosh(r0);
  return {
    at: (t) => {
      if (t >= 1) return { x: bx, y: b.y, z: b.z };
      const s = t * S;
      const u = (w0 / (2 * d1)) * (coshr0 * Math.tanh(rho * s + r0) - Math.sinh(r0));
      return toView(ux0 + u * dx, uy0 + u * dy, (w0 * coshr0) / Math.cosh(rho * s + r0));
    },
    length: Math.abs(S),
  };
}

export const ease = {
  inOut: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  out: (t: number): number => 1 - (1 - t) ** 3,
  outBack: (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  outElastic: (t: number): number =>
    t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};
