// The live map: two stacked canvases (static base + animated overlay), camera
// flights, the target highlight and pin, "find it" candidates, labels and
// pan / pinch / wheel gestures.
import { clock } from '../core/clock';
import { kmPerUnit, type BBox, type Feature, type World } from '../geo/world';
import { ease, fitBox, flight, scaleOf, toScreen, toWorld, wrapX, type Rect, type View } from './camera';
import { Renderer, drawClouds, drawPin, drawRipple, type Surface } from './renderer';
import { THEMES, type Theme } from './themes';

export type Look = 'ask' | 'good' | 'bad';

export interface Limits {
  minZ: number;
  maxZ: number;
  box: BBox; // camera centre stays inside
}

interface Label {
  f: Feature;
  el: HTMLElement;
}

const MIN_SPAN_KM = 350;

function surface(canvas: HTMLCanvasElement): Surface {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Canvas 2D unavailable');
  return { ctx, w: 1, h: 1, dpr: 1 };
}

export class MapView {
  readonly renderer: Renderer;
  view: View = { x: 0.52, y: 0.4, z: 10 };
  home: View | null = null; // framed view of the current round
  vp: Rect = { x: 0, y: 0, w: 1, h: 1 };
  theme: Theme = THEMES[0];
  w = 1;
  h = 1;
  dpr = 1;

  target: Feature | null = null;
  look: Look = 'ask';
  private lookAt = 0;
  silhouette = false;
  candidates: Feature[] = [];
  candidateLook = new Map<Feature, Look | 'hover'>();
  private pinAt = -1;
  private pinAlpha = 1;
  altitude = 0;
  limits: Limits | null = null;
  onTap?: (clientX: number, clientY: number) => void;
  onHover?: (clientX: number, clientY: number) => void;
  onUserMove?: () => void;

  private base: Surface;
  private fx: Surface;
  private baseDirty = true;
  private labels: Label[] = [];
  private pointers = new Map<number, { x: number; y: number; x0: number; y0: number; t0: number }>();
  private velocity = { x: 0, y: 0 };
  private lastMove = 0;
  private pinchDist = 0;
  private moved = false;
  private flying = false;

  constructor(
    public world: World,
    private baseCanvas: HTMLCanvasElement,
    private fxCanvas: HTMLCanvasElement,
    private labelLayer: HTMLElement
  ) {
    this.renderer = new Renderer(world);
    this.base = surface(baseCanvas);
    this.fx = surface(fxCanvas);
    this.bindGestures();
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    for (const [c, s] of [
      [this.baseCanvas, this.base],
      [this.fxCanvas, this.fx],
    ] as const) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      s.w = w;
      s.h = h;
      s.dpr = dpr;
    }
    this.baseDirty = true;
  }

  setViewport(r: Rect): void {
    this.vp = r;
    this.baseDirty = true;
  }

  setTheme(t: Theme): void {
    this.theme = t;
    this.baseDirty = true;
  }

  invalidate(): void {
    this.baseDirty = true;
  }

  get dirty(): boolean {
    return this.baseDirty;
  }

  // ---------- framing ----------

  minSpanUnits(f: Feature): number {
    const cy = (f.frame[1] + f.frame[3]) / 2;
    const km = Math.max(MIN_SPAN_KM, f.ctx);
    return km / kmPerUnit(cy);
  }

  frame(f: Feature, fill = 0.72, vp = this.vp): View {
    return fitBox(f.frame, vp, fill, this.minSpanUnits(f));
  }

  frameMany(fs: Feature[], fill = 0.8): View {
    const ref = (fs[0].frame[0] + fs[0].frame[2]) / 2;
    let bb: BBox = [Infinity, Infinity, -Infinity, -Infinity];
    for (const f of fs) {
      const cx = (f.frame[0] + f.frame[2]) / 2;
      const dx = cx - ref > 0.5 ? -1 : cx - ref < -0.5 ? 1 : 0;
      bb = [
        Math.min(bb[0], f.frame[0] + dx),
        Math.min(bb[1], f.frame[1]),
        Math.max(bb[2], f.frame[2] + dx),
        Math.max(bb[3], f.frame[3]),
      ];
    }
    const minSpan = Math.max(...fs.map((f) => this.minSpanUnits(f)));
    return fitBox(bb, this.vp, fill, minSpan);
  }

  worldView(): View {
    const z = Math.log2(Math.max(this.vp.w, this.vp.h * 1.4) / 1.05);
    return { x: this.view.x, y: 0.42, z };
  }

  // ---------- camera motion ----------

  async flyTo(to: View, maxMs = 1700): Promise<void> {
    const from = { ...this.view };
    const path = flight(from, to, this.vp);
    const dur = Math.max(450, Math.min(maxMs, 380 + path.length * 520));
    const zMin = Math.min(from.z, to.z);
    this.flying = true;
    this.velocity = { x: 0, y: 0 };
    await clock.tween(dur, (t) => {
      const v = path.at(ease.inOut(t));
      this.view = v;
      // clouds when the camera climbs above both endpoints
      this.altitude = Math.max(0, Math.min(1, (zMin - v.z - 0.4) / 1.6));
      this.baseDirty = true;
    });
    this.view = { ...to, x: wrapX(to.x) };
    this.altitude = 0;
    this.flying = false;
    this.baseDirty = true;
  }

  async zoomTo(to: View, ms: number, curve: (t: number) => number = ease.out): Promise<void> {
    const from = { ...this.view };
    let tx = to.x;
    while (tx - from.x > 0.5) tx -= 1;
    while (tx - from.x < -0.5) tx += 1;
    await clock.tween(ms, (t) => {
      const k = curve(t);
      this.view = { x: from.x + (tx - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k };
      this.baseDirty = true;
    });
  }

  jump(v: View): void {
    this.view = { ...v, x: wrapX(v.x) };
    this.baseDirty = true;
  }

  isAway(): boolean {
    if (!this.home) return false;
    const s = scaleOf(this.view);
    const dx = (this.view.x - this.home.x) * s;
    const dy = (this.view.y - this.home.y) * s;
    return Math.abs(this.view.z - this.home.z) > 0.45 || Math.hypot(dx, dy) > Math.min(this.vp.w, this.vp.h) * 0.3;
  }

  // ---------- content ----------

  setTarget(f: Feature | null, look: Look = 'ask'): void {
    this.target = f;
    this.look = look;
    this.lookAt = clock.now;
  }

  setLook(look: Look): void {
    this.look = look;
    this.lookAt = clock.now;
  }

  dropPin(): void {
    this.pinAt = clock.now;
    this.pinAlpha = 1;
  }

  hidePin(): void {
    this.pinAt = -1;
  }

  setSilhouette(on: boolean): void {
    if (this.silhouette !== on) {
      this.silhouette = on;
      this.baseDirty = true;
    }
  }

  setCandidates(fs: Feature[]): void {
    this.candidates = fs;
    this.candidateLook = new Map(fs.map((f) => [f, 'ask' as Look]));
  }

  showLabel(f: Feature, text: string, kind: 'good' | 'bad' | 'hint' = 'good'): void {
    const el = document.createElement('div');
    el.className = `map-label lbl-${kind}`;
    const span = document.createElement('span');
    span.textContent = text;
    span.dir = 'auto';
    el.appendChild(span);
    this.labelLayer.appendChild(el);
    this.labels.push({ f, el });
    this.placeLabels();
  }

  clearLabels(): void {
    for (const l of this.labels) l.el.remove();
    this.labels = [];
  }

  screenOf(x: number, y: number): [number, number] {
    // nearest horizontal copy to the view centre
    let xx = x;
    while (xx - this.view.x > 0.5) xx -= 1;
    while (xx - this.view.x < -0.5) xx += 1;
    return toScreen(this.view, this.vp, xx, y);
  }

  /** Candidate under a screen point, or the nearest within 30 px. */
  hitCandidate(clientX: number, clientY: number): Feature | null {
    const rect = this.fxCanvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const [x, y] = toWorld(this.view, this.vp, sx, sy);
    for (const f of this.candidates) if (this.world.contains(f, x, y)) return f;
    let best: Feature | null = null;
    let bestD = 30;
    for (const f of this.candidates) {
      const [lx, ly] = this.screenOf(f.label[0], f.label[1]);
      const d = Math.hypot(lx - sx, ly - sy);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  // ---------- frame ----------

  update(dt: number): void {
    if (!this.flying && this.pointers.size === 0 && (this.velocity.x || this.velocity.y)) {
      const k = Math.pow(0.9, dt / 16.7);
      this.view.x += this.velocity.x * dt;
      this.view.y += this.velocity.y * dt;
      this.velocity.x *= k;
      this.velocity.y *= k;
      if (Math.abs(this.velocity.x) + Math.abs(this.velocity.y) < 1e-9) this.velocity = { x: 0, y: 0 };
      this.clamp();
      this.baseDirty = true;
    }
  }

  draw(): void {
    const t = clock.now / 1000;
    if (this.baseDirty) {
      if (this.silhouette) this.renderer.drawPaper(this.base, this.theme, 0);
      else this.renderer.drawBase(this.base, this.view, this.vp, this.theme);
      this.baseDirty = false;
      this.placeLabels();
    }
    const fx = this.fx;
    fx.ctx.setTransform(1, 0, 0, 1, 0, 0);
    fx.ctx.clearRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);
    const th = this.theme;

    for (const c of this.candidates) {
      const look = this.candidateLook.get(c) ?? 'ask';
      const stroke = look === 'good' ? th.good : look === 'bad' ? th.bad : th.candidate;
      const fill = look === 'good' ? th.goodFill : look === 'bad' ? th.badFill : th.candidateFill;
      this.renderer.highlight(fx, this.view, this.vp, {
        feature: c,
        fill: look === 'hover' ? 'rgba(255, 196, 0, 0.5)' : fill,
        stroke,
        width: look === 'hover' ? 3.2 : 2.4,
        dash: look === 'ask' || look === 'hover',
        dashOffset: t * 22,
      });
    }

    const f = this.target;
    if (f) {
      if (this.silhouette) {
        const color = this.look === 'good' ? th.good : this.look === 'bad' ? th.bad : th.shape;
        this.renderer.shape(fx, this.view, this.vp, f, color);
      } else {
        const k = Math.min(1, (clock.now - this.lookAt) / 350);
        const pulse = 0.5 + 0.5 * Math.sin(t * 4);
        const [stroke, fill] =
          this.look === 'good' ? [th.good, th.goodFill] : this.look === 'bad' ? [th.bad, th.badFill] : [th.target, th.targetFill];
        this.renderer.highlight(fx, this.view, this.vp, {
          feature: f,
          fill,
          stroke,
          width: this.look === 'ask' ? 2.6 : 2.6 + 1.2 * (1 - k),
          dash: this.look === 'ask',
          dashOffset: t * 18,
          glow: this.look === 'ask' ? pulse : 1 - k,
        });
        this.drawFocusRing(f, t);
      }
      this.drawPinLayer(f);
    }
    drawClouds(fx, this.view, this.altitude);
  }

  private drawFocusRing(f: Feature, t: number): void {
    const s = scaleOf(this.view);
    const size = Math.max(f.frame[2] - f.frame[0], f.frame[3] - f.frame[1]) * s;
    if (size > 22) return;
    const [x, y] = this.screenOf((f.frame[0] + f.frame[2]) / 2, (f.frame[1] + f.frame[3]) / 2);
    const ctx = this.fx.ctx;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const color = this.look === 'good' ? this.theme.good : this.look === 'bad' ? this.theme.bad : this.theme.target;
    for (let i = 0; i < 2; i++) {
      const p = (t * 0.9 + i * 0.5) % 1;
      ctx.globalAlpha = (1 - p) * 0.8;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, 12 + p * 26 + size / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 11 + size / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  private drawPinLayer(f: Feature): void {
    if (this.pinAt < 0 || this.silhouette) return;
    const dt = (clock.now - this.pinAt) / 1000;
    const size = Math.max(30, Math.min(46, Math.min(this.w, this.h) * 0.075));
    const [x, y] = this.screenOf(f.label[0], f.label[1]);
    const fall = 0.32;
    let drop = 0;
    let squash = 1;
    if (dt < fall) {
      const k = dt / fall;
      drop = (1 - k * k) * size * 3.2;
      squash = 1.08;
    } else if (dt < fall + 0.34) {
      const k = (dt - fall) / 0.34;
      drop = Math.sin(k * Math.PI) * size * 0.28;
      squash = 1 - 0.22 * Math.max(0, 1 - k * 3) + 0.06 * Math.sin(k * Math.PI);
    }
    if (dt > fall && dt < fall + 0.7) {
      const k = (dt - fall) / 0.7;
      drawRipple(this.fx, x, y, 8 + k * size * 1.4, (1 - k) * 0.7, this.theme.pin);
    }
    // mascot mood follows the answer; happy pins hop, idle pins blink
    const mood = this.look === 'ask' ? 'idle' : this.look === 'good' ? 'happy' : 'sad';
    const since = (clock.now - this.lookAt) / 1000;
    if (mood === 'happy' && since < 0.9 && dt > fall + 0.34) {
      drop += Math.abs(Math.sin(since * Math.PI * 3.3)) * size * 0.35 * (1 - since / 0.9);
    }
    const tb = (clock.now / 1000) % 3.7;
    const blink = mood === 'idle' && tb > 3.55 ? Math.sin(((tb - 3.55) / 0.15) * Math.PI) : 0;
    const look = mood === 'idle' ? Math.sin(clock.now / 900) * 0.8 : 0;
    drawPin(this.fx, x, y, size, drop, squash, this.theme, this.pinAlpha, mood, blink, look);
  }

  private placeLabels(): void {
    for (const l of this.labels) {
      const [x, y] = this.screenOf(l.f.label[0], l.f.label[1]);
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  // ---------- gestures ----------

  private clamp(): void {
    const L = this.limits;
    if (!L) return;
    this.view.z = Math.max(L.minZ, Math.min(L.maxZ, this.view.z));
    this.view.x = Math.max(L.box[0], Math.min(L.box[2], this.view.x));
    this.view.y = Math.max(L.box[1], Math.min(L.box[3], this.view.y));
  }

  private zoomAround(sx: number, sy: number, dz: number): void {
    const before = toWorld(this.view, this.vp, sx, sy);
    this.view.z += dz;
    if (this.limits) this.view.z = Math.max(this.limits.minZ, Math.min(this.limits.maxZ, this.view.z));
    const after = toWorld(this.view, this.vp, sx, sy);
    this.view.x += before[0] - after[0];
    this.view.y += before[1] - after[1];
    this.clamp();
    this.baseDirty = true;
  }

  private bindGestures(): void {
    const el = this.fxCanvas;
    const local = (e: PointerEvent | WheelEvent): [number, number] => {
      const r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture?.(e.pointerId);
      const [x, y] = local(e);
      this.pointers.set(e.pointerId, { x, y, x0: x, y0: y, t0: performance.now() });
      this.velocity = { x: 0, y: 0 };
      this.moved = false;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) {
        if (e.pointerType === 'mouse') this.onHover?.(e.clientX, e.clientY);
        return;
      }
      const [x, y] = local(e);
      const dx = x - p.x;
      const dy = y - p.y;
      p.x = x;
      p.y = y;
      if (Math.hypot(x - p.x0, y - p.y0) > 8) this.moved = true;
      if (!this.limits || this.flying) return;
      const s = scaleOf(this.view);
      if (this.pointers.size === 1) {
        if (!this.moved) return;
        this.view.x -= dx / s;
        this.view.y -= dy / s;
        const now = performance.now();
        const dtm = Math.max(1, now - this.lastMove);
        this.lastMove = now;
        this.velocity = { x: (-dx / s / dtm) * 0.9, y: (-dy / s / dtm) * 0.9 };
        this.clamp();
        this.baseDirty = true;
        this.onUserMove?.();
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist > 0 && d > 0) this.zoomAround((a.x + b.x) / 2, (a.y + b.y) / 2, Math.log2(d / this.pinchDist));
        this.pinchDist = d;
        this.view.x -= dx / 2 / s;
        this.view.y -= dy / 2 / s;
        this.clamp();
        this.onUserMove?.();
      }
    });
    const end = (e: PointerEvent): void => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (!p) return;
      const quick = performance.now() - p.t0 < 450;
      if (!this.moved && quick && this.pointers.size === 0) {
        this.velocity = { x: 0, y: 0 };
        this.onTap?.(e.clientX, e.clientY);
      }
      if (performance.now() - this.lastMove > 80) this.velocity = { x: 0, y: 0 };
      if (this.pointers.size < 2) this.pinchDist = 0;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (!this.limits || this.flying) return;
        const [x, y] = local(e);
        const dz = -Math.max(-1, Math.min(1, e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0022)));
        this.zoomAround(x, y, dz);
        this.onUserMove?.();
      },
      { passive: false }
    );
  }
}
