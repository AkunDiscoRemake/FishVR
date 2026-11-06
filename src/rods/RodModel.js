// 3D fishing rod: grip, reel seat, spinning reel with crank, segmented tapered blank
// with line guides. The blank bends physically toward the line pull (per-joint rotation
// weighted toward the tip, scaled by elasticity and tension).
import * as THREE from 'three';
import { corkTexture } from '../rendering/textures.js';

export class RodModel {
  constructor(rod, quality) {
    this.rod = rod;
    this.quality = quality;
    const look = rod.look;
    this.root = new THREE.Group();
    this.root.name = 'rod:' + rod.id;
    const std = quality.standardMaterials;
    const M = (opts) => (std ? new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.4, metalness: 0.2 }, opts)) : new THREE.MeshLambertMaterial(opts));
    const len = look.length;
    const gripLen = 0.42;
    const big = look.big ? 1.35 : 1;

    // Rod points along -Z (like the controller ray). Hand at origin.
    const gripMat = look.grip === 'cork' ? M({ map: corkTexture(), roughness: 0.9, metalness: 0 })
      : look.grip === 'carbon' ? M({ color: 0x151515, roughness: 0.3, metalness: 0.5 }) : M({ color: 0x1e1e1e, roughness: 0.85, metalness: 0 });
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017 * big, 0.019 * big, gripLen, 12), gripMat);
    grip.rotation.x = Math.PI / 2;
    grip.position.z = 0.08; // rear grip extends behind the hand
    this.root.add(grip);
    const butt = new THREE.Mesh(new THREE.SphereGeometry(0.021 * big, 10, 8), M({ color: 0x202020 }));
    butt.position.z = 0.08 + gripLen / 2;
    this.root.add(butt);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.014 * big, 0.014 * big, 0.12, 10), M({ color: look.reel, metalness: 0.7, roughness: 0.3 }));
    seat.rotation.x = Math.PI / 2;
    seat.position.z = -0.17;
    this.root.add(seat);

    // spinning reel hanging below the seat
    this.reel = new THREE.Group();
    this.reel.position.set(0, -0.06 * big, -0.17);
    const reelMat = M({ color: look.reel, metalness: 0.75, roughness: 0.3 });
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.06 * big, 0.02), reelMat);
    stem.position.y = 0.03 * big;
    this.reel.add(stem);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.026 * big, 0.03 * big, 0.05, 14), reelMat);
    body.rotation.x = Math.PI / 2;
    this.reel.add(body);
    this.spool = new THREE.Mesh(new THREE.CylinderGeometry(0.022 * big, 0.022 * big, 0.03, 14), M({ color: 0xd8d8d8, metalness: 0.6 }));
    this.spool.rotation.x = Math.PI / 2;
    this.spool.position.z = -0.035;
    this.reel.add(this.spool);
    this.crank = new THREE.Group();
    this.crank.position.set(0.032 * big, 0, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05 * big, 0.006), reelMat);
    arm.position.y = 0.025 * big;
    this.crank.add(arm);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.018, 8), M({ color: 0x1a1a1a }));
    knob.rotation.z = Math.PI / 2;
    knob.position.set(0.012, 0.05 * big, 0);
    this.crank.add(knob);
    this.reel.add(this.crank);
    this.root.add(this.reel);

    // segmented blank
    const blankMat = M({ color: look.blank, roughness: 0.25, metalness: 0.25, emissive: look.glow ? new THREE.Color(look.glow).multiplyScalar(0.15) : new THREE.Color(0) });
    const wrapMat = M({ color: look.wrap, roughness: 0.4 });
    const guideMat = M({ color: 0xc0c0c8, metalness: 0.9, roughness: 0.2 });
    const N = 8;
    this.segments = [];
    this.guides = [];
    const blankLen = len - 0.23;
    const segLen = blankLen / N;
    let parent = this.root;
    const r0 = 0.0125 * big, r1 = 0.0025;
    for (let i = 0; i < N; i++) {
      const joint = new THREE.Group();
      joint.position.z = i === 0 ? -0.23 : -segLen;
      parent.add(joint);
      const ra = r0 + (r1 - r0) * (i / N), rb = r0 + (r1 - r0) * ((i + 1) / N);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(rb, ra, segLen, 8), blankMat);
      seg.rotation.x = -Math.PI / 2;
      seg.position.z = -segLen / 2;
      joint.add(seg);
      if (look.nodes) {
        const node = new THREE.Mesh(new THREE.TorusGeometry(ra * 1.05, ra * 0.25, 4, 10), blankMat);
        joint.add(node);
      }
      if (i > 0 && i % Math.max(1, Math.round(N / look.guides)) === 0 || i === N - 1) {
        const wrap = new THREE.Mesh(new THREE.CylinderGeometry(ra * 1.15, ra * 1.15, 0.025, 8), wrapMat);
        wrap.rotation.x = Math.PI / 2;
        wrap.position.z = -segLen * 0.5;
        joint.add(wrap);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.008 + ra * 0.6, 0.0016, 5, 10), guideMat);
        ring.position.set(0, -(ra + 0.012 + ra * 0.5), -segLen * 0.5);
        joint.add(ring);
        const g = new THREE.Object3D();
        g.position.copy(ring.position);
        joint.add(g);
        this.guides.push(g);
      }
      this.segments.push(joint);
      parent = joint;
    }
    this.tip = new THREE.Object3D();
    this.tip.position.z = -segLen;
    parent.add(this.tip);
    const tipTop = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 4), wrapMat);
    this.tip.add(tipTop);
    this.reelOut = new THREE.Object3D();
    this.reelOut.position.set(0, -0.06 * big, -0.21);
    this.root.add(this.reelOut);

    this.bend = 0;
    this.bendDir = new THREE.Vector2(0, -1);
    this.crankAngle = 0;
    this._inv = new THREE.Matrix4();
  }

  /**
   * Bend toward a world-space pull direction.
   * @param {number} amount 0..1 (tension)
   * @param {THREE.Vector3} worldPullDir direction the line pulls the tip
   */
  setBend(amount, worldPullDir, dt) {
    const elastic = 0.35 + this.rod.stats.elasticity * 0.9;
    const target = THREE.MathUtils.clamp(amount, 0, 1.2) * elastic;
    this.bend += (target - this.bend) * Math.min(1, dt * 10);
    if (worldPullDir) {
      this.root.updateMatrixWorld(true);
      this._inv.copy(this.root.matrixWorld).invert();
      const local = worldPullDir.clone().transformDirection(this._inv);
      const v = new THREE.Vector2(local.x, local.y);
      if (v.lengthSq() > 1e-4) this.bendDir.lerp(v.normalize(), Math.min(1, dt * 6)).normalize();
    }
    const n = this.segments.length;
    const total = this.bend * 1.3; // radians across the blank
    for (let i = 0; i < n; i++) {
      const w = Math.pow((i + 1) / n, 2.2);
      const a = total * w / n * 2.4;
      // rotate about axis perpendicular to bend direction (in XY plane)
      this.segments[i].rotation.set(this.bendDir.y * a, -this.bendDir.x * a, 0);
    }
  }

  spinReel(dt, speed) {
    this.crankAngle += dt * speed * 14;
    this.crank.rotation.z = this.crankAngle;
    this.spool.rotation.y += dt * speed * 6;
  }

  tipWorld(out) { return this.tip.getWorldPosition(out); }

  /** Polyline from reel through guides to the tip (world space). */
  guidePath(out) {
    out.length = 0;
    out.push(this.reelOut.getWorldPosition(new THREE.Vector3()));
    for (const g of this.guides) out.push(g.getWorldPosition(new THREE.Vector3()));
    out.push(this.tip.getWorldPosition(new THREE.Vector3()));
    return out;
  }

  dispose() {
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
}
