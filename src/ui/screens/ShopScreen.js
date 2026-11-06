import { Group as THREE_Group } from 'three';
import { COLORS } from '../Panel.js';
import { RODS } from '@game/rods.js';
import { RodModel } from '../../rods/RodModel.js';

const STATS = [['precision', 'Precision', '#ffd23f'], ['strength', 'Strength', '#ff6a4a'], ['control', 'Control', '#2ec4ff'], ['elasticity', 'Elasticity', '#c46bff'], ['stability', 'Stability', '#7dff6a'], ['reel', 'Reel speed', '#5cf2ff']];

export class ShopScreen {
  constructor(menu) { this.menu = menu; this.title = 'ROD SHOP'; this.sel = 0; this.page = 0; }
  enter() { this._preview(); }
  _preview() {
    const m = this.menu;
    const rod = RODS[this.sel];
    const model = new RodModel(rod, m.game.quality);
    const holder = new THREE_Group();
    model.root.rotation.set(Math.PI / 2 - 0.2, 0, 0.35);
    model.root.position.set(0, -0.55, 0);
    holder.add(model.root);
    holder.scale.setScalar(0.6);
    m.setPreview(holder, () => model.dispose());
  }
  draw(g, W, H) {
    const m = this.menu, game = m.game, p = game.profile;
    const per = 7, pages = Math.ceil(RODS.length / per);
    RODS.slice(this.page * per, this.page * per + per).forEach((r, k) => {
      const i = this.page * per + k;
      const y = 108 + k * 64;
      const owned = p && p.ownedRods.has(r.id);
      const eq = p && p.equippedRod === r.id;
      g.rect(30, y, 440, 56, i === this.sel ? '#24597f' : COLORS.panel, 12);
      g.area(30, y, 440, 56, () => { this.sel = i; this._preview(); m.refresh(); }, 'rod' + r.id);
      g.text(r.name, 48, y + 28, { size: 24, weight: 700, maxWidth: 260 });
      g.text(eq ? 'EQUIPPED' : owned ? 'OWNED' : r.price.toLocaleString() + ' c', 455, y + 28, { size: 20, align: 'right', color: eq ? COLORS.good : owned ? COLORS.dim : COLORS.accent2 });
    });
    g.button(30, 566, 110, 52, '<', () => { this.page = (this.page - 1 + pages) % pages; m.refresh(); }, { size: 30 });
    g.text((this.page + 1) + ' / ' + pages, 250, 592, { size: 22, align: 'center' });
    g.button(360, 566, 110, 52, '>', () => { this.page = (this.page + 1) % pages; m.refresh(); }, { size: 30 });

    const r = RODS[this.sel];
    const x = 500, w = W - x - 30;
    g.rect(x, 108, w, 512, COLORS.panel, 18);
    g.text(r.name, x + 22, 146, { size: 32, weight: 900, maxWidth: w - 44 });
    g.wrap(r.desc, x + 22, 184, w - 44, 28, { size: 20, color: COLORS.dim });
    STATS.forEach(([k, label, c], i) => {
      const y = 256 + i * 36;
      g.text(label, x + 22, y, { size: 20 });
      g.bar(x + 170, y - 10, w - 260, 20, r.stats[k], c);
      g.text(Math.round(r.stats[k] * 100), x + w - 22, y, { size: 20, align: 'right' });
    });
    g.text('Line: ' + r.maxLine + ' m', x + 22, 482, { size: 20 });
    g.text('Luck: +' + Math.round(r.luck * 100) + '%', x + 200, 482, { size: 20, color: r.luck > 0.1 ? '#ff9af0' : COLORS.text });
    g.text('Cast: ' + Math.round(r.castPower * 100), x + 370, 482, { size: 20 });
    const owned = p && p.ownedRods.has(r.id);
    const eq = p && p.equippedRod === r.id;
    if (eq) g.button(x + 22, 520, w - 44, 76, 'EQUIPPED', null, { disabled: true, size: 30 });
    else if (owned) g.button(x + 22, 520, w - 44, 76, 'EQUIP', () => m.run(() => game.equipRod(r.id), 'Equipped ' + r.name), { size: 32, color: '#1f7a3a' });
    else {
      const afford = p && p.coins >= r.price;
      g.button(x + 22, 520, w - 44, 76, afford ? 'BUY FOR ' + r.price.toLocaleString() + ' c' : 'NEED ' + r.price.toLocaleString() + ' c', () => m.run(() => game.buyRod(r.id), 'Purchased ' + r.name + '!'), { size: 30, disabled: !afford, color: '#8a5a10' });
    }
  }
}
