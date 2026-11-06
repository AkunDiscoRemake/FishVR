// Comfortable seated/standing locomotion: touchpad/stick walking relative to head or
// controller, snap or smooth turning, crouch toggle, ground following and a comfort vignette.
import * as THREE from 'three';
import { settings } from '../core/Settings.js';

export class Locomotion {
  constructor(rig, crouch, camera, input, vr) {
    this.rig = rig;
    this.crouch = crouch;
    this.camera = camera;
    this.input = input;
    this.vr = vr;
    this.world = null;
    this.crouched = false;
    this.crouchAmount = 0;
    this.enabled = true;
    this.turnEnabled = true;
    this.speed = 0;
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this.vignette = this._makeVignette();
    camera.add(this.vignette);
  }

  _makeVignette() {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uStrength: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uStrength; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(0.45, 0.95, d) * uStrength; gl_FragColor = vec4(0.0,0.0,0.0,a); }',
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), mat);
    m.position.z = -0.12;
    m.renderOrder = 9999;
    m.frustumCulled = false;
    m.visible = false;
    return m;
  }

  setWorld(world) {
    this.world = world;
    const s = world.spawn;
    this.rig.position.set(s.x, world.groundHeight(s.x, s.z) || 0, s.z);
    this.rig.rotation.set(0, s.yaw, 0);
    this.input.lookPitch = 0;
  }

  /** Horizontal yaw (radians) of head or controller in world space. */
  _moveYaw() {
    const obj = settings.get('moveRelativeTo') === 'controller' && this.vr.isImmersive ? this.input.hand : this.camera;
    obj.getWorldQuaternion(this._q);
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(this._q);
    return Math.atan2(-d.x, -d.z);
  }

  update(dt) {
    const input = this.input;
    // flat-screen mouse/keyboard yaw
    if (input.lookYawDelta) { this.rig.rotation.y += input.lookYawDelta; input.lookYawDelta = 0; }
    if (this.turnEnabled) {
      if (input.snapTurn) this._turnAroundHead(-input.snapTurn * THREE.MathUtils.degToRad(settings.get('snapAngle')));
      else if (settings.get('turnMode') === 'smooth' && Math.abs(input.turnAxis) > 0.6) {
        this._turnAroundHead(-Math.sign(input.turnAxis) * THREE.MathUtils.degToRad(settings.get('smoothTurnSpeed')) * dt);
      }
    }

    if (input.crouchToggle) this.crouched = !this.crouched;
    const target = this.crouched ? settings.get('crouchDepth') : 0;
    this.crouchAmount += (target - this.crouchAmount) * Math.min(1, dt * 8);
    this.crouch.position.y = this.vr.baseHeight() - this.crouchAmount;

    let moving = 0;
    if (this.enabled && this.world && (Math.abs(input.move.x) > 0.05 || Math.abs(input.move.y) > 0.05)) {
      const yaw = this._moveYaw();
      this._fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      this._right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const sp = settings.get('moveSpeed') * (this.crouched ? 0.5 : 1);
      const v = new THREE.Vector3()
        .addScaledVector(this._fwd, input.move.y)
        .addScaledVector(this._right, this.vr.mode === 'flat' || input.source === 'gamepad' ? input.move.x : 0);
      if (v.lengthSq() > 1) v.normalize();
      v.multiplyScalar(sp * dt);
      // try full move, then axis-separated slides along obstacles / water edge
      const head = this._headWorld();
      const tryMove = (dx, dz) => {
        const nx = head.x + dx, nz = head.z + dz;
        const h = this.world.groundHeight(nx, nz);
        if (h === null || h === undefined) return false;
        this.rig.position.x += dx; this.rig.position.z += dz;
        this.rig.position.y += (h - this.rig.position.y) * Math.min(1, dt * 10);
        return true;
      };
      if (!tryMove(v.x, v.z)) { if (!tryMove(v.x, 0)) tryMove(0, v.z); }
      moving = v.length() / Math.max(1e-4, dt);
    } else if (this.world) {
      const head = this._headWorld();
      const h = this.world.groundHeight(head.x, head.z);
      if (h !== null && h !== undefined) this.rig.position.y += (h - this.rig.position.y) * Math.min(1, dt * 10);
    }
    this.speed = moving;
    const vigOn = settings.get('vignette') && this.vr.isImmersive;
    const u = this.vignette.material.uniforms.uStrength;
    u.value += ((vigOn ? Math.min(1, moving / 1.5) * 0.9 : 0) - u.value) * Math.min(1, dt * 6);
    this.vignette.visible = u.value > 0.01;
  }

  _headWorld() {
    return this.camera.getWorldPosition(new THREE.Vector3());
  }

  /** Rotate the rig so that the head stays in place (no sideways lurch in VR). */
  _turnAroundHead(angle) {
    const head = this._headWorld();
    const p = this.rig.position;
    const dx = p.x - head.x, dz = p.z - head.z;
    const c = Math.cos(angle), s = Math.sin(angle);
    p.x = head.x + dx * c + dz * s;
    p.z = head.z - dx * s + dz * c;
    this.rig.rotation.y += angle;
  }
}
