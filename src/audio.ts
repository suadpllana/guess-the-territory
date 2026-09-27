// All sound is synthesised with WebAudio: nothing to download. Audio starts
// on the first user gesture and is muted during ads and hidden tabs.

type Wave = OscillatorType;

class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  soundOn = true;
  musicOn = true;
  private muted = false;
  private musicTimer = 0;
  private nextBeat = 0;
  private beat = 0;
  private musicWanted = false;

  unlock(): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      const c = this.ctx;
      this.master = c.createGain();
      this.master.connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.gain.value = 0.55;
      this.sfx.connect(this.master);
      this.music = c.createGain();
      this.music.gain.value = 0.0;
      this.music.connect(this.master);
      const len = c.sampleRate * 0.5;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyGains();
    }
    if (this.ctx.state === 'suspended' && !this.muted) this.ctx.resume().catch(() => undefined);
    if (this.musicWanted) this.startMusic();
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyGains();
    if (this.ctx) {
      if (m) this.ctx.suspend().catch(() => undefined);
      else this.ctx.resume().catch(() => undefined);
    }
  }

  setSound(on: boolean): void {
    this.soundOn = on;
    this.applyGains();
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    this.applyGains();
  }

  private applyGains(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.03);
    this.sfx.gain.setTargetAtTime(this.soundOn ? 0.55 : 0, t, 0.03);
    this.music.gain.setTargetAtTime(this.musicOn && this.musicWanted ? 0.13 : 0, t, 0.3);
  }

  private get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && this.soundOn && !this.muted;
  }

  private tone(
    freq: number,
    dur: number,
    opts: { type?: Wave; gain?: number; at?: number; to?: number; attack?: number; dest?: AudioNode } = {}
  ): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (opts.at ?? 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const peak = opts.gain ?? 0.3;
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(opts.dest ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, f0: number, f1: number, gain: number, at = 0, dest?: AudioNode): void {
    const c = this.ctx;
    if (!c || !this.noiseBuf) return;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(dest ?? this.sfx);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  tap(): void {
    if (this.ready) this.tone(660, 0.06, { type: 'triangle', gain: 0.14 });
  }

  correct(streak: number): void {
    if (!this.ready) return;
    const up = 2 ** (Math.min(streak, 12) / 12);
    this.tone(1046.5 * up, 0.16, { type: 'triangle', gain: 0.28 });
    this.tone(1568 * up, 0.28, { type: 'sine', gain: 0.24, at: 0.075 });
    this.tone(2093 * up, 0.22, { type: 'sine', gain: 0.08, at: 0.075 });
  }

  wrong(): void {
    if (!this.ready) return;
    this.tone(233, 0.28, { type: 'square', gain: 0.1, to: 110 });
    this.tone(175, 0.34, { type: 'triangle', gain: 0.22, to: 82 });
  }

  pin(): void {
    if (this.ready) this.tone(880, 0.1, { type: 'sine', gain: 0.22, to: 330 });
  }

  whoosh(): void {
    if (this.ready) this.noise(0.7, 350, 1600, 0.09);
  }

  heart(): void {
    if (!this.ready) return;
    this.tone(660, 0.12, { type: 'triangle', gain: 0.18 });
    this.tone(440, 0.22, { type: 'triangle', gain: 0.18, at: 0.1 });
  }

  sparkle(): void {
    if (!this.ready) return;
    for (let i = 0; i < 4; i++) this.tone(2200 + Math.random() * 1600, 0.09, { gain: 0.07, at: i * 0.05 });
  }

  levelUp(): void {
    if (!this.ready) return;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((n, i) => this.tone(n, 0.24, { type: 'triangle', gain: 0.22, at: i * 0.075 }));
    this.tone(1568, 0.5, { type: 'sine', gain: 0.12, at: 0.38 });
    this.noise(0.5, 3000, 8000, 0.03, 0.35);
  }

  streak(n: number): void {
    if (!this.ready) return;
    const base = 659.25 * 2 ** (Math.min(n, 20) / 24);
    [0, 4, 7, 12].forEach((s, i) => this.tone(base * 2 ** (s / 12), 0.16, { type: 'square', gain: 0.07, at: i * 0.06 }));
  }

  tick(): void {
    if (this.ready) this.tone(1500, 0.035, { type: 'square', gain: 0.05 });
  }

  pop(): void {
    if (this.ready) this.tone(520, 0.08, { type: 'sine', gain: 0.18, to: 1040 });
  }

  // ---------- music: a soft I-V-vi-IV loop with an arpeggio ----------

  startMusic(): void {
    this.musicWanted = true;
    this.applyGains();
    if (!this.ctx || this.musicTimer) return;
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.schedule(), 40);
  }

  stopMusic(): void {
    this.musicWanted = false;
    this.applyGains();
  }

  private schedule(): void {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const step = 60 / 104 / 2; // eighth notes at 104 bpm
    const chords = [
      [261.63, 329.63, 392.0],
      [196.0, 246.94, 293.66],
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
    ];
    const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
    while (this.nextBeat < c.currentTime + 0.25) {
      const at = this.nextBeat - c.currentTime;
      const bar = Math.floor(this.beat / 8) % 4;
      const chord = chords[bar];
      const i = this.beat % 8;
      const oct = this.beat % 64 >= 32 ? 4 : 2;
      this.tone(chord[pattern[i]] * oct, step * 1.6, { type: 'triangle', gain: 0.12, at, dest: this.music });
      if (i === 0) {
        this.tone(chord[0] / 2, step * 7, { type: 'sine', gain: 0.22, at, attack: 0.03, dest: this.music });
        for (const n of chord) this.tone(n, step * 8, { type: 'sine', gain: 0.05, at, attack: 0.4, dest: this.music });
      }
      if (i === 4) this.tone(chord[0] / 2, step * 3, { type: 'sine', gain: 0.16, at, dest: this.music });
      if (i % 2 === 1) this.noise(0.05, 7000, 9000, 0.02, at, this.music);
      this.nextBeat += step;
      this.beat++;
    }
  }
}

export const sound = new Sound();
