import { COLORS } from '../Panel.js';
import { SPECIES_BY_ID } from '@game/species.js';
import { RARITIES } from '@game/constants.js';

export class InventoryScreen {
  constructor(menu) { this.menu = menu; this.title = 'INVENTORY'; this.page = 0; }
  draw(g, W, H) {
    const m = this.menu, game = m.game, p = game.profile;
    const inv = p ? p.inventory : [];
    const per = 7, pages = Math.max(1, Math.ceil(inv.length / per));
    if (this.page >= pages) this.page = pages - 1;
    const total = inv.reduce((a, f) => a + f.value, 0);
    g.text(inv.length + ' fish  -  total value ' + total.toLocaleString() + ' c', 30, 128, { size: 26, color: COLORS.accent2 });
    g.button(W - 300, 104, 270, 52, 'SELL ALL', () => m.run(() => game.sellAll(), (r) => 'Sold ' + r.count + ' fish for ' + r.earned + ' c'), { size: 26, disabled: !inv.length, color: '#8a5a10' });
    if (!inv.length) g.wrap('Your fish basket is empty. Catch fish and they will appear here, ready to sell.', 30, 200, W - 60, 32, { size: 24, color: COLORS.dim });
    inv.slice(this.page * per, this.page * per + per).forEach((f, i) => {
      const s = SPECIES_BY_ID[f.speciesId];
      const rc = RARITIES[f.rarity];
      const y = 170 + i * 60;
      g.rect(30, y, W - 60, 54, COLORS.panel, 12);
      g.rect(30, y, 8, 54, rc.color, 4);
      g.text((f.variant === 'shiny' ? '* ' : f.variant === 'trophy' ? 'T ' : '') + (s ? s.name : f.speciesId), 52, y + 27, { size: 22, weight: 700, maxWidth: 330 });
      g.text(Number(f.weightKg).toFixed(2) + ' kg', 400, y + 27, { size: 20 });
      g.text(Number(f.lengthCm).toFixed(0) + ' cm', 520, y + 27, { size: 20, color: COLORS.dim });
      g.text('score ' + f.score, 620, y + 27, { size: 18, color: COLORS.dim });
      g.text(f.value.toLocaleString() + ' c', W - 210, y + 27, { size: 22, align: 'right', color: COLORS.accent2 });
      g.button(W - 190, y + 6, 150, 42, 'SELL', () => m.run(() => game.sellFish([f.id]), (r) => '+' + r.earned + ' coins'), { size: 22 });
    });
    g.button(30, 600 - 30, 110, 52, '<', () => { this.page = (this.page - 1 + pages) % pages; m.refresh(); }, { size: 30 });
    g.text((this.page + 1) + ' / ' + pages, W / 2, 596, { size: 22, align: 'center' });
    g.button(W - 140, 600 - 30, 110, 52, '>', () => { this.page = (this.page + 1) % pages; m.refresh(); }, { size: 30 });
  }
}
