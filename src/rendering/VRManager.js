// Unified VR presentation layer:
//   'webxr'     - navigator.xr immersive-vr (Meta Quest, Oculus Go on newer Oculus Browser, Android Chrome Cardboard)
//   'webvr'     - legacy WebVR 1.1 (Oculus Go / Gear VR / older browsers). Three.js removed WebVR, so we
//                 render both eyes ourselves from VRFrameData.
//   'cardboard' - phone in a VR Box / Cardboard viewer: device-orientation head tracking + side-by-side
//                 stereo with configurable barrel distortion.
//   'flat'      - desktop / phone screen.
import * as THREE from 'three';
import { settings } from '../core/Settings.js';
import { bus } from '../core/EventBus.js';

const distortVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const distortFrag = `
uniform sampler2D uTex; uniform float uK1; uniform float uK2;
varying vec2 vUv;
void main(){
  float eye = vUv.x < 0.5 ? 0.0 : 1.0;
  vec2 local = vec2((vUv.x - eye * 0.5) * 2.0, vUv.y) * 2.0 - 1.0;
  float r2 = dot(local, local);
  float scale = (1.0 + uK1 * r2 + uK2 * r2 * r2) / (1.0 + uK1 + uK2) ;
  vec2 d = local * scale * 1.0;
  if (abs(d.x) > 1.0 || abs(d.y) > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec2 uv = d * 0.5 + 0.5;
  uv.x = uv.x * 0.5 + eye * 0.5;
  gl_FragColor = texture2D(uTex, uv);
}`;

export class VRManager {
  constructor(renderer, camera, rig, crouch, caps) {
    this.renderer = renderer;
    this.camera = camera;
    this.rig = rig;
    this.crouch = crouch;
    this.caps = caps;
    this.mode = 'flat';
    this.refSpace = 'flat';
    this.loop = null;
    this.vrDisplay = caps.webvrDisplay || null;
    this.frameData = typeof window.VRFrameData !== 'undefined' ? new window.VRFrameData() : null;
    this.eyeCams = [new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()];
    for (const c of this.eyeCams) { c.matrixAutoUpdate = false; c.matrixWorldAutoUpdate = false; c.layers.enableAll(); }
    this._tmpM = new THREE.Matrix4();
    this._tmpM2 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this.orientation = { alpha: 0, beta: 90, gamma: 0, ok: false };
    this.orientationYawOffset = null;
    this._onOrient = (e) => {
      if (e.alpha === null && e.beta === null) return;
      this.orientation.alpha = e.alpha || 0; this.orientation.beta = e.beta || 0; this.orientation.gamma = e.gamma || 0;
      this.orientation.ok = true;
    };
    this.xrSession = null;
    renderer.xr.addEventListener('sessionend', () => {
      if (this.mode === 'webxr') this._setMode('flat');
    });
  }

  get isPresenting() { return this.mode !== 'flat'; }
  get isImmersive() { return this.mode === 'webxr' || this.mode === 'webvr' || this.mode === 'cardboard'; }

  /** Standing height that must be added by the rig (0 when the runtime reports floor-relative poses). */
  baseHeight() {
    if (this.mode === 'webxr' && this.refSpace === 'local-floor') return 0;
    if (this.mode === 'webvr' && this.vrDisplay && this.vrDisplay.stageParameters) return 0;
    return settings.get('playerHeight');
  }

  _setMode(mode) {
    const prev = this.mode;
    this.mode = mode;
    if (mode === 'flat' && prev !== 'flat') {
      this.camera.position.set(0, 0, 0);
      this.camera.quaternion.identity();
      this._restoreSize();
    }
    this._startLoop();
    bus.emit('vr-mode', { mode, prev });
  }

  setAnimationLoop(fn) {
    this.loop = fn;
    this._startLoop();
  }

  _startLoop() {
    const r = this.renderer;
    if (this.mode === 'webvr') {
      r.setAnimationLoop(null);
      const tick = (t) => {
        if (this.mode !== 'webvr') return;
        this.vrDisplay.requestAnimationFrame(tick);
        this._webvrPose();
        if (this.loop) this.loop(t, null);
        try { this.vrDisplay.submitFrame(); } catch (e) { /* ignore */ }
      };
      this.vrDisplay.requestAnimationFrame(tick);
    } else {
      r.setAnimationLoop((t, frame) => {
        if (this.mode === 'cardboard') this._cardboardPose();
        if (this.loop) this.loop(t, frame);
      });
    }
  }

  // ------------------------------------------------------------------ WebXR
  async enterWebXR(quality) {
    const xr = navigator.xr;
    const session = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    let type = 'local';
    try { await session.requestReferenceSpace('local-floor'); type = 'local-floor'; } catch (e) { type = 'local'; }
    this.refSpace = type;
    const r = this.renderer;
    r.xr.setReferenceSpaceType(type);
    try { r.xr.setFramebufferScaleFactor(quality.xrScale); } catch (e) { /* ignore */ }
    await r.xr.setSession(session);
    try { r.xr.setFoveation(quality.foveation); } catch (e) { /* ignore */ }
    this.xrSession = session;
    session.addEventListener('end', () => { this.xrSession = null; });
    this._setMode('webxr');
  }

  // ------------------------------------------------------------------ WebVR 1.1
  async enterWebVR() {
    const d = this.vrDisplay;
    if (!d) throw new Error('No WebVR display');
    await d.requestPresent([{ source: this.renderer.domElement }]);
    const l = d.getEyeParameters('left');
    const rr = d.getEyeParameters('right');
    this._savedSize = this._savedSize || this._captureSize();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(Math.max(l.renderWidth, rr.renderWidth) * 2, Math.max(l.renderHeight, rr.renderHeight), false);
    const onChange = () => {
      if (!d.isPresenting) {
        window.removeEventListener('vrdisplaypresentchange', onChange);
        this._setMode('flat');
      }
    };
    window.addEventListener('vrdisplaypresentchange', onChange);
    this._setMode('webvr');
  }

  _webvrPose() {
    const d = this.vrDisplay, fd = this.frameData;
    if (!d || !fd) return;
    d.getFrameData(fd);
    const pose = fd.pose;
    if (pose && pose.orientation) this.camera.quaternion.fromArray(pose.orientation);
    if (pose && pose.position) this.camera.position.fromArray(pose.position);
    else this.camera.position.set(0, 0, 0);
    if (d.stageParameters && d.stageParameters.sittingToStandingTransform) {
      this._tmpM.fromArray(d.stageParameters.sittingToStandingTransform);
      this.camera.position.applyMatrix4(this._tmpM);
    }
  }

  _renderWebVR(scene) {
    const d = this.vrDisplay, fd = this.frameData, r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const w = size.x / 2, h = size.y;
    this.crouch.updateMatrixWorld(true);
    const parentM = this.crouch.matrixWorld;
    let stage = null;
    if (d.stageParameters && d.stageParameters.sittingToStandingTransform) stage = new THREE.Matrix4().fromArray(d.stageParameters.sittingToStandingTransform);
    r.setScissorTest(true);
    r.autoClear = false;
    r.clear();
    const views = [fd.leftViewMatrix, fd.rightViewMatrix];
    const projs = [fd.leftProjectionMatrix, fd.rightProjectionMatrix];
    for (let e = 0; e < 2; e++) {
      const cam = this.eyeCams[e];
      // eye world = parent * stage * inverse(view)
      this._tmpM.fromArray(views[e]).invert();
      if (stage) this._tmpM.premultiply(stage);
      cam.matrixWorld.multiplyMatrices(parentM, this._tmpM);
      cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      cam.projectionMatrix.fromArray(projs[e]);
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      r.setViewport(e * w, 0, w, h);
      r.setScissor(e * w, 0, w, h);
      r.render(scene, cam);
    }
    r.setScissorTest(false);
    r.autoClear = true;
  }

  // ------------------------------------------------------------------ Cardboard / VR Box
  async enterCardboard() {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      const res = await DOE.requestPermission();
      if (res !== 'granted') throw new Error('Motion sensor permission denied');
    }
    window.addEventListener('deviceorientation', this._onOrient, true);
    this.orientationYawOffset = null;
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) { /* not fatal */ }
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) { /* not fatal */ }
    this._initDistortion();
    this._setMode('cardboard');
  }

  _initDistortion() {
    if (this.distortScene) return;
    this.distortRT = new THREE.WebGLRenderTarget(16, 16);
    this.distortMat = new THREE.ShaderMaterial({
      vertexShader: distortVert, fragmentShader: distortFrag,
      uniforms: { uTex: { value: this.distortRT.texture }, uK1: { value: 0.22 }, uK2: { value: 0.1 } },
      depthTest: false, depthWrite: false,
    });
    this.distortScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.distortMat);
    quad.frustumCulled = false;
    this.distortScene.add(quad);
    this.distortCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  _cardboardPose() {
    const o = this.orientation;
    if (!o.ok) return;
    const deg = THREE.MathUtils.DEG2RAD;
    const screenAngle = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * deg;
    const euler = new THREE.Euler(o.beta * deg, o.alpha * deg, -o.gamma * deg, 'YXZ');
    const q = this.camera.quaternion;
    q.setFromEuler(euler);
    q.multiply(new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))); // camera looks out the back of the device
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -screenAngle));
    // recentre yaw on first sample so the player faces the rig's forward direction
    const yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
    if (this.orientationYawOffset === null) this.orientationYawOffset = yaw;
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.orientationYawOffset));
  }

  recenter() {
    if (this.mode === 'cardboard') this.orientationYawOffset = null;
    if (this.mode === 'webvr' && this.vrDisplay && this.vrDisplay.resetPose) this.vrDisplay.resetPose();
  }

  _renderCardboard(scene) {
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const pr = r.getPixelRatio();
    const W = size.x * pr, H = size.y * pr;
    const ipd = settings.get('cardboardIpd');
    const fov = settings.get('cardboardFov');
    const k1 = settings.get('cardboardDistortion');
    this.camera.updateMatrixWorld(true);
    const useDistortion = k1 > 0.001;
    if (useDistortion && (this.distortRT.width !== W || this.distortRT.height !== H)) this.distortRT.setSize(W, H);
    const target = useDistortion ? this.distortRT : null;
    r.setRenderTarget(target);
    r.setScissorTest(true);
    r.autoClear = false;
    r.clear();
    for (let e = 0; e < 2; e++) {
      const cam = this.eyeCams[e];
      cam.fov = fov; cam.aspect = (size.x / 2) / size.y; cam.near = 0.05; cam.far = 1500;
      cam.updateProjectionMatrix();
      this._tmpM.makeTranslation((e === 0 ? -1 : 1) * ipd / 2, 0, 0);
      cam.matrixWorld.multiplyMatrices(this.camera.matrixWorld, this._tmpM);
      cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      const vx = e * size.x / 2;
      if (target) { r.setViewport(vx, 0, size.x / 2, size.y); r.setScissor(vx, 0, size.x / 2, size.y); }
      else { r.setViewport(vx, 0, size.x / 2, size.y); r.setScissor(vx, 0, size.x / 2, size.y); }
      r.render(scene, cam);
    }
    r.setScissorTest(false);
    r.autoClear = true;
    if (useDistortion) {
      this.distortMat.uniforms.uK1.value = k1;
      this.distortMat.uniforms.uK2.value = k1 * 0.45;
      r.setRenderTarget(null);
      r.setViewport(0, 0, size.x, size.y);
      r.render(this.distortScene, this.distortCam);
    }
  }

  // ------------------------------------------------------------------ common
  _captureSize() {
    return { w: window.innerWidth, h: window.innerHeight, pr: this.renderer.getPixelRatio() };
  }
  _restoreSize() {
    window.removeEventListener('deviceorientation', this._onOrient, true);
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    const s = this._savedSize;
    if (s) this.renderer.setPixelRatio(s.pr);
    this._savedSize = null;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  async exit() {
    if (this.mode === 'webxr' && this.xrSession) await this.xrSession.end();
    else if (this.mode === 'webvr' && this.vrDisplay) await this.vrDisplay.exitPresent();
    else if (this.mode === 'cardboard') this._setMode('flat');
  }

  /** Pixel height used to size point particles. */
  pixelHeight() {
    if (this.mode === 'webxr') return 1600;
    const s = this.renderer.getSize(new THREE.Vector2());
    return s.y * this.renderer.getPixelRatio();
  }

  render(scene) {
    switch (this.mode) {
      case 'webvr': this._renderWebVR(scene); break;
      case 'cardboard': this._renderCardboard(scene); break;
      default: this.renderer.render(scene, this.camera);
    }
  }
}
