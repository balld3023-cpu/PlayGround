/* Procedural WebAudio sound engine — zero asset downloads. */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.7;
    this.noise = null;
    this.engine = null;
    this.ambient = null;
    this._lastShot = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? this.volume : 0;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startAmbient();
    } catch (e) { this.enabled = false; }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.05);
  }

  _now() { return this.ctx ? this.ctx.currentTime : 0; }
  _ready() { return this.ctx && this.enabled; }

  tone(freq = 440, dur = 0.1, type = 'sine', gain = 0.15, slideTo = null, delay = 0) {
    if (!this._ready()) return;
    const t = this._now() + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noiseBurst(freq = 1200, dur = 0.15, gain = 0.25, q = 0.8, type = 'bandpass', slideTo = null, delay = 0) {
    if (!this._ready()) return;
    const t = this._now() + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.01);
  }

  shot(kind = 'ar', dist = 0) {
    if (!this._ready()) return;
    const vol = Math.max(0.03, 1 - dist / 170);
    switch (kind) {
      case 'sniper':
        this.noiseBurst(1800, 0.3, 0.5 * vol, 0.6);
        this.tone(90, 0.32, 'sawtooth', 0.3 * vol, 38);
        this.noiseBurst(400, 0.5, 0.14 * vol, 0.5, 'lowpass');
        break;
      case 'shotgun':
        this.noiseBurst(900, 0.26, 0.5 * vol, 0.5);
        this.tone(70, 0.24, 'square', 0.3 * vol, 32);
        break;
      case 'smg':
        this.noiseBurst(1900, 0.07, 0.26 * vol, 1);
        this.tone(140, 0.06, 'square', 0.12 * vol, 60);
        break;
      case 'pistol':
        this.noiseBurst(1500, 0.11, 0.32 * vol, 0.8);
        this.tone(120, 0.1, 'square', 0.14 * vol, 48);
        break;
      case 'lmg':
        this.noiseBurst(1100, 0.13, 0.35 * vol, 0.7);
        this.tone(95, 0.12, 'sawtooth', 0.18 * vol, 42);
        break;
      default:
        this.noiseBurst(1400, 0.1, 0.3 * vol, 0.8);
        this.tone(110, 0.09, 'square', 0.15 * vol, 46);
    }
  }

  hit(head = false) {
    if (!this._ready()) return;
    this.tone(head ? 1600 : 900, 0.07, 'triangle', head ? 0.22 : 0.13, head ? 1200 : 700);
    if (head) this.tone(2400, 0.1, 'sine', 0.1, 1800, 0.02);
  }
  kill() { this.tone(700, 0.12, 'triangle', 0.14); this.tone(1100, 0.18, 'triangle', 0.12, 1500, 0.07); }
  reload() {
    this.noiseBurst(2600, 0.05, 0.14, 2); this.noiseBurst(1200, 0.07, 0.12, 2, 'bandpass', null, 0.18);
    this.tone(220, 0.04, 'square', 0.05, 130, 0.34);
  }
  equip() { this.noiseBurst(1800, 0.06, 0.12, 2); this.tone(320, 0.05, 'triangle', 0.05, 440); }
  pickup() { this.tone(620, 0.07, 'sine', 0.12); this.tone(930, 0.1, 'sine', 0.1, 1100, 0.06); }
  empty() { this.tone(180, 0.03, 'square', 0.08); }
  heal() { this.tone(420, 0.18, 'sine', 0.1, 620); this.tone(880, 0.2, 'sine', 0.06, 1200, 0.12); }
  shield() { this.tone(320, 0.25, 'triangle', 0.09, 780); this.tone(980, 0.3, 'sine', 0.05, 1400, 0.08); }
  land() { this.noiseBurst(280, 0.35, 0.3, 0.4, 'lowpass'); this.tone(55, 0.3, 'sine', 0.3, 28); }
  step(vol = 1) { this.noiseBurst(260 + Math.random() * 120, 0.05, 0.05 * vol, 1.5, 'lowpass'); }
  zone() { this.tone(440, 0.2, 'sine', 0.1); this.tone(330, 0.3, 'sine', 0.1, 280, 0.22); }
  warn() { this.tone(180, 0.18, 'triangle', 0.14, 140); this.tone(180, 0.18, 'triangle', 0.14, 140, 0.28); }
  airdrop() { this.tone(620, 0.15, 'triangle', 0.1); this.tone(830, 0.2, 'triangle', 0.1, 620, 0.16); }
  victory() {
    if (!this._ready()) return;
    const seq = [523, 659, 784, 1046];
    seq.forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.12, null, i * 0.14));
    this.tone(261, 1.2, 'sine', 0.1, null, 0.1);
  }
  defeat() {
    if (!this._ready()) return;
    const seq = [392, 349, 294, 220];
    seq.forEach((f, i) => this.tone(f, 0.5, 'sine', 0.1, f * 0.94, i * 0.18));
  }
  click() { this.tone(780, 0.03, 'square', 0.035); }
  ability() {
    if (!this._ready()) return;
    this.tone(300, 0.24, 'sine', 0.1, 760);
    this.tone(600, 0.34, 'triangle', 0.08, 1200, 0.06);
    this.noiseBurst(2400, 0.18, 0.1, 2.2, 'bandpass', 900);
  }

  parachute() { this.noiseBurst(700, 0.6, 0.2, 0.4, 'lowpass', 300); }

  startEngine() {
    if (!this._ready() || this.engine) return;
    const t = this._now();
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
    const o2 = this.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 27;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = this.ctx.createGain(); g.gain.value = 0.0001;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
    o.start(); o2.start();
    this.engine = { o, o2, g, f };
  }
  engineSpeed(speed) {
    if (!this.engine) return;
    const t = this._now();
    this.engine.o.frequency.setTargetAtTime(48 + speed * 3.2, t, 0.12);
    this.engine.o2.frequency.setTargetAtTime(22 + speed * 1.6, t, 0.12);
    this.engine.g.gain.setTargetAtTime(this.enabled ? 0.035 + Math.min(speed, 30) * 0.0015 : 0, t, 0.14);
  }
  stopEngine() {
    if (!this.engine) return;
    const { o, o2, g } = this.engine;
    try { g.gain.setTargetAtTime(0.0001, this._now(), 0.1); o.stop(this._now() + 0.35); o2.stop(this._now() + 0.35); } catch {}
    this.engine = null;
  }

  startAmbient() {
    if (!this._ready() || this.ambient) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 0.3;
    const g = this.ctx.createGain(); g.gain.value = 0.012;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = this.ctx.createGain(); lg.gain.value = 0.006;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    this.ambient = { src, lfo };
  }
}

export const audio = new AudioEngine();
