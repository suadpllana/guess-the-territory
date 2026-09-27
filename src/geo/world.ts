// Decodes the bundled geometry and exposes countries as Path2D objects in
// Web Mercator "unit" coordinates (x east 0..1, y south 0..1), scaled by K.
import { BASE, FEATURES, GEOMETRY, GRID_BITS, POVS } from '../data/world';
import { DIFFICULTY } from '../game/countries';

export const K = 4096;
export type BBox = [number, number, number, number];

export interface Feature {
  index: number;
  id: string;
  code: string;
  name: string;
  neutral: boolean;
  continent: string;
  subregion: string;
  label: [number, number];
  frame: BBox;
  area: number;
  neighbours: string[];
  ctx: number; // minimum framing span (km) so some other land is visible
  quiz: boolean;
  difficulty: number;
  polys: number[][][];
  bbox: BBox;
}

interface BorderChunk {
  bbox: BBox;
  solid: Path2D[];
  dashed: Path2D[];
}

// Coarser levels of detail for zoomed-out views (tolerance in unit coords).
const LOD_TOL = [1.5e-4, 3.5e-5, 0];

function decode(): { arcs: Float64Array[]; polys: number[][][][] } {
  const raw = atob(GEOMETRY);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  let pos = 0;
  const uv = (): number => {
    let n = 0;
    let mul = 1;
    let b: number;
    do {
      b = bytes[pos++];
      n += (b & 127) * mul;
      mul *= 128;
    } while (b & 128);
    return n;
  };
  const sv = (): number => {
    const z = uv();
    return z % 2 ? -(z + 1) / 2 : z / 2;
  };
  const G = 2 ** GRID_BITS;
  const arcCount = uv();
  const arcs: Float64Array[] = [];
  let px = 0;
  let py = 0;
  for (let a = 0; a < arcCount; a++) {
    const h = uv();
    const e = h % 32;
    const rest = Math.floor(h / 32);
    const closed = rest % 2 === 1;
    const n = Math.floor(rest / 2);
    const step = 2 ** e;
    const fx = px + sv();
    const fy = py + sv();
    const xy = new Float64Array(n * 2);
    xy[0] = fx / G;
    xy[1] = fy / G;
    let cx = fx;
    let cy = fy;
    for (let k = 1; k < n - 1; k++) {
      cx += sv() * step;
      cy += sv() * step;
      xy[2 * k] = cx / G;
      xy[2 * k + 1] = cy / G;
    }
    if (n > 1) {
      if (closed) {
        xy[2 * n - 2] = fx / G;
        xy[2 * n - 1] = fy / G;
      } else {
        xy[2 * n - 2] = (fx + sv()) / G;
        xy[2 * n - 1] = (fy + sv()) / G;
      }
    }
    px = fx;
    py = fy;
    arcs.push(xy);
  }
  const featureCount = uv();
  const polys: number[][][][] = [];
  for (let f = 0; f < featureCount; f++) {
    const pc = uv();
    const fp: number[][][] = [];
    for (let p = 0; p < pc; p++) {
      const rc = uv();
      const rings: number[][] = [];
      for (let r = 0; r < rc; r++) {
        const n = uv();
        const refs: number[] = [];
        for (let i = 0; i < n; i++) refs.push(uv());
        rings.push(refs);
      }
      fp.push(rings);
    }
    polys.push(fp);
  }
  return { arcs, polys };
}

function simplify(xy: Float64Array, tol: number): Float64Array {
  const n = xy.length / 2;
  if (n <= 2 || tol <= 0) return xy;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: number[] = [0, n - 1];
  const t2 = tol * tol;
  while (stack.length) {
    const e = stack.pop() as number;
    const s = stack.pop() as number;
    const ax = xy[2 * s];
    const ay = xy[2 * s + 1];
    const dx = xy[2 * e] - ax;
    const dy = xy[2 * e + 1] - ay;
    const L = dx * dx + dy * dy;
    let best = -1;
    let bestD = t2;
    for (let i = s + 1; i < e; i++) {
      const px = xy[2 * i] - ax;
      const py = xy[2 * i + 1] - ay;
      let d: number;
      if (L === 0) d = px * px + py * py;
      else {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / L));
        const qx = px - t * dx;
        const qy = py - t * dy;
        d = qx * qx + qy * qy;
      }
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push(s, best, best, e);
    }
  }
  let count = 0;
  for (let i = 0; i < n; i++) count += keep[i];
  const closed = xy[0] === xy[2 * n - 2] && xy[1] === xy[2 * n - 1];
  if (closed && count < 4) {
    if (n < 4) return xy;
    const pick = new Float64Array(8);
    [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1].forEach((i, j) => {
      pick[2 * j] = xy[2 * i];
      pick[2 * j + 1] = xy[2 * i + 1];
    });
    return pick;
  }
  const out = new Float64Array(count * 2);
  for (let i = 0, j = 0; i < n; i++)
    if (keep[i]) {
      out[j++] = xy[2 * i];
      out[j++] = xy[2 * i + 1];
    }
  return out;
}

function arcBBox(xy: Float64Array): BBox {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < xy.length; i += 2) {
    const x = xy[i];
    const y = xy[i + 1];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

export function latToY(lat: number): number {
  const s = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}
export function yToLat(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}
/** Ground kilometres per unit at mercator y. */
export function kmPerUnit(y: number): number {
  return 40075 * Math.cos((yToLat(y) * Math.PI) / 180);
}

export class World {
  features: Feature[] = [];
  byCode = new Map<string, Feature>();
  quiz: Feature[] = [];
  private arcs: Float64Array[][] = [];
  private arcBoxes: BBox[] = [];
  private paths = new Map<number, Path2D>();
  private outlines = new Map<string, Path2D>();
  private borders: (BorderChunk[] | null)[] = [null, null, null];
  private arcUsers: number[][] = [];

  constructor(home: string | null) {
    const { arcs, polys } = decode();
    this.arcs[2] = arcs;
    this.arcBoxes = arcs.map(arcBBox);
    const pov = home ? POVS[home] : undefined;
    const active = new Set(BASE);
    if (pov) {
      for (const i of pov.remove) active.delete(i);
      for (const i of pov.add) active.add(i);
    }
    for (const i of [...active].sort((a, b) => a - b)) {
      const row = FEATURES[i];
      const [id, code, name, neutral, continent, subregion, label, frame, area, neighbours, , ctx] = row;
      const fpolys = polys[i];
      let bb: BBox = [Infinity, Infinity, -Infinity, -Infinity];
      for (const p of fpolys)
        for (const r of p)
          for (const ref of r) {
            const b = this.arcBoxes[ref >>> 1];
            bb = [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])];
          }
      const f: Feature = {
        index: i,
        id,
        code,
        name,
        neutral: neutral === 1,
        continent,
        subregion,
        label,
        frame: frame ?? bb,
        area,
        neighbours: neighbours ? neighbours.split(' ') : [],
        ctx,
        quiz: neutral !== 1 && DIFFICULTY.has(code),
        difficulty: DIFFICULTY.get(code) ?? 9,
        polys: fpolys,
        bbox: bb,
      };
      this.features.push(f);
      this.byCode.set(code, f);
    }
    this.quiz = this.features.filter((f) => f.quiz);
    this.arcUsers = arcs.map(() => []);
    this.features.forEach((f, fi) => {
      for (const p of f.polys) for (const r of p) for (const ref of r) this.arcUsers[ref >>> 1].push(fi);
    });
  }

  /** Detail level for a zoom (s = pixels per unit). */
  lodFor(s: number): number {
    if (LOD_TOL[0] * s <= 0.9) return 0;
    if (LOD_TOL[1] * s <= 0.9) return 1;
    return 2;
  }

  private arcsAt(lod: number): Float64Array[] {
    if (!this.arcs[lod]) this.arcs[lod] = this.arcs[2].map((a) => simplify(a, LOD_TOL[lod]));
    return this.arcs[lod];
  }

  private ringVisible(ring: number[], lod: number): boolean {
    if (lod === 2 || ring.length !== 1) return true;
    const b = this.arcBoxes[ring[0] >>> 1];
    return Math.hypot(b[2] - b[0], b[3] - b[1]) >= 2.5 * LOD_TOL[lod];
  }

  private traceRing(p: Path2D, ring: number[], arcs: Float64Array[], dx = 0): void {
    let first = true;
    for (const ref of ring) {
      const xy = arcs[ref >>> 1];
      const n = xy.length / 2;
      const rev = (ref & 1) === 1;
      for (let k = first ? 0 : 1; k < n; k++) {
        const i = rev ? n - 1 - k : k;
        const x = (xy[2 * i] + dx) * K;
        const y = xy[2 * i + 1] * K;
        if (first) {
          p.moveTo(x, y);
          first = false;
        } else p.lineTo(x, y);
      }
    }
    p.closePath();
  }

  path(f: Feature, lod: number): Path2D {
    const key = f.index * 3 + lod;
    let p = this.paths.get(key);
    if (p) return p;
    p = new Path2D();
    const arcs = this.arcsAt(lod);
    for (const poly of f.polys) {
      if (!this.ringVisible(poly[0], lod)) continue;
      for (const ring of poly) if (this.ringVisible(ring, lod)) this.traceRing(p, ring, arcs);
    }
    this.paths.set(key, p);
    return p;
  }

  /** Outline without islands smaller than minDiag (units): keeps dashed outlines clean. */
  outline(f: Feature, lod: number, minDiag: number): Path2D {
    const bucket = Math.round(Math.log2(Math.max(minDiag, 1e-9)));
    const key = `${f.index}:${lod}:${bucket}`;
    let p = this.outlines.get(key);
    if (p) return p;
    p = new Path2D();
    const arcs = this.arcsAt(lod);
    const limit = 2 ** bucket;
    let largest = -1;
    let largestIdx = 0;
    f.polys.forEach((poly, i) => {
      const d = this.ringDiag(poly[0]);
      if (d > largest) {
        largest = d;
        largestIdx = i;
      }
    });
    f.polys.forEach((poly, i) => {
      if (i !== largestIdx && this.ringDiag(poly[0]) < limit) return;
      for (const ring of poly) if (ring === poly[0] || this.ringDiag(ring) >= limit) this.traceRing(p as Path2D, ring, arcs);
    });
    this.outlines.set(key, p);
    return p;
  }

  private ringDiag(ring: number[]): number {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const ref of ring) {
      const b = this.arcBoxes[ref >>> 1];
      if (b[0] < x0) x0 = b[0];
      if (b[1] < y0) y0 = b[1];
      if (b[2] > x1) x1 = b[2];
      if (b[3] > y1) y1 = b[3];
    }
    return Math.hypot(x1 - x0, y1 - y0);
  }

  /** Land borders between two features, chunked by area for culling. */
  borderChunks(lod: number): BorderChunk[] {
    const cached = this.borders[lod];
    if (cached) return cached;
    const arcs = this.arcsAt(lod);
    const cells = new Map<number, BorderChunk & { s: Path2D; d: Path2D; ns: number; nd: number }>();
    this.arcUsers.forEach((users, ai) => {
      const u = [...new Set(users)];
      if (u.length !== 2) return;
      const a = this.features[u[0]];
      const b = this.features[u[1]];
      const bb = this.arcBoxes[ai];
      const cx = Math.floor(((bb[0] + bb[2]) / 2) * 24);
      const cy = Math.floor(((bb[1] + bb[3]) / 2) * 24);
      const key = cy * 64 + cx;
      let cell = cells.get(key);
      if (!cell) {
        cell = { bbox: [...bb] as BBox, solid: [], dashed: [], s: new Path2D(), d: new Path2D(), ns: 0, nd: 0 };
        cells.set(key, cell);
      }
      cell.bbox = [
        Math.min(cell.bbox[0], bb[0]),
        Math.min(cell.bbox[1], bb[1]),
        Math.max(cell.bbox[2], bb[2]),
        Math.max(cell.bbox[3], bb[3]),
      ];
      const dashed = a.neutral || b.neutral || isLineOfControl(a.code, b.code, bb);
      const target = dashed ? cell.d : cell.s;
      const xy = arcs[ai];
      for (let i = 0; i < xy.length; i += 2) {
        if (i === 0) target.moveTo(xy[0] * K, xy[1] * K);
        else target.lineTo(xy[i] * K, xy[i + 1] * K);
      }
      if (dashed) cell.nd++;
      else cell.ns++;
    });
    const out: BorderChunk[] = [];
    for (const c of cells.values()) {
      out.push({ bbox: c.bbox, solid: c.ns ? [c.s] : [], dashed: c.nd ? [c.d] : [] });
    }
    this.borders[lod] = out;
    return out;
  }

  /** Even-odd point in polygon on full detail. */
  contains(f: Feature, x: number, y: number): boolean {
    const bb = f.bbox;
    for (const dx of [0, -1, 1]) {
      const px = x + dx;
      if (px < bb[0] || px > bb[2] || y < bb[1] || y > bb[3]) continue;
      let inside = false;
      const arcs = this.arcs[2];
      for (const poly of f.polys)
        for (const ring of poly) {
          let prevX = NaN;
          let prevY = NaN;
          for (const ref of ring) {
            const xy = arcs[ref >>> 1];
            const n = xy.length / 2;
            const rev = (ref & 1) === 1;
            for (let k = 0; k < n; k++) {
              const i = rev ? n - 1 - k : k;
              const cx = xy[2 * i];
              const cy = xy[2 * i + 1];
              if (!Number.isNaN(prevX) && cy > y !== prevY > y) {
                const ix = prevX + ((y - prevY) * (cx - prevX)) / (cy - prevY);
                if (px < ix) inside = !inside;
              }
              prevX = cx;
              prevY = cy;
            }
          }
        }
      if (inside) return true;
    }
    return false;
  }
}

// Kashmir line of control and the India-China line are drawn dashed, as on
// most international maps.
function isLineOfControl(a: string, b: string, bb: BBox): boolean {
  const pair = [a, b].sort().join('');
  if (pair === 'INPK') return bb[1] < latToY(32.6);
  if (pair === 'CNIN') return true;
  return false;
}
