// Main orchestrator: owns renderer, VR presentation, input, world, fishing, UI, backends and multiplayer.
import * as THREE from 'three';
import { QUALITY } from './Capabilities.js';
import { settings } from './Settings.js';
import { bus } from './EventBus.js';
import { VRManager } from '../rendering/VRManager.js';
import { Sky } from '../rendering/Sky.js';
import { Water } from '../rendering/Water.js';
import { Particles } from '../rendering/Particles.js';
import { InputManager } from '../input/InputManager.js';
import { Locomotion } from '../movement/Locomotion.js';
import { World } from '../worlds/World.js';
import { FishManager } from '../fish/FishAI.js';
import { FishingController, errorText } from '../fishing/FishingController.js';
import { UIManager } from '../ui/UIManager.js';
import { HUD } from '../ui/HUD.js';
import { Menu } from '../ui/Menu.js';
import { CatchCard } from '../ui/CatchCard.js';
import { audio } from '../audio/AudioEngine.js';
import { AuthService } from '../supabase/AuthService.js';
import { OfflineBackend } from '../economy/OfflineBackend.js';
import { OnlineBackend } from '../economy/OnlineBackend.js';
import { MultiplayerService } from '../multiplayer/MultiplayerService.js';
import { P2PMultiplayerService } from '../multiplayer/P2PMultiplayerService.js';
import { supabaseConfigured } from '../supabase/client.js';
import { PvPMatch } from '../multiplayer/PvPMatch.js';
import { SPECIES, WORLDS_BY_ID, eventFor } from '@game/index.js';

export class Game {
  constructor(caps, container) {
    this.caps = caps;
    this.container = container;
    const q = settings.get('quality');
    this.tier = q === 'auto' ? caps.tier : q;
    this.quality = QUALITY[this.tier];
    this.audio = audio;
    this.speciesCount = SPECIES.length;
    this.errorText = errorText;
    this.world = null;
    this.profile = null;
    this.backend = null;
    this.fps = 60;
    this._fpsAcc = 0; this._fpsN = 0;
  }

  async init(onProgress) {
    const q = this.quality;
    const renderer = new THREE.WebGLRenderer({ antialias: q.antialias, powerPreference: 'high-performance', alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = this.tier === 'low' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = !!q.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 1500);
    this.rig = new THREE.Group(); this.rig.name = 'rig';
    this.crouch = new THREE.Group(); this.crouch.name = 'crouch';
    this.rig.add(this.crouch);
    this.crouch.add(this.camera);
    this.scene.add(this.rig);

    this.vr = new VRManager(renderer, this.camera, this.rig, this.crouch, this.caps);
    this.input = new InputManager(this.vr, this.camera, this.crouch, renderer.domElement, this.caps);
    this.locomotion = new Locomotion(this.rig, this.crouch, this.camera, this.input, this.vr);
    onProgress && onProgress(0.2, 'Sky & water');

    this.sky = new Sky(q);
    this.scene.add(this.sky.mesh);
    this.water = new Water(q, true);
    this.scene.add(this.water.mesh);
    this.particles = new Particles(q.particles, window.innerHeight);
    this.scene.add(this.particles.points);
    this.fish = new FishManager(this.scene, q);

    this.ui = new UIManager(this.scene, this.input, this.camera);
    this.hud = new HUD(this.scene, this.camera, this.ui, () => this.toggleMenu());
    this.fishing = new FishingController({
      scene: this.scene, input: this.input, camera: this.camera, quality: q, particles: this.particles, fish: this.fish,
      hud: this.hud, water: this.water, worldRef: () => this.world, backendRef: () => this.backend,
    });

    onProgress && onProgress(0.4, 'Account');
    this.auth = new AuthService();
    try { await this.auth.init(); } catch (e) { console.warn(e); }
    await this._setupBackend();
    // Supabase when configured, otherwise serverless peer-to-peer multiplayer (WebRTC).
    this.mp = supabaseConfigured ? new MultiplayerService(this) : new P2PMultiplayerService(this);
    this.menu = new Menu(this);
    this.catchCard = new CatchCard(this);
    this.pvp = new PvPMatch(this, this.mp);

    onProgress && onProgress(0.6, 'World');
    await this.loadWorld('lake', true);

    bus.on('auth', async () => {
      await this._setupBackend();
      if (this.mp.started) await this.mp.stop();
      if (this.mp.available) this.mp.start().catch(() => {});
      this.menu.refresh();
    });
    bus.on('fish-result', (r) => this._onFishResult(r));
    bus.on('mp-invite', (inv) => { this.hud.toast(inv.from_username + ' invited you to a duel! Open MULTIPLAYER.', '#ffd23f', 6); audio.newDiscovery(); });
    bus.on('vr-mode', ({ mode }) => {
      this.particles.setPixelHeight(this.vr.pixelHeight());
      if (this.world) this.world.setPixelHeight(this.vr.pixelHeight());
      bus.emit('vr-mode-ui', mode);
    });
    bus.on('settings', ({ key }) => { if (key === 'handedness') this.fishing.setRod(this.profile.equippedRod); });
    window.addEventListener('resize', () => this._onResize());
    if (this.mp.available) this.mp.start().catch((e) => console.warn('mp', e));

    this.clock = new THREE.Clock();
    this.vr.setAnimationLoop((t, frame) => this._frame(frame));
    this.menu.open('main');
    onProgress && onProgress(1, 'Ready');
  }

  async _setupBackend() {
    let backend;
    if (this.auth.isLoggedIn) {
      backend = new OnlineBackend(this.auth.user);
      try { await backend.init(); } catch (e) {
        console.warn('online backend failed, using offline', e);
        this.hud && this.hud.toast('Could not reach the server - playing offline', '#ffb07a');
        backend = new OfflineBackend();
        await backend.init();
      }
    } else {
      backend = new OfflineBackend();
      await backend.init();
    }
    if (this.fishing && this.fishing.busy) this.fishing.abort();
    this.backend = backend;
    this.profile = backend.profile;
    if (this.fishing) this.fishing.setRod(this.profile.equippedRod);
    this._updateHudInfo();
    bus.emit('profile', this.profile);
  }

  async refreshProfile() {
    if (!this.backend) return;
    try { this.profile = await this.backend.refresh(); } catch (e) { /* ignore */ }
    this._updateHudInfo();
    if (this.menu) this.menu.refresh();
  }

  _updateHudInfo() {
    if (!this.hud || !this.profile) return;
    this.hud.setInfo({
      coins: this.profile.coins, level: this.profile.level, online: !!(this.backend && this.backend.online),
      world: this.world ? this.world.def.name : '', event: this.world ? eventFor(this.world.id, Date.now()) : null,
    });
  }

  async loadWorld(id, silent) {
    if (this.world && this.world.id === id) { this.locomotion.setWorld(this.world); return; }
    this.fishing.abort();
    if (this.world) this.world.detach();
    const w = new World(id, this.quality, this.sky, this.water, this.scene);
    w.attach();
    w.setPixelHeight(this.vr.pixelHeight());
    this.world = w;
    this.fish.setWorld(w);
    this.locomotion.setWorld(w);
    this.particles.waterLevel = 0;
    audio.setAmbience(w.preset.ambience);
    this._updateHudInfo();
    if (!silent) {
      const ev = eventFor(id, Date.now());
      this.hud.prompt(WORLDS_BY_ID[id].name, '#ffffff', 2.5);
      if (ev.id !== 'none') this.hud.toast('EVENT: ' + ev.name + ' - ' + ev.desc, '#ff9af0', 6);
      this.hud.toast('Hold the trigger and release (or swing) to cast', '#cfe8ff', 6);
    }
  }

  // --------------------------------------------------------------- VR entry
  async enterVR(kind) {
    audio.unlock();
    if (kind === 'webxr') await this.vr.enterWebXR(this.quality);
    else if (kind === 'webvr') await this.vr.enterWebVR();
    else if (kind === 'cardboard') await this.vr.enterCardboard();
    this.menu.open(this.world ? null : 'main');
  }
  async exitVR() { await this.vr.exit(); }
  recenter() {
    this.vr.recenter();
    if (this.menu.isOpen) this.menu.open();
  }

  toggleMenu() {
    if (this.catchCard.open) return;
    if (this.menu.isOpen) { if (this.world) this.menu.close(); }
    else { this.menu.open('main'); this.input.releasePointerLock(); }
  }

  // --------------------------------------------------------------- economy actions
  async buyRod(id) { const r = await this.backend.buyRod(id); audio.purchase(); await this.refreshProfile(); return r; }
  async equipRod(id) { const r = await this.backend.equipRod(id); await this.refreshProfile(); this.fishing.setRod(id); return r; }
  async sellFish(ids) { const r = await this.backend.sellFish(ids); audio.purchase(); await this.refreshProfile(); return r; }
  async sellAll() { const r = await this.backend.sellAll(); audio.purchase(); await this.refreshProfile(); return r; }
  async signInGuest() { await this.auth.signInGuest(this.profile ? this.profile.username : 'Angler'); }
  async signOut() { if (this.mp.started) await this.mp.stop(); await this.auth.signOut(); }

  // --------------------------------------------------------------- catch flow
  async _onFishResult(r) {
    const res = r.res || {};
    await this.refreshProfile();
    if (r.local && r.local.result === 'caught') {
      if (res.new_discovery) { audio.newDiscovery(); this.hud.prompt('NEW SPECIES!', '#ffd23f', 2.5); }
      this.catchCard.show(r);
      this.fishing.state = 'result';
    } else {
      if (res.status === 'rejected' || res.status === 'error') this.hud.toast('Server: ' + (res.reason || res.status), '#ff8a7a', 5);
    }
  }

  closeCatchCard() {
    this.catchCard.hide();
    this.fishing.finishLanding();
  }

  async sellFromCard(id) {
    try {
      const r = await this.sellFish([id]);
      this.hud.toast('Sold for ' + r.earned + ' coins', '#ffd23f');
    } catch (e) { this.hud.toast(errorText(e.message), '#ff8a7a'); }
    this.closeCatchCard();
  }

  // --------------------------------------------------------------- frame
  _onResize() {
    if (this.vr.mode === 'webvr' || this.vr.mode === 'webxr') return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.particles.setPixelHeight(this.vr.pixelHeight());
    if (this.world) this.world.setPixelHeight(this.vr.pixelHeight());
  }

  /**
   * Adaptive rendering: keeps the frame rate near the display refresh. Flat screen adjusts
   * the pixel ratio; immersive modes raise fixed foveation and thin out vegetation.
   */
  _adapt() {
    const target = this.vr.mode === 'flat' || this.vr.mode === 'cardboard' ? 55 : 68;
    this._adaptLevel = this._adaptLevel || 0;
    if (this.fps < target * 0.85 && this._adaptLevel < 3) this._adaptLevel++;
    else if (this.fps > target * 1.05 && this._adaptLevel > 0) this._adaptLevel--;
    else return;
    const L = this._adaptLevel, q = this.quality;
    if (this.vr.mode === 'flat' || this.vr.mode === 'cardboard') {
      const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio) * [1, 0.85, 0.7, 0.55][L];
      this.renderer.setPixelRatio(Math.max(0.5, pr));
      this.particles.setPixelHeight(this.vr.pixelHeight());
    } else if (this.vr.mode === 'webxr') {
      try { this.renderer.xr.setFoveation(Math.min(1, q.foveation + L * 0.25)); } catch (e) { /* not supported */ }
    }
    if (this.world && this.world.vegetation) {
      // drop grass/reeds first (most instances), keep trees and structures
      this.world.vegetation.children.forEach((m, i) => { if (m.isInstancedMesh && m.count > 200) m.visible = L < 2 || i % 2 === 0; });
    }
  }

  _frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc > 1) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; this._adapt(); }
    const input = this.input;
    input.update(dt);
    if (input.menuToggle) this.toggleMenu();
    if (input.recenterPressed) this.recenter();

    const menuOpen = this.menu.isOpen;
    const busy = this.fishing.busy;
    this.locomotion.enabled = !menuOpen && !busy && !this.catchCard.open;
    this.locomotion.update(dt);

    this.ui.update(dt, menuOpen || this.catchCard.open);
    const uiConsumed = input.consumedTrigger || menuOpen || this.catchCard.open;
    this.fishing.enabled = !this.catchCard.open;
    this.fishing.update(dt, uiConsumed);

    const head = this.camera.getWorldPosition(new THREE.Vector3());
    if (this.world) this.world.update(dt, head);
    this.sky.update(dt, this.camera);
    this.water.update(dt, this.camera);
    this.particles.update(dt);
    this.hud.flat = this.vr.mode === 'flat';
    this.hud.update(dt, false);
    this.menu.update(dt);
    this.pvp.update(dt);

    if (this.water.reflectionEnabled && this.vr.mode === 'flat') this.water.renderReflection(this.renderer, this.scene, this.camera);
    this.vr.render(this.scene);
  }
}
