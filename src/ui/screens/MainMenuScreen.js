import { COLORS } from '../Panel.js';
import { eventFor } from '@game/luck.js';

export class MainMenuScreen {
  constructor(menu) { this.menu = menu; this.title = 'PERFECT FISHING VR'; }
  draw(g, W, H) {
    const m = this.menu, game = m.game;
    const items = [
      ['PLAY', () => m.go('play')],
      ['MULTIPLAYER', () => m.go('multiplayer')],
      ['FISH COLLECTION', () => m.go('collection')],
      ['ROD SHOP', () => m.go('shop')],
      ['INVENTORY', () => m.go('inventory')],
      ['LEADERBOARD', () => m.go('leaderboard')],
      ['SETTINGS', () => m.go('settings')],
    ];
    const bw = 480, bh = 64, x0 = 40;
    items.forEach(([label, fn], i) => {
      g.button(x0, 112 + i * (bh + 8), bw, bh, label, fn, { size: 30, color: i === 0 ? '#1f7a3a' : undefined });
    });
    // right column: status
    const x = 560, w = W - x - 40;
    g.rect(x, 118, w, 330, COLORS.panel, 20);
    const p = game.profile;
    if (p) {
      g.text(p.username, x + 24, 156, { size: 34, weight: 800, maxWidth: w - 48 });
      g.text('Level ' + p.level + '   XP ' + p.xp, x + 24, 198, { size: 26, color: COLORS.dim });
      g.text(p.coins.toLocaleString() + ' coins', x + 24, 238, { size: 30, weight: 800, color: COLORS.accent2 });
      const disc = Object.keys(p.discoveries).length;
      g.text('Species discovered: ' + disc + ' / ' + game.speciesCount, x + 24, 280, { size: 24 });
      g.text('Catches: ' + p.stats.totalCatches + '   PERFECT!: ' + p.stats.totalPerfects, x + 24, 316, { size: 24 });
      g.text('Duels won: ' + (p.stats.pvpWins || 0), x + 24, 352, { size: 24 });
    }
    const online = game.backend && game.backend.online;
    g.text(online ? 'ONLINE - progress saved on the server' : 'OFFLINE - progress saved on this device', x + 24, 396, { size: 22, color: online ? COLORS.good : COLORS.dim, maxWidth: w - 48 });
    if (game.world) {
      const ev = eventFor(game.world.id, Date.now());
      g.text(game.world.def.name + (ev.id !== 'none' ? '  |  ' + ev.name : ''), x + 24, 430, { size: 22, color: '#ff9af0', maxWidth: w - 48 });
    }
    // utility buttons
    let bx = x;
    if (game.vr.isPresenting) { g.button(bx, 470, 200, 64, 'EXIT VR', () => game.exitVR(), { size: 26 }); bx += 214; }
    g.button(bx, 470, 200, 64, 'RECENTER', () => game.recenter(), { size: 26 }); bx += 214;
    if (game.world) g.button(bx, 470, Math.min(200, W - 40 - bx), 64, 'RESUME', () => m.close(), { size: 26, color: '#1f7a3a' });
    g.wrap('Trigger: cast / reel / act.  Touchpad: walk & turn.  Centre click: crouch.  Hold centre: menu.', x, 570, w, 30, { size: 20, color: COLORS.dim });
  }
}
