import { COLORS } from '../Panel.js';
import { SPECIES } from '@game/species.js';
import { WORLDS } from '@game/worlds.js';
import { RARITIES } from '@game/constants.js';
import { createFish } from '../../fish/FishModelFactory.js';

const BEHAVIOR_TEXT = {
  runner: 'Long powerful runs', diver: 'Dives deep, keep the rod high', jumper: 'Leaps out of the water',
  zigzag: 'Rapid side-to-side changes', bulldog: 'Brutal steady pulling', sulker: 'Stubborn, sulks on the bottom', erratic: 'Unpredictable',
};

export class CollectionScreen {
  constructor(menu) { this.menu = menu; this.title = 'FISH COLLECTION'; this.tab = 'all'; this.page = 0; this.sel = null; }
  list() { return this.tab === 'all' ? SPECIES : SPECIES.filter((s) => s.worlds.indexOf(this.tab) >= 0); }
  enter() { this._preview(); }
  _preview() {
    const m = this.menu;
    const p = m.game.profile;
    if (!this.sel || !p || !p.discoveries[this.sel.id]) { m.clearPreview(); return; }
    const fish = createFish(this.sel, { detail: m.game.quality.fishDetail, standard: m.game.quality.standardMaterials });
    const scale = 0.7 / Math.max(0.3, fish.lengthM);
    fish.object.scale.multiplyScalar(scale);
    fish.object.rotation.y = Math.PI / 2;
    const holder = fish.object;
    holder.userData.anim = fish;
    m.setPreview(holder, () => fish.dispose());
  }
  update(dt) {
    const c = this.menu.preview.children[0];
    if (c && c.userData.anim) c.userData.anim.update(dt, 0.35, 0);
  }
  draw(g, W, H) {
    const m = this.menu, p = m.game.profile;
    const tabs = [['all', 'ALL']].concat(WORLDS.map((w) => [w.id, w.name.split(' ').pop().toUpperCase()]));
    tabs.forEach(([id, label], i) => g.button(30 + i * 104, 106, 98, 46, label, () => { this.tab = id; this.page = 0; m.refresh(); }, { size: 18, active: this.tab === id }));
    const list = this.list();
    const per = 20, pages = Math.ceil(list.length / per);
    const items = list.slice(this.page * per, this.page * per + per);
    const found = list.filter((s) => p && p.discoveries[s.id]).length;
    g.text(found + ' / ' + list.length + ' discovered', 660, 129, { size: 22, color: COLORS.dim });
    items.forEach((s, i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const x = 30 + col * 156, y = 164 + row * 78;
      const known = p && p.discoveries[s.id];
      const rc = RARITIES[s.rarity];
      const sel = this.sel === s;
      g.rect(x, y, 148, 70, sel ? '#24597f' : COLORS.panel, 12);
      g.rect(x, y, 8, 70, rc.color, 4);
      g.area(x, y, 148, 70, () => { this.sel = s; this._preview(); m.refresh(); }, 'sp' + s.id);
      g.text(known ? s.name : '???', x + 18, y + 26, { size: 18, weight: 700, maxWidth: 124, color: known ? '#fff' : '#6a7a86' });
      g.text(known ? 'x' + known.count : rc.name, x + 18, y + 52, { size: 16, color: known ? COLORS.dim : rc.color });
    });
    g.button(30, 566, 120, 52, '<', () => { this.page = (this.page - 1 + pages) % pages; m.refresh(); }, { size: 30 });
    g.text((this.page + 1) + ' / ' + pages, 320, 592, { size: 24, align: 'center' });
    g.button(500, 566, 120, 52, '>', () => { this.page = (this.page + 1) % pages; m.refresh(); }, { size: 30 });
    // details
    const x = 660, w = W - x - 30;
    g.rect(x, 164, w, 456, COLORS.panel, 18);
    const s = this.sel;
    if (!s) { g.wrap('Select a fish to see its details. Catch fish to discover them and fill your personal catalogue.', x + 20, 200, w - 40, 30, { size: 22, color: COLORS.dim }); return; }
    const known = p && p.discoveries[s.id];
    const rc = RARITIES[s.rarity];
    g.text(known ? s.name : 'Undiscovered', x + 20, 198, { size: 28, weight: 900, maxWidth: w - 40 });
    g.text(known ? s.sci : '?', x + 20, 230, { size: 18, color: COLORS.dim, maxWidth: w - 40, weight: 400 });
    g.text(rc.name, x + 20, 262, { size: 22, color: rc.color, weight: 800 });
    g.text(s.worlds.map((id) => id).join(', '), x + 160, 262, { size: 18, color: COLORS.dim, maxWidth: w - 180 });
    g.text('Size ' + s.lenMin + '-' + s.lenMax + ' cm', x + 20, 296, { size: 20 });
    g.text('Avg ' + (s.avgWeight < 1 ? Math.round(s.avgWeight * 1000) + ' g' : s.avgWeight.toFixed(1) + ' kg'), x + 220, 296, { size: 20 });
    const stat = (label, v, y, c) => { g.text(label, x + 20, y, { size: 18, color: COLORS.dim }); g.bar(x + 130, y - 9, w - 150, 18, v, c); };
    stat('Speed', s.speed, 330, '#5cf2ff');
    stat('Power', s.power, 358, '#ff8c3a');
    stat('Stamina', s.stamina, 386, '#7dff6a');
    g.text('Fight: ' + (BEHAVIOR_TEXT[s.behavior] || s.behavior), x + 20, 418, { size: 18, maxWidth: w - 40 });
    g.text('Base value: ' + s.baseValue + ' c', x + 20, 448, { size: 20, color: COLORS.accent2 });
    if (known) {
      g.text('Caught: ' + known.count, x + 20, 486, { size: 20 });
      g.text('Best: ' + Number(known.bestWeight).toFixed(2) + ' kg / ' + Number(known.bestLength).toFixed(0) + ' cm', x + 20, 516, { size: 20 });
      g.text('Best score: ' + known.bestScore, x + 20, 546, { size: 20 });
    } else g.wrap('Catch this fish to reveal its 3D model and records.', x + 20, 490, w - 40, 28, { size: 19, color: COLORS.dim });
  }
}
