import { COLORS } from '../Panel.js';

const TABS = [['score', 'SCORE', 'total_score'], ['coins', 'COINS', 'coins'], ['catches', 'CATCHES', 'total_catches'], ['legendary', 'LEGENDS', 'legendary_catches'], ['wins', 'DUEL WINS', 'pvp_wins']];

export class LeaderboardScreen {
  constructor(menu) { this.menu = menu; this.title = 'GLOBAL LEADERBOARD'; this.tab = 'score'; this.rows = []; this.history = []; this.loading = false; }
  enter() { this.load(); }
  async load() {
    const game = this.menu.game;
    this.loading = true; this.menu.refresh();
    try {
      this.rows = await game.backend.leaderboard(this.tab);
      this.history = game.backend.matchHistory ? await game.backend.matchHistory() : [];
      this.error = null;
    } catch (e) { this.error = e.message; }
    this.loading = false; this.menu.refresh();
  }
  draw(g, W, H) {
    const m = this.menu, game = m.game;
    TABS.forEach(([id, label], i) => g.button(30 + i * 150, 106, 142, 48, label, () => { this.tab = id; this.load(); }, { size: 20, active: this.tab === id }));
    const col = (TABS.find((t) => t[0] === this.tab) || TABS[0])[2];
    if (!game.backend.online) g.text('Offline: sign in (2D page) to compete in the global ranking.', 30, 180, { size: 22, color: COLORS.dim });
    if (this.loading) g.text('Loading...', 30, 220, { size: 24, color: COLORS.accent });
    if (this.error) g.text('Error: ' + this.error, 30, 220, { size: 22, color: COLORS.bad });
    const me = game.profile ? game.profile.username : '';
    const x0 = 30, w = 640;
    this.rows.slice(0, 12).forEach((r, i) => {
      const y = 200 + i * 34;
      const mine = r.username === me;
      if (mine) g.rect(x0, y - 16, w, 32, 'rgba(255,210,63,0.18)', 8);
      g.text('#' + (i + 1), x0 + 10, y, { size: 22, color: i < 3 ? COLORS.accent2 : COLORS.dim, weight: 800 });
      g.text(r.username, x0 + 80, y, { size: 22, maxWidth: 330 });
      g.text('Lv ' + r.level, x0 + 430, y, { size: 18, color: COLORS.dim });
      g.text(Number(r[col] || 0).toLocaleString(), x0 + w - 10, y, { size: 22, align: 'right', weight: 800 });
    });
    const hx = 700, hw = W - hx - 30;
    g.rect(hx, 170, hw, 440, COLORS.panel, 16);
    g.text('MY DUEL HISTORY', hx + 18, 200, { size: 22, weight: 800 });
    if (!this.history || !this.history.length) g.text(game.backend.online ? 'No duels yet.' : 'Online only.', hx + 18, 240, { size: 20, color: COLORS.dim });
    (this.history || []).slice(0, 10).forEach((h, i) => {
      const y = 238 + i * 36;
      const won = h.winner_id && h.winner_id === h.user_id;
      g.text(h.status === 'finished' ? (won ? 'WIN' : '#' + (h.placement || '-')) : h.status, hx + 18, y, { size: 18, color: won ? COLORS.good : COLORS.dim, weight: 800 });
      g.text('score ' + h.score + '  P' + h.perfects, hx + 90, y, { size: 18 });
      g.text(h.winner_name ? 'won by ' + h.winner_name : '', hx + hw - 14, y, { size: 16, align: 'right', color: COLORS.dim, maxWidth: 140 });
    });
  }
}
