// Runs a PvP duel on this client: countdown synced to server time, identical fish for
// every competitor, live scoreboard via Realtime broadcast, server-validated submission.
import { SPECIES_BY_ID, PVP_ROD, GAME } from '@game/index.js';
import { bus } from '../core/EventBus.js';
import { Panel, COLORS } from '../ui/Panel.js';
import { audio } from '../audio/AudioEngine.js';

export class PvPMatch {
  constructor(game, mp) {
    this.game = game;
    this.mp = mp;
    this.activeRoomId = null;
    this.phase = 'none'; // none | countdown | fighting | submitted | finished
    this.board = new Panel('duel-board', 0.7, 0.62, 520);
    this.board.interactive = false;
    this.board.mesh.visible = false;
    this.board.setDraw((g, W, H) => this._drawBoard(g, W, H));
    game.hud.root.add(this.board.mesh);
    this.board.mesh.position.set(1.05, -0.05, -1.7);
    this.board.mesh.rotation.y = -0.45;
    bus.on('mp-room', (room) => this._onRoom(room));
    bus.on('mp-live', () => { this.board.dirty = true; });
    bus.on('mp-changed', () => { this.board.dirty = true; });
    this._lastCount = null;
  }

  async _onRoom(room) {
    if (!room) { this._reset(); return; }
    if (room.status === 'active' && room.starts_at && this.activeRoomId !== room.id) {
      this.activeRoomId = room.id;
      await this._startDuel(room);
    }
    if (room.status === 'finished' && this.activeRoomId === room.id && this.phase !== 'finished') {
      this.phase = 'finished';
      await this.mp.loadParticipants();
      const me = this.mp.participants.find((p) => p.user_id === this.mp.uid);
      const won = room.winner_id && room.winner_id === this.mp.uid;
      this.game.hud.prompt(won ? 'YOU WIN THE DUEL!' : room.winner_id ? 'DUEL LOST' : 'NO WINNER', won ? '#ffd23f' : '#ffb07a', 4);
      if (won) audio.catchFanfare('L'); else audio.escape();
      this.game.hud.toast('Placement #' + (me && me.placement ? me.placement : '-') + (won ? ' - prize +' + room.prize + ' coins' : ''), '#ffffff', 5);
      this.board.dirty = true;
      await this.game.refreshProfile();
      setTimeout(() => {
        if (this.phase === 'finished') { this.game.fishing.finishLanding(); this.board.mesh.visible = false; this.game.menu.open('multiplayer'); }
      }, 6000);
    }
  }

  _reset() {
    this.activeRoomId = null;
    this.phase = 'none';
    this.board.mesh.visible = false;
  }

  async _startDuel(room) {
    const game = this.game;
    const species = SPECIES_BY_ID[room.species_id];
    if (!game.world || game.world.id !== room.world_id) await game.loadWorld(room.world_id, true);
    game.menu.close();
    const startsAtMs = new Date(room.starts_at).getTime();
    const localStart = game.fishing.time + (startsAtMs - this.mp.serverNow()) / 1000;
    this.phase = 'countdown';
    this.actions = null;
    this.board.mesh.visible = true;
    this.board.dirty = true;
    game.fishing.startDuel({
      species, weightKg: Number(room.weight_kg), lengthCm: Number(room.length_cm), seed: Number(room.seed), rod: PVP_ROD,
      startAt: localStart, eventId: 'none',
      onAction: (st) => {
        this.phase = 'fighting';
        this.mp.sendLive({ score: st.score, perfects: st.perfects, distance: Math.round(st.distance * 10) / 10, combo: st.combo, done: st.done, result: st.result });
      },
      onDone: (st, actions) => this._submit(st, actions),
    });
    game.hud.toast('DUEL: ' + species.name + ' - first to land it with ' + room.min_score + '+ points wins!', '#ffd23f', 6);
    this.mp.sendLive({ score: 0, perfects: 0, distance: null, done: false });
  }

  async _submit(st, actions) {
    this.phase = 'submitted';
    const clean = actions.map((a) => ({ i: a.i, t: Math.round(a.t * 1000) / 1000, yaw: Math.round(a.yaw * 1000) / 1000, pitch: Math.round(a.pitch * 1000) / 1000 }));
    this.mp.sendLive({ score: st.score, perfects: st.perfects, distance: Math.round(st.distance * 10) / 10, done: true, result: st.result });
    this.game.hud.toast('Result sent - waiting for the other anglers...', '#5cf2ff', 4);
    try {
      const r = await this.mp.submit(clean);
      if (r.valid === false) this.game.hud.toast('Server rejected your result: ' + r.result, '#ff8a7a', 5);
    } catch (e) {
      this.game.hud.toast('Submit failed: ' + e.message, '#ff8a7a', 5);
    }
  }

  update(dt) {
    const room = this.mp.room;
    if (!room || room.id !== this.activeRoomId) return;
    const f = this.game.fishing;
    if (this.phase === 'countdown' && f.fight) {
      const left = f.fight.startAt - f.time;
      const c = Math.ceil(left);
      if (c !== this._lastCount && c >= 0 && c <= GAME.PVP_COUNTDOWN_SEC) {
        this._lastCount = c;
        if (c > 0) { this.game.hud.prompt(String(c), '#ffffff', 0.9); audio.countdown(false); }
        else { this.game.hud.prompt('FIGHT!', '#ffd23f', 1); audio.countdown(true); }
      }
    }
    // after the deadline anyone may ask the server to finalise
    if (room.status === 'active' && room.ends_at && this.mp.serverNow() > new Date(room.ends_at).getTime() + 11000) {
      if (!this._finalizing) {
        this._finalizing = true;
        this.mp.finalize().catch(() => {}).finally(() => setTimeout(() => { this._finalizing = false; }, 5000));
      }
    }
    if (this.board.mesh.visible) this.board.update(dt);
  }

  _drawBoard(g, W, H) {
    const mp = this.mp;
    g.rect(0, 0, W, H, 'rgba(6,16,26,0.8)', 22);
    g.text('DUEL SCOREBOARD', W / 2, 34, { size: 26, weight: 900, align: 'center', color: COLORS.accent2 });
    const rows = mp.participants.map((p) => {
      const l = mp.live[p.user_id] || {};
      return { name: p.username, score: p.submitted ? p.score : (l.score || 0), perfects: p.submitted ? p.perfects : (l.perfects || 0), done: p.submitted || l.done, result: p.result || l.result, me: p.user_id === mp.uid, placement: p.placement };
    }).sort((a, b) => b.score - a.score);
    rows.forEach((r, i) => {
      const y = 80 + i * 56;
      if (r.me) g.rect(10, y - 24, W - 20, 48, 'rgba(255,210,63,0.15)', 10);
      g.text((r.placement ? '#' + r.placement + ' ' : '') + r.name, 22, y, { size: 22, weight: 700, maxWidth: 200 });
      g.text('P' + r.perfects, 250, y, { size: 20, color: '#fff6b0' });
      g.text(String(r.score), W - 22, y, { size: 24, align: 'right', weight: 800 });
      if (r.done) g.text(r.result || 'done', 300, y, { size: 16, color: r.result === 'caught' ? COLORS.good : COLORS.dim });
    });
  }
}
