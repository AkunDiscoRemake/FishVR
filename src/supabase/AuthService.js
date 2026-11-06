// Authentication: email/password, anonymous guest accounts, sign out, username changes.
import { supabase, supabaseConfigured } from './client.js';
import { bus } from '../core/EventBus.js';

export class AuthService {
  constructor() {
    this.user = null;
    this.configured = supabaseConfigured;
    if (supabase) {
      supabase.auth.onAuthStateChange((_event, session) => {
        const u = session ? session.user : null;
        const changed = (u && u.id) !== (this.user && this.user.id);
        this.user = u;
        if (changed) bus.emit('auth', { user: u });
      });
    }
  }

  async init() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    this.user = data.session ? data.session.user : null;
    return this.user;
  }

  get isLoggedIn() { return !!this.user; }

  async signUp(email, password, username) {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
    if (error) throw error;
    return data;
  }

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async signInGuest(username) {
    const { data, error } = await supabase.auth.signInAnonymously({ options: { data: { username: username || 'Angler' } } });
    if (error) throw error;
    return data;
  }

  async signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  async setUsername(name) {
    const { error } = await supabase.from('profiles').update({ username: name }).eq('id', this.user.id);
    if (error) throw error;
  }
}
