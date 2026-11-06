// Unifies every supported input device into one per-frame state:
//  - WebXR controllers (Quest touch, Oculus Go controller in WebXR)
//  - Oculus Go / Gear VR / Daydream controller under legacy WebVR (with arm model)
//  - Standard Bluetooth gamepads (common with VR Box headsets)
//  - Keyboard + mouse (desktop), touch controls (phone), screen tap (Cardboard)
import * as THREE from 'three';
import { settings } from '../core/Settings.js';
import { ArmModel } from '../movement/ArmModel.js';

class Button {
  constructor() { this.down = false; this.pressed = false; this.released = false; this.downTime = 0; }
  set(v, dt) {
    this.pressed = v && !this.down;
    this.released = !v && this.down;
    if (v) this.downTime = this.pressed ? 0 : this.downTime + dt; else if (this.released) this._lastHeld = this.downTime;
    this.down = v;
  }
}

export class InputManager {
  constructor(vr, camera, crouch, dom, caps) {
    this.vr = vr;
    this.camera = camera;
    this.crouch = crouch;
    this.dom = dom;
    this.caps = caps;
    this.trigger = new Button();
    this.padClick = new Button();
    this.menu = new Button();
    this.crouchBtn = new Button();
    this.pad = { x: 0, y: 0, touched: false };
    this.move = new THREE.Vector2();
    this.turnAxis = 0;
    this.snapTurn = 0; // -1 / +1 edge events
    this.crouchToggle = false;
    this.menuToggle = false;
    this.recenterPressed = false;
    this.source = 'mouse';
    this.consumedTrigger = false;

    // hand: pose of the rod hand in crouch-group space
    this.hand = new THREE.Object3D();
    this.hand.name = 'hand';
    crouch.add(this.hand);
    this.armModel = new ArmModel();
    this.prevHandQuat = new THREE.Quaternion();
    this.angularVelocity = new THREE.Vector3();
    this.handSpeed = 0;

    this.ray = new THREE.Ray();
    this.rayIsGaze = false;

    // flat-screen look
    this.lookPitch = 0;
    this.lookYawDelta = 0;
    this.mouse = new THREE.Vector2();
    this.mouseDown = false;
    this.leftDown = false;
    this.keys = new Set();
    this.pointerLocked = false;
    this.virtual = { moveX: 0, moveY: 0, lookDX: 0, lookDY: 0, trigger: false, menu: false, crouch: false };
    this.tapDown = false;

    // WebXR controllers
    this.xrControllers = [];
    for (let i = 0; i < 2; i++) {
      const c = vr.renderer.xr.getController(i);
      c.userData.inputSource = null;
      c.addEventListener('connected', (e) => { c.userData.inputSource = e.data; });
      c.addEventListener('disconnected', () => { c.userData.inputSource = null; });
      crouch.add(c);
      this.xrControllers.push(c);
    }
    this._bindDom();
    this._lastPadClickTime = 0;
    this._padHoldMoved = false;
    this._gpPrev = {};
  }

  _bindDom() {
    const el = this.dom;
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (this.pointerLocked) {
        this.lookYawDelta -= e.movementX * 0.0025;
        this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - e.movementY * 0.0025, -1.4, 1.4);
      } else if (this.mouseDown && e.buttons & 2) {
        this.lookYawDelta -= e.movementX * 0.004;
        this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - e.movementY * 0.004, -1.4, 1.4);
      }
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.leftDown = true;
      if (e.button === 2) this.mouseDown = true;
      this.source = 'mouse';
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.leftDown = false; if (e.button === 2) this.mouseDown = false; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === el; });

    // Cardboard / phone: a tap on the screen acts as the trigger (Cardboard button presses the screen)
    const tStart = (e) => {
      if (this.vr.mode === 'cardboard') { this.tapDown = true; e.preventDefault(); }
    };
    const tEnd = (e) => {
      if (this.vr.mode === 'cardboard') { this.tapDown = false; e.preventDefault(); }
    };
    el.addEventListener('touchstart', tStart, { passive: false });
    el.addEventListener('touchend', tEnd, { passive: false });
    el.addEventListener('touchcancel', tEnd, { passive: false });
  }

  requestPointerLock() {
    if (this.vr.mode === 'flat' && !this.caps.touch && this.dom.requestPointerLock) {
      try { this.dom.requestPointerLock(); } catch (e) { /* ignore */ }
    }
  }
  releasePointerLock() {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }

  /** Active WebXR input source matching handedness preference. */
  _xrPrimary() {
    const pref = settings.get('handedness');
    let best = null;
    for (const c of this.xrControllers) {
      const s = c.userData.inputSource;
      if (!s || !s.gamepad) continue;
      if (!best || s.handedness === pref) best = c;
    }
    return best;
  }

  _webvrGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (p && p.pose && (p.pose.orientation || p.pose.hasOrientation)) return p;
    }
    return null;
  }

  _standardGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (p && !p.pose && p.mapping === 'standard' && p.connected !== false) return p;
    }
    return null;
  }

  pulse(intensity, ms) {
    if (!settings.get('haptics')) return;
    try {
      const c = this._xrPrimary();
      const act = c && c.userData.inputSource.gamepad && c.userData.inputSource.gamepad.hapticActuators;
      if (act && act[0] && act[0].pulse) { act[0].pulse(intensity, ms); return; }
      const g = this._webvrGamepad();
      if (g && g.hapticActuators && g.hapticActuators[0]) { g.hapticActuators[0].pulse(intensity, ms); return; }
      const sg = this._standardGamepad();
      if (sg && sg.vibrationActuator && sg.vibrationActuator.playEffect) {
        sg.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity });
        return;
      }
      if ((this.vr.mode === 'cardboard' || this.caps.touch) && navigator.vibrate) navigator.vibrate(Math.round(ms * intensity));
    } catch (e) { /* haptics unsupported */ }
  }

  update(dt) {
    let trig = false, padClick = false, menu = false, crouchB = false;
    let px = 0, py = 0, touched = false;
    this.snapTurn = 0;
    this.crouchToggle = false;
    this.menuToggle = false;
    this.recenterPressed = false;
    this.move.set(0, 0);
    this.turnAxis = 0;
    const mode = this.vr.mode;
    const handSign = settings.get('handedness') === 'left' ? -1 : 1;
    let handPosed = false;

    // ---------------- WebXR
    if (mode === 'webxr') {
      const c = this._xrPrimary() || this.xrControllers[0];
      const s = c.userData.inputSource;
      if (s) {
        this.hand.position.copy(c.position);
        this.hand.quaternion.copy(c.quaternion);
        handPosed = true;
        this.source = 'xr';
        const gp = s.gamepad;
        if (gp) {
          const b = gp.buttons;
          trig = !!(b[0] && b[0].pressed);
          const ax = gp.axes;
          const a01 = Math.hypot(ax[0] || 0, ax[1] || 0), a23 = Math.hypot(ax[2] || 0, ax[3] || 0);
          if (a23 > a01) { px = ax[2]; py = ax[3]; touched = a23 > 0.15; padClick = !!(b[3] && b[3].pressed); }
          else { px = ax[0] || 0; py = ax[1] || 0; touched = !!(b[2] && b[2].touched) || a01 > 0.15; padClick = !!(b[2] && b[2].pressed); }
          menu = !!((b[4] && b[4].pressed) || (b[5] && b[5].pressed));
          crouchB = !!(b[1] && b[1].pressed) && false; // squeeze reserved
        }
      }
      // any other controller can also open the menu (e.g. left Quest controller Y/X)
      for (const oc of this.xrControllers) {
        const os = oc.userData.inputSource;
        if (os && os !== s && os.gamepad) {
          const b = os.gamepad.buttons;
          if ((b[4] && b[4].pressed) || (b[5] && b[5].pressed)) menu = true;
          const ax = os.gamepad.axes;
          if (Math.hypot(ax[2] || 0, ax[3] || 0) > 0.2 && !touched) { px = ax[2]; py = ax[3]; touched = true; }
        }
      }
    }

    // ---------------- WebVR (Oculus Go controller)
    if (mode === 'webvr') {
      const g = this._webvrGamepad();
      if (g) {
        const q = g.pose && g.pose.orientation ? new THREE.Quaternion().fromArray(g.pose.orientation) : new THREE.Quaternion();
        if (g.pose && g.pose.position && g.pose.hasPosition) this.hand.position.fromArray(g.pose.position);
        else this.hand.position.copy(this.armModel.update(this.camera.position, this.camera.quaternion, q, g.hand === 'left' ? -1 : handSign));
        this.hand.quaternion.copy(q);
        handPosed = true;
        this.source = 'webvr';
        const b = g.buttons;
        // Oculus Go / Gear VR: 0 = touchpad, 1 = trigger. Daydream: 0 = touchpad only.
        trig = !!((b[1] && b[1].pressed));
        padClick = !!(b[0] && b[0].pressed);
        if (b.length === 1 || /Daydream/i.test(g.id)) { trig = padClick; padClick = false; }
        px = g.axes[0] || 0; py = g.axes[1] || 0;
        touched = !!(b[0] && b[0].touched) || Math.hypot(px, py) > 0.12;
        menu = !!(b[2] && b[2].pressed);
      }
    }

    // ---------------- standard gamepad (any mode)
    const sg = this._standardGamepad();
    if (sg) {
      const b = sg.buttons;
      const anyInput = b.some((x) => x.pressed) || Math.hypot(sg.axes[0] || 0, sg.axes[1] || 0) > 0.25;
      if (anyInput && mode !== 'webxr') this.source = 'gamepad';
      if (b[0] && b[0].pressed) trig = true;
      if (b[7] && b[7].value > 0.4) trig = true;
      if ((b[9] && b[9].pressed) || (b[1] && b[1].pressed)) menu = true;
      if ((b[3] && b[3].pressed) || (b[10] && b[10].pressed)) crouchB = true;
      const ax = sg.axes;
      if (Math.hypot(ax[0] || 0, ax[1] || 0) > 0.2) { px = ax[0]; py = ax[1]; touched = true; }
      if (Math.abs(ax[2] || 0) > 0.6 && mode === 'flat') this.lookYawDelta -= ax[2] * dt * 2;
      if (Math.abs(ax[3] || 0) > 0.3 && mode === 'flat') this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - ax[3] * dt * 1.5, -1.4, 1.4);
    }

    // ---------------- keyboard / mouse / touch (flat)
    const k = this.keys;
    if (k.has('Space') || (this.leftDown && mode === 'flat')) trig = true;
    if (this.virtual.trigger) trig = true;
    if (this.tapDown) trig = true;
    if (k.has('KeyM') || k.has('Escape') || k.has('Tab') || this.virtual.menu) menu = true;
    if (k.has('KeyC') || k.has('ControlLeft') || this.virtual.crouch) crouchB = true;
    let kx = 0, ky = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) ky -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) ky += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) kx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) kx += 1;
    if (kx || ky) { this.move.set(kx, -ky); }
    if (Math.hypot(this.virtual.moveX, this.virtual.moveY) > 0.1) this.move.set(this.virtual.moveX, -this.virtual.moveY);
    if (this.virtual.lookDX || this.virtual.lookDY) {
      this.lookYawDelta -= this.virtual.lookDX * 0.006;
      this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - this.virtual.lookDY * 0.006, -1.4, 1.4);
      this.virtual.lookDX = 0; this.virtual.lookDY = 0;
    }
    if (k.has('KeyQ')) { if (!this._qHeld) this.snapTurn = -1; this._qHeld = true; } else this._qHeld = false;
    if (k.has('KeyE')) { if (!this._eHeld) this.snapTurn = 1; this._eHeld = true; } else this._eHeld = false;
    if (k.has('KeyR')) { if (!this._rHeld) this.recenterPressed = true; this._rHeld = true; } else this._rHeld = false;

    // ---------------- touchpad / stick semantics
    this.pad.x = px; this.pad.y = py; this.pad.touched = touched;
    this.padClick.set(padClick, dt);
    const clickOnly = settings.get('touchpadMove') === 'click' && (this.source === 'webvr' || this.source === 'xr');
    const active = touched && (!clickOnly || padClick);
    const centered = Math.abs(px) < 0.45 && Math.abs(py) < 0.45;
    if (active && !centered) {
      if (Math.abs(py) > 0.45 && Math.abs(py) >= Math.abs(px) * 0.8) this.move.y = -py;
      if (Math.abs(px) > 0.6 && Math.abs(px) > Math.abs(py)) this.turnAxis = px;
    }
    // snap turn edge
    const turnNow = this.turnAxis > 0.6 ? 1 : this.turnAxis < -0.6 ? -1 : 0;
    if (turnNow !== 0 && this._prevTurn === 0 && settings.get('turnMode') === 'snap') this.snapTurn = turnNow;
    this._prevTurn = turnNow;

    // crouch gestures on touchpad
    const cm = settings.get('crouchMode');
    if (this.padClick.pressed) this._padHoldMoved = !centered;
    if (this.padClick.down && !centered) this._padHoldMoved = true;
    if (this.padClick.released && centered && !this._padHoldMoved && (this.padClick._lastHeld || 0) < 0.6) {
      const now = performance.now();
      if (cm === 'center-click') this.crouchToggle = true;
      else if (cm === 'double-click') {
        if (now - this._lastPadClickTime < 380) { this.crouchToggle = true; this._lastPadClickTime = 0; } else this._lastPadClickTime = now;
      }
    }
    // long press on touchpad centre opens the menu (Oculus Go has no free menu button)
    if (this.padClick.down && centered && !this._padHoldMoved && this.padClick.downTime > 0.8 && !this._longFired) {
      this._longFired = true; this.menuToggle = true;
    }
    if (!this.padClick.down) this._longFired = false;

    this.crouchBtn.set(crouchB, dt);
    if (this.crouchBtn.pressed) this.crouchToggle = true;
    this.menu.set(menu, dt);
    if (this.menu.pressed) this.menuToggle = true;
    this.trigger.set(trig, dt);
    this.consumedTrigger = false;
    // Cardboard / gaze-only: look at the floor and hold the trigger to walk forward
    this.gazeWalk = false;
    if (mode === 'cardboard' && this.trigger.down && !this.move.y) {
      const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
      if (e.x < -0.6) { this.gazeWalk = true; this.move.y = 1; this.consumedTrigger = true; }
    }

    // ---------------- hand pose for gaze / flat modes
    if (!handPosed) {
      if (mode === 'flat') {
        this.camera.rotation.set(this.lookPitch, 0, 0, 'YXZ');
      }
      // rod hand rides at the lower right of the view, aiming where the player looks
      const camQ = this.camera.quaternion;
      const off = new THREE.Vector3(0.22 * handSign, -0.28, -0.32).applyQuaternion(camQ);
      this.hand.position.copy(this.camera.position).add(off);
      this.hand.quaternion.copy(camQ);
      if (mode === 'flat' && !this.pointerLocked && !this.caps.touch) {
        // aim slightly toward the mouse cursor
        const aim = new THREE.Vector3(this.mouse.x * 0.35, this.mouse.y * 0.25, -1).normalize().applyQuaternion(camQ);
        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), aim, new THREE.Vector3(0, 1, 0));
        this.hand.quaternion.setFromRotationMatrix(m);
      }
    }
    this.hand.updateMatrixWorld(true);

    // angular velocity (rad/s) for swing casting
    const dq = this.prevHandQuat.clone().invert().multiply(this.hand.quaternion);
    const angle = 2 * Math.acos(THREE.MathUtils.clamp(Math.abs(dq.w), -1, 1));
    const axis = new THREE.Vector3(dq.x, dq.y, dq.z);
    if (axis.lengthSq() > 1e-9) axis.normalize();
    this.angularVelocity.copy(axis.multiplyScalar(dt > 0 ? angle / dt : 0));
    this.prevHandQuat.copy(this.hand.quaternion);

    // pointer ray
    const origin = new THREE.Vector3(), dir = new THREE.Vector3();
    if (handPosed) {
      this.hand.getWorldPosition(origin);
      dir.set(0, 0, -1).applyQuaternion(this.hand.getWorldQuaternion(new THREE.Quaternion()));
      this.rayIsGaze = false;
    } else if (mode === 'flat' && !this.pointerLocked && !this.caps.touch) {
      this.camera.getWorldPosition(origin);
      const v = new THREE.Vector3(this.mouse.x, this.mouse.y, 0.5).unproject(this.camera);
      dir.copy(v).sub(origin).normalize();
      this.rayIsGaze = false;
    } else {
      this.camera.getWorldPosition(origin);
      this.camera.getWorldDirection(dir);
      this.rayIsGaze = true;
    }
    this.ray.set(origin, dir);
  }

  /** World direction the rod is pointing (unit vector). */
  rodDirection(out) {
    return out.set(0, 0, -1).applyQuaternion(this.hand.getWorldQuaternion(new THREE.Quaternion())).normalize();
  }

  consumeTrigger() { this.consumedTrigger = true; }
  get triggerPressed() { return this.trigger.pressed && !this.consumedTrigger; }
  get triggerDown() { return this.trigger.down && !this.consumedTrigger; }
  get triggerReleased() { return this.trigger.released && !this.consumedTrigger; }
}
