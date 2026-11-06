// Docks, piers, jetty, river platform and the deep-sea boat.
// Each returns { group, walkable: [{minX,maxX,minZ,maxZ,y}] }.
import * as THREE from 'three';
import { woodTexture } from '../rendering/textures.js';

function woodMat(quality, repeatX = 1, repeatY = 1, base, dark) {
  const t = woodTexture(quality.textureSize >= 512 ? 256 : 128, base, dark).clone();
  t.needsUpdate = true;
  t.repeat.set(repeatX, repeatY);
  return quality.standardMaterials
    ? new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 })
    : new THREE.MeshLambertMaterial({ map: t });
}

function deck(quality, minX, maxX, minZ, maxZ, y, thickness = 0.12, base, dark) {
  const w = maxX - minX, l = maxZ - minZ;
  const g = new THREE.Group();
  const plankCount = Math.max(1, Math.round(l / 0.32));
  const mat = woodMat(quality, 1, 1, base || '#8a6440', dark || '#5a3c22');
  const geo = new THREE.BoxGeometry(w, thickness, l / plankCount * 0.94);
  for (let i = 0; i < plankCount; i++) {
    const p = new THREE.Mesh(geo, mat);
    p.position.set((minX + maxX) / 2, y - thickness / 2 + (i % 3 === 0 ? 0.004 : 0), minZ + (i + 0.5) * (l / plankCount));
    p.rotation.y = (Math.random() - 0.5) * 0.01;
    p.receiveShadow = true;
    g.add(p);
  }
  return g;
}

function posts(quality, minX, maxX, minZ, maxZ, top, bottom, spacing = 2.4, radius = 0.12) {
  const g = new THREE.Group();
  const mat = woodMat(quality, 1, 2, '#5a4028', '#3a2818');
  const h = top - bottom;
  const geo = new THREE.CylinderGeometry(radius, radius * 1.1, h, 7);
  for (let z = minZ; z <= maxZ + 0.01; z += spacing) {
    for (const x of [minX, maxX]) {
      const p = new THREE.Mesh(geo, mat);
      p.position.set(x, bottom + h / 2, z);
      g.add(p);
    }
  }
  return g;
}

function railing(quality, minX, maxX, minZ, maxZ, y) {
  const g = new THREE.Group();
  const mat = woodMat(quality, 4, 1, '#6a4a2e', '#3a2818');
  for (const x of [minX + 0.05, maxX - 0.05]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, maxZ - minZ), mat);
    rail.position.set(x, y + 0.95, (minZ + maxZ) / 2);
    g.add(rail);
    for (let z = minZ; z <= maxZ; z += 2) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.08), mat);
      p.position.set(x, y + 0.47, z);
      g.add(p);
    }
  }
  return g;
}

function lantern(quality, x, y, z, color = 0xffc070, withLight = true) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.8, 6), new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));
  pole.position.set(x, y + 0.9, z);
  g.add(pole);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color }));
  lamp.position.set(x, y + 1.85, z);
  g.add(lamp);
  if (withLight) {
    const light = new THREE.PointLight(color, quality.standardMaterials ? 6 : 3, 14, 1.6);
    light.position.copy(lamp.position);
    g.add(light);
  }
  return g;
}

function cabin(quality, x, y, z, rotY) {
  const g = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 3.2), woodMat(quality, 3, 2, '#6a4a30', '#4a3220'));
  walls.position.y = 1.3;
  g.add(walls);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.6, 4), new THREE.MeshLambertMaterial({ color: 0x5a2a20 }));
  roof.position.y = 3.4;
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.05, 1, 0.85);
  g.add(roof);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), new THREE.MeshLambertMaterial({ color: 0x3a2414 }));
  door.position.set(0, 0.9, 1.61);
  g.add(door);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), new THREE.MeshBasicMaterial({ color: 0xffd890 }));
  win.position.set(1.2, 1.5, 1.61);
  g.add(win);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  return g;
}

function hut(quality, x, y, z) {
  const g = new THREE.Group();
  const floor = deck(quality, -2.2, 2.2, -2.2, 2.2, 0);
  g.add(floor);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.2, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0xc8a860, side: THREE.DoubleSide }));
  roof.position.y = 3.6;
  g.add(roof);
  for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 6), new THREE.MeshLambertMaterial({ color: 0x8a6a40 }));
    p.position.set(px, 1.3, pz);
    g.add(p);
  }
  g.position.set(x, y, z);
  return g;
}

function boat(quality) {
  const g = new THREE.Group();
  // hull from a lathe-like extruded profile
  const shape = new THREE.Shape();
  shape.moveTo(-2.1, 1.2);
  shape.quadraticCurveTo(-2.0, -0.2, 0, -0.8);
  shape.quadraticCurveTo(2.0, -0.2, 2.1, 1.2);
  shape.lineTo(-2.1, 1.2);
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 10, bevelEnabled: false, steps: 1 });
  hullGeo.translate(0, 0, -5);
  // taper the bow
  const p = hullGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    if (z < -2.5) {
      const t = (z + 5) / 2.5; // 0 at bow tip
      p.setX(i, p.getX(i) * (0.15 + 0.85 * t));
    }
  }
  hullGeo.computeVertexNormals();
  const hullMat = quality.standardMaterials ? new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.5 }) : new THREE.MeshLambertMaterial({ color: 0xe8e8e0 });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  g.add(hull);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.25, 0.15, 7.5), new THREE.MeshLambertMaterial({ color: 0x1a3a7a }));
  stripe.position.set(0, 0.95, 1.2);
  g.add(stripe);
  g.add(deck(quality, -1.9, 1.9, -3.2, 4.8, 1.2));
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 2.2), hullMat);
  cab.position.set(0, 2.1, 3.6);
  g.add(cab);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), new THREE.MeshBasicMaterial({ color: 0x8ab0d0 }));
  glass.position.set(0, 2.5, 2.49);
  glass.rotation.y = Math.PI;
  glass.rotation.y = 0;
  g.add(glass);
  g.add(railing(quality, -1.95, 1.95, -3.2, 2.4, 1.2));
  g.add(lantern(quality, 1.5, 1.2, -2.8, 0xffd9a0, true));
  return g;
}

export function buildStructure(kind, quality) {
  const group = new THREE.Group();
  group.name = 'structure';
  const walkable = [];
  switch (kind) {
    case 'dock': {
      group.add(deck(quality, -1.3, 1.3, -8, 14, 0.55));
      group.add(posts(quality, -1.25, 1.25, -8, 14, 0.5, -3.5));
      group.add(deck(quality, -3.5, -1.3, -8, -4, 0.55));
      group.add(posts(quality, -3.45, -1.35, -8, -4, 0.5, -3.5, 4));
      group.add(lantern(quality, 1.15, 0.55, 6, 0xffc070, quality.standardMaterials));
      group.add(cabin(quality, 12, 1.6, 24, -0.4));
      walkable.push({ minX: -1.3, maxX: 1.3, minZ: -8, maxZ: 14, y: 0.55 }, { minX: -3.5, maxX: -1.3, minZ: -8, maxZ: -4, y: 0.55 });
      break;
    }
    case 'platform': {
      group.add(deck(quality, -2.2, 2.2, 4, 16, 0.5));
      group.add(posts(quality, -2.15, 2.15, 4, 16, 0.45, -2.5));
      group.add(railing(quality, -2.2, 2.2, 4, 9, 0.5));
      walkable.push({ minX: -2.2, maxX: 2.2, minZ: 4, maxZ: 16, y: 0.5 });
      break;
    }
    case 'pier': {
      group.add(deck(quality, -1.7, 1.7, -30, 42, 3.0, 0.15, '#9a7650', '#5a4028'));
      group.add(posts(quality, -1.65, 1.65, -30, 42, 2.95, -12, 3, 0.18));
      group.add(railing(quality, -1.7, 1.7, -30, 30, 3.0));
      group.add(lantern(quality, -1.5, 3.0, -18, 0xfff0d0, false));
      group.add(lantern(quality, 1.5, 3.0, -10, 0xfff0d0, false));
      walkable.push({ minX: -1.7, maxX: 1.7, minZ: -30, maxZ: 42, y: 3.0 });
      break;
    }
    case 'jetty': {
      group.add(deck(quality, -1.4, 1.4, -14, 28, 1.0));
      group.add(posts(quality, -1.35, 1.35, -14, 28, 0.95, -4));
      group.add(deck(quality, 1.4, 2.2, -9, -7, 1.0));
      group.add(hut(quality, 4.4, 1.0, -8));
      walkable.push({ minX: -1.4, maxX: 1.4, minZ: -14, maxZ: 28, y: 1.0 }, { minX: 1.4, maxX: 2.2, minZ: -9, maxZ: -7, y: 1.0 }, { minX: 2.2, maxX: 6.6, minZ: -10.2, maxZ: -5.8, y: 1.0 });
      break;
    }
    case 'boat': {
      const b = boat(quality);
      b.name = 'boat';
      group.add(b);
      walkable.push({ minX: -1.6, maxX: 1.6, minZ: -3.1, maxZ: 2.4, y: 1.2 });
      break;
    }
    default: break;
  }
  return { group, walkable };
}

export const SPAWNS = {
  lake: { x: 0, z: -6, yaw: 0 },
  river: { x: 0, z: 6.5, yaw: 0 },
  ocean: { x: 0, z: -27, yaw: 0 },
  tropical: { x: 0, z: -12, yaw: 0 },
  deep: { x: 0, z: -2.4, yaw: 0 },
};
