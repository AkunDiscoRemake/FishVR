// Pooled CPU particle system rendered as a single Points draw call.
// Used for splashes, spray, PERFECT! sparkles, bubbles, fireflies and plankton.
import * as THREE from 'three';
import { dotTexture } from './textures.js';

const vert = /* glsl */`
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uScale;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */`
uniform sampler2D uTex;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(vColor.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.01) discard;
  #include <colorspace_fragment>
}`;

export class Particles {
  constructor(max, pixelHeight = 1000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.baseAlpha = new Float32Array(max);
    this.flags = new Uint8Array(max); // 1 = flicker, 2 = water-killed, 4 = rise
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: { uTex: { value: dotTexture() }, uScale: { value: pixelHeight * 0.85 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 50;
    this.waterLevel = 0;
    this.time = 0;
  }

  setPixelHeight(h) { this.material.uniforms.uScale.value = h * 0.85; }

  spawn(x, y, z, vx, vy, vz, life, size, color, alpha = 1, gravity = 9.8, drag = 0.5, flags = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.baseSize[i] = size; this.gravity[i] = gravity; this.drag[i] = drag;
    this.col[i * 4] = color.r; this.col[i * 4 + 1] = color.g; this.col[i * 4 + 2] = color.b;
    this.baseAlpha[i] = alpha;
    this.flags[i] = flags;
  }

  splash(p, strength = 1, color) {
    const c = color || new THREE.Color(0.85, 0.92, 1);
    const n = Math.floor(14 + strength * 26);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.6 * strength;
      this.spawn(p.x, p.y + 0.05, p.z, Math.cos(a) * r, 2 + Math.random() * 3.5 * strength, Math.sin(a) * r,
        0.6 + Math.random() * 0.5, 0.06 + Math.random() * 0.08 * strength, c, 0.85, 9.8, 0.3, 2);
    }
    // ring of mist
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      this.spawn(p.x, p.y + 0.02, p.z, Math.cos(a) * 1.2 * strength, 0.3, Math.sin(a) * 1.2 * strength, 0.7, 0.25 * strength, c, 0.35, 0, 2.5, 0);
    }
  }

  sparkle(p, color, count = 40, speed = 2.5) {
    for (let k = 0; k < count; k++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u) * speed * (0.4 + Math.random() * 0.6);
      this.spawn(p.x, p.y, p.z, Math.cos(a) * s, u * speed, Math.sin(a) * s, 0.7 + Math.random() * 0.6, 0.05 + Math.random() * 0.05, color, 1, 1.5, 1.8, 1);
    }
  }

  bubbles(p, count = 6) {
    const c = new THREE.Color(0.8, 0.9, 1);
    for (let k = 0; k < count; k++) {
      this.spawn(p.x + (Math.random() - 0.5) * 0.3, p.y, p.z + (Math.random() - 0.5) * 0.3, 0, 0.6 + Math.random() * 0.6, 0,
        1.5, 0.03 + Math.random() * 0.03, c, 0.6, 0, 0.1, 4 | 2);
    }
  }

  update(dt) {
    this.time += dt;
    const P = this.pos, V = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      V[i * 3] *= d; V[i * 3 + 2] *= d;
      V[i * 3 + 1] = V[i * 3 + 1] * d - this.gravity[i] * dt;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      const f = this.flags[i];
      if ((f & 2) && !(f & 4) && P[i * 3 + 1] < this.waterLevel && V[i * 3 + 1] < 0) this.life[i] = 0;
      if ((f & 4) && P[i * 3 + 1] > this.waterLevel) this.life[i] = 0;
      const t = this.life[i] / this.maxLife[i];
      let a = this.baseAlpha[i] * Math.min(1, t * 2.5);
      if (f & 1) a *= 0.6 + 0.4 * Math.sin(this.time * 25 + i);
      this.col[i * 4 + 3] = a;
      this.size[i] = this.baseSize[i] * (0.6 + 0.4 * t);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}

/** Persistent ambient particles (fireflies / plankton / dust) drifting around the player. */
export class AmbientParticles {
  constructor(count, color, mode) {
    this.count = count;
    this.mode = mode; // 'fireflies' | 'plankton' | 'dust' | 'rain'
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 4);
    this.size = new Float32Array(count);
    this.phase = new Float32Array(count);
    this.color = new THREE.Color(color);
    for (let i = 0; i < count; i++) { this.phase[i] = Math.random() * 100; this._reset(i, new THREE.Vector3(), true); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: { uTex: { value: dotTexture() }, uScale: { value: 850 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.time = 0;
  }
  _reset(i, center, initial) {
    const r = 4 + Math.random() * 30;
    const a = Math.random() * Math.PI * 2;
    this.pos[i * 3] = center.x + Math.cos(a) * r;
    this.pos[i * 3 + 2] = center.z + Math.sin(a) * r;
    if (this.mode === 'plankton') this.pos[i * 3 + 1] = -0.3 - Math.random() * 4;
    else if (this.mode === 'rain') this.pos[i * 3 + 1] = initial ? Math.random() * 20 : 20;
    else this.pos[i * 3 + 1] = 0.4 + Math.random() * 3.5;
    this.col[i * 4] = this.color.r; this.col[i * 4 + 1] = this.color.g; this.col[i * 4 + 2] = this.color.b;
  }
  setPixelHeight(h) { this.material.uniforms.uScale.value = h * 0.85; }
  update(dt, center) {
    this.time += dt;
    const t = this.time;
    for (let i = 0; i < this.count; i++) {
      const ph = this.phase[i];
      if (this.mode === 'rain') {
        this.pos[i * 3 + 1] -= dt * 14;
        if (this.pos[i * 3 + 1] < 0) this._reset(i, center, false);
        this.col[i * 4 + 3] = 0.35; this.size[i] = 0.025;
      } else {
        this.pos[i * 3] += Math.sin(t * 0.3 + ph) * dt * 0.3;
        this.pos[i * 3 + 1] += Math.sin(t * 0.5 + ph * 2) * dt * 0.12;
        this.pos[i * 3 + 2] += Math.cos(t * 0.27 + ph) * dt * 0.3;
        const glow = Math.max(0, Math.sin(t * (0.8 + (ph % 1)) + ph));
        this.col[i * 4 + 3] = this.mode === 'dust' ? 0.25 : glow * glow;
        this.size[i] = this.mode === 'plankton' ? 0.05 : 0.07;
      }
      const dx = this.pos[i * 3] - center.x, dz = this.pos[i * 3 + 2] - center.z;
      if (dx * dx + dz * dz > 40 * 40) this._reset(i, center, false);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}
