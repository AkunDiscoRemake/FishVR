import { COLORS } from '../Panel.js';
import { settings } from '../../core/Settings.js';

const ROWS = [
  { key: 'quality', label: 'Graphics quality', options: ['auto', 'low', 'medium', 'high'], note: 'reload' },
  { key: 'turnMode', label: 'Turning', options: ['snap', 'smooth'] },
  { key: 'snapAngle', label: 'Snap angle', options: [15, 30, 45, 60, 90] },
  { key: 'moveSpeed', label: 'Walk speed (m/s)', options: [0.8, 1.2, 1.6, 2.2, 3.0] },
  { key: 'moveRelativeTo', label: 'Walk direction', options: ['head', 'controller'] },
  { key: 'touchpadMove', label: 'Touchpad walking', options: ['touch', 'click'] },
  { key: 'crouchMode', label: 'Crouch gesture', options: ['center-click', 'double-click', 'off'] },
  { key: 'vignette', label: 'Comfort vignette', options: [true, false] },
  { key: 'handedness', label: 'Rod hand', options: ['right', 'left'] },
  { key: 'haptics', label: 'Haptics', options: [true, false] },
  { key: 'showGuide', label: 'PERFECT! guide ring', options: [true, false] },
  { key: 'masterVolume', label: 'Master volume', options: [0, 0.25, 0.5, 0.75, 0.9, 1] },
  { key: 'ambientVolume', label: 'Ambience volume', options: [0, 0.25, 0.5, 0.7, 1] },
  { key: 'sfxVolume', label: 'Effects volume', options: [0, 0.25, 0.5, 0.75, 1] },
  { key: 'playerHeight', label: 'Player height (3DoF)', options: [1.2, 1.4, 1.55, 1.65, 1.75, 1.85] },
  { key: 'cardboardIpd', label: 'Cardboard IPD', options: [0.058, 0.061, 0.064, 0.067, 0.07] },
  { key: 'cardboardFov', label: 'Cardboard FOV', options: [70, 80, 90, 100] },
  { key: 'cardboardDistortion', label: 'Cardboard lens distortion', options: [0, 0.12, 0.22, 0.32, 0.42] },
];

function fmt(v) { return v === true ? 'ON' : v === false ? 'OFF' : String(v).toUpperCase(); }

export class SettingsScreen {
  constructor(menu) { this.menu = menu; this.title = 'SETTINGS'; this.page = 0; }
  draw(g, W, H) {
    const m = this.menu, game = m.game;
    const per = 9, pages = Math.ceil(ROWS.length / per);
    ROWS.slice(this.page * per, this.page * per + per).forEach((r, i) => {
      const y = 108 + i * 54;
      g.rect(30, y, 640, 48, COLORS.panel, 12);
      g.text(r.label, 50, y + 24, { size: 22 });
      const v = settings.get(r.key);
      const idx = r.options.indexOf(v);
      const step = (d) => {
        const n = r.options[(Math.max(0, idx) + d + r.options.length) % r.options.length];
        settings.set(r.key, n);
        if (r.note === 'reload') m.flash('Quality applies after reloading the page.', COLORS.accent);
        m.refresh();
      };
      g.button(390, y + 4, 56, 40, '<', () => step(-1), { size: 24 });
      g.text(fmt(v), 520, y + 24, { size: 22, align: 'center', weight: 800, color: COLORS.accent2 });
      g.button(596, y + 4, 56, 40, '>', () => step(1), { size: 24 });
    });
    g.button(30, 600 - 30, 110, 50, '<', () => { this.page = (this.page - 1 + pages) % pages; m.refresh(); }, { size: 28 });
    g.text('page ' + (this.page + 1) + ' / ' + pages, 350, 596, { size: 22, align: 'center' });
    g.button(560, 600 - 30, 110, 50, '>', () => { this.page = (this.page + 1) % pages; m.refresh(); }, { size: 28 });

    const x = 700, w = W - x - 30;
    g.rect(x, 108, w, 512, COLORS.panel, 16);
    g.text('ACCOUNT', x + 20, 140, { size: 24, weight: 800 });
    const auth = game.auth;
    if (!auth.configured) {
      g.wrap('Online server not configured. Playing offline (see SUPABASE_SETUP.md).', x + 20, 180, w - 40, 28, { size: 19, color: COLORS.dim });
    } else if (auth.isLoggedIn) {
      g.text(game.profile ? game.profile.username : '', x + 20, 180, { size: 22, color: COLORS.good, maxWidth: w - 40 });
      g.text(auth.user.is_anonymous ? 'Guest account' : (auth.user.email || ''), x + 20, 212, { size: 18, color: COLORS.dim, maxWidth: w - 40 });
      g.button(x + 20, 240, w - 40, 56, 'SIGN OUT', () => m.run(() => game.signOut(), 'Signed out. Playing offline.'), { size: 24 });
    } else {
      g.wrap('Sign in with e-mail on the 2D page, or play online now as a guest:', x + 20, 180, w - 40, 26, { size: 18, color: COLORS.dim });
      g.button(x + 20, 240, w - 40, 56, 'PLAY AS GUEST', () => m.run(() => game.signInGuest(), 'Signed in as guest!'), { size: 22, color: '#1f7a3a' });
    }
    g.text('DEVICE', x + 20, 340, { size: 24, weight: 800 });
    const caps = game.caps;
    const dev = caps.isOculusGo ? 'Oculus Go' : caps.isQuest ? 'Meta Quest' : caps.isMobile ? 'Phone' : 'Desktop';
    g.text(dev + '  |  ' + game.vr.mode.toUpperCase(), x + 20, 376, { size: 20 });
    g.text('Quality tier: ' + game.tier.toUpperCase(), x + 20, 406, { size: 20 });
    g.text('WebXR ' + (caps.webxrVR ? 'yes' : 'no') + '  WebVR ' + (caps.webvr ? 'yes' : 'no'), x + 20, 436, { size: 20, color: COLORS.dim });
    g.text(Math.round(game.fps) + ' fps', x + 20, 466, { size: 20, color: COLORS.dim });
    g.button(x + 20, 540, w - 40, 56, 'RECENTER VIEW', () => game.recenter(), { size: 22 });
  }
}
