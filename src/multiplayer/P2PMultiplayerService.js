// Serverless multiplayer: players connect directly to each other with WebRTC.
// Public WebTorrent trackers are used only so peers can find each other (signalling);
// no game data goes through them and there is no backend to deploy.
//
// Same public interface as the Supabase MultiplayerService, so the lobby UI and PvPMatch
// work with either. In a duel the ROOM HOST's game is the referee: it rolls the shared
// fish, keeps the clock and re-simulates every player's action log with the exact same
// rules the server used (evaluateFight) before deciding the winner.
import { joinRoom, selfId } from '@trystero-p2p/torrent';
import { bus } from '../core/EventBus.js';
import {
  SPECIES, SPECIES_BY_ID, PVP_ROD, GAME, WORLDS_BY_ID, evaluateFight, weightForLength, createRng, randomSeed,
} from '@game/index.js';

const APP = { appId: 'perfect-fishing-vr-p2p-v1' };
const HELLO_EVERY = 4000;
const PEER_TTL = 13000;

function code6() { return String(100000 + (randomSeed() % 900000)); }
function noop() {}

export class P2PMultiplayerService {
  constructor(game) {
    this.game = game;
    this.kind = 'p2p';
    this.started = false;
    this.uid = selfId;
    this.peers = {}; // lobby peerId -> hello payload
    this.online = [];
    this.publicRooms = [];
    this.room = null;
    this.participants = [];
    this.invites = [];
    this.live = {};
    this.clockOffset = 0;
    this.status = 'menu';
    this.lobby = null;
    this.chan = null; // current room channel
    this.isHost = false;
    this._rewarded = {};
  }

  get available() { return typeof RTCPeerConnection !== 'undefined' && !!(window.crypto && window.crypto.subtle); }
  serverNow() { return Date.now() + this.clockOffset; }
  _emit() { bus.emit('mp-changed'); }

  // ------------------------------------------------------------------ lobby
  async start() {
    if (this.started || !this.available) return;
    this.started = true;
    const lobby = joinRoom(APP, 'lobby');
    this.lobby = lobby;
    this.helloAct = lobby.makeAction('hello', { onMessage: (d, ctx) => { this.peers[ctx.peerId] = Object.assign({}, d, { user_id: ctx.peerId, seen: Date.now() }); this._recompute(); } });
    this.inviteAct = lobby.makeAction('invite', {
      onMessage: (d, ctx) => {
        if (!d || !d.code) return;
        const inv = { id: d.code + ':' + ctx.peerId, code: String(d.code), from_user: ctx.peerId, from_username: String(d.from || 'Angler').slice(0, 20), status: 'pending' };
        this.invites = [inv].concat(this.invites.filter((i) => i.id !== inv.id)).slice(0, 5);
        bus.emit('mp-invite', inv);
        this._emit();
      },
    });
    lobby.onPeerJoin = (id) => this._sendHello(id);
    lobby.onPeerLeave = (id) => { delete this.peers[id]; this._recompute(); };
    this._helloTimer = setInterval(() => { this._sendHello(); this._recompute(); }, HELLO_EVERY);
    this._sendHello();
    this._recompute();
  }

  async stop() {
    clearInterval(this._helloTimer);
    await this.leaveRoom().catch(noop);
    if (this.lobby) await this.lobby.leave().catch(noop);
    this.lobby = null;
    this.started = false;
    this.peers = {};
    this._recompute();
  }

  _myHello() {
    const p = this.game.profile || {};
    const s = p.stats || {};
    const r = this.room;
    return {
      username: p.username || 'Angler', level: p.level || 1, status: this.status,
      // self-reported stats for the "online now" ranking (not verifiable without a server)
      coins: p.coins || 0, total_score: s.totalScore || 0, total_catches: s.totalCatches || 0,
      legendary_catches: s.legendary || 0, pvp_wins: s.pvpWins || 0,
      room: r && this.isHost && !r.is_private && r.status === 'lobby'
        ? { id: r.code, code: r.code, name: r.name, world_id: r.world_id, players: this.participants.length, max_players: r.max_players, host_id: this.uid, status: 'lobby', is_private: false }
        : null,
    };
  }

  _sendHello(target) {
    if (!this.helloAct) return;
    this.helloAct.send(this._myHello(), target ? { target } : undefined).catch(noop);
  }

  _recompute() {
    const now = Date.now();
    for (const id of Object.keys(this.peers)) if (now - this.peers[id].seen > PEER_TTL) delete this.peers[id];
    const me = Object.assign({ user_id: this.uid }, this._myHello());
    this.online = [me].concat(Object.keys(this.peers).map((k) => this.peers[k]));
    const rooms = this.online.map((o) => o.room).filter(Boolean);
    this.publicRooms = rooms.filter((r) => r.status === 'lobby');
    this._emit();
  }

  async refreshRooms() { this._sendHello(); this._recompute(); }
  async loadInvites() { this._emit(); }
  async loadParticipants() { this._emit(); }
  async reloadRoom() { this._emit(); }
  async trackPresence(status) { this.status = status; this._sendHello(); }

  async invite(userId) {
    if (!this.room) throw new Error('not_in_room');
    await this.inviteAct.send({ code: this.room.code, from: this._myHello().username }, { target: userId });
    return { ok: true };
  }

  async respond(inviteId, accept) {
    const inv = this.invites.find((i) => i.id === inviteId);
    this.invites = this.invites.filter((i) => i.id !== inviteId);
    this._emit();
    if (!inv) throw new Error('invite_not_found');
    if (accept) await this.joinCode(inv.code);
    return { ok: true };
  }

  // ------------------------------------------------------------------ room channel
  _open(code) {
    const ch = joinRoom(APP, 'room-' + code);
    this.chan = ch;
    this.stateAct = ch.makeAction('state', { onMessage: (d, ctx) => this._onState(d, ctx.peerId) });
    this.reqAct = ch.makeAction('req', { onMessage: (d, ctx) => { if (this.isHost) this._hostHandle(ctx.peerId, d || {}); } });
    this.liveAct = ch.makeAction('live', { onMessage: (d, ctx) => { if (d) { this.live[ctx.peerId] = Object.assign({}, d, { user_id: ctx.peerId }); bus.emit('mp-live'); } } });
    this.clockAct = ch.makeAction('clock', { kind: 'request', onRequest: () => ({ t: Date.now() }) });
    ch.onPeerJoin = (id) => {
      if (this.isHost) this._broadcast(id);
      else if (!this.room) this.reqAct.send({ type: 'join', username: this._myHello().username }, { target: id }).catch(noop);
    };
    ch.onPeerLeave = (id) => {
      if (this.isHost) this._hostDrop(id);
      else if (this.room && id === this.room.host_id && this.room.status !== 'finished') {
        this.room = Object.assign({}, this.room, { status: 'cancelled' });
        this.game.hud.toast('The host left - duel cancelled', '#ffb07a', 5);
        this._roomUpdated();
        this.leaveRoom().catch(noop);
      }
    };
    return ch;
  }

  async createRoom(isPrivate, worldId) {
    await this.leaveRoom().catch(noop);
    const code = code6();
    this.isHost = true;
    const name = (this._myHello().username || 'Angler') + "'s duel";
    this.room = {
      id: code, code, name, host_id: this.uid, is_private: !!isPrivate, max_players: 4,
      world_id: WORLDS_BY_ID[worldId] ? worldId : 'lake', status: 'lobby', min_score: GAME.PVP_MIN_SCORE, prize: 150,
      seed: null, species_id: null, weight_kg: null, length_cm: null, starts_at: null, ends_at: null, winner_id: null,
    };
    this.participants = [{ user_id: this.uid, username: this._myHello().username, ready: true, submitted: false, score: 0, perfects: 0, result: null, valid: null, placement: null, finish_t: null }];
    this.clockOffset = 0;
    this._open(code);
    this.status = 'in-room';
    this._sendHello();
    this._roomUpdated();
    return this.room;
  }

  async joinCode(code) {
    code = String(code).trim();
    if (this.room && this.room.code === code) return this.room;
    await this.leaveRoom().catch(noop);
    this.isHost = false;
    this.room = null;
    const ch = this._open(code);
    // ask whoever is already in the room; only the host answers
    this.reqAct.send({ type: 'join', username: this._myHello().username }).catch(noop);
    const joined = await new Promise((resolve, reject) => {
      const t0 = Date.now();
      let lastAsk = t0;
      const iv = setInterval(() => {
        if (this.room) { clearInterval(iv); resolve(this.room); }
        else if (this._joinError) { clearInterval(iv); const e = this._joinError; this._joinError = null; reject(new Error(e)); }
        else if (Date.now() - t0 > 20000) { clearInterval(iv); reject(new Error('room_not_found')); }
        else if (Date.now() - lastAsk > 3000) { lastAsk = Date.now(); this.reqAct.send({ type: 'join', username: this._myHello().username }).catch(noop); }
      }, 250);
    }).catch(async (e) => { await ch.leave().catch(noop); if (this.chan === ch) this.chan = null; throw e; });
    this.status = 'in-room';
    this._sendHello();
    this._syncClock();
    return joined;
  }

  joinRoom(id) { return this.joinCode(id); }

  async leaveRoom() {
    const ch = this.chan;
    if (!ch) { this.room = null; this.participants = []; return; }
    if (this.isHost && this.room && this.room.status !== 'finished') {
      this.room = Object.assign({}, this.room, { status: 'cancelled' });
      this._broadcast();
    } else if (this.reqAct) this.reqAct.send({ type: 'leave' }).catch(noop);
    await new Promise((r) => setTimeout(r, 150));
    await ch.leave().catch(noop);
    this.chan = null;
    this.room = null;
    this.participants = [];
    this.live = {};
    this.isHost = false;
    this.status = 'menu';
    this._sendHello();
    this._roomUpdated();
  }

  async _syncClock() {
    if (!this.room || this.isHost) return;
    const samples = [];
    for (let i = 0; i < 4; i++) {
      try {
        const t0 = Date.now();
        const r = await this.clockAct.request({}, { target: this.room.host_id, timeoutMs: 4000 });
        const t1 = Date.now();
        samples.push({ rtt: t1 - t0, off: r.t - (t0 + t1) / 2 });
      } catch (e) { /* retry */ }
    }
    if (samples.length) { samples.sort((a, b) => a.rtt - b.rtt); this.clockOffset = samples[0].off; }
  }

  _onState(d, from) {
    if (!d) return;
    if (d.reject && d.to === this.uid) { this._joinError = d.reject; return; }
    if (!d.room || (this.room && d.room.code !== this.room.code && this.room.status !== 'cancelled')) return;
    if (d.room.host_id !== from) return; // only the host may publish room state
    const amIn = d.participants.some((p) => p.user_id === this.uid);
    if (!amIn && !this.room) return; // state for others while we are still knocking
    this.room = d.room;
    this.participants = d.participants;
    if (!amIn && this.room.status === 'lobby') { this.room = null; this._joinError = 'kicked'; }
    this._roomUpdated();
  }

  _roomUpdated() {
    const r = this.room;
    if (r && r.status === 'finished' && !this._rewarded[r.code]) {
      this._rewarded[r.code] = true;
      const be = this.game.backend;
      if (be && be.recordDuel) be.recordDuel(r.winner_id === this.uid, r.prize);
    }
    bus.emit('mp-room', r);
    this._emit();
  }

  sendLive(payload) {
    const msg = Object.assign({ user_id: this.uid, username: this._myHello().username }, payload);
    this.live[this.uid] = msg;
    if (this.liveAct) this.liveAct.send(msg).catch(noop);
    bus.emit('mp-live');
  }

  async _request(type, extra) {
    if (!this.room) throw new Error('not_in_room');
    if (this.isHost) { this._hostHandle(this.uid, Object.assign({ type }, extra)); return; }
    await this.reqAct.send(Object.assign({ type }, extra), { target: this.room.host_id });
  }

  async setReady(ready) { await this._request('ready', { ready: !!ready }); }

  async startMatch() {
    if (!this.isHost) throw new Error('only_host_can_start');
    const r = this.room;
    if (r.status !== 'lobby') throw new Error('room_not_open');
    if (this.participants.length < 2) throw new Error('need_two_players');
    if (this.participants.some((p) => !p.ready && p.user_id !== this.uid)) throw new Error('players_not_ready');
    const seed = randomSeed() & 0x7fffffff;
    const rng = createRng(seed);
    const pool = SPECIES.filter((s) => s.worlds.indexOf(r.world_id) >= 0 && (s.rarity === 'U' || s.rarity === 'R'));
    const species = rng.pick(pool);
    const len = Math.round((species.lenMin + (species.lenMax - species.lenMin) * rng.range(0.45, 0.75)) * 10) / 10;
    const startsAt = Date.now() + GAME.PVP_COUNTDOWN_SEC * 1000;
    Object.assign(r, {
      status: 'active', seed, species_id: species.id, length_cm: len, weight_kg: Math.round(weightForLength(species, len) * 1000) / 1000,
      starts_at: new Date(startsAt).toISOString(), ends_at: new Date(startsAt + GAME.PVP_MAX_DURATION_SEC * 1000).toISOString(),
    });
    this._broadcast();
    this._roomUpdated();
    return r;
  }

  async submit(actions) {
    await this._request('submit', { actions });
    // wait until the referee published our validated result
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      const me = this.participants.find((p) => p.user_id === this.uid);
      if (me && me.submitted) return { ok: true, valid: me.valid, result: me.result, score: me.score, room: this.room };
      await new Promise((res) => setTimeout(res, 200));
    }
    throw new Error('referee_timeout');
  }

  async finalize() {
    if (this.isHost) this._hostFinalize(true);
    else await this._request('finalize');
    return { ok: true, room: this.room };
  }

  // ------------------------------------------------------------------ host / referee
  _broadcast(target) {
    if (!this.stateAct || !this.room) return;
    this.stateAct.send({ room: this.room, participants: this.participants }, target ? { target } : undefined).catch(noop);
  }

  _hostChanged() { this._broadcast(); this._sendHello(); this._roomUpdated(); }

  _hostDrop(peerId) {
    const r = this.room;
    if (!r) return;
    if (r.status === 'lobby') this.participants = this.participants.filter((p) => p.user_id !== peerId);
    else if (r.status === 'active') {
      const p = this.participants.find((x) => x.user_id === peerId);
      if (p && !p.submitted) Object.assign(p, { submitted: true, result: 'forfeit', valid: false });
      this._hostFinalize(false);
    }
    this._hostChanged();
  }

  _hostHandle(peerId, d) {
    const r = this.room;
    if (!r) return;
    const me = this.participants.find((p) => p.user_id === peerId);
    switch (d.type) {
      case 'join': {
        if (me) { this._broadcast(peerId); return; }
        let reason = null;
        if (r.status !== 'lobby') reason = 'room_not_open';
        else if (this.participants.length >= r.max_players) reason = 'room_full';
        if (reason) { this.stateAct.send({ reject: reason, to: peerId }, { target: peerId }).catch(noop); return; }
        this.participants.push({ user_id: peerId, username: String(d.username || 'Angler').replace(/[^\w]/g, '').slice(0, 20) || 'Angler', ready: false, submitted: false, score: 0, perfects: 0, result: null, valid: null, placement: null, finish_t: null });
        break;
      }
      case 'leave': this._hostDrop(peerId); return;
      case 'ready': if (me && r.status === 'lobby') me.ready = !!d.ready; break;
      case 'finalize': this._hostFinalize(true); break;
      case 'submit': {
        if (!me || me.submitted || r.status !== 'active') return;
        const actions = Array.isArray(d.actions) ? d.actions.slice(0, GAME.MAX_BEATS) : [];
        const elapsed = (Date.now() - new Date(r.starts_at).getTime()) / 1000;
        const ev = evaluateFight(Number(r.seed), SPECIES_BY_ID[r.species_id], Number(r.weight_kg), PVP_ROD, 'none', actions);
        if (!ev.ok) Object.assign(me, { result: 'rejected', valid: false, score: 0 });
        else {
          const st = ev.state;
          const lastT = Math.max(st.finishT || 0, ...actions.map((a) => Number(a.t) || 0));
          const valid = elapsed >= lastT - GAME.TIME_TOLERANCE - 1.5 && !ev.suspicious; // extra slack for P2P latency
          Object.assign(me, { result: valid ? (st.result || 'escaped') : 'rejected', valid, score: st.score, perfects: st.perfects, finish_t: st.finishT });
        }
        me.submitted = true;
        this._hostFinalize(false);
        break;
      }
      default: return;
    }
    this._hostChanged();
  }

  _hostFinalize(force) {
    const r = this.room;
    if (!r || r.status !== 'active') return;
    const timeUp = Date.now() > new Date(r.ends_at).getTime() + 10000;
    const parts = this.participants;
    if (!parts.every((p) => p.submitted) && !(force && timeUp)) return;
    for (const p of parts) if (!p.submitted) Object.assign(p, { submitted: true, result: 'timeout', valid: false });
    const q = parts.filter((p) => p.valid && p.result === 'caught' && p.score >= r.min_score)
      .sort((a, b) => a.finish_t - b.finish_t || b.score - a.score);
    const rest = parts.filter((p) => q.indexOf(p) < 0).sort((a, b) => (b.valid ? 1 : 0) - (a.valid ? 1 : 0) || b.score - a.score);
    q.concat(rest).forEach((p, i) => { p.placement = i + 1; });
    r.winner_id = q.length ? q[0].user_id : null;
    r.status = 'finished';
    this._hostChanged();
  }
}
