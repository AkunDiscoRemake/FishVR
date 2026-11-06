// Supabase browser client. Uses ONLY the public anon key (RLS + Edge Functions enforce security).
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || '';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabaseConfigured = !!(url && key && url.indexOf('YOUR-PROJECT') < 0);

export const supabase = supabaseConfigured
  ? createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 12 } },
  })
  : null;

/** Calls an Edge Function and throws an Error carrying the server's error code. */
export async function invoke(name, body) {
  if (!supabase) throw new Error('server_not_configured');
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let code = error.message || 'request_failed';
    try {
      if (error.context && typeof error.context.json === 'function') {
        const j = await error.context.json();
        if (j && j.error) code = j.error;
      }
    } catch (e) { /* ignore */ }
    throw new Error(code);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}
