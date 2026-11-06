// Single entry that contains all four Edge Functions. Paste the BUILT file
// (supabase/dashboard/game-server.ts) into each of the 4 functions in the dashboard:
// it routes by the function name in the URL (fishing-start, fishing-complete, shop, pvp).
import { corsHeaders } from '../../functions/_shared/http.ts';

const handlers: Record<string, (req: Request) => Promise<Response>> = {};
let current = '';
(globalThis as any).__pfvrRegister = (h: (req: Request) => Promise<Response>) => { handlers[current] = h; };
current = 'fishing-start'; await import('../../functions/fishing-start/index.ts');
current = 'fishing-complete'; await import('../../functions/fishing-complete/index.ts');
current = 'shop'; await import('../../functions/shop/index.ts');
current = 'pvp'; await import('../../functions/pvp/index.ts');
(globalThis as any).__pfvrRegister = undefined;

Deno.serve((req: Request) => {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const name = parts.find((p) => handlers[p]);
  if (!name) {
    return new Response(JSON.stringify({ error: 'unknown_function', path: parts }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  return handlers[name](req);
});
