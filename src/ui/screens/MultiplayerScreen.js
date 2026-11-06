import { COLORS } from '../Panel.js';
import { bus } from '../../core/EventBus.js';
import { WORLDS, WORLDS_BY_ID } from '@game/worlds.js';
import { SPECIES_BY_ID } from '@game/species.js';

export class MultiplayerScreen {
  constructor(menu) {
    this.menu = menu;
    this.title = 'MULTIPLAYER DUELS';
    this.view = 'lobby'; // lobby | code | invite
    this.code = '';
    this.worldIdx = 0;
    bus.on('mp-changed', () => { if (this.menu.isOpen && this.menu.current === this) this.menu.refresh(); });
    bus.on('mp-live', () => { if (this.menu.isOpen && this.menu.current === this) this.menu.refresh(); });
  }
  get mp() { return this.menu.game.mp; }
  enter() {
    if (this.mp.available) this.mp.start().then(() => this.mp.refreshRooms()).catch((e) => this.menu.flash(e.message, COLORS.bad));
  }

  draw(g, W, H) {
    const m = this.menu, game = m.game, mp = this.mp;
    const p2p = mp.kind === 'p2p';
    if (p2p && !mp.available) {
      g.wrap('This browser has no WebRTC, which peer-to-peer duels need. Try the Oculus/Meta Quest browser or Chrome over HTTPS.', 40, 160, W - 80, 36, { size: 26, color: COLORS.dim });
      return;
    }
    if (!p2p && !mp.available) {
      g.wrap('Sign in to duel other players online. Use the 2D page for e-mail login, or start right now with a guest account:', 40, 160, W - 80, 36, { size: 26 });
      g.button(40, 260, 420, 80, 'PLAY ONLINE AS GUEST', () => m.run(async () => { await game.signInGuest(); await mp.start(); }, 'Welcome!'), { size: 28, color: '#1f7a3a' });
      return;
    }
    if (mp.room) return this._drawRoom(g, W, H);
    if (this.view === 'code') return this._drawKeypad(g, W, H);

    // ---------------- lobby
    g.text('PUBLIC ROOMS', 30, 124, { size: 24, weight: 800 });
    g.button(330, 102, 150, 44, 'REFRESH', () => mp.refreshRooms(), { size: 20 });
    if (!mp.publicRooms.length) g.text('No open rooms - create one!', 30, 180, { size: 22, color: COLORS.dim });
    mp.publicRooms.slice(0, 6).forEach((r, i) => {
      const y = 160 + i * 66;
      g.rect(30, y, 560, 58, COLORS.panel, 12);
      g.text(r.name, 48, y + 20, { size: 22, weight: 700, maxWidth: 330 });
      g.text((WORLDS_BY_ID[r.world_id] || {}).name + '  -  ' + r.players + '/' + r.max_players, 48, y + 44, { size: 17, color: COLORS.dim });
      g.button(440, y + 8, 136, 42, 'JOIN', () => m.run(() => mp.joinRoom(r.id), 'Joined!'), { size: 22, color: '#1f7a3a' });
    });
    const x = 620, w = W - x - 30;
    g.rect(x, 104, w, 300, COLORS.panel, 16);
    g.text('NEW DUEL', x + 18, 134, { size: 22, weight: 800 });
    const wd = WORLDS[this.worldIdx];
    g.button(x + 18, 154, 54, 46, '<', () => { this.worldIdx = (this.worldIdx + WORLDS.length - 1) % WORLDS.length; m.refresh(); }, { size: 24 });
    g.text(wd.name, x + w / 2, 177, { size: 21, align: 'center', maxWidth: w - 150 });
    g.button(x + w - 72, 154, 54, 46, '>', () => { this.worldIdx = (this.worldIdx + 1) % WORLDS.length; m.refresh(); }, { size: 24 });
    g.button(x + 18, 214, w - 36, 54, 'CREATE PUBLIC ROOM', () => m.run(() => mp.createRoom(false, wd.id), 'Room created'), { size: 22, color: '#1f7a3a' });
    g.button(x + 18, 278, w - 36, 54, 'CREATE PRIVATE ROOM', () => m.run(() => mp.createRoom(true, wd.id), 'Private room created'), { size: 22 });
    g.button(x + 18, 342, w - 36, 54, 'JOIN WITH CODE', () => { this.view = 'code'; this.code = ''; m.refresh(); }, { size: 22 });
    g.text(mp.online.length + ' players online' + (p2p ? '  (P2P)' : ''), x + 18, 432, { size: 20, color: COLORS.good });
    if (p2p && mp.online.length <= 1) g.text('Looking for players...', x + 18, 456, { size: 16, color: COLORS.dim });
    g.text('INVITES', x + 18, 468, { size: 22, weight: 800 });
    if (!mp.invites.length) g.text('none', x + 18, 500, { size: 18, color: COLORS.dim });
    mp.invites.slice(0, 2).forEach((inv, i) => {
      const y = 490 + i * 62;
      g.text(inv.from_username, x + 18, y + 14, { size: 20, maxWidth: w - 230 });
      g.button(x + w - 210, y, 96, 46, 'YES', () => m.run(() => mp.respond(inv.id, true), 'Joined!'), { size: 20, color: '#1f7a3a' });
      g.button(x + w - 108, y, 90, 46, 'NO', () => m.run(() => mp.respond(inv.id, false)), { size: 20 });
    });
  }

  _drawKeypad(g, W, H) {
    const m = this.menu, mp = this.mp;
    g.text('Enter the 6-digit room code', W / 2, 130, { size: 28, align: 'center' });
    g.rect(W / 2 - 200, 156, 400, 70, COLORS.panel, 14);
    g.text(this.code.padEnd(6, '_').split('').join(' '), W / 2, 192, { size: 42, align: 'center', weight: 900, color: COLORS.accent2 });
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'DEL', '0', 'JOIN'];
    keys.forEach((k, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = W / 2 - 230 + col * 156, y = 244 + row * 84;
      const isJoin = k === 'JOIN';
      g.button(x, y, 148, 76, k, () => {
        if (k === 'DEL') this.code = this.code.slice(0, -1);
        else if (isJoin) { if (this.code.length === 6) m.run(() => mp.joinCode(this.code), 'Joined!').then(() => { this.view = 'lobby'; }); return; }
        else if (this.code.length < 6) this.code += k;
        m.refresh();
      }, { size: 34, color: isJoin ? '#1f7a3a' : undefined, disabled: isJoin && this.code.length < 6 });
    });
    g.button(30, 104, 160, 50, 'CANCEL', () => { this.view = 'lobby'; m.refresh(); }, { size: 22 });
  }

  _drawRoom(g, W, H) {
    const m = this.menu, game = m.game, mp = this.mp, room = mp.room;
    const isHost = room.host_id === mp.uid;
    if (this.view === 'invite') return this._drawInvite(g, W, H);
    g.text(room.name, 30, 126, { size: 28, weight: 900, maxWidth: 560 });
    g.text((room.is_private ? 'PRIVATE' : 'PUBLIC') + '  -  code ' + room.code, 30, 162, { size: 22, color: COLORS.accent2 });
    g.text((WORLDS_BY_ID[room.world_id] || {}).name + '  -  status: ' + room.status.toUpperCase(), 30, 194, { size: 20, color: COLORS.dim });
    mp.participants.forEach((p, i) => {
      const y = 220 + i * 60;
      const live = mp.live[p.user_id] || {};
      g.rect(30, y, 600, 52, p.user_id === mp.uid ? '#24597f' : COLORS.panel, 12);
      g.text((p.placement ? '#' + p.placement + '  ' : '') + p.username + (p.user_id === room.host_id ? '  (host)' : ''), 48, y + 26, { size: 22, maxWidth: 330 });
      const status = room.status === 'lobby' ? (p.ready || p.user_id === room.host_id ? 'READY' : 'not ready') : (p.submitted ? (p.result || 'done') + ' ' + p.score : 'score ' + (live.score || 0));
      g.text(status, 612, y + 26, { size: 20, align: 'right', color: p.ready || p.submitted ? COLORS.good : COLORS.dim });
    });
    const x = 660, w = W - x - 30;
    g.rect(x, 104, w, 510, COLORS.panel, 16);
    if (room.status === 'lobby') {
      g.wrap('Everyone fights the SAME fish. Each action is rated PERFECT! to Failed!. First to land the fish with at least ' + room.min_score + ' points wins ' + room.prize + ' coins.' + (mp.kind === 'p2p' ? ' The host\'s game is the referee.' : ''), x + 18, 136, w - 36, 26, { size: 18, color: COLORS.dim });
      const me = mp.participants.find((p) => p.user_id === mp.uid);
      if (!isHost) g.button(x + 18, 290, w - 36, 60, me && me.ready ? 'NOT READY' : 'READY', () => m.run(() => mp.setReady(!(me && me.ready))), { size: 26, color: me && me.ready ? undefined : '#1f7a3a' });
      else {
        const can = mp.participants.length >= 2 && mp.participants.every((p) => p.ready || p.user_id === room.host_id);
        g.button(x + 18, 290, w - 36, 60, can ? 'START DUEL' : 'WAITING...', () => m.run(() => mp.startMatch(), 'Duel starting!'), { size: 26, disabled: !can, color: '#1f7a3a' });
      }
      g.button(x + 18, 362, w - 36, 56, 'INVITE PLAYERS', () => { this.view = 'invite'; m.refresh(); }, { size: 22 });
      g.button(x + 18, 430, w - 36, 56, 'LEAVE ROOM', () => m.run(() => mp.leaveRoom()), { size: 22, color: '#7a2a2a' });
    } else if (room.status === 'active') {
      const sp = SPECIES_BY_ID[room.species_id];
      g.text('DUEL IN PROGRESS', x + 18, 140, { size: 24, weight: 800, color: COLORS.accent2 });
      if (sp) g.text(sp.name + '  ' + Number(room.weight_kg).toFixed(1) + ' kg', x + 18, 176, { size: 20, maxWidth: w - 36 });
      g.button(x + 18, 430, w - 36, 56, 'FORFEIT', () => m.run(() => mp.leaveRoom()), { size: 22, color: '#7a2a2a' });
      g.button(x + 18, 360, w - 36, 56, 'BACK TO DUEL', () => m.close(), { size: 22, color: '#1f7a3a' });
    } else {
      const winner = mp.participants.find((p) => p.user_id === room.winner_id);
      g.text('DUEL FINISHED', x + 18, 140, { size: 26, weight: 900 });
      g.text(winner ? 'Winner: ' + winner.username : 'No qualifying winner', x + 18, 180, { size: 22, color: winner ? COLORS.accent2 : COLORS.dim, maxWidth: w - 36 });
      g.button(x + 18, 430, w - 36, 56, 'BACK TO LOBBY', () => m.run(() => mp.leaveRoom()), { size: 22 });
    }
  }

  _drawInvite(g, W, H) {
    const m = this.menu, mp = this.mp;
    g.button(30, 104, 160, 50, 'DONE', () => { this.view = 'lobby'; m.refresh(); }, { size: 22 });
    g.text('ONLINE PLAYERS', 220, 130, { size: 24, weight: 800 });
    const others = mp.online.filter((o) => o.user_id !== mp.uid);
    if (!others.length) g.text('Nobody else is online right now.', 30, 200, { size: 22, color: COLORS.dim });
    others.slice(0, 7).forEach((o, i) => {
      const y = 170 + i * 62;
      g.rect(30, y, W - 60, 54, COLORS.panel, 12);
      g.text(o.username + '  Lv ' + o.level, 50, y + 27, { size: 22, maxWidth: 520 });
      g.text(o.status || '', 640, y + 27, { size: 18, color: COLORS.dim });
      const inRoom = mp.participants.some((p) => p.user_id === o.user_id);
      g.button(W - 230, y + 6, 180, 42, inRoom ? 'IN ROOM' : 'INVITE', () => m.run(() => mp.invite(o.user_id), 'Invite sent to ' + o.username), { size: 20, disabled: inRoom });
    });
  }
}
