// Verlet-integrated fishing line. The first point is pinned to the rod tip, the last
// to the lure/hook. Segments are inextensible but may go slack. Gravity, air damping,
// water drag and buoyancy act on every particle.
import * as THREE from 'three';

export class VerletLine {
  constructor(segments, color = 0xf0f0f0) {
    this.n = segments + 1;
    this.p = [];
    this.prev = [];
    for (let i = 0; i < this.n; i++) { this.p.push(new THREE.Vector3()); this.prev.push(new THREE.Vector3()); }
    this.length = 1;
    this.tension = 0;
    this.waterHeight = () => 0;
    // rendered polyline = guide path (reel->guides->tip) + simulated span
    this.maxPoints = this.n + 16;
    this.positions = new Float32Array(this.maxPoints * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
    this.mesh = new THREE.Line(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.baseColor = new THREE.Color(color);
    this.hotColor = new THREE.Color(0xff3020);
  }

  reset(from, to) {
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      this.p[i].lerpVectors(from, to, t);
      this.prev[i].copy(this.p[i]);
    }
    this.length = Math.max(0.3, from.distanceTo(to));
  }

  /**
   * @param {THREE.Vector3} start pinned start (rod tip)
   * @param {THREE.Vector3|null} end pinned end (lure) or null for free end
   */
  simulate(dt, start, end, iterations = 6) {
    dt = Math.min(dt, 1 / 30);
    const g = -9.8 * dt * dt;
    for (let i = 1; i < this.n; i++) {
      const p = this.p[i], q = this.prev[i];
      const wh = this.waterHeight(p.x, p.z);
      const inWater = p.y < wh;
      const damp = inWater ? 0.8 : 0.985;
      const vx = (p.x - q.x) * damp, vy = (p.y - q.y) * damp, vz = (p.z - q.z) * damp;
      q.copy(p);
      p.x += vx; p.y += vy + (inWater ? g * -0.15 : g); p.z += vz;
      if (inWater && p.y < wh - 6) p.y = wh - 6;
    }
    const seg = this.length / (this.n - 1);
    this.p[0].copy(start);
    if (end) this.p[this.n - 1].copy(end);
    for (let k = 0; k < iterations; k++) {
      for (let i = 0; i < this.n - 1; i++) {
        const a = this.p[i], b = this.p[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (d <= seg) continue; // slack allowed
        const diff = (d - seg) / d;
        const aPinned = i === 0, bPinned = end && i + 1 === this.n - 1;
        const wa = aPinned ? 0 : bPinned ? 1 : 0.5, wb = bPinned ? 0 : aPinned ? 1 : 0.5;
        a.x += dx * diff * wa; a.y += dy * diff * wa; a.z += dz * diff * wa;
        b.x -= dx * diff * wb; b.y -= dy * diff * wb; b.z -= dz * diff * wb;
      }
      this.p[0].copy(start);
      if (end) this.p[this.n - 1].copy(end);
    }
    // straightness = tension proxy
    let pathLen = 0;
    for (let i = 0; i < this.n - 1; i++) pathLen += this.p[i].distanceTo(this.p[i + 1]);
    const straight = this.p[0].distanceTo(this.p[this.n - 1]);
    this.slack = pathLen > 1e-3 ? 1 - straight / pathLen : 0;
  }

  /** Free end (when nothing attached) */
  get endPoint() { return this.p[this.n - 1]; }

  updateMesh(guidePath, tension) {
    let k = 0;
    const put = (v) => { if (k < this.maxPoints) { this.positions[k * 3] = v.x; this.positions[k * 3 + 1] = v.y; this.positions[k * 3 + 2] = v.z; k++; } };
    if (guidePath) for (let i = 0; i < guidePath.length - 1; i++) put(guidePath[i]);
    for (let i = 0; i < this.n; i++) put(this.p[i]);
    const geo = this.mesh.geometry;
    geo.setDrawRange(0, k);
    geo.attributes.position.needsUpdate = true;
    const t = THREE.MathUtils.clamp((tension || 0) - 0.55, 0, 0.45) / 0.45;
    this.material.color.copy(this.baseColor).lerp(this.hotColor, t);
  }
}
