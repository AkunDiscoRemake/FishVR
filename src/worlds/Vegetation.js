// Instanced vegetation and props generated procedurally per world.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { foliageTexture } from '../rendering/textures.js';
import { createRng } from '@game/rng.js';

function colored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = 0.85 + Math.random() * 0.15;
    arr[i * 3] = c.r * v; arr[i * 3 + 1] = c.g * v; arr[i * 3 + 2] = c.b * v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

function pineGeometry() {
  const parts = [colored(new THREE.CylinderGeometry(0.12, 0.22, 2.2, 6).translate(0, 1.1, 0), 0x4a3422)];
  const tiers = [[1.6, 2.4, 2.3], [1.25, 2.1, 3.5], [0.9, 1.8, 4.6], [0.5, 1.4, 5.6]];
  tiers.forEach(([r, h, y], i) => parts.push(colored(new THREE.ConeGeometry(r, h, 8).translate(0, y, 0), i % 2 ? 0x24452a : 0x2a5030)));
  return mergeGeometries(parts);
}

function birchGeometry() {
  const parts = [colored(new THREE.CylinderGeometry(0.09, 0.14, 4.2, 6).translate(0, 2.1, 0), 0xd8d4c8)];
  [[0, 4.2, 0, 1.3], [0.6, 3.6, 0.3, 1.0], [-0.5, 3.8, -0.4, 1.05], [0.1, 5.0, 0.2, 0.9]].forEach(([x, y, z, r], i) => {
    parts.push(colored(new THREE.IcosahedronGeometry(r, 0).translate(x, y, z), i % 2 ? 0x5a8a3a : 0x6a9a40));
  });
  return mergeGeometries(parts);
}

function palmGeometry() {
  const parts = [];
  let x = 0, y = 0;
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.CylinderGeometry(0.15 - i * 0.008, 0.18 - i * 0.008, 1.0, 7);
    seg.rotateZ(-0.06 * i);
    seg.translate(x, y + 0.5, 0);
    parts.push(colored(seg, i % 2 ? 0x8a7050 : 0x7a6040));
    x += Math.sin(0.06 * i) * 1.0; y += Math.cos(0.06 * i) * 1.0;
  }
  for (let k = 0; k < 8; k++) {
    const leaf = new THREE.PlaneGeometry(0.55, 3.2, 1, 6);
    const p = leaf.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const ly = p.getY(i) + 1.6; // 0..3.2 along leaf
      p.setX(i, p.getX(i) * (1 - ly / 3.6));
      p.setZ(i, -(ly * ly) * 0.09);
      p.setY(i, ly);
    }
    leaf.rotateX(-Math.PI / 2.6);
    leaf.rotateY((k / 8) * Math.PI * 2);
    leaf.translate(x, y, 0);
    parts.push(colored(leaf, k % 2 ? 0x3a7a2a : 0x4a8a30));
  }
  parts.push(colored(new THREE.SphereGeometry(0.22, 6, 4).translate(x, y - 0.15, 0.1), 0x5a4a2a));
  return mergeGeometries(parts);
}

function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const rng = createRng(seed);
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3);
    if (!map.has(key)) map.set(key, 0.75 + rng.next() * 0.45);
    const s = map.get(key);
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.7, p.getZ(i) * s);
  }
  g.computeVertexNormals();
  return colored(g, 0x7a7a74);
}

function reedGeometry() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, r = 0.12;
    const h = 1.3 + (i % 3) * 0.3;
    const stem = new THREE.CylinderGeometry(0.012, 0.018, h, 4).translate(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    parts.push(colored(stem, 0x6a8a3a));
    if (i % 2 === 0) parts.push(colored(new THREE.CapsuleGeometry(0.035, 0.22, 2, 5).translate(Math.cos(a) * r, h - 0.05, Math.sin(a) * r), 0x5a3a1a));
  }
  return mergeGeometries(parts);
}

function lilyGeometry() {
  const pad = new THREE.CircleGeometry(0.38, 12, 0.35, Math.PI * 2 - 0.7).rotateX(-Math.PI / 2);
  return colored(pad, 0x3a7a2a);
}

function coralGeometry(kind) {
  const parts = [];
  if (kind === 0) {
    for (let i = 0; i < 7; i++) {
      const h = 0.6 + (i % 3) * 0.3;
      const b = new THREE.CylinderGeometry(0.04, 0.07, h, 5);
      b.rotateZ((i - 3) * 0.22);
      b.rotateY(i * 0.9);
      b.translate(0, h / 2, 0);
      parts.push(colored(b, 0xffffff));
    }
  } else if (kind === 1) {
    parts.push(colored(new THREE.SphereGeometry(0.5, 10, 7).scale(1, 0.6, 1), 0xffffff));
  } else {
    for (let i = 0; i < 5; i++) {
      const fan = new THREE.CircleGeometry(0.45, 9, 0, Math.PI).rotateY(i * 0.6).translate(0, 0.1, 0);
      parts.push(colored(fan, 0xffffff));
    }
  }
  return mergeGeometries(parts);
}

function makeInstanced(geo, mat, transforms, colors) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, transforms.length));
  const m = new THREE.Matrix4();
  transforms.forEach((t, i) => {
    m.compose(t.p, new THREE.Quaternion().setFromEuler(new THREE.Euler(t.rx || 0, t.ry || 0, t.rz || 0)), new THREE.Vector3(t.s, t.sy || t.s, t.s));
    mesh.setMatrixAt(i, m);
    if (colors) mesh.setColorAt(i, colors[i]);
  });
  mesh.count = transforms.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/** Scatter points over terrain matching a predicate. */
function scatter(rng, count, extent, heightFn, accept, avoid) {
  const out = [];
  let tries = 0;
  while (out.length < count && tries < count * 25) {
    tries++;
    const x = (rng.next() - 0.5) * extent, z = (rng.next() - 0.5) * extent;
    if (avoid && avoid(x, z)) continue;
    const h = heightFn(x, z);
    if (!accept(h, x, z)) continue;
    out.push({ x, z, h });
  }
  return out;
}

export function buildVegetation(worldId, preset, quality, heightFn, avoid) {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const v = preset.vegetation;
  const rng = createRng('veg:' + worldId);
  const lit = (opts) => (quality.standardMaterials ? new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9 }, opts)) : new THREE.MeshLambertMaterial(opts));
  const vc = lit({ vertexColors: true });
  const extent = 360;

  if (v.pines) {
    const pts = scatter(rng, Math.round(quality.trees * v.pines), extent, heightFn, (h) => h > 1.2 && h < 40, avoid);
    group.add(makeInstanced(pineGeometry(), vc, pts.map((p) => ({ p: new THREE.Vector3(p.x, p.h - 0.2, p.z), s: 0.9 + rng.next() * 1.1, ry: rng.next() * 6.28 }))));
  }
  if (v.birches) {
    const pts = scatter(rng, Math.round(quality.trees * v.birches * 0.6), extent, heightFn, (h) => h > 1 && h < 18, avoid);
    group.add(makeInstanced(birchGeometry(), vc, pts.map((p) => ({ p: new THREE.Vector3(p.x, p.h - 0.1, p.z), s: 0.8 + rng.next() * 0.7, ry: rng.next() * 6.28 }))));
  }
  if (v.palms) {
    const pts = scatter(rng, Math.round(quality.trees * v.palms * 0.5), extent, heightFn, (h) => h > 0.5 && h < 10, avoid);
    const mat = lit({ vertexColors: true, side: THREE.DoubleSide });
    group.add(makeInstanced(palmGeometry(), mat, pts.map((p) => ({ p: new THREE.Vector3(p.x, p.h - 0.1, p.z), s: 0.8 + rng.next() * 0.6, ry: rng.next() * 6.28 }))));
  }
  if (v.rocks) {
    const pts = scatter(rng, Math.round(quality.trees * v.rocks * 0.6), extent * 0.7, heightFn, (h) => h > -2.5 && h < 30, avoid);
    group.add(makeInstanced(rockGeometry(7), vc, pts.map((p) => ({ p: new THREE.Vector3(p.x, p.h - 0.2, p.z), s: 0.3 + Math.pow(rng.next(), 2) * 2.2, ry: rng.next() * 6.28, rx: rng.next() * 0.4 }))));
  }
  if (v.grass) {
    const tex = foliageTexture(worldId === 'tropical' ? '#5a9a3a' : '#4a7a2a');
    const geo = mergeGeometries([new THREE.PlaneGeometry(0.9, 0.6).translate(0, 0.3, 0), new THREE.PlaneGeometry(0.9, 0.6).rotateY(Math.PI / 2).translate(0, 0.3, 0)]);
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    const pts = scatter(rng, Math.round(quality.grass * v.grass), 160, heightFn, (h) => h > 0.4 && h < 15, avoid);
    group.add(makeInstanced(geo, mat, pts.map((p) => ({ p: new THREE.Vector3(p.x, p.h - 0.03, p.z), s: 0.7 + rng.next() * 0.8, ry: rng.next() * 6.28 }))));
  }
  if (v.reeds) {
    const pts = scatter(rng, Math.round(220 * v.reeds * (quality.trees / 160)), 220, heightFn, (h) => h > -0.6 && h < 0.35, avoid);
    group.add(makeInstanced(reedGeometry(), vc, pts.map((p) => ({ p: new THREE.Vector3(p.x, Math.min(p.h, -0.05), p.z), s: 0.8 + rng.next() * 0.6, ry: rng.next() * 6.28 }))));
  }
  if (v.lilies) {
    const pts = scatter(rng, Math.round(160 * v.lilies), 200, heightFn, (h) => h > -2.8 && h < -0.6, avoid);
    const mat = lit({ vertexColors: true, side: THREE.DoubleSide });
    const lilies = makeInstanced(lilyGeometry(), mat, pts.map((p) => ({ p: new THREE.Vector3(p.x, 0.02, p.z), s: 0.7 + rng.next() * 0.8, ry: rng.next() * 6.28 })));
    lilies.userData.floating = true;
    group.add(lilies);
    const flowers = pts.filter(() => rng.chance(0.25));
    const fl = makeInstanced(colored(new THREE.ConeGeometry(0.09, 0.12, 6, 1, true).rotateX(Math.PI), 0xf0a0c0), lit({ vertexColors: true, side: THREE.DoubleSide }),
      flowers.map((p) => ({ p: new THREE.Vector3(p.x + 0.08, 0.1, p.z), s: 1 })));
    group.add(fl);
  }
  if (v.coral) {
    const palette = [0xff6a5a, 0xffa040, 0xc060ff, 0x40e0c0, 0xff60a0, 0xf0e060];
    for (let kind = 0; kind < 3; kind++) {
      const pts = scatter(rng, 120, 150, heightFn, (h) => h < -0.8 && h > -6, avoid);
      const cols = pts.map(() => new THREE.Color(palette[Math.floor(rng.next() * palette.length)]));
      group.add(makeInstanced(coralGeometry(kind), lit({ vertexColors: true, side: THREE.DoubleSide }),
        pts.map((p) => ({ p: new THREE.Vector3(p.x, p.h, p.z), s: 0.6 + rng.next() * 1.2, ry: rng.next() * 6.28 })), cols));
    }
  }
  if (v.mountains !== undefined) {
    const parts = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rng.next() * 0.2;
      const r = 300 + rng.next() * 60;
      const h = 40 + rng.next() * (worldId === 'deep' || worldId === 'ocean' ? 30 : 110);
      const cone = new THREE.ConeGeometry(50 + rng.next() * 60, h, 7).translate(Math.cos(a) * r, h / 2 - 8, Math.sin(a) * r);
      parts.push(cone);
    }
    // ocean worlds: only distant islands on one side
    const geo = mergeGeometries(parts);
    const mat = new THREE.MeshBasicMaterial({ color: v.mountains, fog: false });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'mountains';
    group.add(m);
  }
  return group;
}

