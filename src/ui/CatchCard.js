// Card shown after landing a fish, with the SERVER-validated result.
import * as THREE from 'three';
import { Panel, COLORS } from './Panel.js';
import { RARITIES, RATINGS } from '@game/constants.js';

export class CatchCard {
  constructor(game) {
    this.game = game;
    this.panel = game.ui.add(new Panel('catch', 1.15, 0.8, 620));
    this.panel.mesh.visible = false;
    game.scene.add(this.panel.mesh);
    this.panel.setDraw((g, W, H) => this._draw(g, W, H));
    this.data = null;
  }
  get open() { return this.panel.mesh.visible; }

  show(data) {
    this.data = data;
    const cam = this.game.camera;
    const head = cam.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    this.panel.mesh.position.copy(head).addScaledVector(fwd, 1.55).addScaledVector(right, 0.62).add(new THREE.Vector3(0, -0.12, 0));
    this.panel.mesh.lookAt(head);
    this.panel.mesh.visible = true;
    this.panel.dirty = true;
  }
  hide() { this.panel.mesh.visible = false; this.data = null; }

  _draw(g, W, H) {
    const d = this.data;
    if (!d) return;
    const s = d.species, res = d.res || {}, roll = d.roll || {};
    const rc = RARITIES[s.rarity];
    g.rect(0, 0, W, H, COLORS.bg, 30);
    g.stroke(3, 3, W - 6, H - 6, rc.color, 5, 30);
    const caught = res.status === 'caught';
    if (res.new_discovery) { g.rect(W - 250, 18, 230, 44, '#ffd23f', 14); g.text('NEW SPECIES!', W - 135, 41, { size: 24, weight: 900, align: 'center', color: '#1a1a1a' }); }
    g.text(caught ? 'CAUGHT!' : 'NOT COUNTED', 30, 44, { size: 40, weight: 900, color: caught ? COLORS.good : COLORS.bad });
    g.text(s.name, 30, 100, { size: 40, weight: 900, color: rc.color, maxWidth: W - 60 });
    g.text(s.sci + '  -  ' + rc.name + (roll.variant === 'shiny' ? '  -  SHINY!' : roll.variant === 'trophy' ? '  -  TROPHY' : ''), 30, 140, { size: 22, color: COLORS.dim, maxWidth: W - 60 });
    g.text(Number(roll.weightKg).toFixed(2) + ' kg', 30, 196, { size: 36, weight: 800 });
    g.text(Number(roll.lengthCm).toFixed(1) + ' cm', 280, 196, { size: 30, color: COLORS.dim });
    if (caught) g.text('Value ' + (res.value || 0).toLocaleString() + ' c', W - 30, 196, { size: 32, weight: 800, align: 'right', color: COLORS.accent2 });
    const counts = res.counts || (d.local && d.local.counts) || {};
    let x = 30;
    for (const r of RATINGS) {
      g.rect(x, 236, 112, 74, 'rgba(255,255,255,0.06)', 12);
      g.text(String(counts[r.key] || 0), x + 56, 262, { size: 30, weight: 900, align: 'center', color: r.color });
      g.text(r.label, x + 56, 292, { size: 15, align: 'center', color: COLORS.dim, maxWidth: 104 });
      x += 118;
    }
    g.text('Score ' + (res.score !== undefined ? res.score : d.local.score) + '   +' + (res.xp || 0) + ' XP' + (res.level ? '   Level ' + res.level : ''), 30, 346, { size: 26 });
    if (!caught) g.text('Server: ' + (res.reason || res.status || 'unknown'), 30, 384, { size: 22, color: COLORS.bad, maxWidth: W - 60 });
    if (caught && res.inventory_id) {
      g.button(30, H - 110, (W - 80) / 2, 80, 'KEEP', () => this.game.closeCatchCard(), { size: 32, color: '#1f7a3a' });
      g.button(50 + (W - 80) / 2, H - 110, (W - 80) / 2, 80, 'SELL NOW', () => this.game.sellFromCard(res.inventory_id), { size: 32, color: '#8a5a10' });
    } else {
      g.button(30, H - 110, W - 60, 80, 'CONTINUE', () => this.game.closeCatchCard(), { size: 32 });
    }
  }
}
