// Shared helpers for Edge Functions (Deno runtime).
import { createClient, SupabaseClient, User } from 'npm:@supabase/supabase-js@2';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Service-role client. NEVER expose this key to the browser. */
export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new HttpError(500, 'server_not_configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Resolves the calling user from the Authorization bearer token. */
export async function requireUser(req: Request, admin: SupabaseClient): Promise<User> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'missing_token');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'invalid_token');
  return data.user;
}

/** Wraps a handler with CORS, JSON parsing and error handling. */
export function serve(handler: (req: Request, body: any) => Promise<Response>) {
  Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }
    try {
      return await handler(req, body ?? {});
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      const msg = (e as Error)?.message ?? String(e);
      // Postgres raise exception messages from our SQL functions are safe to forward.
      const known = ['not_enough_coins', 'already_owned', 'not_owned', 'session_already_closed', 'session_not_found', 'room_not_found'];
      for (const k of known) if (msg.includes(k)) return json({ error: k }, 400);
      console.error(e);
      return json({ error: 'internal_error' }, 500);
    }
  });
}

export function must<T>(res: { data: T | null; error: any }, what: string): T {
  if (res.error) {
    const m = res.error.message ?? String(res.error);
    throw new Error(`${what}: ${m}`);
  }
  return res.data as T;
}
