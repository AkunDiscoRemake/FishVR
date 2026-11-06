// Small value-noise / fbm helpers for procedural terrain and textures (CPU side).
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);

export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = fade(xf), v = fade(yf);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

export function fbm(x, y, octaves = 4, seed = 0) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** Tileable noise for textures: samples on a torus so edges wrap. */
export function tileNoise(u, v, scale, octaves, seed) {
  const TAU = Math.PI * 2;
  const a = Math.cos(u * TAU) * scale, b = Math.sin(u * TAU) * scale;
  const c = Math.cos(v * TAU) * scale, d = Math.sin(v * TAU) * scale;
  return (fbm(a + c * 0.71, b + d * 0.37, octaves, seed) + fbm(c + 3.1, d + a * 0.5, octaves, seed + 9)) * 0.5;
}
