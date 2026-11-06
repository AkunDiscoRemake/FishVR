// Lure + bobber rigid-ish body: ballistic flight with drag, floating with buoyancy
// on the animated wave surface, being dragged by the line, and a hook below the float.
import * as THREE from 'three';

export class Lure {
  constructor(quality) {
    this.object = new THREE.Group();
    const std = quality.standardMaterials;
    const M = (c) => (std ? new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 }) : new THREE.MeshLambertMaterial({ color: c }));
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0xe8241c));
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M(0xf4f4f4));
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 6), M(0xe8241c));
    stick.position.y = 0.06;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.004, 4, 16), M(0x111111));
    band.rotation.x = Math.PI / 2;
    this.float = new THREE.Group();
    this.float.add(top, bottom, stick, band);
    this.object.add(this.float);
    // leader + hook
    this.hook = new THREE.Group();
    const hookMesh = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0018, 4, 12, Math.PI * 1.4), new THREE.MeshStandardMaterial({ color: 0xb0b0b8, metalness: 0.9, roughness: 0.2 }));
    hookMesh.rotation.z = Math.PI * 0.8;
    const bait = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.025, 2, 6), M(0xc06a6a));
    bait.position.y = -0.012;
    this.hook.add(hookMesh, bait);
    this.object.add(this.hook);
    this.leaderGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -0.5, 0)]);
    this.leader = new THREE.Line(this.leaderGeo, new THREE.LineBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.7 }));
    this.leader.frustumCulled = false;
    this.object.add(this.leader);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.state = 'held'; // held | flying | floating | landed | underwater
    this.dip = 0; // extra downward displacement from nibbles / bite
    this.dipTarget = 0;
    this.leaderLen = 0.5;
    this.tilt = 0;
  }

  launch(from, velocity) {
    this.pos.copy(from);
    this.vel.copy(velocity);
    this.state = 'flying';
  }

  /** returns event string when it hits something */
  update(dt, waterHeight, groundHeight, isWater) {
    let ev = null;
    if (this.state === 'flying') {
      this.vel.y -= 9.8 * dt;
      this.vel.multiplyScalar(1 - 0.12 * dt);
      this.pos.addScaledVector(this.vel, dt);
      const wh = waterHeight(this.pos.x, this.pos.z);
      const gh = groundHeight(this.pos.x, this.pos.z);
      if (gh !== null && this.pos.y <= gh + 0.03) { this.pos.y = gh + 0.03; this.state = 'landed'; this.vel.set(0, 0, 0); ev = 'ground'; }
      else if (this.pos.y <= wh) {
        if (isWater(this.pos.x, this.pos.z)) { this.state = 'floating'; this.vel.multiplyScalar(0.05); this.vel.y = 0; ev = 'water'; }
        else { this.state = 'landed'; this.vel.set(0, 0, 0); ev = 'ground'; }
      }
    } else if (this.state === 'floating' || this.state === 'underwater') {
      const wh = waterHeight(this.pos.x, this.pos.z);
      this.dip += (this.dipTarget - this.dip) * Math.min(1, dt * 14);
      const target = wh - 0.01 - this.dip;
      // buoyancy spring
      this.vel.y += (target - this.pos.y) * 60 * dt;
      this.vel.y *= 1 - Math.min(1, dt * 8);
      this.vel.x *= 1 - Math.min(1, dt * 1.5);
      this.vel.z *= 1 - Math.min(1, dt * 1.5);
      this.pos.addScaledVector(this.vel, dt);
      this.tilt += ((this.dip > 0.05 ? 0.5 : 0) - this.tilt) * Math.min(1, dt * 6);
    }
    this.object.position.copy(this.pos);
    this.float.rotation.x = this.tilt;
    const hookY = this.state === 'floating' || this.state === 'underwater' ? -this.leaderLen : -0.12;
    this.hook.position.set(0, hookY, 0);
    const lp = this.leaderGeo.attributes.position;
    lp.setXYZ(1, 0, hookY, 0);
    lp.needsUpdate = true;
    return ev;
  }

  /** Pull toward a point (reeling) at speed m/s; returns remaining distance. */
  pullToward(target, speed, dt) {
    const d = target.clone().sub(this.pos);
    d.y = 0;
    const len = d.length();
    if (len > 1e-3) this.vel.addScaledVector(d.normalize(), speed * 4 * dt).clampLength(0, speed);
    return len;
  }
}
