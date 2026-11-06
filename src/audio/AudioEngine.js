// Procedural WebAudio sound: no audio files needed. Ambient beds per world
// (water lapping, wind, birds, gulls, surf, river rush, deep drones), rod/line/reel
// sounds driven by physics, splashes, UI and a distinct jingle for every PERFECT! rating.
import { settings } from '../core/Settings.js';
import { bus } from '../core/EventBus.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.ambientNodes = [];
    this.timers = [];
    this.reelLevel = 0;
    this.tension = 0;
    bus.on('settings', () => this._applyVolumes());
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.connect(this.master);
    this._applyVolumes();
    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // continuous line-tension whine + reel clicker
    this.tensionOsc = ctx.createOscillator();
    this.tensionOsc.type = 'sawtooth';
    this.tensionFilter = ctx.createBiquadFilter();
    this.tensionFilter.type = 'bandpass';
    this.tensionFilter.Q.value = 8;
    this.tensionGain = ctx.createGain();
    this.tensionGain.gain.value = 0;
    this.tensionOsc.connect(this.tensionFilter).connect(this.tensionGain).connect(this.sfx);
    this.tensionOsc.start();
    this.ready = true;
    this._clickAcc = 0;
    if (this.pendingAmbience) this.setAmbience(this.pendingAmbience);
  }

  _applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = settings.get('masterVolume');
    this.sfx.gain.value = settings.get('sfxVolume');
    this.amb.gain.value = settings.get('ambientVolume');
  }

  _noiseSource(loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    return s;
  }

  _env(gainNode, t, attack, peak, decay) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, dest) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    o.connect(g).connect(dest || this.sfx);
    this._env(g, t, 0.008, vol, dur);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  sweep(f0, f1, dur, type = 'sine', vol = 0.2, when = 0, dest) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    o.connect(g).connect(dest || this.sfx);
    this._env(g, t, 0.01, vol, dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst(dur, freq, q, vol, when = 0, type = 'bandpass', sweepTo, dest) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const s = this._noiseSource(false);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    s.connect(f).connect(g).connect(dest || this.sfx);
    this._env(g, t, 0.005, vol, dur);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ game sounds
  ui() { this.tone(1200, 0.05, 'triangle', 0.08); }
  hover() { this.tone(1800, 0.025, 'sine', 0.03); }
  cast(power) { this.noiseBurst(0.35 + power * 0.3, 900, 1.2, 0.25 + power * 0.25, 0, 'bandpass', 3500); }
  splash(size = 1) {
    this.noiseBurst(0.25 + size * 0.35, 1400, 0.7, 0.35 * Math.min(1.5, size), 0, 'lowpass', 300);
    this.sweep(600 + Math.random() * 200, 140, 0.12, 'sine', 0.18 * Math.min(1.5, size));
  }
  plop() { this.sweep(900, 250, 0.08, 'sine', 0.15); }
  bite() { this.sweep(500, 120, 0.15, 'sine', 0.3); this.noiseBurst(0.3, 600, 1, 0.3, 0.02, 'lowpass', 200); }
  strike() { this.noiseBurst(0.12, 2500, 3, 0.3); this.tone(220, 0.15, 'square', 0.08); }
  snap() { this.noiseBurst(0.08, 4000, 1, 0.6, 0, 'highpass'); this.sweep(2000, 200, 0.3, 'sawtooth', 0.12, 0.02); }
  escape() { this.sweep(440, 180, 0.5, 'triangle', 0.15); }
  catchFanfare(rarity) {
    const base = { C: 523, U: 587, R: 659, E: 698, L: 784 }[rarity] || 523;
    const notes = [1, 1.25, 1.5, 2, 1.5, 2];
    notes.forEach((m, i) => this.tone(base * m, 0.22, 'triangle', 0.16, i * 0.11));
    if (rarity === 'E' || rarity === 'L') notes.forEach((m, i) => this.tone(base * m * 2, 0.3, 'sine', 0.08, 0.66 + i * 0.09));
  }
  newDiscovery() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.18, 'sine', 0.12, i * 0.08)); }
  purchase() { [660, 880, 1320].forEach((f, i) => this.tone(f, 0.12, 'square', 0.06, i * 0.07)); }
  error() { this.tone(160, 0.25, 'square', 0.1); }
  countdown(final) { this.tone(final ? 1320 : 880, final ? 0.4 : 0.15, 'square', 0.12); }

  rating(key) {
    switch (key) {
      case 'PERFECT':
        [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.17, i * 0.045));
        this.noiseBurst(0.4, 7000, 2, 0.12, 0.05, 'highpass');
        this.tone(2637, 0.35, 'sine', 0.07, 0.2);
        break;
      case 'AMAZING': [880, 1109, 1319].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.14, i * 0.05)); break;
      case 'GOOD': [784, 988].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.12, i * 0.06)); break;
      case 'NOTGOOD': this.tone(523, 0.16, 'sine', 0.1); break;
      case 'BAD': this.tone(330, 0.12, 'square', 0.08); this.tone(262, 0.18, 'square', 0.08, 0.1); break;
      case 'FAILED': this.sweep(200, 70, 0.4, 'sawtooth', 0.14); break;
      default: break;
    }
  }

  /** Continuous rod/line state, call every frame. reel: 0..1 reeling speed, tension 0..1. */
  updateLine(dt, reel, tension) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const tg = tension > 0.35 ? Math.pow((tension - 0.35) / 0.65, 2) * 0.12 : 0;
    this.tensionGain.gain.setTargetAtTime(tg, t, 0.05);
    this.tensionOsc.frequency.setTargetAtTime(110 + tension * 260, t, 0.05);
    this.tensionFilter.frequency.setTargetAtTime(500 + tension * 1800, t, 0.05);
    if (reel > 0.02) {
      this._clickAcc += dt * (8 + reel * 40);
      while (this._clickAcc > 1) {
        this._clickAcc -= 1;
        this.noiseBurst(0.012, 3800 + Math.random() * 800, 4, 0.05 + reel * 0.05);
      }
    }
  }

  // ------------------------------------------------------------ ambience
  stopAmbience() {
    for (const n of this.ambientNodes) { try { n.stop(); } catch (e) { /* ignore */ } }
    this.ambientNodes = [];
    for (const id of this.timers) clearTimeout(id);
    this.timers = [];
  }

  _bed(freq, q, vol, type = 'lowpass', lfoRate = 0.15, lfoDepth = 0.5) {
    const ctx = this.ctx;
    const s = this._noiseSource(true);
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = vol;
    const lfo = ctx.createOscillator(); lfo.frequency.value = lfoRate;
    const lg = ctx.createGain(); lg.gain.value = vol * lfoDepth;
    lfo.connect(lg).connect(g.gain);
    s.connect(f).connect(g).connect(this.amb);
    s.start(0, Math.random() * 2); lfo.start();
    this.ambientNodes.push(s, lfo);
  }

  _repeat(fn, minS, maxS) {
    const loop = () => {
      fn();
      this.timers.push(setTimeout(loop, (minS + Math.random() * (maxS - minS)) * 1000));
    };
    this.timers.push(setTimeout(loop, Math.random() * maxS * 1000));
  }

  _bird() {
    const base = 2200 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) this.sweep(base, base * (1.2 + Math.random() * 0.4), 0.07, 'sine', 0.035, i * 0.11, this.amb);
  }
  _gull() {
    for (let i = 0; i < 3; i++) this.sweep(1400, 700, 0.22, 'sawtooth', 0.02, i * 0.3, this.amb);
  }
  _lap() { this.noiseBurst(0.5, 500, 0.8, 0.08, 0, 'lowpass', 200, this.amb); }
  _sonar() { this.tone(1200, 1.6, 'sine', 0.03, 0, this.amb); this.tone(1200, 1.6, 'sine', 0.012, 0.9, this.amb); }
  _frog() { for (let i = 0; i < 3; i++) this.tone(140 + Math.random() * 30, 0.08, 'square', 0.02, i * 0.12, this.amb); }

  setAmbience(kind) {
    if (!this.ready) { this.pendingAmbience = kind; return; }
    this.stopAmbience();
    switch (kind) {
      case 'lake':
        this._bed(420, 0.6, 0.05, 'lowpass', 0.2, 0.6);
        this._bed(1200, 0.5, 0.012, 'bandpass', 0.05, 0.8);
        this._repeat(() => this._bird(), 2, 7);
        this._repeat(() => this._lap(), 1.5, 4);
        this._repeat(() => this._frog(), 6, 15);
        break;
      case 'river':
        this._bed(900, 0.4, 0.12, 'lowpass', 0.3, 0.2);
        this._bed(2600, 0.7, 0.03, 'bandpass', 0.6, 0.4);
        this._repeat(() => this._bird(), 4, 10);
        break;
      case 'ocean':
        this._bed(500, 0.5, 0.14, 'lowpass', 0.09, 0.9);
        this._bed(3000, 0.4, 0.02, 'highpass', 0.11, 0.9);
        this._repeat(() => this._gull(), 5, 14);
        break;
      case 'tropical':
        this._bed(600, 0.5, 0.1, 'lowpass', 0.12, 0.85);
        this._repeat(() => this._bird(), 1.5, 5);
        this._repeat(() => this._lap(), 2, 5);
        break;
      case 'deep':
        this._bed(160, 1.2, 0.08, 'lowpass', 0.05, 0.6);
        this._bed(700, 0.4, 0.04, 'lowpass', 0.08, 0.9);
        this._repeat(() => this._sonar(), 8, 18);
        this._repeat(() => this._lap(), 2, 5);
        break;
      default: break;
    }
  }
}
export const audio = new AudioEngine();
