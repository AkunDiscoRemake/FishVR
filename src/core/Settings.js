// Persistent player settings (localStorage).
import { bus } from './EventBus.js';

const KEY = 'pfvr.settings.v1';
const DEFAULTS = {
  quality: 'auto', // auto | low | medium | high
  turnMode: 'snap', // snap | smooth
  snapAngle: 30,
  smoothTurnSpeed: 90,
  moveSpeed: 1.6,
  moveRelativeTo: 'head', // head | controller
  vignette: true,
  handedness: 'right',
  crouchMode: 'center-click', // center-click | double-click | off
  crouchDepth: 0.55,
  touchpadMove: 'touch', // touch | click (Go: move only while touchpad is clicked)
  masterVolume: 0.9,
  sfxVolume: 1.0,
  ambientVolume: 0.7,
  haptics: true,
  showGuide: true,
  cardboardIpd: 0.064,
  cardboardFov: 90,
  cardboardDistortion: 0.22,
  playerHeight: 1.65,
};

export class Settings {
  constructor() {
    this.values = Object.assign({}, DEFAULTS);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.values, JSON.parse(raw));
    } catch (e) { /* storage blocked */ }
  }
  get(k) { return this.values[k]; }
  set(k, v) {
    this.values[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch (e) { /* ignore */ }
    bus.emit('settings', { key: k, value: v });
  }
  cycle(k, options) {
    const i = options.indexOf(this.values[k]);
    this.set(k, options[(i + 1) % options.length]);
    return this.values[k];
  }
}
export const settings = new Settings();
