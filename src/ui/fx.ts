// Confetti and sparkles on a canvas above the UI (pointer-events: none).

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  s: number;
  c: string;
  life: number;
  max: number;
  shape: number;
}

const COLORS = ['#ff4757', '#ffc93c', '#2ed573', '#1e90ff', '#a55eea', '#ff7f50', '#00d2d3'];

export class Fx {
  private ctx: CanvasRenderingContext2D;
  private ps: P[] = [];
  private w = 1;
  private h = 1;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d');
    this.ctx = ctx;
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = Math.min(dpr, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
  }

  get busy(): boolean {
    return this.ps.length > 0;
  }

  burst(x: number, y: number, n = 40, power = 1, colors = COLORS): void {
    const scale = Math.min(this.w, this.h) / 700;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
      const v = (380 + Math.random() * 520) * power * Math.max(0.6, scale);
      this.ps.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 14,
        s: (5 + Math.random() * 6) * Math.max(0.7, scale),
        c: colors[Math.floor(Math.random() * colors.length)],
        life: 0,
        max: 0.9 + Math.random() * 0.7,
        shape: Math.floor(Math.random() * 3),
      });
    }
    if (this.ps.length > 500) this.ps.splice(0, this.ps.length - 500);
  }

  rain(n = 90): void {
    for (let i = 0; i < n; i++) {
      this.ps.push({
        x: Math.random() * this.w,
        y: -20 - Math.random() * this.h * 0.4,
        vx: (Math.random() - 0.5) * 120,
        vy: 120 + Math.random() * 260,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 10,
        s: 6 + Math.random() * 7,
        c: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: 0,
        max: 2.2 + Math.random(),
        shape: Math.floor(Math.random() * 3),
      });
    }
  }

  update(dt: number): void {
    const s = dt / 1000;
    for (const p of this.ps) {
      p.life += s;
      p.vy += 1300 * s;
      p.vx *= Math.pow(0.35, s);
      p.vy *= Math.pow(0.55, s);
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.r += p.vr * s;
    }
    this.ps = this.ps.filter((p) => p.life < p.max && p.y < this.h + 40);
  }

  draw(): void {
    const { ctx, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.ps.length) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const p of this.ps) {
      const fade = Math.min(1, (p.max - p.life) / 0.3);
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.c;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      if (p.shape === 0) ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      else if (p.shape === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, p.s / 2.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = (k * 4 * Math.PI) / 5 - Math.PI / 2;
          ctx.lineTo(Math.cos(a) * p.s * 0.55, Math.sin(a) * p.s * 0.55);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
