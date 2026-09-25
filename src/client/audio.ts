/*
 * Every sound in Tanda is synthesized with WebAudio — no files. Each effect is a function of
 * (context, destination, start time), so the same code plays live or renders offline for tests.
 */
type Ctx = BaseAudioContext;
type Fx = (c: Ctx, out: AudioNode, t: number, v?: number) => void;

let noiseBuf: AudioBuffer | null = null;
function noise(c: Ctx) {
  if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
  }
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

function env(c: Ctx, t: number, peak: number, attack: number, decay: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function burst(c: Ctx, out: AudioNode, t: number, o: { type: BiquadFilterType; f: number; f2?: number; q?: number; peak: number; a: number; d: number }) {
  const n = noise(c);
  const f = c.createBiquadFilter();
  f.type = o.type;
  f.frequency.setValueAtTime(o.f, t);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.a + o.d);
  f.Q.value = o.q ?? 1;
  const g = env(c, t, o.peak, o.a, o.d);
  n.connect(f).connect(g).connect(out);
  n.start(t, Math.random() * 0.5);
  n.stop(t + o.a + o.d + 0.05);
}

function tone(c: Ctx, out: AudioNode, t: number, o: { type?: OscillatorType; f: number; f2?: number; peak: number; a: number; d: number }) {
  const osc = c.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.a + o.d);
  const g = env(c, t, o.peak, o.a, o.d);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + o.a + o.d + 0.05);
}

/** A small brass bell: a few inharmonic partials ringing down. */
function bell(c: Ctx, out: AudioNode, t: number, f: number, peak: number) {
  for (const [m, a, d] of [[1, 1, 0.9], [2.76, 0.4, 0.5], [5.4, 0.2, 0.3], [8.9, 0.1, 0.18]] as const) tone(c, out, t, { f: f * m, peak: peak * a, a: 0.003, d });
}

export const SOUNDS: Record<string, Fx> = {
  dig: (c, o, t) => {
    burst(c, o, t, { type: "lowpass", f: 1400, f2: 300, peak: 0.5, a: 0.005, d: 0.16 });
    tone(c, o, t, { f: 150, f2: 70, peak: 0.25, a: 0.004, d: 0.12 });
  },
  place: (c, o, t) => {
    tone(c, o, t, { type: "triangle", f: 190, f2: 95, peak: 0.45, a: 0.003, d: 0.12 });
    burst(c, o, t, { type: "bandpass", f: 2400, q: 2, peak: 0.18, a: 0.002, d: 0.03 });
  },
  till: (c, o, t) => {
    burst(c, o, t, { type: "bandpass", f: 900, f2: 500, q: 1.5, peak: 0.45, a: 0.02, d: 0.22 });
    burst(c, o, t + 0.09, { type: "highpass", f: 2500, peak: 0.12, a: 0.005, d: 0.08 });
  },
  plough: (c, o, t) => {
    for (let i = 0; i < 4; i++) burst(c, o, t + i * 0.13, { type: "bandpass", f: 700 - i * 60, q: 1.2, peak: 0.35, a: 0.02, d: 0.18 });
    SOUNDS.bells(c, o, t + 0.1);
  },
  water: (c, o, t) => {
    burst(c, o, t, { type: "highpass", f: 1800, peak: 0.22, a: 0.04, d: 0.45 });
    for (let i = 0; i < 5; i++) tone(c, o, t + 0.05 + i * 0.07 + Math.random() * 0.03, { f: 700 + Math.random() * 600, f2: 1600, peak: 0.06, a: 0.004, d: 0.05 });
  },
  fill: (c, o, t) => {
    for (let i = 0; i < 9; i++) tone(c, o, t + i * 0.06, { f: 300 + i * 70, f2: 500 + i * 90, peak: 0.08, a: 0.005, d: 0.06 });
  },
  plant: (c, o, t) => {
    burst(c, o, t, { type: "lowpass", f: 700, peak: 0.3, a: 0.004, d: 0.08 });
    tone(c, o, t + 0.03, { f: 520, f2: 660, peak: 0.08, a: 0.005, d: 0.08 });
  },
  harvest: (c, o, t) => {
    burst(c, o, t, { type: "bandpass", f: 3200, q: 0.8, peak: 0.25, a: 0.01, d: 0.18 });
    tone(c, o, t + 0.08, { f: 660, f2: 990, peak: 0.12, a: 0.005, d: 0.12 });
  },
  cash: (c, o, t) => {
    bell(c, o, t, 1318, 0.22);
    bell(c, o, t + 0.09, 1760, 0.2);
    burst(c, o, t, { type: "highpass", f: 6000, peak: 0.06, a: 0.002, d: 0.12 });
  },
  buy: (c, o, t) => {
    tone(c, o, t, { type: "triangle", f: 880, peak: 0.12, a: 0.004, d: 0.1 });
    tone(c, o, t + 0.07, { type: "triangle", f: 660, peak: 0.1, a: 0.004, d: 0.12 });
  },
  refused: (c, o, t) => tone(c, o, t, { type: "square", f: 140, f2: 110, peak: 0.08, a: 0.01, d: 0.18 }),
  bells: (c, o, t) => {
    // ghungroo: a handful of tiny bells jingling
    for (let i = 0; i < 6; i++) bell(c, o, t + i * 0.045 + Math.random() * 0.02, 2600 + Math.random() * 900, 0.05);
  },
  step: (c, o, t, v = 1) => burst(c, o, t, { type: "lowpass", f: 500 + v * 900, peak: 0.12 + v * 0.06, a: 0.004, d: 0.07 }),
  moo: (c, o, t) => {
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.linearRampToValueAtTime(140, t + 0.3);
    osc.frequency.linearRampToValueAtTime(95, t + 0.9);
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 600;
    const g = env(c, t, 0.12, 0.15, 0.8);
    osc.connect(f).connect(g).connect(o);
    osc.start(t);
    osc.stop(t + 1.1);
  },
  chirp: (c, o, t) => {
    // a bulbul-ish two-note whistle
    const base = 2200 + Math.random() * 1400;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) tone(c, o, t + i * 0.11, { f: base * (i % 2 ? 1.25 : 1), f2: base * (i % 2 ? 1.1 : 1.4), peak: 0.035, a: 0.01, d: 0.07 });
  },
  splash: (c, o, t) => {
    burst(c, o, t, { type: "lowpass", f: 2200, f2: 400, peak: 0.35, a: 0.005, d: 0.3 });
    for (let i = 0; i < 4; i++) tone(c, o, t + 0.04 + i * 0.05, { f: 500 + Math.random() * 500, f2: 1200, peak: 0.05, a: 0.004, d: 0.06 });
  },
  bite: (c, o, t) => {
    // the float bobs under: a plop and a ring
    tone(c, o, t, { f: 420, f2: 180, peak: 0.25, a: 0.004, d: 0.12 });
    burst(c, o, t, { type: "bandpass", f: 1500, q: 2, peak: 0.12, a: 0.003, d: 0.08 });
  },
  reel: (c, o, t) => {
    for (let i = 0; i < 4; i++) burst(c, o, t + i * 0.035, { type: "highpass", f: 4200, peak: 0.06, a: 0.001, d: 0.015 });
  },
  snap: (c, o, t) => {
    burst(c, o, t, { type: "highpass", f: 3000, peak: 0.3, a: 0.001, d: 0.05 });
    tone(c, o, t, { type: "triangle", f: 900, f2: 200, peak: 0.12, a: 0.002, d: 0.15 });
  },
  whistle: (c, o, t) => {
    // the referee's pea whistle: a trilled high note
    const osc = c.createOscillator();
    osc.frequency.value = 2900;
    const lfo = c.createOscillator();
    lfo.frequency.value = 38;
    const depth = c.createGain();
    depth.gain.value = 160;
    lfo.connect(depth).connect(osc.frequency);
    const g = env(c, t, 0.08, 0.01, 0.45);
    osc.connect(g).connect(o);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.5);
    lfo.stop(t + 0.5);
  },
  cheer: (c, o, t) => {
    // a small crowd: a swell of filtered noise with a few whoops on top
    burst(c, o, t, { type: "bandpass", f: 900, f2: 1300, q: 0.7, peak: 0.22, a: 0.25, d: 1.1 });
    for (let i = 0; i < 4; i++) tone(c, o, t + 0.1 + i * 0.18 + Math.random() * 0.1, { type: "triangle", f: 500 + Math.random() * 300, f2: 900 + Math.random() * 400, peak: 0.035, a: 0.03, d: 0.2 });
  },
  bleat: (c, o, t) => {
    // a goat: a nasal, wobbling "meh-eh"
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.linearRampToValueAtTime(380, t + 0.5);
    const lfo = c.createOscillator();
    lfo.frequency.value = 11;
    const depth = c.createGain();
    depth.gain.value = 30;
    lfo.connect(depth).connect(osc.frequency);
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1100;
    f.Q.value = 1.5;
    const g = env(c, t, 0.1, 0.04, 0.5);
    osc.connect(f).connect(g).connect(o);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.6);
    lfo.stop(t + 0.6);
  },
  templebell: (c, o, t) => {
    // the mandir's big bell: a low strike with long, beating partials, rung twice
    for (const k of [0, 1.1]) for (const [m, a, d] of [[1, 1, 3.2], [2.02, 0.5, 2.4], [2.97, 0.32, 1.8], [4.13, 0.2, 1.2], [5.4, 0.12, 0.8]] as const) tone(c, o, t + k, { f: 196 * m, peak: 0.16 * a, a: 0.004, d });
  },
  rooster: (c, o, t) => {
    // kuk-kuk-kukooo: a few rising, nasal calls
    const call = (t0: number, f0: number, f1: number, d: number) => {
      const osc = c.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f0, t0);
      osc.frequency.linearRampToValueAtTime(f1, t0 + d * 0.7);
      osc.frequency.linearRampToValueAtTime(f0 * 0.9, t0 + d);
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1400;
      f.Q.value = 2;
      const g = env(c, t0, 0.16, 0.02, d);
      osc.connect(f).connect(g).connect(o);
      osc.start(t0);
      osc.stop(t0 + d + 0.05);
    };
    call(t, 520, 640, 0.14);
    call(t + 0.2, 540, 680, 0.14);
    call(t + 0.42, 560, 900, 0.75);
  },
  ripe: (c, o, t) => {
    // a soft two-note chime: something in your field is ready
    bell(c, o, t, 1046, 0.1);
    bell(c, o, t + 0.16, 1568, 0.09);
  },
  cricket: (c, o, t) => {
    for (let i = 0; i < 3; i++) tone(c, o, t + i * 0.05, { type: "sine", f: 4400 + Math.random() * 200, peak: 0.018, a: 0.004, d: 0.03 });
  },
};

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wind: GainNode | null = null;
  volume = 0.8;
  private nextAmbient = 0;

  /** Browsers only allow sound after a click or key press. */
  unlock() {
    if (this.ctx) return void this.ctx.resume();
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    // a soft bed of wind through the neem trees
    const n = noise(this.ctx);
    n.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 420;
    this.wind = this.ctx.createGain();
    this.wind.gain.value = 0.02;
    n.connect(f).connect(this.wind).connect(this.master);
    n.start();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  play(name: string, v?: number) {
    const fx = SOUNDS[name];
    if (!fx || !this.ctx || !this.master || this.volume <= 0) return;
    fx(this.ctx, this.master, this.ctx.currentTime + 0.005, v);
  }

  /** Birds by day, crickets at night, now and then a bull lowing. Call every frame. */
  ambience(hour: number, nearBulls: boolean) {
    if (!this.ctx || this.volume <= 0) return;
    const now = this.ctx.currentTime;
    if (now < this.nextAmbient) return;
    const night = hour < 5.5 || hour > 19.5;
    const dusk = hour > 17.5 && hour <= 19.5;
    if (night) {
      this.play("cricket");
      this.nextAmbient = now + 0.4 + Math.random() * 0.8;
    } else {
      this.play(Math.random() < 0.08 && nearBulls ? "moo" : "chirp");
      this.nextAmbient = now + (dusk ? 1.5 : 2.5) + Math.random() * 4;
    }
    if (this.wind) this.wind.gain.value = night ? 0.012 : 0.02;
  }
}

/** Render one sound offline and measure it — used by the self-test. */
export async function renderRms(name: string): Promise<number> {
  const c = new OfflineAudioContext(1, 44100 * 1.2, 44100);
  SOUNDS[name](c, c.destination, 0.01);
  const buf = await c.startRendering();
  const d = buf.getChannelData(0);
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return Math.sqrt(s / d.length);
}
