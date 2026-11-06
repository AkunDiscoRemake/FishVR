# PERFECT FISHING VR

A VR fishing game for the web, built with **Three.js + WebGL**: a physical rod and line,
fish with their own behaviour, a precision fight system called **PERFECT!**, 143 species,
a rod shop with trade-offs, luck and world events, and **real online multiplayer** on **Supabase**
with server-validated scores.

It runs on:

| Device | Path used | Notes |
|---|---|---|
| **Oculus Go** | WebXR (newer Oculus Browser) **or legacy WebVR 1.1** | 3DoF controller with arm model, `low` quality tier |
| **Meta Quest 1/2/3/Pro** | WebXR | 6DoF, thumbstick locomotion, `medium`/`high` tier |
| **VR Box / Google Cardboard** | WebXR on Android Chrome when available, otherwise built-in Cardboard mode (gyroscope + side-by-side stereo with lens distortion) | tap = trigger, Bluetooth gamepads supported |
| **Desktop / Android / iOS browser** | flat screen | mouse/keyboard, gamepad or touch controls |

---

## Running locally

Requirements: **Node.js 18+**.

```bash
npm install
npm run dev          # http://localhost:5173  (desktop testing)
npm run dev:https    # https://<your-LAN-IP>:5173  (headsets: WebXR needs HTTPS)
npm test             # rule/fight-model unit tests (node:test)
npm run build        # production build in dist/
npm run preview      # serve dist/
```

Without a `.env.local` the game runs in **offline mode**: single-player works and
progress is saved in `localStorage`. To enable accounts, the ranking and PvP, follow
**[SUPABASE_SETUP.md](SUPABASE_SETUP.md)** and create `.env.local`:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

## Hosting

`npm run build` produces a fully static site in `dist/` (relative paths, so any sub-folder works).
Host it on any **HTTPS** static host: Netlify, Vercel, Cloudflare Pages, GitHub Pages or S3+CloudFront.
WebXR, WebVR and the motion sensors only work on **HTTPS** (or `localhost`).

* Build command: `npm run build`, output directory: `dist`
* Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public values only)
* Add your production URL to Supabase **Auth → URL Configuration**.

## Testing on Oculus Go

1. Host the game on HTTPS (deploy, or run `npm run dev:https` on a PC on the same Wi-Fi).
2. In the Go, open **Oculus Browser** and go to the URL. With the self-signed dev certificate,
   accept the warning ("Advanced → Proceed").
3. The start page says *"Oculus Go detected"* and picks the **low** quality tier.
4. Press **ENTER VR**. The game uses WebXR when the browser has it, and otherwise legacy WebVR.
   If one fails, the other button is shown as well.
5. Controls (Go controller):
   * **Trigger**: hold and release (or swing the controller forward) to cast. Press when the float
     goes under (STRIKE!). Press on every ring during the fight.
   * **Touchpad**: touch top/bottom to walk, left/right edge for snap turns.
     *Settings → Touchpad walking → click* makes it walk only while the pad is clicked.
   * **Touchpad centre click**: crouch / stand up (configurable: centre-click, double-click, off).
   * **Hold the touchpad centre (0.8 s)** or point at the **MENU** button under your view: open the menu.
   * The Go's back/home buttons are reserved by the system. The game never relies on them.
6. Sign in on the 2D page before entering VR (typing in the headset is slow), or use
   **PLAY AS GUEST** inside VR.

## Testing on Meta Quest

1. Open the HTTPS URL in **Meta Quest Browser** → **ENTER VR**.
2. **Trigger** = rod action, **thumbstick** = walk/turn, **thumbstick click** = crouch,
   **A/B/X/Y** = menu. Haptics are on by default (Settings → Haptics).
3. Quest 2/3/Pro use the **high** tier (standard PBR materials, shadows, clouds, more vegetation and fish).
   Quest 1 uses **medium**. Override it on the start page (Graphics) or in Settings.

## Testing with Cardboard / VR Box

Open the HTTPS URL in Chrome on Android (or Safari on iOS) → **CARDBOARD / VR BOX**, allow motion
sensors, then put the phone in the viewer. Tap the screen (or press the viewer's button) for the
trigger. To walk, look down at the floor and hold the trigger. Tune IPD, FOV and lens distortion in
**Settings**. When Android Chrome supports WebXR with Cardboard, **ENTER VR** uses it instead.

## Desktop controls

WASD walk · Q/E snap turn · click the scene to lock the mouse (or right-drag) to look ·
left click / Space = trigger · C crouch · M / Esc menu · R recenter.

---

## How to play

1. **Cast:** hold the trigger. The power meter oscillates. Release at the top, or swing the
   controller forward and release for a physical cast (the faster the swing, the farther).
   Press the trigger in flight to thumb the spool and stop short.
2. **Wait:** the float bobs on the waves. The server has already picked the fish, which swims in, nibbles
   (small dips and clicks), then **bites**: the float goes under and you hear a splash.
3. **Strike:** press the trigger, or flick the rod up, within 1.1 s.
4. **Fight (PERFECT! system):** the fish runs, dives, jumps, zig-zags and rests. Each move
   appears as a **ring** at the direction your rod must point (you counter the fish: it runs left,
   you sweep right). The small gold inner circle is the **PERFECT** zone. Point the rod
   (your dot) into the ring and **press the trigger** while the window is open (the blue ring shrinks).
   * **PERFECT!** ≤ 5°, **Amazing!** ≤ 10°, **Good!** ≤ 17°, **Not very good.** ≤ 26°, **BAD!** ≤ 38°,
     otherwise or no press **Failed!**. All thresholds are scaled by rod precision and fish difficulty.
   * Good actions drain the fish's stamina and recover line. Bad ones let it pull line out and raise
     **tension**. At 100% tension the line **snaps**. If it takes all your line, it **escapes**.
   * Consecutive PERFECTs build a combo multiplier (+10% each, max ×2).
5. **Land:** the fish is lifted in front of you and the server-validated card shows species, weight,
   size, value, XP and your rating counts. **KEEP** it (Inventory) or **SELL NOW**.

## Features

* **Vertical slice:** dock on a lake, physical rod, Verlet fishing line, float and hook with
  buoyancy, fish AI, full PERFECT! fight, catch flow, locomotion, Oculus Go support.
* **143 species** (`supabase/functions/_shared/game/species.js`). Each one has its own body
  archetype (20 shapes), colours and pattern (16 procedural patterns plus species details), fins and
  extras (barbels, bills, swords, angler lures, sails, teeth, photophores...), size range,
  length→weight curve, speed/power/stamina, fight behaviour (7 profiles), rarity, value and difficulty.
* **5 worlds:** Misty Pine Lake, Rushing Rapids (flowing river), Saltwind Pier (ocean),
  Coral Lagoon (tropical, corals), Abyssal Trench (night, boat, bioluminescence). Each has its own
  terrain, vegetation, structures, sky, water, ambient particles and soundscape.
* **13 rods** with real trade-offs: precision, strength, control, elasticity, stability,
  reel speed, line capacity, luck and cast power. Each has its own 3D model that bends under
  tension. The shop has a live 3D preview.
* **Luck and events:** luck (rod + level) shifts rarity odds, trophy/shiny chances and fish size
  without guaranteeing anything. Global 30-minute events per world: Feeding Frenzy, Golden Hour,
  Rare Tide, The Legend Stirs and Storm Front (rain, darker light, rougher water, more tension).
* **Economy and progress:** coins, XP and levels (which unlock worlds), inventory, selling, and a
  personal catalogue with best weight/size/score per species.
* **Multiplayer (Supabase):** login (e-mail or guest), profile, server-saved inventory, coins,
  rods and catalogue, global ranking (score/coins/catches/legendary/duel wins), online players
  (Presence), public and private rooms (6-digit code), invites, ready check, synced countdown,
  live scoreboard (Broadcast), server-decided result, duel history.
* **Graphics:** Gerstner-style wave water with Fresnel sky reflection, sun glints, depth-based
  colour and transparency, shore foam, and planar reflections on desktop high. Also a procedural
  sky with sun, clouds and stars, a slow day cycle, adaptive quality tiers, instanced vegetation,
  distant mountain ranges, particles (splashes, sparkles, bubbles, fireflies, plankton, rain)
  and procedural textures (no low-quality downloaded assets).
* **Audio:** fully procedural WebAudio. Ambience per world, reel clicks, line-tension whine,
  splashes, bites, line snaps, a distinct sound for each rating, and fanfares.

## Project structure

```
index.html                 start page + overlay (VR entry, login, touch controls)
src/
  main.js                  boot
  core/                    Game orchestrator, capabilities & quality tiers, settings, event bus
  rendering/               VRManager (WebXR / WebVR / Cardboard), Water, Sky, Particles, textures, noise
  physics/                 VerletLine (fishing line), Lure (float + hook buoyancy/ballistics)
  fishing/                 FishingController (state machine), FightGuide (rings), RatingFeedback
  fish/                    FishModelFactory (procedural models + swim shader), FishAI
  rods/                    RodModel (segmented bending rod + reel)
  movement/                Locomotion (walk/turn/crouch/vignette), ArmModel (3DoF)
  input/                   InputManager (XR controllers, Go WebVR gamepad, gamepads, keyboard, touch, tap)
  ui/                      Panel (canvas UI), UIManager (laser/gaze), Menu + screens, HUD, CatchCard, DomOverlay
  audio/                   AudioEngine (procedural)
  worlds/                  World, presets, terrain, vegetation, structures
  economy/                 OfflineBackend, OnlineBackend
  supabase/                client, AuthService
  multiplayer/             MultiplayerService (Realtime), PvPMatch
supabase/
  migrations/              schema, RLS, functions, realtime
  functions/               Edge Functions + _shared/game (rules shared with the client)
tests/                     fight model / rules tests
```

The **game rules live in one place** (`supabase/functions/_shared/game`) and are imported by
both Vite (alias `@game`) and the Deno Edge Functions. Client and server simulate the same fight.

## Real compatibility limits

* **Oculus Go** is discontinued. Its last Oculus Browser has WebXR on recent firmware and WebVR 1.1 on
  all of them. The game supports both, but the hardware is weak (Snapdragon 821): it runs the
  `low` tier with fewer trees and fish, Lambert materials, no shadows and no clouds, at 0.85×
  resolution. Expect 60–72 fps in the lake and somewhat less in vegetation-heavy views.
* **3DoF** (Go, Cardboard): there is no real hand position. An arm model estimates it, and
  only the **direction** of the controller matters for casting and PERFECT!.
* **Cardboard mode** without WebXR has no reprojection or low-persistence display. Lens distortion
  is approximate and adjustable (IPD/FOV/distortion), and comfort depends on the phone's gyroscope.
* **iOS Safari** has no WebXR VR and no WebVR. Only the Cardboard (gyro) mode and flat mode are
  available, and motion sensors need a permission tap.
* **Haptics:** Quest yes, Android vibration yes, Oculus Go controller **no** (no actuator).
* **Visuals:** all models and textures are procedural (no downloaded art). They are detailed for
  the budget but are not photogrammetry. Planar water reflections are on only on desktop
  high, because stereo planar reflections cost too much on mobile VR.
* **Anti-cheat:** the server prevents forged fish, coins, purchases, results and impossible timings,
  and rejects inhumanly perfect aim. It cannot fully stop a modified client that aims for the
  player (true of any client-rendered aiming game).
* WebXR, WebVR and motion sensors **require HTTPS**.
