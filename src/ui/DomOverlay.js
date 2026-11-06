// 2D page layer: device detection info, VR entry buttons (WebXR / WebVR / Cardboard / screen),
// e-mail login & sign-up (typing is impractical inside a headset), and touch controls for phones.
import { settings } from '../core/Settings.js';
import { bus } from '../core/EventBus.js';
import { audio } from '../audio/AudioEngine.js';

const $ = (id) => document.getElementById(id);

export class DomOverlay {
  constructor(game) {
    this.game = game;
    this.caps = game.caps;
    this.started = false;
  }

  init() {
    const caps = this.caps;
    const dev = caps.isOculusGo ? 'Oculus Go detected' : caps.isQuest ? 'Meta Quest detected' : caps.isMobile ? 'Phone / tablet detected' : 'Desktop detected';
    $('device-info').textContent = dev + ' - WebXR: ' + (caps.webxrVR ? 'yes' : 'no') + ' - WebVR: ' + (caps.webvr ? 'yes' : 'no') +
      ' - quality: ' + this.game.tier + (caps.webgl2 ? '' : ' (WebGL1)');
    const box = $('vr-buttons');
    const add = (label, fn, primary) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (primary) b.className = 'primary';
      b.addEventListener('click', async () => {
        audio.unlock();
        try { await fn(); this.hide(); } catch (e) { this.msg('Could not start: ' + (e.message || e)); }
      });
      box.appendChild(b);
      return b;
    };
    if (caps.webxrVR) add('ENTER VR', () => this.game.enterVR('webxr'), true);
    if (caps.webvr) add(caps.webxrVR ? 'ENTER VR (legacy WebVR)' : 'ENTER VR', () => this.game.enterVR('webvr'), !caps.webxrVR);
    if (caps.isMobile && caps.deviceOrientation && !caps.isOculusBrowser) add('CARDBOARD / VR BOX', () => this.game.enterVR('cardboard'), !caps.webxrVR && !caps.webvr);
    add('PLAY ON SCREEN', async () => { this.game.menu.open(); }, !caps.webxrVR && !caps.webvr && !caps.isMobile);

    const q = $('quality');
    q.value = settings.get('quality');
    q.addEventListener('change', () => { settings.set('quality', q.value); location.reload(); });

    $('btn-signin').addEventListener('click', () => this._auth('signin'));
    $('btn-signup').addEventListener('click', () => this._auth('signup'));
    $('btn-guest').addEventListener('click', () => this._auth('guest'));
    $('btn-signout').addEventListener('click', () => this._auth('signout'));
    const nameInput = $('p2p-name-input');
    nameInput.value = this.game.profile ? this.game.profile.username : '';
    nameInput.addEventListener('change', async () => {
      const n = nameInput.value.trim().replace(/[^A-Za-z0-9_]/g, '').slice(0, 20);
      if (n.length < 3) { this.msg('Name: 3-20 letters, digits or _'); return; }
      await this.game.backend.setUsername(n);
      await this.game.refreshProfile();
      nameInput.value = n;
      this.msg('Saved: ' + n);
    });
    $('btn-show-overlay').addEventListener('click', () => this.show());
    bus.on('auth', () => this._renderAccount());
    bus.on('profile', () => this._renderAccount());
    bus.on('vr-mode-ui', (mode) => { if (mode === 'flat' && this.started) this.show(); else this.hide(); });
    this._renderAccount();
    this._touchControls();
    this._pointerLock();
    this.show();
  }

  msg(t) { $('auth-msg').textContent = t || ''; }
  show() { $('overlay').classList.remove('hidden'); $('flat-ui').classList.add('hidden'); this.game.input.releasePointerLock(); }
  hide() {
    this.started = true;
    $('overlay').classList.add('hidden');
    const flat = this.game.vr.mode === 'flat';
    $('flat-ui').classList.toggle('hidden', !flat);
    $('touch-controls').classList.toggle('hidden', !(flat && this.caps.touch));
  }

  _renderAccount() {
    const auth = this.game.auth;
    const p = this.game.profile;
    const form = $('auth-form');
    if (!auth.configured) {
      $('account-status').textContent = 'No account needed: progress is saved on this device and multiplayer duels connect players directly (peer-to-peer). Choose your player name:';
      form.classList.add('hidden');
      $('p2p-name').classList.remove('hidden');
      $('btn-signout').classList.add('hidden');
      return;
    }
    if (auth.isLoggedIn) {
      $('account-status').textContent = 'Signed in as ' + (p ? p.username : '...') + (auth.user.is_anonymous ? ' (guest)' : ' (' + (auth.user.email || '') + ')') + ' - ONLINE';
      form.classList.add('hidden');
      $('btn-signout').classList.remove('hidden');
    } else {
      $('account-status').textContent = 'Not signed in - playing offline. Sign in to save progress online, rank and duel.';
      form.classList.remove('hidden');
      $('btn-signout').classList.add('hidden');
    }
  }

  async _auth(kind) {
    const auth = this.game.auth;
    const email = $('auth-email').value.trim();
    const pw = $('auth-password').value;
    const user = $('auth-username').value.trim().replace(/[^A-Za-z0-9_]/g, '').slice(0, 20);
    this.msg('...');
    try {
      if (kind === 'signin') await auth.signIn(email, pw);
      else if (kind === 'signup') {
        if (user.length < 3) throw new Error('Username must have 3-20 letters, digits or _');
        const r = await auth.signUp(email, pw, user);
        if (!r.session) { this.msg('Check your e-mail to confirm the account, then sign in.'); return; }
      } else if (kind === 'guest') await auth.signInGuest(user.length >= 3 ? user : 'Angler');
      else if (kind === 'signout') await this.game.signOut();
      this.msg(kind === 'signout' ? 'Signed out.' : 'Welcome!');
    } catch (e) {
      this.msg(e.message || String(e));
    }
  }

  _pointerLock() {
    const canvas = this.game.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (this.game.vr.mode !== 'flat' || this.caps.touch) return;
      if (this.game.menu.isOpen || this.game.catchCard.open) return;
      if (!this.game.input.pointerLocked) this.game.input.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => document.body.classList.toggle('locked', !!document.pointerLockElement));
    bus.on('menu-open', () => this.game.input.releasePointerLock());
  }

  _touchControls() {
    const v = this.game.input.virtual;
    const joy = $('joystick'), stick = $('stick');
    let jid = null, jx = 0, jy = 0;
    const setStick = (x, y) => { stick.style.transform = `translate(${x * 45}px, ${y * 45}px)`; v.moveX = x; v.moveY = y; };
    joy.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; jid = t.identifier; const r = joy.getBoundingClientRect(); jx = r.left + r.width / 2; jy = r.top + r.height / 2; e.preventDefault(); }, { passive: false });
    joy.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === jid) {
        let x = (t.clientX - jx) / 60, y = (t.clientY - jy) / 60;
        const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
        setStick(x, y);
      }
      e.preventDefault();
    }, { passive: false });
    const endJ = (e) => { for (const t of e.changedTouches) if (t.identifier === jid) { jid = null; setStick(0, 0); } };
    joy.addEventListener('touchend', endJ); joy.addEventListener('touchcancel', endJ);
    const look = $('look-area');
    let lid = null, lx = 0, ly = 0, moved = 0;
    look.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; lid = t.identifier; lx = t.clientX; ly = t.clientY; moved = 0; e.preventDefault(); }, { passive: false });
    look.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === lid) { v.lookDX += t.clientX - lx; v.lookDY += t.clientY - ly; moved += Math.abs(t.clientX - lx) + Math.abs(t.clientY - ly); lx = t.clientX; ly = t.clientY; }
      e.preventDefault();
    }, { passive: false });
    look.addEventListener('touchend', (e) => {
      // a short tap on the look area acts as a UI click (trigger tap)
      if (moved < 8) { v.trigger = true; setTimeout(() => { v.trigger = false; }, 90); }
      lid = null; void e;
    });
    const hold = (id, key) => {
      const b = $(id);
      b.addEventListener('touchstart', (e) => { v[key] = true; audio.unlock(); e.preventDefault(); }, { passive: false });
      b.addEventListener('touchend', (e) => { v[key] = false; e.preventDefault(); }, { passive: false });
      b.addEventListener('mousedown', () => { v[key] = true; });
      b.addEventListener('mouseup', () => { v[key] = false; });
    };
    hold('btn-action', 'trigger');
    hold('btn-menu', 'menu');
    hold('btn-crouch', 'crouch');
  }
}
