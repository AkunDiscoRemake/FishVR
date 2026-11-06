// Procedural canvas textures (no downloaded assets): water normals, wood, cork, bark, ground detail.
import * as THREE from 'three';
import { tileNoise, valueNoise } from './noise.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const cache = new Map();
function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

/** Tileable normal map from a noise height field. */
export function waterNormalTexture(size = 256) {
  return cached('waterN' + size, () => {
    const c = canvas(size, size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const H = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      // ridged directional ripples + isotropic detail, both periodic so the texture tiles
      const ripple = Math.sin((u * 6 + v * 2) * Math.PI * 2 + tileNoise(u, v, 4, 3, 5) * 6) * 0.25;
      H[y * size + x] = tileNoise(u, v, 6, 4, 7) + 0.4 * tileNoise(u, v, 16, 2, 3) + ripple;
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const l = H[y * size + ((x - 1 + size) % size)], r = H[y * size + ((x + 1) % size)];
      const u = H[((y - 1 + size) % size) * size + x], d = H[((y + 1) % size) * size + x];
      let nx = (l - r) * 4, ny = (u - d) * 4, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  });
}

export function woodTexture(size = 256, base = '#7a5634', dark = '#4a321c') {
  return cached('wood' + size + base, () => {
    const c = canvas(size, size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size);
    const b = new THREE.Color(base), d = new THREE.Color(dark);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const grain = Math.sin((y / size) * 60 + valueNoise(x / 18, y / 6, 3) * 8) * 0.5 + 0.5;
      const n = valueNoise(x / 4, y / 40, 5) * 0.3;
      const t = Math.min(1, grain * 0.55 + n);
      const i = (y * size + x) * 4;
      img.data[i] = (b.r + (d.r - b.r) * t) * 255;
      img.data[i + 1] = (b.g + (d.g - b.g) * t) * 255;
      img.data[i + 2] = (b.b + (d.b - b.b) * t) * 255;
    }
    ctx.putImageData(img, 0, 0);
    // plank seams
    ctx.fillStyle = 'rgba(20,12,6,0.55)';
    for (let k = 0; k < 4; k++) ctx.fillRect(0, (k * size) / 4, size, 2);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function corkTexture(size = 128) {
  return cached('cork' + size, () => {
    const c = canvas(size, size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const n = valueNoise(x / 2.5, y / 2.5, 1) * 0.6 + valueNoise(x / 9, y / 9, 2) * 0.4;
      const ring = (y % 16) < 1 ? 0.75 : 1;
      const i = (y * size + x) * 4;
      img.data[i] = (150 + n * 70) * ring;
      img.data[i + 1] = (110 + n * 50) * ring;
      img.data[i + 2] = (70 + n * 30) * ring;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function barkTexture(size = 128, base = '#4a3a2a') {
  return cached('bark' + size + base, () => {
    const c = canvas(size, size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const col = new THREE.Color(base);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const n = tileNoise(x / size, y / size * 0.25, 6, 3, 11);
      const furrow = Math.abs(Math.sin(x / size * Math.PI * 10 + n * 6));
      const v = 0.55 + furrow * 0.45 * n + n * 0.3;
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, col.r * 255 * v);
      img.data[i + 1] = Math.min(255, col.g * 255 * v);
      img.data[i + 2] = Math.min(255, col.b * 255 * v);
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Grey detail texture modulating terrain vertex colours. */
export function groundDetailTexture(size = 256, seed = 1) {
  return cached('ground' + size + seed, () => {
    const c = canvas(size, size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const n = tileNoise(x / size, y / size, 5, 4, seed) * 0.7 + tileNoise(x / size, y / size, 22, 2, seed + 5) * 0.3;
      const v = 150 + n * 105;
      const i = (y * size + x) * 4;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** Soft round sprite for particles. */
export function dotTexture() {
  return cached('dot', () => {
    const c = canvas(64, 64);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  });
}

/** Leaf/fern alpha texture used for foliage cards. */
export function foliageTexture(color = '#3c6a2a') {
  return cached('foliage' + color, () => {
    const c = canvas(128, 128);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    const col = new THREE.Color(color);
    for (let i = 0; i < 70; i++) {
      const x = 64 + (Math.random() - 0.5) * 100;
      const y = 128 - Math.random() * 120;
      const s = 0.85 + Math.random() * 0.3;
      ctx.fillStyle = `rgb(${(col.r * 255 * s) | 0},${(col.g * 255 * s) | 0},${(col.b * 255 * s) | 0})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 3 + Math.random() * 3, 9 + Math.random() * 9, (Math.random() - 0.5) * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}
