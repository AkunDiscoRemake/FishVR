# Instalação pelo painel do Supabase (sem CLI)

Arquivos gerados automaticamente (`npm run build:dashboard`) a partir de `supabase/migrations` e `supabase/functions`:

| Arquivo | Onde colar |
|---|---|
| `ALL_MIGRATIONS.sql` | Dashboard → **SQL Editor** → New query → colar tudo → **Run** |
| `fishing-start.ts` | Dashboard → **Edge Functions** → Deploy a new function → *Via Editor* → nome `fishing-start` |
| `fishing-complete.ts` | idem, nome `fishing-complete` |
| `shop.ts` | idem, nome `shop` |
| `pvp.ts` | idem, nome `pvp` |

Cada `.ts` é um arquivo único (as regras do jogo já estão embutidas). O nome da função precisa ser exatamente o indicado.
Não edite estes arquivos: edite as fontes e rode `npm run build:dashboard` de novo.
