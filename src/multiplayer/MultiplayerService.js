// Real multiplayer over Supabase: Realtime Presence (who is online), Postgres Changes
// (rooms, participants, invites - filtered by RLS) and Broadcast (live duel scores).
// All authoritative actions go through the `pvp` Edge Function.
import { supabase, invoke } from '../supabase/client.js';
import { bus } from '../core/EventBus.js';

export class MultiplayerService {
  constructor(game) {
    this.game = game;
    this.started = false;
    this.online = [];
    this.publicRooms = [];
    this.room = null;
    this.participants = [];
    this.invites = [];
    this.live = {}; // user_id -> live progress
    this.clockOffset = 0; // serverTime - Date.now()
    this.presenceChannel = null;
    this.roomChannel = null;
    this.userChannel = null;
  }

  get available() { return !!(supabase && this.game.auth.isLoggedIn && this.game.backend && this.game.backend.online); }
  get uid() { return this.game.auth.user ? this.game.auth.user.id : null; }
  serverNow() { return Date.now() + this.clockOffset; }

  _syncClock(serverTime, t0, t1) {
    if (!serverTime) return;
    const off = serverTime - (t0 + t1) / 2;
    this.clockOffset = this._clockSamples ? this.clockOffset * 0.6 + off * 0.4 : off;
    this._clockSamples = (this._clockSamples || 0) + 1;
  }

  async call(action, body = {}) {
    const t0 = Date.now();
    const res = await invoke('pvp', Object.assign({ action }, body));
    this._syncClock(res && res.serverTime, t0, Date.now());
    return res;
  }

  async start() {
    if (this.started || !this.available) return;
    this.started = true;
    const p = this.game.profile;
    // presence: who is online
    this.presenceChannel = supabase.channel('online-players', { config: { presence: { key: this.uid } } });
    this.presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = this.presenceChannel.presenceState();
        this.online = Object.keys(state).map((k) => state[k][0]).filter(Boolean);
        bus.emit('mp-changed');
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await this.trackPresence('menu');
      });
    // personal channel: invites + room list changes
    this.userChannel = supabase.channel('user-' + this.uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pvp_invites', filter: 'to_user=eq.' + this.uid }, (payload) => {
        const inv = payload.new;
        if (payload.eventType === 'INSERT' && inv.status === 'pending') {
          bus.emit('mp-invite', inv);
        }
        this.loadInvites();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pvp_rooms' }, () => this.refreshRooms())
      .subscribe();
    await Promise.all([this.refreshRooms(), this.loadInvites(), this.call('time').catch(() => {})]);
    // rejoin a room we are still in (page reload)
    const mine = await supabase.from('pvp_participants').select('room_id, pvp_rooms!inner(*)').eq('user_id', this.uid).in('pvp_rooms.status', ['lobby', 'active']).limit(1);
    if (mine.data && mine.data.length) await this._enterRoom(mine.data[0].pvp_rooms);
    void p;
  }

  async stop() {
    this.started = false;
    for (const ch of [this.presenceChannel, this.userChannel, this.roomChannel]) if (ch) await supabase.removeChannel(ch);
    this.presenceChannel = this.userChannel = this.roomChannel = null;
    this.room = null; this.participants = []; this.online = []; this.invites = [];
    bus.emit('mp-changed');
  }

  async trackPresence(status) {
    if (!this.presenceChannel) return;
    const p = this.game.profile;
    await this.presenceChannel.track({ user_id: this.uid, username: p ? p.username : 'Angler', level: p ? p.level : 1, status, at: Date.now() });
  }

  async refreshRooms() {
    if (!supabase) return;
    const { data } = await supabase.from('pvp_rooms').select('*, pvp_participants(count)')
      .eq('status', 'lobby').eq('is_private', false).order('created_at', { ascending: false }).limit(20);
    this.publicRooms = (data || []).map((r) => Object.assign(r, { players: r.pvp_participants && r.pvp_participants[0] ? r.pvp_participants[0].count : 0 }));
    bus.emit('mp-changed');
  }

  async loadInvites() {
    const { data } = await supabase.from('pvp_invites').select('*').eq('to_user', this.uid).eq('status', 'pending').order('created_at', { ascending: false });
    this.invites = data || [];
    bus.emit('mp-changed');
  }

  async _enterRoom(room) {
    if (this.roomChannel) { await supabase.removeChannel(this.roomChannel); this.roomChannel = null; }
    this.room = room;
    this.live = {};
    if (!room) { bus.emit('mp-changed'); await this.trackPresence('menu'); return; }
    this.roomChannel = supabase.channel('room-' + room.id, { config: { broadcast: { self: false } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pvp_rooms', filter: 'id=eq.' + room.id }, (payload) => {
        if (payload.new && payload.new.id) { this.room = payload.new; this._roomUpdated(); }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pvp_participants', filter: 'room_id=eq.' + room.id }, () => this.loadParticipants())
      .on('broadcast', { event: 'live' }, ({ payload }) => {
        if (payload && payload.user_id) { this.live[payload.user_id] = payload; bus.emit('mp-live'); }
      })
      .subscribe();
    await this.loadParticipants();
    await this.trackPresence('in-room');
    this._roomUpdated();
  }

  async reloadRoom() {
    if (!this.room) return;
    const { data } = await supabase.from('pvp_rooms').select('*').eq('id', this.room.id).maybeSingle();
    if (data) { this.room = data; this._roomUpdated(); }
  }

  _roomUpdated() {
    bus.emit('mp-room', this.room);
    bus.emit('mp-changed');
  }

  async loadParticipants() {
    if (!this.room) return;
    const { data } = await supabase.from('pvp_participants').select('*').eq('room_id', this.room.id).order('joined_at');
    this.participants = data || [];
    bus.emit('mp-changed');
  }

  sendLive(payload) {
    if (!this.roomChannel) return;
    const msg = Object.assign({ user_id: this.uid, username: this.game.profile ? this.game.profile.username : '' }, payload);
    this.live[this.uid] = msg;
    this.roomChannel.send({ type: 'broadcast', event: 'live', payload: msg });
    bus.emit('mp-live');
  }

  // ------------------------------------------------------------ actions
  async createRoom(isPrivate, worldId) {
    const r = await this.call('create', { isPrivate, worldId, name: (this.game.profile ? this.game.profile.username : 'Angler') + "'s duel", maxPlayers: 4 });
    await this._enterRoom(r.room);
    return r.room;
  }
  async joinCode(code) { const r = await this.call('join', { code }); await this._enterRoom(r.room); return r.room; }
  async joinRoom(id) { const r = await this.call('join', { roomId: id }); await this._enterRoom(r.room); return r.room; }
  async leaveRoom() {
    if (!this.room) return;
    const id = this.room.id;
    await this.call('leave', { roomId: id }).catch(() => {});
    await this._enterRoom(null);
    this.refreshRooms();
  }
  async setReady(ready) { await this.call('ready', { roomId: this.room.id, ready }); await this.loadParticipants(); }
  async startMatch() { const r = await this.call('start', { roomId: this.room.id }); this.room = r.room; this._roomUpdated(); return r.room; }
  async invite(userId) { return this.call('invite', { roomId: this.room.id, toUser: userId }); }
  async respond(inviteId, accept) {
    const r = await this.call('respond', { inviteId, accept });
    await this.loadInvites();
    if (accept && r.room) await this._enterRoom(r.room);
    return r;
  }
  async submit(actions) { const r = await this.call('submit', { roomId: this.room.id, actions }); if (r.room) { this.room = r.room; this._roomUpdated(); } await this.loadParticipants(); return r; }
  async finalize() { const r = await this.call('finalize', { roomId: this.room.id }); if (r.room) { this.room = r.room; this._roomUpdated(); } await this.loadParticipants(); return r; }
}
