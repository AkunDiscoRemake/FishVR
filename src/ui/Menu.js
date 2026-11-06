// The immersive 3D menu: a large curved-feel panel placed in front of the player,
// a preview stand for 3D fish / rod models, and a stack of screens.
import * as THREE from 'three';
import { Panel, COLORS } from './Panel.js';
import { MainMenuScreen } from './screens/MainMenuScreen.js';
import { PlayScreen } from './screens/PlayScreen.js';
import { CollectionScreen } from './screens/CollectionScreen.js';
import { ShopScreen } from './screens/ShopScreen.js';
import { InventoryScreen } from './screens/InventoryScreen.js';
import { LeaderboardScreen } from './screens/LeaderboardScreen.js';
import { SettingsScreen } from './screens/SettingsScreen.js';
import { MultiplayerScreen } from './screens/MultiplayerScreen.js';

export class Menu {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.name = 'menu';
    this.root.visible = false;
    game.scene.add(this.root);
    this.panel = game.ui.add(new Panel('menu', 1.7, 1.05, 650));
    this.panel.mesh.position.set(0, 0, -1.75);
    this.root.add(this.panel.mesh);
    this.preview = new THREE.Group();
    this.preview.position.set(1.25, -0.05, -1.55);
    this.preview.rotation.y = -0.5;
    this.root.add(this.preview);
    const light = new THREE.PointLight(0xffffff, 3, 4, 1.5);
    light.position.set(1.0, 0.6, -1.0);
    this.root.add(light);
    this.screens = {
      main: new MainMenuScreen(this), play: new PlayScreen(this), collection: new CollectionScreen(this),
      shop: new ShopScreen(this), inventory: new InventoryScreen(this), leaderboard: new LeaderboardScreen(this),
      settings: new SettingsScreen(this), multiplayer: new MultiplayerScreen(this),
    };
    this.stack = ['main'];
    this.panel.setDraw((g, W, H) => this._draw(g, W, H));
    this.busy = false;
    this.message = null;
  }

  get current() { return this.screens[this.stack[this.stack.length - 1]]; }
  get isOpen() { return this.root.visible; }

  open(screen) {
    const g = this.game;
    // place in front of the player, horizontally
    const head = g.camera.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.getWorldQuaternion(new THREE.Quaternion()));
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    this.root.position.copy(head).add(new THREE.Vector3(0, -0.08, 0));
    this.root.rotation.set(0, yaw, 0);
    this.root.visible = true;
    if (screen) this.go(screen, true);
    else if (this.current.enter) this.current.enter();
    this.refresh();
  }

  close() {
    if (this.current.leave) this.current.leave();
    this.root.visible = false;
    this.clearPreview();
  }

  go(name, reset) {
    if (this.current.leave) this.current.leave();
    if (reset) this.stack = name === 'main' ? ['main'] : ['main', name];
    else this.stack.push(name);
    this.clearPreview();
    this.message = null;
    if (this.current.enter) this.current.enter();
    this.refresh();
  }

  back() {
    if (this.stack.length > 1) {
      if (this.current.leave) this.current.leave();
      this.stack.pop();
      this.clearPreview();
      this.message = null;
      if (this.current.enter) this.current.enter();
      this.refresh();
    } else if (this.game.world) this.close();
  }

  refresh() { this.panel.dirty = true; }

  flash(text, color = COLORS.text) { this.message = { text, color, t: 3.5 }; this.refresh(); }

  /** Runs an async action with a busy indicator and error message. */
  async run(fn, okText) {
    if (this.busy) return;
    this.busy = true; this.refresh();
    try {
      const r = await fn();
      if (okText) this.flash(typeof okText === 'function' ? okText(r) : okText, COLORS.good);
      return r;
    } catch (e) {
      this.flash(this.game.errorText(e.message || String(e)), COLORS.bad);
      this.game.audio.error();
      return null;
    } finally {
      this.busy = false; this.refresh();
    }
  }

  clearPreview() {
    for (const c of [...this.preview.children]) {
      this.preview.remove(c);
      if (c.userData.dispose) c.userData.dispose();
    }
  }
  setPreview(obj, dispose) {
    this.clearPreview();
    obj.userData.dispose = dispose;
    this.preview.add(obj);
  }

  _draw(g, W, H) {
    const game = this.game;
    const p = game.profile;
    g.rect(0, 0, W, H, COLORS.bg, 34);
    g.stroke(2, 2, W - 4, H - 4, 'rgba(46,196,255,0.35)', 3, 34);
    // header
    const scr = this.current;
    if (this.stack.length > 1) g.button(20, 18, 150, 62, '< BACK', () => this.back(), { size: 28 });
    else if (game.world) g.button(20, 18, 190, 62, 'RESUME', () => this.close(), { size: 28, color: '#1f7a3a' });
    g.text(scr.title, W / 2, 50, { size: 40, weight: 900, align: 'center', color: '#ffffff' });
    if (p) {
      g.text(p.coins.toLocaleString() + ' c', W - 28, 36, { size: 28, weight: 800, align: 'right', color: COLORS.accent2 });
      g.text(p.username + '  Lv ' + p.level, W - 28, 70, { size: 22, align: 'right', color: COLORS.dim, maxWidth: 360 });
    }
    g.rect(20, 92, W - 40, 3, 'rgba(255,255,255,0.12)', 1);
    scr.draw(g, W, H);
    if (this.busy) {
      g.rect(W / 2 - 160, H - 70, 320, 50, 'rgba(0,0,0,0.75)', 20);
      g.text('Please wait...', W / 2, H - 45, { size: 26, align: 'center', color: COLORS.accent });
    } else if (this.message) {
      g.rect(40, H - 66, W - 80, 48, 'rgba(0,0,0,0.75)', 20);
      g.text(this.message.text, W / 2, H - 42, { size: 26, align: 'center', color: this.message.color, maxWidth: W - 120 });
    }
  }

  update(dt) {
    if (!this.root.visible) return;
    if (this.message) { this.message.t -= dt; if (this.message.t <= 0) { this.message = null; this.refresh(); } }
    this.preview.rotation.y += dt * 0.5;
    if (this.current.update) this.current.update(dt);
  }
}
