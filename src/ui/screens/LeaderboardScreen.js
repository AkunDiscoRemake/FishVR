import { COLORS } from '../Panel.js';

const TABS = [['score', 'SCORE', 'total_score'], ['coins', 'COINS', 'coins'], ['catches', 'CATCHES', 'total_catches'], ['legendary', 'LEGENDS', 'legendary_catches'], ['wins', 'DUEL WINS', 'pvp_wins']];

export class LeaderboardScreen {
  constructor(menu) { this.menu = menu; this.title = 'GLOBAL LEADERBOARD'; this.tab = 'score'; this.rows = []; this.history = []; this.loading = false; }
  enter() { this.load(); }
  async load() {
    const game = this.menu.game;
    this.loading = true; this.menu.refresh();
    try {
      if (!game.backend.online && game.mp && game.mp.kind === 'p2p') {
        // no server: rank the players online right now by their own reported stats
        if (!game.mp.started) await game.mp.start();
        const col = (TABS.find((t) => t[0] === this.tab) || TABS[0])[2];
        this.rows = game.mp.online.slice().sort((a, b) => (b[col] || 0) - (a[col] || 0));
        this.p2p = true;
      } else this.rows = await game.backend.leaderboard(this.tab);
      this.history = game.backend.matchHistory ? await game.backend.matchHistory() : [];
      this.error = null;
    } catch (e) { this.error = e.message; }
    this.loading = false; this.menu.refresh();
  }
  draw(g, W, H) {
    const m = this.menu, game = m.game;
    TABS.forEach(([id, label], i) => g.button(30 + i * 150, 106, 142, 48, label, () => { this.tab = id; this.load(); }, { size: 20, active: this.tab === id }));
    if (this.p2p) g.button(W - 190, 106, 160, 48, 'REFRESH', () => this.load(), { size: 20 });
    const col = (TABS.find((t) => t[0] === this.tab) || TABS[0])[2];
    if (this.p2p) g.text('Players online now (self-reported, P2P - no central server)', 30, 176, { size: 20, color: COLORS.dim });
    else if (!game.backend.online) g.text('Offline: sign in (2D page) to compete in the global ranking.', 30, 180, { size: 22, color: COLORS.dim });
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
    if (!this.history || !this.history.length) {
      const st = game.profile ? game.profile.stats : {};
      if (game.backend.online) g.text('No duels yet.', hx + 18, 240, { size: 20, color: COLORS.dim });
      else { g.text('Wins: ' + (st.pvpWins || 0), hx + 18, 240, { size: 22 }); g.text('Losses: ' + (st.pvpLosses || 0), hx + 18, 276, { size: 22 }); }
    }
    (this.history || []).slice(0, 10).forEach((h, i) => {
      const y = 238 + i * 36;
      const won = h.winner_id && h.winner_id === h.user_id;
      g.text(h.status === 'finished' ? (won ? 'WIN' : '#' + (h.placement || '-')) : h.status, hx + 18, y, { size: 18, color: won ? COLORS.good : COLORS.dim, weight: 800 });
      g.text('score ' + h.score + '  P' + h.perfects, hx + 90, y, { size: 18 });
      g.text(h.winner_name ? 'won by ' + h.winner_name : '', hx + hw - 14, y, { size: 16, align: 'right', color: COLORS.dim, maxWidth: 140 });
    });
  }
}
