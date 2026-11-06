// Height functions for each world + terrain mesh with vertex colours and a detail texture.
import * as THREE from 'three';
import { fbm } from '../rendering/noise.js';
import { groundDetailTexture } from '../rendering/textures.js';

const SS = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const HEIGHT_FUNCS = {
  lake(x, z) {
    const cx = 0, cz = -48;
    const n = fbm(x * 0.02, z * 0.02, 4, 3);
    const dockBlend = SS(10, 30, Math.abs(x));
    const R = 56 + (n - 0.5) * 30 * dockBlend;
    const d = Math.hypot(x - cx, z - cz);
    if (d < R) return -(1 - Math.pow(d / R, 1.6)) * 9 - 0.4 * SS(R - 6, R, R - d + 6);
    const hills = fbm(x * 0.012 + 5, z * 0.012, 5, 9) * 26 * SS(R + 15, R + 90, d);
    return Math.min(2.2, (d - R) * 0.18) + hills + (fbm(x * 0.1, z * 0.1, 2, 4) - 0.5) * 0.6;
  },
  river(x, z) {
    const center = 7 * Math.sin(x / 34) + 4 * Math.sin(x / 13 + 1);
    const W = 26;
    const dz = Math.abs(z - center);
    const n = fbm(x * 0.05, z * 0.05, 3, 2);
    if (dz < W / 2) return -(1 - Math.pow(dz / (W / 2), 2)) * 3.6 - 0.25 + (n - 0.5) * 0.8;
    const hills = fbm(x * 0.015, z * 0.015, 5, 4) * 30 * SS(W / 2 + 12, W / 2 + 90, dz);
    return Math.min(1.5, (dz - W / 2) * 0.3) + hills + (n - 0.5) * 0.8;
  },
  ocean(x, z) {
    const shore = 34 + (fbm(x * 0.01, 0.5, 3, 5) - 0.5) * 20;
    if (z < shore) return Math.max(-38, (z - shore) * 0.16) + (fbm(x * 0.04, z * 0.04, 3, 7) - 0.5) * 1.2;
    const dunes = fbm(x * 0.03, z * 0.03, 4, 6) * 4 * SS(shore, shore + 25, z) + SS(shore + 40, shore + 140, z) * fbm(x * 0.01, z * 0.01, 4, 2) * 40;
    return (z - shore) * 0.08 + dunes;
  },
  tropical(x, z) {
    const cx = 0, cz = -40;
    const d = Math.hypot(x - cx, z - cz);
    const n = fbm(x * 0.025, z * 0.025, 4, 11);
    const R = 62 + (n - 0.5) * 24;
    if (d < R) return -(1 - Math.pow(d / R, 1.3)) * 5.5 - 0.3 + (fbm(x * 0.08, z * 0.08, 2, 3) - 0.5) * 0.8;
    // island ring then outer reef dropping to deep ocean
    const ring = d - R;
    if (ring < 45) return Math.min(1.8, ring * 0.12) + fbm(x * 0.03, z * 0.03, 4, 5) * 7 * SS(8, 40, ring);
    return 1.8 - (ring - 45) * 0.4;
  },
  deep(x, z) {
    return -120 - fbm(x * 0.01, z * 0.01, 3, 1) * 60;
  },
};

export function buildTerrain(worldId, preset, quality, extent = 420) {
  const fn = HEIGHT_FUNCS[worldId];
  const seg = quality.waterSegments >= 120 ? 180 : quality.waterSegments >= 80 ? 128 : 90;
  const geo = new THREE.PlaneGeometry(extent, extent, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const g = preset.ground;
  const cLow = new THREE.Color(g.low), cMid = new THREE.Color(g.mid), cHigh = new THREE.Color(g.high);
  const cRock = new THREE.Color(g.rock), cSand = new THREE.Color(g.sand);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = fn(x, z);
    pos.setY(i, h);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i);
    const slope = 1 - nrm.getY(i);
    if (h < 0.6) c.copy(cSand).lerp(cLow, SS(-4, 0.5, h) * 0.3);
    else if (h < 8) c.copy(cMid).lerp(cSand, SS(1.2, 0.6, h));
    else c.copy(cMid).lerp(cHigh, SS(8, 25, h));
    if (h < -0.2) c.multiplyScalar(0.75 + 0.25 * SS(-8, 0, h));
    c.lerp(cRock, SS(0.25, 0.55, slope));
    const v = 0.9 + Math.random() * 0.1;
    colors[i * 3] = c.r * v; colors[i * 3 + 1] = c.g * v; colors[i * 3 + 2] = c.b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const tex = groundDetailTexture(quality.textureSize >= 512 ? 256 : 128, 3);
  tex.repeat.set(extent / 6, extent / 6);
  const mat = quality.standardMaterials
    ? new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.95, metalness: 0 })
    : new THREE.MeshLambertMaterial({ vertexColors: true, map: tex });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = !!quality.shadows;
  mesh.name = 'terrain';
  return { mesh, heightAt: fn };
}

/** Bakes water depth into a texture for the water shader (shore foam / colour). */
export function bakeDepthTexture(heightFn, bounds, size = 128) {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = bounds.x + (i + 0.5) / size * bounds.w;
    const z = bounds.z + (j + 0.5) / size * bounds.h;
    const d = Math.min(12, Math.max(0, -heightFn(x, z)));
    const k = (j * size + i) * 4;
    data[k] = Math.round(d / 12 * 255); data[k + 1] = 0; data[k + 2] = 0; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
