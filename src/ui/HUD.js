// Comfortable "lazy-follow" HUD: a status strip below the view (power meter, fight
// telemetry, menu button) and a prompt banner for big messages / toasts.
import * as THREE from 'three';
import { Panel, COLORS } from './Panel.js';
import { RARITIES } from '@game/constants.js';

export class HUD {
  constructor(scene, camera, ui, onMenu) {
    this.camera = camera;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.status = ui.add(new Panel('hud-status', 1.2, 0.36, 560));
    this.status.mesh.position.set(0, 0, 0);
    this.root.add(this.status.mesh);
    this.prompts = new Panel('hud-prompt', 1.6, 0.4, 420);
    this.prompts.interactive = false;
    this.root.add(this.prompts.mesh);
    this.yaw = 0;
    this.promptText = null; this.promptColor = '#fff'; this.promptT = 0;
    this.toasts = [];
    this.power = null;
    this.fight = null;
    this.info = { coins: 0, level: 1, world: '', event: null, online: false };
    this.onMenu = onMenu;
    this.visible = true;
    this.status.setDraw((g, W, H) => this._drawStatus(g, W, H));
    this.prompts.setDraw((g, W, H) => this._drawPrompt(g, W, H));
    this._acc = 0;
  }

  prompt(text, color = '#ffffff', seconds = 1.5) { this.promptText = text; this.promptColor = color; this.promptT = seconds; this.prompts.dirty = true; }
  toast(text, color = '#e8f4ff', seconds = 3.5) { this.toasts.push({ text, color, t: seconds }); if (this.toasts.length > 3) this.toasts.shift(); this.prompts.dirty = true; }
  setPower(v) { if (v !== this.power) { this.power = v; this.status.dirty = true; } }
  setFight(f) { this.fight = f; }
  setInfo(info) { Object.assign(this.info, info); this.status.dirty = true; }

  _drawStatus(g, W, H) {
    const f = this.fight;
    g.rect(0, 0, W, H, 'rgba(6,16,26,0.72)', 26);
    if (f) {
      const rc = RARITIES[f.species.rarity];
      g.text(f.species.name, 24, 34, { size: 30, weight: 800, color: rc.color, maxWidth: 380 });
      g.text('Score ' + f.score, W - 24, 34, { size: 30, align: 'right', weight: 800, color: '#ffd23f' });
      g.text('PERFECT x' + f.perfects + (f.combo > 1 ? '   combo ' + f.combo : ''), W / 2 + 40, 34, { size: 24, align: 'center', color: '#fff6b0' });
      // tension
      g.text('TENSION', 24, 84, { size: 22, color: COLORS.dim });
      const tc = f.tension > 0.8 ? '#ff4a3a' : f.tension > 0.55 ? '#ffb23a' : '#5ddc5d';
      g.bar(150, 72, W - 180, 24, Math.min(1, f.tension), tc);
      g.text('FISH', 24, 124, { size: 22, color: COLORS.dim });
      g.bar(150, 112, W - 180, 24, f.stamina, '#2ec4ff');
      g.text('LINE', 24, 164, { size: 22, color: COLORS.dim });
      g.bar(150, 152, W - 180, 24, Math.min(1, f.distance / f.maxLine), '#c8c8c8');
      g.text(f.distance.toFixed(1) + ' m', W - 34, 164, { size: 20, align: 'right', color: '#1a1a1a', weight: 800 });
      if (f.countdown !== null && f.countdown !== undefined && f.countdown > 0) {
        g.text('Duel starts in ' + Math.ceil(f.countdown), W / 2, 196, { size: 26, align: 'center', color: '#ffd23f' });
      }
    } else {
      g.text('Lv ' + this.info.level, 24, 40, { size: 30, weight: 800 });
      g.text(this.info.coins.toLocaleString() + ' coins', 150, 40, { size: 30, weight: 800, color: '#ffd23f' });
      g.text(this.info.world, 24, 86, { size: 24, color: COLORS.dim, maxWidth: W - 240 });
      if (this.info.event && this.info.event.id !== 'none') g.text('EVENT: ' + this.info.event.name, 24, 124, { size: 24, color: '#ff9af0', maxWidth: W - 240 });
      g.text(this.info.online ? 'ONLINE' : 'OFFLINE', 24, 166, { size: 20, color: this.info.online ? COLORS.good : COLORS.dim });
      if (this.power !== null && this.power !== undefined) {
        g.text('CAST POWER', W / 2, 150, { size: 22, align: 'center', color: COLORS.dim });
        g.bar(140, 168, W - 280, 22, this.power, this.power > 0.85 ? '#ffd23f' : '#2ec4ff');
      }
    }
    g.button(W - 200, H - 82, 180, 64, 'MENU', () => this.onMenu && this.onMenu(), { size: 30 });
  }

  _drawPrompt(g, W, H) {
    if (this.promptText) {
      g.text(this.promptText, W / 2, 70, { size: 76, weight: 900, align: 'center', color: this.promptColor });
    }
    let y = this.promptText ? 140 : 40;
    for (const t of this.toasts) {
      g.rect(W / 2 - 600, y - 24, 1200, 48, 'rgba(0,0,0,0.55)', 20);
      g.text(t.text, W / 2, y, { size: 28, align: 'center', color: t.color, maxWidth: 1160 });
      y += 54;
    }
  }

  update(dt, hidden) {
    // lazy follow: only re-centre when the view drifts more than 35 degrees
    const q = this.camera.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    let d = yaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) > 0.6 || this._moving) { this._moving = Math.abs(d) > 0.05; this.yaw += d * Math.min(1, dt * 3); }
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    this.root.position.copy(head);
    this.root.rotation.set(0, this.yaw, 0);
    const fighting = !!this.fight;
    this.status.mesh.position.set(0, fighting ? -0.55 : -0.72, -1.35);
    this.status.mesh.rotation.set(-0.45, 0, 0);
    this.prompts.mesh.position.set(0, 0.32, -2.2);
    this.root.visible = !hidden;

    if (this.promptT > 0) { this.promptT -= dt; if (this.promptT <= 0) { this.promptText = null; this.prompts.dirty = true; } }
    for (const t of this.toasts) t.t -= dt;
    const n = this.toasts.length;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    if (n !== this.toasts.length) this.prompts.dirty = true;
    this.prompts.mesh.visible = !!this.promptText || this.toasts.length > 0;
    this._acc += dt;
    if (fighting && this._acc > 0.1) { this._acc = 0; this.status.dirty = true; }
    if (!fighting && this._lastFight) this.status.dirty = true;
    this._lastFight = fighting;
    this.prompts.update(dt);
  }
}
