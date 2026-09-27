// Step 2 of the map pipeline: topology, adaptive simplification, compact encoding.
// Input:  tools/.cache/features.geojson, tools/.cache/povs.json (from prepare.py)
// Output: src/data/world.ts (base64 geometry + feature metadata)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { topology } from 'topojson-server';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const CACHE = path.join(ROOT, 'tools', '.cache');
const OUT = path.join(ROOT, 'src', 'data', 'world.ts');

// Tuning. Distances are ground metres unless noted.
const EPS_VIEW = 1 / 320; // detail inside any framed view, relative to that view's span
const FILL = 0.72; // share of the viewport a framed country fills (matches the game)
const EPS_OWN = 1 / 60; // every feature keeps its own coarse silhouette
const MIN_SPAN = 350e3; // framing never shows less than this much ground
const TOL_MIN = 20; // finest detail kept anywhere
const TOL_MAX = 8000; // coarsest detail kept anywhere
const GRID_BITS = 26; // world width = 2^26 units (~0.6 m at the equator)
const GRID = 2 ** GRID_BITS;
const EARTH = 40075016.686; // equatorial circumference

// Manual framing for countries whose automatic cluster would be misleading.
// [minLon, minLat, maxLon, maxLat]
const FRAME_OVERRIDE = {
  US: [-125, 24.4, -66.9, 49.4],
  FR: [-5.2, 41.3, 9.6, 51.1],
  NL: [3.3, 50.7, 7.3, 53.6],
  NO: [4.5, 57.9, 31.2, 71.2],
  ES: [-9.4, 35.9, 4.4, 43.8],
  PT: [-9.6, 36.9, -6.2, 42.2],
  EC: [-81.1, -5.1, -75.2, 1.5],
  CL: [-75.8, -56, -66.4, -17.5],
  DK: [8, 54.5, 12.7, 57.8],
  AU: [112.9, -43.7, 153.7, -10.6],
  NZ: [166.4, -47.3, 178.6, -34.4],
  RU: [27, 41.2, 190.5, 77.8],
  GB: [-8.2, 49.9, 1.8, 60.9],
  JP: [128.5, 30.9, 145.9, 45.6],
  CN: [73.6, 18.1, 134.8, 53.6],
  IN: [68.1, 6.7, 97.4, 37.1],
  YE: [42.5, 12.5, 53.2, 19],
  EG: [24.7, 21.9, 36.9, 31.7],
  CO: [-79.1, -4.3, -66.8, 12.5],
  VE: [-73.4, 0.6, -59.8, 12.3],
  HN: [-89.4, 12.9, -83.1, 16.1],
  GQ: [5.6, -1.5, 11.4, 3.8],
  KI: [172.8, -2.8, 174.8, 3.4],
  TV: [176, -10.9, 179.9, -5.6],
  CV: [-25.4, 14.8, -22.6, 17.3],
  MV: [72.6, -0.8, 73.8, 7.2],
  SC: [55.2, -4.9, 56.0, -3.7],
  MU: [57.3, -20.6, 57.9, -19.9],
  FJ: [176.8, -19.3, 181, -16],
  MH: [166.5, 4.5, 172.2, 12.5],
  FM: [151.5, 5.2, 163.1, 9.8],
  PW: [134.1, 6.8, 134.8, 8.2],
  TO: [-176.3, -21.5, -173.9, -15.5],
  WS: [-172.9, -14.1, -171.3, -13.4],
  SB: [155.4, -11.9, 162.8, -6.5],
  VU: [166.4, -20.3, 169.9, -13.0],
  BS: [-79.4, 20.9, -72.6, 27.3],
  KM: [43.2, -12.5, 44.6, -11.3],
  ST: [6.4, -0.1, 7.5, 1.8],
  GR: [19.3, 34.8, 28.3, 41.8],
  IT: [6.6, 36.6, 18.6, 47.1],
  MY: [99.6, 0.8, 119.3, 7.4],
  PH: [116.9, 4.6, 126.7, 21.1],
  ID: [95, -11, 141.1, 6.1],
  CA: [-141, 41.7, -52.6, 76],
  GL: [-73.3, 59.8, -11.3, 83.6],
};

// Pin positions where Natural Earth's label point sits off-centre. [lon, lat]
const LABEL_OVERRIDE = {
  RU: [96, 62.5],
  CA: [-104, 58],
  NO: [9.5, 61.3],
  CL: [-70.5, -30],
  ID: [114, -1.5],
  MY: [102, 4],
  JP: [138.3, 36.4],
  PH: [122.5, 12.8],
  NZ: [172.5, -42],
  FJ: [178.1, -17.8],
  KI: [173, 1.4],
  US: [-98.5, 39.2],
  GL: [-41, 72.5],
};

const log = (...a) => console.log(...a);

// ---------- projection (Web Mercator, unit square, y down) ----------
const MAX_LAT = 85.0511287798;
function project([lon, lat]) {
  const la = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const s = Math.sin((la * Math.PI) / 180);
  return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
}
function unprojectLat(y) {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}
// Ground metres per unit-square unit at mercator y.
const metresPerUnit = (y) => EARTH * Math.cos((unprojectLat(y) * Math.PI) / 180);

// ---------- load ----------
const fc = JSON.parse(fs.readFileSync(path.join(CACHE, 'features.geojson'), 'utf8'));
const povs = JSON.parse(fs.readFileSync(path.join(CACHE, 'povs.json'), 'utf8'));

function projectGeometry(g) {
  if (g.type === 'Polygon') return { type: 'Polygon', coordinates: g.coordinates.map((r) => r.map(project)) };
  if (g.type === 'MultiPolygon')
    return { type: 'MultiPolygon', coordinates: g.coordinates.map((p) => p.map((r) => r.map(project))) };
  throw new Error('unexpected geometry ' + g.type);
}
for (const f of fc.features) f.geometry = projectGeometry(f.geometry);

const topo = topology({ countries: fc });
const arcs = topo.arcs; // [[x,y],...] in unit square (no quantization)
const geoms = topo.objects.countries.geometries;
log('features', geoms.length, 'arcs', arcs.length, 'points', arcs.reduce((s, a) => s + a.length, 0));

// ---------- per-feature polygons, areas, framing ----------
const arcIndex = (i) => (i < 0 ? ~i : i);
function ringCoords(ring) {
  const out = [];
  for (const i of ring) {
    const a = arcs[arcIndex(i)];
    const pts = i < 0 ? [...a].reverse() : a;
    for (let k = out.length ? 1 : 0; k < pts.length; k++) out.push(pts[k]);
  }
  return out;
}
function ringArea(c) {
  let s = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) s += (c[j][0] + c[i][0]) * (c[j][1] - c[i][1]);
  return s / 2;
}
function bboxOf(c) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of c) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}
const polygonsOf = (g) => (g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : []);

const features = geoms.map((g) => {
  const polys = polygonsOf(g).map((rings) => {
    const outer = ringCoords(rings[0]);
    const bb = bboxOf(outer);
    const cy = (bb[1] + bb[3]) / 2;
    const m = metresPerUnit(cy);
    return { rings, bb, ground: Math.abs(ringArea(outer)) * m * m };
  });
  return { g, props: g.properties, polys };
});

function clusterFrame(f) {
  const code = f.props.code;
  if (FRAME_OVERRIDE[code]) {
    const [a, b, c, d] = FRAME_OVERRIDE[code];
    const p0 = project([a, d]);
    const p1 = project([c, b]);
    return [p0[0], p0[1], p1[0], p1[1]];
  }
  const polys = [...f.polys].sort((a, b) => b.ground - a.ground);
  if (!polys.length) return null;
  const p0 = polys[0];
  const cx0 = (p0.bb[0] + p0.bb[2]) / 2;
  const size0 =
    Math.max(p0.bb[2] - p0.bb[0], p0.bb[3] - p0.bb[1]) * metresPerUnit((p0.bb[1] + p0.bb[3]) / 2);
  let bb = [...p0.bb];
  const shifted = polys.slice(1).map((p) => {
    const cx = (p.bb[0] + p.bb[2]) / 2;
    const dx = cx - cx0 > 0.5 ? -1 : cx - cx0 < -0.5 ? 1 : 0;
    return { ...p, bb: [p.bb[0] + dx, p.bb[1], p.bb[2] + dx, p.bb[3]] };
  });
  let added = true;
  const used = new Set();
  while (added) {
    added = false;
    shifted.forEach((p, i) => {
      if (used.has(i)) return;
      const gx = Math.max(0, p.bb[0] - bb[2], bb[0] - p.bb[2]);
      const gy = Math.max(0, p.bb[1] - bb[3], bb[1] - p.bb[3]);
      const dist = Math.hypot(gx, gy) * metresPerUnit((p.bb[1] + p.bb[3]) / 2);
      const big = p.ground >= 0.02 * p0.ground;
      if ((big && dist <= 0.35 * size0) || dist <= 0.12 * size0) {
        used.add(i);
        added = true;
        bb = [Math.min(bb[0], p.bb[0]), Math.min(bb[1], p.bb[1]), Math.max(bb[2], p.bb[2]), Math.max(bb[3], p.bb[3])];
      }
    });
  }
  return bb;
}

for (const f of features) {
  f.frame = clusterFrame(f);
  if (!f.frame) continue;
  const [x0, y0, x1, y1] = f.frame;
  const m = metresPerUnit((y0 + y1) / 2);
  f.extent = Math.max(x1 - x0, y1 - y0) * m; // ground metres
  const own = f.polys.length ? Math.max(...f.polys.map((p) => Math.sqrt(p.ground))) : 0;
  f.tolOwn = Math.min(TOL_MAX, Math.max(TOL_MIN, own * EPS_OWN));
}

// ---------- context span: widen tiny/remote targets until real land is visible ----------
function contextSpan(f) {
  if (!f.frame || f.props.neutral || f.extent > 600e3) return 0;
  const [x0, y0, x1, y1] = f.frame;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const m = metresPerUnit(cy);
  let span = Math.max(f.extent / FILL, MIN_SPAN);
  for (let i = 0; i < 10 && span < 3000e3; i++, span = Math.min(3000e3, span * 1.4)) {
    const hw = span / 2 / m;
    const minArea = (span / 40) ** 2;
    let others = 0;
    for (const g of features) {
      if (g === f || !g.frame) continue;
      if (g.polys.some((p) => {
        if (p.ground < minArea) return false;
        for (const dx of [0, -1, 1]) {
          if (p.bb[0] + dx <= cx + hw && p.bb[2] + dx >= cx - hw && p.bb[1] <= cy + hw && p.bb[3] >= cy - hw) return true;
        }
        return false;
      })) others++;
    }
    if (others >= 1) break;
  }
  return Math.round(span / 1000);
}
// The camera shows `span` ground metres across the viewport's short side; the
// long side is typically ~1.45x, so detail is needed ~0.8 span from the centre.
for (const f of features) {
  if (!f.frame) continue;
  f.ctx = contextSpan(f);
  f.span = Math.max(f.extent / FILL, MIN_SPAN, f.ctx * 1000);
  const [x0, y0, x1, y1] = f.frame;
  const m = metresPerUnit((y0 + y1) / 2);
  const half = (f.span / m) * 0.8;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  f.view = [cx - half, cy - half, cx + half, cy + half];
  f.tolView = Math.min(TOL_MAX, Math.max(TOL_MIN, f.span * EPS_VIEW));
}
const widened = features.filter((f) => f.frame && f.ctx * 1000 > Math.max(f.extent / FILL, MIN_SPAN) * 1.05);
log('context-widened', widened.map((f) => f.props.code + ':' + f.ctx).join(' '));

// ---------- per-vertex tolerance field ----------
// arc -> features using it
const arcUsers = arcs.map(() => []);
features.forEach((f, fi) => {
  for (const p of f.polys) for (const r of p.rings) for (const i of r) arcUsers[arcIndex(i)].push(fi);
});

const withView = features.filter((f) => f.view);
function vertexTol(x, y, ownTol) {
  let t = Math.min(ownTol, TOL_MAX);
  for (const f of withView) {
    if (f.tolView >= t) continue;
    const v = f.view;
    for (const dx of [0, -1, 1]) {
      const xx = x + dx;
      if (xx >= v[0] && xx <= v[2] && y >= v[1] && y <= v[3]) {
        t = f.tolView;
        break;
      }
    }
  }
  return t / metresPerUnit(y); // back to unit-square distance
}

// ---------- variable-tolerance Douglas-Peucker ----------
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function simplifyArc(pts, tols) {
  const n = pts.length;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let best = -1, bestR = 1;
    for (let i = s + 1; i < e; i++) {
      const r = segDist(pts[i], pts[s], pts[e]) / tols[i];
      if (r > bestR) {
        bestR = r;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([s, best], [best, e]);
    }
  }
  // closed rings need at least 4 points to stay an area
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  const closed = pts[0][0] === pts[n - 1][0] && pts[0][1] === pts[n - 1][1];
  if (closed && out.length < 4 && n >= 4) {
    const extra = [Math.floor(n / 3), Math.floor((2 * n) / 3)];
    return [pts[0], pts[extra[0]], pts[extra[1]], pts[n - 1]];
  }
  return out;
}

let before = 0, after = 0;
const simplified = arcs.map((a, ai) => {
  const users = arcUsers[ai];
  const own = users.length ? Math.min(...users.map((fi) => features[fi].tolOwn)) : TOL_MAX;
  const tols = a.map(([x, y]) => vertexTol(x, y, own));
  const s = simplifyArc(a, tols);
  before += a.length;
  after += s.length;
  return s;
});
log('points before', before, 'after', after);

// ---------- drop rings that vanish (tiny islands below local detail) ----------
function arcOwnTol(ai) {
  const users = arcUsers[ai];
  return users.length ? Math.min(...users.map((fi) => features[fi].tolOwn)) : TOL_MAX;
}
function ringVisible(ring) {
  // Islands (single closed arc) smaller than a few times the local detail are never visible.
  if (ring.length !== 1) return true;
  const a = arcs[arcIndex(ring[0])];
  const [x0, y0, x1, y1] = bboxOf(a);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const tol = vertexTol(cx, cy, arcOwnTol(arcIndex(ring[0])));
  return Math.hypot(x1 - x0, y1 - y0) >= 3 * tol;
}
function ringExtentOK(ring) {
  if (!ringVisible(ring)) return false;
  const c = [];
  for (const i of ring) {
    const a = simplified[arcIndex(i)];
    const pts = i < 0 ? [...a].reverse() : a;
    for (let k = c.length ? 1 : 0; k < pts.length; k++) c.push(pts[k]);
  }
  const uniq = new Set(c.map((p) => p[0] + ',' + p[1]));
  return uniq.size >= 3 && Math.abs(ringArea(c)) > 0;
}

// ---------- quantize & encode ----------
const q = (v) => Math.round(v * GRID);
const bytes = [];
function uv(n) {
  // unsigned varint
  while (n > 127) {
    bytes.push((n & 127) | 128);
    n = Math.floor(n / 128);
  }
  bytes.push(n);
}
const zz = (n) => (n < 0 ? -2 * n - 1 : 2 * n);
const sv = (n) => uv(zz(n));

// Keep only arcs referenced by surviving rings; renumber.
const liveArcs = new Map();
const featureRings = features.map((f) =>
  f.polys
    .map((p) => p.rings.filter((r, ri) => ri === 0 || ringExtentOK(r)))
    .filter((rings) => ringExtentOK(rings[0]) || f.polys.length === 1)
);
featureRings.forEach((polys) =>
  polys.forEach((rings) =>
    rings.forEach((r) =>
      r.forEach((i) => {
        const ai = arcIndex(i);
        if (!liveArcs.has(ai)) liveArcs.set(ai, liveArcs.size);
      })
    )
  )
);
// Morton-order arcs by first point so consecutive start points are close.
function morton(x, y) {
  let xi = Math.floor(Math.max(0, Math.min(1, x)) * 65535), yi = Math.floor(Math.max(0, Math.min(1, y)) * 65535);
  let m = 0;
  for (let b = 15; b >= 0; b--) m = m * 4 + ((xi >> b) & 1) * 2 + ((yi >> b) & 1);
  return m;
}
const arcOrder = [...liveArcs.keys()].sort(
  (a, b) => morton(...simplified[a][0]) - morton(...simplified[b][0])
);
arcOrder.forEach((ai, k) => liveArcs.set(ai, k));

// Per-arc step exponent: coarse arcs are stored on a coarser grid.
function arcStepExp(pts, ai) {
  const own = arcOwnTol(ai);
  let t = Infinity;
  for (const [x, y] of pts) t = Math.min(t, vertexTol(x, y, own));
  const units = (t * GRID) / 3; // allow a third of the tolerance as rounding error
  return Math.max(0, Math.min(20, Math.floor(Math.log2(Math.max(1, units)))));
}

// header
uv(arcOrder.length);
let px = 0, py = 0, totalPts = 0;
for (const ai of arcOrder) {
  const pts = simplified[ai];
  const e = arcStepExp(pts, ai);
  const step = 2 ** e;
  const closed = pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
  uv((pts.length * 2 + (closed ? 1 : 0)) * 32 + e);
  const first = [q(pts[0][0]), q(pts[0][1])];
  sv(first[0] - px);
  sv(first[1] - py);
  let cx = first[0], cy = first[1];
  for (let k = 1; k < pts.length - 1; k++) {
    const tx = q(pts[k][0]), ty = q(pts[k][1]);
    const dx = Math.round((tx - cx) / step), dy = Math.round((ty - cy) / step);
    sv(dx);
    sv(dy);
    cx += dx * step;
    cy += dy * step;
  }
  if (pts.length > 1 && !closed) {
    const last = [q(pts[pts.length - 1][0]), q(pts[pts.length - 1][1])];
    sv(last[0] - first[0]);
    sv(last[1] - first[1]);
  }
  px = first[0];
  py = first[1];
  totalPts += pts.length;
}
// features: polygons -> rings -> arc refs
uv(features.length);
features.forEach((f, fi) => {
  const polys = featureRings[fi];
  uv(polys.length);
  for (const rings of polys) {
    uv(rings.length);
    for (const r of rings) {
      uv(r.length);
      for (const i of r) {
        const idx = liveArcs.get(arcIndex(i));
        uv(i < 0 ? idx * 2 + 1 : idx * 2);
      }
    }
  }
});
const bin = Buffer.from(bytes);
log('arcs kept', arcOrder.length, 'points encoded', totalPts, 'bytes', bin.length);

// ---------- metadata ----------
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const baseIds = new Set(povs.base);
const byId = new Map(features.map((f, i) => [f.props.id, i]));

// Neighbours in the base edition: features sharing an arc.
const neighbours = features.map(() => new Set());
arcUsers.forEach((users) => {
  const u = [...new Set(users)].filter((fi) => baseIds.has(features[fi].props.id));
  for (const a of u) for (const b of u) if (a !== b) neighbours[a].add(features[b].props.code);
});

const meta = features.map((f, i) => {
  const p = f.props;
  const lab = project(LABEL_OVERRIDE[p.code] || p.label);
  const frame = f.frame ? f.frame.map((v) => round(v, 7)) : null;
  const areaKm2 = Math.round(f.polys.reduce((s, x) => s + x.ground, 0) / 1e6);
  return [
    p.id,
    p.code,
    p.name,
    p.neutral ? 1 : 0,
    p.continent,
    p.subregion,
    [round(lab[0], 7), round(lab[1], 7)],
    frame,
    areaKm2,
    [...neighbours[i]].sort().join(' '),
    p.type,
    f.ctx || 0,
  ];
});
const povTable = {};
for (const [home, v] of Object.entries(povs.povs)) {
  povTable[home] = { add: v.add.map((id) => byId.get(id)), remove: v.remove.map((id) => byId.get(id)) };
}

const header =
  '// Generated by tools/geo/build.mjs from Natural Earth (public domain). Do not edit.\n' +
  '// Feature row: [id, code, englishName, neutral, continent, subregion, labelXY, frameXYXY, areaKm2, neighbours, type, contextSpanKm]\n';
const ts =
  header +
  `export const GRID_BITS = ${GRID_BITS};\n` +
  `export const GEOMETRY = '${bin.toString('base64')}';\n` +
  `export const FEATURES: [string, string, string, number, string, string, [number, number], [number, number, number, number] | null, number, string, string, number][] = ${JSON.stringify(meta)};\n` +
  `export const BASE: number[] = ${JSON.stringify(povs.base.map((id) => byId.get(id)))};\n` +
  `export const POVS: Record<string, { add: number[]; remove: number[] }> = ${JSON.stringify(povTable)};\n`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, ts);
log('wrote', path.relative(ROOT, OUT), (ts.length / 1024).toFixed(1) + ' KB');
