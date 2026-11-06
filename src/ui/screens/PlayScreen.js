import { COLORS } from '../Panel.js';
import { WORLDS } from '@game/worlds.js';
import { eventFor, rarityOdds, computeLuck } from '@game/luck.js';
import { RODS_BY_ID } from '@game/rods.js';
import { RARITIES } from '@game/constants.js';

export class PlayScreen {
  constructor(menu) { this.menu = menu; this.title = 'CHOOSE A FISHING SPOT'; this.sel = 0; }
  draw(g, W, H) {
    const m = this.menu, game = m.game, p = game.profile;
    WORLDS.forEach((w, i) => {
      const y = 110 + i * 92;
      const locked = p && p.level < w.unlockLevel;
      const sel = i === this.sel;
      g.rect(30, y, 470, 82, sel ? '#24597f' : COLORS.panel, 16);
      g.area(30, y, 470, 82, () => { this.sel = i; m.refresh(); }, 'world' + i);
      g.text(w.name, 50, y + 28, { size: 30, weight: 800, color: locked ? '#6a7a86' : '#fff' });
      g.text(locked ? 'Unlocks at level ' + w.unlockLevel : w.desc, 50, y + 60, { size: 20, color: locked ? '#8a6a6a' : COLORS.dim, maxWidth: 430 });
    });
    const w = WORLDS[this.sel];
    const x = 530, cw = W - x - 30;
    g.rect(x, 110, cw, 448, COLORS.panel, 20);
    g.text(w.name, x + 24, 150, { size: 34, weight: 900 });
    const ev = eventFor(w.id, Date.now());
    g.text('Current event: ' + ev.name, x + 24, 194, { size: 24, color: ev.id === 'none' ? COLORS.dim : '#ff9af0' });
    g.text(ev.desc, x + 24, 226, { size: 20, color: COLORS.dim, maxWidth: cw - 48 });
    const rod = p ? RODS_BY_ID[p.equippedRod] : null;
    const luck = computeLuck(rod, p ? p.xp : 0);
    g.text('Your luck: ' + Math.round(luck * 100) + '%   (rod ' + (rod ? rod.name : '-') + ')', x + 24, 266, { size: 22 });
    const odds = rarityOdds(w.id, luck, ev);
    let yy = 306;
    for (const k of Object.keys(odds)) {
      const r = RARITIES[k];
      g.text(r.name, x + 24, yy, { size: 22, color: r.color });
      g.bar(x + 170, yy - 10, cw - 300, 20, Math.min(1, odds[k] / 0.7), r.color);
      g.text((odds[k] * 100).toFixed(odds[k] < 0.01 ? 2 : 1) + '%', x + cw - 24, yy, { size: 22, align: 'right' });
      yy += 36;
    }
    const locked = p && p.level < w.unlockLevel;
    g.button(x + 24, 490, cw - 48, 58, locked ? 'LOCKED' : 'GO FISHING', () => { game.loadWorld(w.id); m.close(); }, { size: 32, disabled: locked, color: '#1f7a3a' });
  }
}
