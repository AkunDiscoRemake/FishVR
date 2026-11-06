# Supabase setup — PERFECT FISHING VR

This guide covers everything needed to run the online backend: accounts, saved progress,
the server-validated economy, the global ranking and real-time PvP duels.

Without Supabase the game still runs, but **offline only**: single-player progress stays on
the device and nothing is ranked.

---

## 0. What the backend contains

```
supabase/
├── config.toml                         CLI config (anonymous sign-in enabled, JWT checks on functions)
├── migrations/
│   ├── 20261106000001_schema.sql       tables, views, new-user trigger
│   ├── 20261106000002_rls.sql          Row Level Security + column grants
│   ├── 20261106000003_functions.sql    transactional SQL functions (service_role only)
│   └── 20261106000004_realtime.sql     Realtime publication (+ optional pg_cron housekeeping)
└── functions/
    ├── _shared/game/*.js               THE game rules (species, rods, luck, PERFECT! fight model)
    ├── _shared/http.ts, rules.ts       CORS, auth, error helpers
    ├── fishing-start/                  server rolls the fish (species, size, bite delay)
    ├── fishing-complete/               server re-simulates the fight from the action log
    ├── shop/                           buy / equip rods, sell fish (prices from the server catalogue)
    └── pvp/                            rooms, invites, start, submit, finalize, winner
```

### Tables

| Table | Purpose | Player can write? |
|---|---|---|
| `profiles` | username, coins, xp, level, equipped rod, stats, PvP wins | only `username`, `settings` |
| `player_rods` | rods owned | no (shop function) |
| `fishing_sessions` | one row per cast, holds the server seed and the rolled fish | no |
| `fish_inventory` | caught fish with server-computed value | no |
| `fish_discoveries` | personal catalogue (count, best weight/length/score) | no |
| `pvp_rooms` | duel rooms (public/private, 6-digit code, shared seed + fish) | no |
| `pvp_participants` | players in a room, ready flag, validated score/result/placement | no |
| `pvp_invites` | invitations | no |
| `leaderboard` (view) | public ranking data | read only |
| `match_history` (view) | duels a player took part in | read only |

### Anti-cheat model

* The browser only holds the **anon** key. The `service_role` key exists only inside Edge Functions.
* Players cannot `insert/update/delete` any economy table: RLS + revoked grants. `profiles`
  only allows updating `username` and `settings` (column-level grant).
* Coins, XP, catches, discoveries, purchases and PvP results change only through
  `SECURITY DEFINER` SQL functions whose `EXECUTE` is granted to `service_role` only.
* **The server decides what bites** (`fishing-start`): species, rarity, length, weight,
  shiny/trophy variant and bite delay come from a server-side crypto seed plus luck
  (rod + level) and the global event.
* **The server re-plays the fight** (`fishing-complete`, `pvp submit`): the client sends
  only its raw inputs, one `{beat index, time, rod yaw, rod pitch}` per action. The server
  regenerates the exact beat schedule from the seed, rates every action with the same
  PERFECT! thresholds, simulates tension, stamina and line distance, and decides
  caught/escaped/snapped, score, PERFECT count, coin value and XP. A client that says
  "caught" gets nothing unless the replay agrees.
* **Timing checks:** a fight cannot end faster than real time. The server compares its own
  clock (`now - started_at`) with the bite delay plus the fight length. Actions outside their
  beat windows, duplicate beats and malformed values reject the session.
* **Plausibility checks:** inhumanly precise aim (over 90% of actions under 0.6°) is
  rejected. Casting is limited to 15 per minute, only one session can be active at a time,
  and sessions expire after 15 minutes.
* **PvP:** every competitor gets the same seed, species, weight and regulation rod
  (`tournament_standard`). Winner = earliest *simulated* finish time among valid
  catches with `score >= min_score`. Prize and win/loss counters are written by
  `fn_pvp_finalize`.

> One limit no web game can remove: the client has to render the target direction, so a
> modified client could aim for the player (an aimbot). The server makes that a bounded
> exploit: no fake fish, coins, purchases, results or impossible times, and suspiciously
> perfect aim is rejected.

---

## 1. Create the project

1. Go to <https://supabase.com/dashboard> → **New project**. Pick a region close to your players.
2. Wait until the database is ready.
3. **Project Settings → API**: copy
   * `Project URL` → `VITE_SUPABASE_URL`
   * `anon` / `publishable` key → `VITE_SUPABASE_ANON_KEY`
   * **Do not copy the `service_role` key anywhere in the frontend.**

## 2. Enable the auth providers

**Authentication → Sign In / Providers**

* **Email**: enabled. For quick testing you may disable "Confirm email". With it on,
  players confirm by e-mail before the first sign-in.
* **Anonymous sign-ins**: **enable**. The in-headset "PLAY AS GUEST" button and the
  2D page's "Guest" button need it, because typing in a headset is hard.
* **Authentication → URL Configuration**: set *Site URL* to where you host the game
  (e.g. `https://your-domain.com`), and add `http://localhost:5173` for development.

## 3. Install the Supabase CLI

```bash
npm i -g supabase        # or: brew install supabase/tap/supabase  /  scoop install supabase
supabase --version
supabase login           # opens the browser to create an access token
```

## 4. Link the repository to your project

From the repository root (the folder that contains `supabase/`):

```bash
supabase link --project-ref YOUR-PROJECT-REF
# the ref is the subdomain of your Project URL: https://YOUR-PROJECT-REF.supabase.co
```

## 5. Run the migrations

```bash
supabase db push
```

This creates all tables, RLS policies, grants, SQL functions and the Realtime publication.

*Alternative without the CLI:* open **SQL Editor** and run the four files in
`supabase/migrations/` **in filename order**.

Check the result in **Table Editor**: you should see `profiles`, `player_rods`,
`fishing_sessions`, `fish_inventory`, `fish_discoveries`, `pvp_rooms`, `pvp_participants`,
`pvp_invites`, all marked **RLS enabled**.

### Optional: automatic housekeeping

Enable **Database → Extensions → pg_cron**, then run
`supabase/migrations/20261106000004_realtime.sql` again (or just the last `do $$ ... $$` block).
It schedules `fn_housekeeping()` every 10 minutes to expire stale sessions, rooms and invites.
The game works without it.

## 6. Realtime

The migration adds `pvp_rooms`, `pvp_participants`, `pvp_invites` and `profiles` to the
`supabase_realtime` publication. Confirm under **Database → Publications → supabase_realtime**
that the four tables are listed.

The client uses three Realtime features:

* **Presence** on channel `online-players` (who is online, for invites),
* **Postgres Changes** on rooms, participants and invites. These still go through RLS, so private rooms stay private,
* **Broadcast** on `room-<id>` for the live duel scoreboard. This is cosmetic only: final
  scores always come from the server re-simulation.

## 7. Deploy the Edge Functions

```bash
supabase functions deploy fishing-start
supabase functions deploy fishing-complete
supabase functions deploy shop
supabase functions deploy pvp
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are **injected
automatically** into Edge Functions by Supabase. You don't need to set them.

Optional secret: restrict CORS to your domain:

```bash
supabase secrets set ALLOWED_ORIGIN=https://your-domain.com
```

The functions import the shared game rules from `supabase/functions/_shared/game/`, the same
files the browser bundles. The CLI bundles `_shared` automatically.

All four functions keep JWT verification on (`verify_jwt = true` in `config.toml`), so
anonymous callers are refused before the code runs.

## 8. Configure the frontend

```bash
cp .env.example .env.local
# edit .env.local
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

Restart `npm run dev` (Vite reads env files at startup) or rebuild with `npm run build`.
For hosting, set the same two variables in your host's build settings
(Vercel / Netlify / Cloudflare Pages → Environment Variables).

## 9. Verify everything works

1. Open the game, then on the 2D page click **Guest** (or sign up).
   *Account* should show `Signed in as ... ONLINE`.
2. **Table Editor → profiles**: a row was created with 250 coins and `player_rods` has `willow_starter`.
3. Cast and catch a fish. `fishing_sessions` gets a row (`status = caught`), and
   `fish_inventory` plus `fish_discoveries` get rows.
4. **Edge Functions → fishing-complete → Logs** shows the call.
5. Try to cheat from the browser console. It must fail:
   ```js
   const { supabase } = await import('/src/supabase/client.js');
   await supabase.from('profiles').update({ coins: 999999 }).eq('id', (await supabase.auth.getUser()).data.user.id);
   // -> error: permission denied for table profiles
   ```
6. PvP: open the game in two browsers with two different accounts. Have one create a room and the other join
   (public list or 6-digit code), press READY, then have the host press START DUEL.

## 10. Local development with Docker (optional)

```bash
supabase start                 # local Postgres + Auth + Realtime + Functions
supabase db reset              # applies migrations
supabase functions serve       # serves all functions with hot reload
# use the printed API URL / anon key in .env.local
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Anonymous sign-ins are disabled` | Enable step 2 (Anonymous sign-ins). |
| Functions return `401 invalid_token` | Sign in again. Make sure the client uses the same project's anon key. |
| Functions return `server_not_configured` | The function runs outside Supabase without `SUPABASE_SERVICE_ROLE_KEY`. Redeploy with the CLI. |
| Lobby does not update live | Check step 6 (publication). Realtime must be enabled for the project. |
| `world_locked` | Reach the world's level first (Lake 1, River 2, Ocean 4, Tropical 6, Deep 8). |
| `too_fast` / `suspicious_precision` rejections | Expected for scripted or modified clients. Normal play never triggers them. |
| CORS errors | Unset `ALLOWED_ORIGIN` or set it to your exact origin (scheme + host + port). |
