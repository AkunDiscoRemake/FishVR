// Animated rating text ("PERFECT!", "Amazing!", ...) + particle bursts + flash ring.
import * as THREE from 'three';
import { RATINGS } from '@game/constants.js';
import { FONT } from '../ui/Panel.js';

const texCache = {};
function ratingTexture(r, combo) {
  const key = r.key + ':' + (combo || 0);
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas');
  c.width = 512; c.height = 192;
  const ctx = c.getContext('2d');
  const size = r.key === 'PERFECT' ? 110 : r.key === 'NOTGOOD' ? 64 : 88;
  ctx.font = `italic 900 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(r.label, 256, 86);
  if (r.key === 'PERFECT') {
    const g = ctx.createLinearGradient(0, 30, 0, 140);
    g.addColorStop(0, '#fff6b0'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#ff9a1a');
    ctx.fillStyle = g;
  } else ctx.fillStyle = r.color;
  ctx.fillText(r.label, 256, 86);
  if (combo && combo > 1) {
    ctx.font = `800 44px ${FONT}`;
    ctx.lineWidth = 8;
    ctx.strokeText('COMBO x' + combo, 256, 160);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('COMBO x' + combo, 256, 160);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache[key] = t;
  return t;
}

export class RatingFeedback {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.items = [];
    this.flash = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 40), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0, depthTest: false, side: THREE.DoubleSide }));
    this.flash.renderOrder = 160;
    scene.add(this.flash);
    this.flashT = 1;
    for (const r of RATINGS) ratingTexture(r, 0); // warm cache
  }

  show(rating, position, cameraPos, combo) {
    const mat = new THREE.MeshBasicMaterial({ map: ratingTexture(rating, rating.key === 'PERFECT' ? combo : 0), transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.375), mat);
    m.renderOrder = 170;
    m.position.copy(position);
    m.lookAt(cameraPos);
    this.scene.add(m);
    this.items.push({ m, t: 0, base: position.clone(), key: rating.key });
    const col = new THREE.Color(rating.color);
    if (rating.key === 'PERFECT') {
      this.particles.sparkle(position, new THREE.Color(1, 0.85, 0.3), 70, 3.2);
      this.particles.sparkle(position, new THREE.Color(1, 1, 1), 25, 1.6);
      this.flash.position.copy(position);
      this.flash.lookAt(cameraPos);
      this.flashT = 0;
    } else if (rating.key === 'AMAZING') {
      this.particles.sparkle(position, col, 35, 2.2);
    } else if (rating.key === 'GOOD') {
      this.particles.sparkle(position, col, 15, 1.5);
    }
  }

  update(dt, cameraPos) {
    for (const it of this.items) {
      it.t += dt;
      const t = it.t;
      const pop = t < 0.12 ? 0.3 + (t / 0.12) * 1.0 : t < 0.25 ? 1.3 - ((t - 0.12) / 0.13) * 0.3 : 1;
      const wobble = it.key === 'FAILED' || it.key === 'BAD' ? Math.sin(t * 40) * 0.03 * Math.max(0, 1 - t * 3) : 0;
      it.m.scale.setScalar(pop * (it.key === 'PERFECT' ? 1.25 : 1));
      it.m.position.copy(it.base);
      it.m.position.y += t * 0.35;
      it.m.position.x += wobble;
      it.m.lookAt(cameraPos);
      it.m.material.opacity = t < 0.8 ? 1 : Math.max(0, 1 - (t - 0.8) / 0.4);
    }
    const dead = this.items.filter((i) => i.t > 1.25);
    for (const d of dead) { this.scene.remove(d.m); d.m.geometry.dispose(); d.m.material.dispose(); }
    this.items = this.items.filter((i) => i.t <= 1.25);
    if (this.flashT < 1) {
      this.flashT += dt * 2.2;
      this.flash.scale.setScalar(1 + this.flashT * 4);
      this.flash.material.opacity = Math.max(0, 1 - this.flashT);
    } else this.flash.material.opacity = 0;
  }
}
