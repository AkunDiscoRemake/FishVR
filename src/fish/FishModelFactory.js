// Procedural 3D fish models. Each species gets a lofted body built from its own
// shape archetype + flags, painted with a procedurally generated texture (pattern,
// counter-shading, lateral line, gill cover, scales, photophores...), real fins,
// eyes and species extras (barbels, bills, angler lures, sails, teeth...).
// Swimming is animated in the vertex shader (travelling body wave).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRng } from '@game/rng.js';
import { valueNoise } from '../rendering/noise.js';

// H/W: max half-height / half-width relative to length; hPos: position of max girth (0 tail .. 1 snout)
// blunt: nose taper exponent (higher = pointier), ped: peduncle thickness, belly: belly fullness
// tail: caudal type, dorsal/anal/pect: fin size multipliers
const SHAPE_PARAMS = {
  fusiform: { H: 0.11, W: 0.065, hPos: 0.55, blunt: 0.75, ped: 0.25, belly: 0.95, tail: 'forked', dorsal: 1, anal: 0.8, pect: 1 },
  bass: { H: 0.155, W: 0.075, hPos: 0.52, blunt: 0.6, ped: 0.27, belly: 1.0, tail: 'truncate', dorsal: 1.3, anal: 0.9, pect: 1 },
  perch: { H: 0.14, W: 0.065, hPos: 0.56, blunt: 0.7, ped: 0.25, belly: 0.95, tail: 'forked', dorsal: 1.4, anal: 0.8, pect: 1 },
  pike: { H: 0.075, W: 0.06, hPos: 0.45, blunt: 1.25, ped: 0.38, belly: 0.9, tail: 'forked', dorsal: 0.9, anal: 0.9, pect: 0.8, dorsalPos: 0.22 },
  carp: { H: 0.17, W: 0.095, hPos: 0.5, blunt: 0.55, ped: 0.3, belly: 1.1, tail: 'forked', dorsal: 1.2, anal: 0.7, pect: 1 },
  catfish: { H: 0.09, W: 0.1, hPos: 0.72, blunt: 0.35, ped: 0.22, belly: 1.0, tail: 'rounded', dorsal: 0.8, anal: 1.2, pect: 1.2 },
  disc: { H: 0.3, W: 0.055, hPos: 0.5, blunt: 0.5, ped: 0.15, belly: 1.0, tail: 'truncate', dorsal: 1.2, anal: 1.2, pect: 0.8 },
  eel: { H: 0.045, W: 0.04, hPos: 0.62, blunt: 0.6, ped: 0.55, belly: 1.0, tail: 'eel', dorsal: 0, anal: 0, pect: 0.5 },
  tuna: { H: 0.14, W: 0.11, hPos: 0.56, blunt: 0.62, ped: 0.1, belly: 1.05, tail: 'lunate', dorsal: 0.9, anal: 0.7, pect: 1.1 },
  billfish: { H: 0.11, W: 0.07, hPos: 0.62, blunt: 0.85, ped: 0.11, belly: 1.0, tail: 'lunate', dorsal: 1.0, anal: 0.7, pect: 1.1 },
  shark: { H: 0.1, W: 0.09, hPos: 0.6, blunt: 0.75, ped: 0.2, belly: 0.95, tail: 'shark', dorsal: 1.4, anal: 0.5, pect: 1.6 },
  ray: { H: 0.035, W: 0.48, hPos: 0.55, blunt: 0.6, ped: 0.08, belly: 1.0, tail: 'whip', dorsal: 0, anal: 0, pect: 0 },
  flatfish: { H: 0.28, W: 0.035, hPos: 0.52, blunt: 0.6, ped: 0.15, belly: 1.0, tail: 'rounded', dorsal: 0, anal: 0, pect: 0.4, flat: true },
  puffer: { H: 0.26, W: 0.24, hPos: 0.52, blunt: 0.4, ped: 0.22, belly: 1.1, tail: 'rounded', dorsal: 0.6, anal: 0.6, pect: 0.7 },
  angler: { H: 0.3, W: 0.27, hPos: 0.68, blunt: 0.25, ped: 0.16, belly: 1.1, tail: 'rounded', dorsal: 0.5, anal: 0.5, pect: 0.6 },
  gar: { H: 0.05, W: 0.045, hPos: 0.45, blunt: 1.7, ped: 0.4, belly: 0.95, tail: 'rounded', dorsal: 0.7, anal: 0.7, pect: 0.6, dorsalPos: 0.2 },
  grouper: { H: 0.17, W: 0.12, hPos: 0.5, blunt: 0.5, ped: 0.32, belly: 1.05, tail: 'rounded', dorsal: 1.2, anal: 0.9, pect: 1.1 },
  reef: { H: 0.26, W: 0.07, hPos: 0.55, blunt: 0.5, ped: 0.2, belly: 1.0, tail: 'truncate', dorsal: 1.1, anal: 1.0, pect: 0.8 },
  sturgeon: { H: 0.07, W: 0.08, hPos: 0.56, blunt: 1.1, ped: 0.2, belly: 0.85, tail: 'shark', dorsal: 0.7, anal: 0.6, pect: 1.2 },
  ribbon: { H: 0.06, W: 0.014, hPos: 0.9, blunt: 0.5, ped: 0.85, belly: 1.0, tail: 'eel', dorsal: 0, anal: 0, pect: 0.4 },
};

function envelope(u, hPos, blunt, ped) {
  if (u < hPos) {
    const t = u / hPos;
    return ped + (1 - ped) * Math.pow(Math.sin(t * Math.PI / 2), 0.85);
  }
  const t = (u - hPos) / (1 - hPos);
  return Math.max(0.02, Math.pow(Math.cos(t * Math.PI / 2), blunt));
}

const geoCache = new Map();
const texCache = new Map();

function hex(c) { return '#' + new THREE.Color(c).getHexString(); }
function mixC(a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), t); }

/** Paints the body texture. u (x) = tail->head, v (y) = around the body starting at the dorsal line. */
function paintBody(species, sp, size, variant) {
  const key = species.id + ':' + size + ':' + variant;
  if (texCache.has(key)) return texCache.get(key);
  const W = size, H = size / 2;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const rng = createRng('tex:' + species.id);
  let body = new THREE.Color(species.colors.body);
  let belly = new THREE.Color(species.colors.belly);
  let pat = new THREE.Color(species.colors.pattern);
  if (variant === 'shiny') {
    const hsl = {}; body.getHSL(hsl); body.setHSL((hsl.h + 0.5) % 1, Math.min(1, hsl.s + 0.3), Math.min(0.75, hsl.l + 0.15));
    pat = new THREE.Color(0xffd040);
  }
  const flags = species.flags;
  const circumference = 2 * Math.PI * Math.sqrt((sp.H * sp.H + sp.W * sp.W) / 2);
  const ry = (r) => r * H / Math.max(0.15, circumference);
  const rx = (r) => r * W;
  const side = (s) => { const v = Math.acos(Math.max(-1, Math.min(1, s))) / (2 * Math.PI); return [v * H, (1 - v) * H]; };

  // counter-shading gradient
  const img = ctx.createImageData(W, H);
  const backDark = species.pattern === 'gradient' ? 0.55 : 0.82;
  for (let y = 0; y < H; y++) {
    const s = Math.cos((y / H) * Math.PI * 2); // 1 top, -1 belly
    let t = Math.min(1, Math.max(0, (0.35 - s) / 0.9));
    if (species.pattern === 'gradient') t = Math.min(1, Math.max(0, (0.1 - s) / 0.35));
    const col = body.clone().multiplyScalar(s > 0.6 ? backDark + (1 - s) * 0.4 : 1).lerp(belly, t);
    for (let x = 0; x < W; x++) {
      const n = valueNoise(x / 6, y / 6, 3) * 0.12 + valueNoise(x / 30, y / 20, 9) * 0.1 - 0.11;
      const i = (y * W + x) * 4;
      img.data[i] = Math.min(255, Math.max(0, (col.r + n) * 255));
      img.data[i + 1] = Math.min(255, Math.max(0, (col.g + n) * 255));
      img.data[i + 2] = Math.min(255, Math.max(0, (col.b + n) * 255));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const P = hex(pat);
  const ellipse = (u, s, r, color, alpha = 1, stretch = 1) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (const y of side(s)) {
      ctx.beginPath();
      ctx.ellipse(u * W, y, Math.max(0.5, rx(r) * stretch), Math.max(0.5, ry(r)), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  const band = (u0, u1, sMin, color, alpha = 0.85) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    const [ya] = side(1), [yb] = side(sMin);
    ctx.fillRect(u0 * W, 0, (u1 - u0) * W, yb);
    ctx.fillRect(u0 * W, H - yb, (u1 - u0) * W, yb - ya);
    ctx.globalAlpha = 1;
  };
  const stripe = (s, thick, color, alpha = 0.8, u0 = 0.05, u1 = 0.92) => {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, ry(thick));
    for (const y of side(s)) { ctx.beginPath(); ctx.moveTo(u0 * W, y); ctx.lineTo(u1 * W, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
  };

  switch (species.pattern) {
    case 'spots':
      for (let i = 0; i < 90; i++) ellipse(rng.range(0.05, 0.9), rng.range(-0.25, 1), rng.range(0.004, 0.012), P, 0.9);
      break;
    case 'bars': {
      const n = rng.int(5, 9);
      for (let i = 0; i < n; i++) { const u = 0.12 + (i / n) * 0.7; band(u, u + 0.035 + rng.next() * 0.02, -0.35, P, 0.65); }
      break;
    }
    case 'stripes': {
      const n = rng.int(3, 6);
      for (let i = 0; i < n; i++) stripe(0.85 - i * (1.1 / n), 0.012, P, 0.85);
      break;
    }
    case 'mottled':
      for (let i = 0; i < 70; i++) ellipse(rng.range(0.03, 0.95), rng.range(-0.5, 1), rng.range(0.01, 0.035), P, 0.45, rng.range(0.6, 1.8));
      break;
    case 'patches':
      for (let i = 0; i < 9; i++) ellipse(rng.range(0.1, 0.9), rng.range(-0.3, 1), rng.range(0.04, 0.08), P, 0.95, rng.range(0.7, 1.6));
      break;
    case 'scales':
    case 'vermic':
    case 'parr':
    case 'tigerstripe':
    case 'photophores':
    case 'psychedelic':
    case 'bands':
    case 'tangmask':
    case 'eyespot':
    case 'gradient':
    case 'plain':
    default: break;
  }
  if (species.pattern === 'vermic') {
    ctx.strokeStyle = P; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
    for (let i = 0; i < 70; i++) {
      const u = rng.range(0.05, 0.9), s = rng.range(0.4, 1);
      for (const y of side(s)) { ctx.beginPath(); ctx.arc(u * W, y, rng.range(2, 6), rng.next() * 6, rng.next() * 6 + 2); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 30; i++) ellipse(rng.range(0.1, 0.85), rng.range(-0.2, 0.4), 0.005, '#e85a3a', 0.9);
  }
  if (species.pattern === 'parr') for (let i = 0; i < 9; i++) ellipse(0.15 + i * 0.08, 0.1, 0.022, P, 0.55, 0.7);
  if (species.pattern === 'tigerstripe') {
    ctx.strokeStyle = P; ctx.lineWidth = 3; ctx.globalAlpha = 0.85;
    for (let i = 0; i < 26; i++) {
      const u = 0.1 + i * 0.03;
      for (const sgn of [1, -1]) {
        ctx.beginPath();
        for (let k = 0; k <= 10; k++) {
          const s = 1 - k * 0.06;
          const [y1, y2] = side(s);
          const xx = (u + Math.sin(k * 0.9 + i) * 0.012) * W;
          const yy = sgn > 0 ? y1 : y2;
          if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  if (species.pattern === 'scales' || flags.includes('bigscales')) {
    const sz = flags.includes('bigscales') ? 0.035 : 0.018;
    ctx.strokeStyle = hex(mixC(species.colors.pattern, species.colors.body, 0.3));
    ctx.globalAlpha = 0.45; ctx.lineWidth = 1.2;
    for (let x = 0.08; x < 0.85; x += sz) {
      for (let y = 0; y < H; y += ry(sz) * 0.9) {
        ctx.beginPath();
        ctx.arc(x * W + ((y / ry(sz)) % 2) * rx(sz) * 0.5, y, rx(sz) * 0.55, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  if (species.pattern === 'psychedelic') {
    ctx.lineWidth = 3;
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = i % 2 ? P : hex(species.colors.fin);
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      const x = rng.range(0, W), y = rng.range(0, H);
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + rng.range(-40, 40), y + rng.range(-30, 30), x + rng.range(-40, 40), y + rng.range(-30, 30), x + rng.range(-50, 50), y + rng.range(-30, 30));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (species.pattern === 'bands') {
    for (const u of [0.2, 0.52, 0.8]) {
      band(u - 0.045, u + 0.045, -1, '#111111', 1);
      band(u - 0.035, u + 0.035, -1, P, 1);
    }
  }
  if (species.pattern === 'tangmask') {
    ctx.fillStyle = P; ctx.globalAlpha = 0.95;
    for (const y of side(0.35)) { ctx.beginPath(); ctx.ellipse(0.5 * W, y, 0.3 * W, ry(0.05), 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  if (species.pattern === 'eyespot') ellipse(0.12, 0.25, 0.03, P, 0.95);
  if (species.pattern === 'photophores') {
    for (let row = 0; row < 2; row++) for (let i = 0; i < 26; i++) ellipse(0.08 + i * 0.033, -0.5 - row * 0.2, 0.006, P, 1);
  }

  // species-specific details
  if (flags.includes('redband')) stripe(0.1, 0.04, '#e0607a', 0.55);
  if (flags.includes('redspots')) for (let i = 0; i < 25; i++) ellipse(rng.range(0.1, 0.85), rng.range(-0.2, 0.5), 0.007, '#e03a2a', 0.9);
  if (flags.includes('lateral') || species.shape === 'fusiform') stripe(0.12, 0.004, '#202020', 0.35, 0.1, 0.84);
  if (flags.includes('thumbprint')) ellipse(0.72, 0.3, 0.025, '#151515', 0.9);
  if (flags.includes('greenhead')) band(0.8, 1, -1, '#3a6a3a', 0.9);
  if (flags.includes('redtail')) band(0, 0.12, -1, '#c0402a', 0.7);
  if (flags.includes('mask')) band(0.86, 0.93, -0.6, '#1a1a40', 0.8);
  if (flags.includes('throatslash')) ellipse(0.93, -0.75, 0.015, '#e0302a', 0.95, 2);
  if (flags.includes('blackedge')) { ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeRect(0, 0, W, H); }
  // gill cover arc + mouth
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
  for (const y of side(0.0)) { ctx.beginPath(); ctx.ellipse(0.82 * W, y, rx(0.012), ry(0.09), 0, -1.2, 1.2); ctx.stroke(); }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0.975 * W, 0, 0.025 * W, H);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  let emissive = null;
  if (flags.includes('glow') || species.pattern === 'photophores') {
    const e = document.createElement('canvas');
    e.width = W; e.height = H;
    const ectx = e.getContext('2d');
    ectx.fillStyle = '#000'; ectx.fillRect(0, 0, W, H);
    ectx.fillStyle = P;
    const er = createRng('glow:' + species.id);
    for (let row = 0; row < 2; row++) for (let i = 0; i < 26; i++) {
      for (const y of side(-0.5 - row * 0.2)) { ectx.beginPath(); ectx.arc((0.08 + i * 0.033) * W, y, 2.2, 0, 7); ectx.fill(); }
    }
    for (let i = 0; i < 20; i++) for (const y of side(er.range(-0.2, 0.6))) { ectx.beginPath(); ectx.arc(er.range(0.1, 0.9) * W, y, 1.5, 0, 7); ectx.fill(); }
    emissive = new THREE.CanvasTexture(e);
    emissive.colorSpace = THREE.SRGBColorSpace;
  }
  const out = { map: tex, emissive };
  texCache.set(key, out);
  return out;
}

function finTexture(color) {
  const key = 'fin:' + color;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(color);
  ctx.fillStyle = `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},0.82)`;
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 64; i += 5) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 64); ctx.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/** Lofted body. Returns geometry with length 1 along +Z (snout at +0.5). */
function bodyGeometry(sp, flags, nx, nr) {
  const pos = [], uv = [], idx = [];
  const H = sp.H * (flags.includes('hump') ? 1.12 : 1);
  const W = sp.W * (flags.includes('flathead') ? 1.25 : 1);
  for (let i = 0; i <= nx; i++) {
    const u = i / nx;
    let e = envelope(u, sp.hPos, sp.blunt, sp.ped);
    let hu = H * e, wu = W * envelope(u, Math.min(0.8, sp.hPos + 0.05), sp.blunt * 0.9, sp.ped * 0.9);
    if (flags.includes('hump') && u > 0.55 && u < 0.85) hu *= 1 + Math.sin((u - 0.55) / 0.3 * Math.PI) * 0.15;
    if (flags.includes('blob')) { hu *= 1.1; wu *= 1.1; }
    if (flags.includes('bluntface') && u > 0.85) hu = Math.max(hu, H * 0.7 * (1 - (u - 0.85) / 0.15 * 0.6));
    const z = u - 0.5;
    for (let j = 0; j <= nr; j++) {
      const v = j / nr;
      const th = v * Math.PI * 2;
      let y = Math.cos(th) * hu;
      if (y < 0) y *= sp.belly;
      if (sp.flat === undefined && species_flatten(flags) && y < 0) y *= 0.6;
      const x = Math.sin(th) * wu;
      pos.push(x, y, z);
      uv.push(u, 1 - v);
    }
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < nr; j++) {
    const a = i * (nr + 1) + j, b = a + nr + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function species_flatten(flags) { return flags.includes('flathead'); }

/** Builds a flat fin in the YZ plane from outline points [(z,y)...]. */
function finYZ(points, x = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  const g = new THREE.ShapeGeometry(shape);
  const p = g.attributes.position;
  const uvs = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const zz = p.getX(i), yy = p.getY(i);
    p.setXYZ(i, x, yy, zz);
    uvs.setXY(i, zz * 4 + 0.5, yy * 4 + 0.5);
  }
  g.computeVertexNormals();
  return g;
}

function buildFins(species, sp, flags) {
  const fins = [];
  const H = sp.H, L = 1;
  const zAt = (u) => u - 0.5;
  const hAt = (u) => H * envelope(u, sp.hPos, sp.blunt, sp.ped);
  const big = flags.includes('longfins') ? 1.6 : 1;
  // caudal fin
  const tz = zAt(0) + 0.01;
  const th = hAt(0.02);
  const tail = sp.tail;
  let pts;
  if (tail === 'forked') pts = [[tz, th], [tz - 0.17, H * 1.25], [tz - 0.1, 0], [tz - 0.17, -H * 1.25], [tz, -th]];
  else if (tail === 'lunate') pts = [[tz, th], [tz - 0.13, H * 1.7], [tz - 0.16, H * 1.6], [tz - 0.06, 0], [tz - 0.16, -H * 1.6], [tz - 0.13, -H * 1.7], [tz, -th]];
  else if (tail === 'truncate') pts = [[tz, th], [tz - 0.14, H * 0.95], [tz - 0.15, 0], [tz - 0.14, -H * 0.95], [tz, -th]];
  else if (tail === 'shark') pts = [[tz + 0.02, th], [tz - 0.2, H * 2.0], [tz - 0.13, H * 0.3], [tz - 0.08, -H * 0.9], [tz, -th]];
  else if (tail === 'eel') pts = [[tz + 0.25, th + H * 0.4], [tz - 0.04, 0], [tz + 0.25, -th - H * 0.4], [tz + 0.25, -th], [tz + 0.25, th]];
  else if (tail === 'whip') pts = [[tz, 0.004], [tz - 0.7, 0.001], [tz - 0.7, -0.001], [tz, -0.004]];
  else pts = [[tz, th], [tz - 0.1, H * 0.95], [tz - 0.15, H * 0.4], [tz - 0.16, 0], [tz - 0.15, -H * 0.4], [tz - 0.1, -H * 0.95], [tz, -th]];
  if (flags.includes('redtail') || flags.includes('longtail')) pts = pts.map(([z, y]) => [z - (z - tz) * 0.3, y]);
  fins.push(finYZ(pts));

  // dorsal
  if (sp.dorsal > 0) {
    const d0 = sp.dorsalPos !== undefined ? sp.dorsalPos : 0.38;
    let len = flags.includes('longdorsal') ? 0.55 : flags.includes('sail') ? 0.5 : 0.24;
    let ht = H * 0.75 * sp.dorsal * big;
    if (flags.includes('sail')) ht = H * (species.shape === 'billfish' ? 2.6 : 1.6);
    const u0 = d0, u1 = Math.min(0.85, d0 + len);
    const top = [];
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const u = u0 + (u1 - u0) * (i / n);
      let fy = ht * Math.sin((i / n) * Math.PI * 0.9 + 0.15);
      if (flags.includes('spines') && i % 2 === 0) fy *= 1.25;
      if (flags.includes('sail') && species.shape === 'billfish') fy = ht * (1 - Math.abs(i / n - 0.25) * 0.9);
      top.push([zAt(u), hAt(u) * 0.92 + fy]);
    }
    const base = [[zAt(u1), hAt(u1) * 0.8], [zAt(u0), hAt(u0) * 0.8]];
    fins.push(finYZ([...top, ...base]));
    if (species.shape === 'perch' || species.shape === 'bass') {
      const u2 = u1 + 0.02, u3 = Math.min(0.88, u2 + 0.12);
      fins.push(finYZ([[zAt(u2), hAt(u2) * 0.85], [zAt(u2 + 0.02), hAt(u2) + ht * 0.8], [zAt(u3), hAt(u3) * 0.9 + ht * 0.2], [zAt(u3), hAt(u3) * 0.8]]));
    }
  }
  if (flags.includes('crest')) {
    const top = [];
    for (let i = 0; i <= 20; i++) { const u = 0.1 + i * 0.04; top.push([zAt(u), hAt(u) + H * 0.9 * (i > 17 ? 3 : 1)]); }
    fins.push(finYZ([...top, [zAt(0.9), hAt(0.9) * 0.8], [zAt(0.1), hAt(0.1) * 0.8]]));
  }
  // anal
  if (sp.anal > 0) {
    const u0 = 0.18, u1 = 0.32 + (flags.includes('longdorsal') ? 0.15 : 0);
    const ah = -H * 0.6 * sp.anal * big;
    fins.push(finYZ([[zAt(u0), -hAt(u0) * 0.8], [zAt(u0 + 0.03), -hAt(u0) + ah], [zAt(u1), -hAt(u1) * 0.85 + ah * 0.4], [zAt(u1), -hAt(u1) * 0.8]]));
  }
  // pectorals (angled out sideways)
  if (sp.pect > 0) {
    const pl = 0.12 * sp.pect * big * (flags.includes('lionfins') ? 2.2 : 1) * (species.shape === 'shark' ? 1.4 : 1);
    for (const sgn of [-1, 1]) {
      const g = finYZ([[0, 0], [-pl, -pl * 0.25], [-pl * 0.8, -pl * 0.6], [-pl * 0.1, -pl * 0.2]]);
      g.rotateZ(sgn * (Math.PI / 2 - 0.5));
      const wAt = sp.W * envelope(0.72, Math.min(0.8, sp.hPos + 0.05), sp.blunt * 0.9, sp.ped * 0.9);
      g.translate(sgn * wAt * 0.95, -hAt(0.72) * 0.35, zAt(0.72));
      fins.push(g);
    }
    // pelvic
    for (const sgn of [-1, 1]) {
      const pl2 = 0.07 * sp.pect * big;
      const g = finYZ([[0, 0], [-pl2, -pl2 * 0.5], [-pl2 * 0.6, -pl2 * 0.8]]);
      g.rotateZ(sgn * 0.35);
      g.translate(sgn * sp.W * 0.4, -hAt(0.55) * 0.9, zAt(0.55));
      fins.push(g);
    }
  }
  if (flags.includes('lobefins')) {
    for (const sgn of [-1, 1]) {
      const g = new THREE.SphereGeometry(0.035, 6, 4).scale(0.5, 0.5, 1.6);
      g.translate(sgn * sp.W * 1.1, -H * 0.4, zAt(0.62));
      fins.push(g.toNonIndexed ? stripUv(g) : g);
    }
  }
  // finlets (tuna)
  if (flags.includes('finlets')) {
    for (let i = 0; i < 6; i++) {
      const u = 0.06 + i * 0.03;
      fins.push(finYZ([[zAt(u), hAt(u) * 0.9], [zAt(u) - 0.015, hAt(u) + H * 0.25], [zAt(u) - 0.02, hAt(u) * 0.9]]));
      fins.push(finYZ([[zAt(u), -hAt(u) * 0.9], [zAt(u) - 0.015, -hAt(u) - H * 0.25], [zAt(u) - 0.02, -hAt(u) * 0.9]]));
    }
  }
  return mergeGeometries(fins.map((g) => normalizeAttrs(g)));
}

function stripUv(g) { return g; }
function normalizeAttrs(g) {
  const ng = g.index ? g.toNonIndexed() : g;
  if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
  for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') ng.deleteAttribute(k);
  if (!ng.attributes.normal) ng.computeVertexNormals();
  return ng;
}

function extrasGeometry(species, sp) {
  const flags = species.flags;
  const parts = { dark: [], light: [], glow: [], bill: [] };
  const H = sp.H;
  const snoutZ = 0.5;
  const mouthY = -H * 0.15;
  const mkTube = (pts, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))), 6, r, 4, false);
  if (flags.includes('whiskers') || flags.includes('barbels') || flags.includes('chinbarbel')) {
    const long = flags.includes('longwhiskers') ? 2 : 1;
    const n = flags.includes('whiskers') ? 3 : flags.includes('barbels') ? 2 : 1;
    for (let i = 0; i < n; i++) for (const s of flags.includes('chinbarbel') && n === 1 ? [0] : [-1, 1]) {
      const L = (flags.includes('whiskers') ? 0.18 : 0.06) * long * (1 - i * 0.25);
      parts.dark.push(mkTube([[s * sp.W * 0.3, mouthY - i * 0.01, snoutZ - 0.03], [s * (sp.W * 0.3 + L * 0.5), mouthY - L * 0.3, snoutZ - 0.03 - L * 0.2], [s * (sp.W * 0.3 + L), mouthY - L * 0.5, snoutZ - L * 0.6]], 0.004 + 0.002 * long));
    }
  }
  if (flags.includes('bill') || flags.includes('sword')) {
    const L = flags.includes('sword') ? 0.36 : 0.26;
    const g = new THREE.ConeGeometry(flags.includes('sword') ? 0.022 : 0.012, L, 6);
    g.rotateX(Math.PI / 2);
    g.translate(0, H * 0.05, snoutZ + L / 2 - 0.02);
    if (flags.includes('sword')) g.scale(1.6, 0.5, 1);
    parts.bill.push(g);
  }
  if (flags.includes('paddle')) {
    const g = new THREE.BoxGeometry(0.08, 0.008, 0.3);
    g.translate(0, 0, snoutZ + 0.13);
    parts.bill.push(g);
  }
  if (flags.includes('lure')) {
    parts.dark.push(mkTube([[0, H * 0.9, snoutZ - 0.12], [0, H * 1.6, snoutZ - 0.02], [0, H * 1.5, snoutZ + 0.12]], 0.006));
    parts.glow.push(new THREE.SphereGeometry(0.03, 8, 6).translate(0, H * 1.5, snoutZ + 0.13));
  }
  if (flags.includes('teeth') || flags.includes('bigmouth')) {
    const n = flags.includes('teeth') ? 8 : 0;
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - 0.5) * 1.6;
      const g = new THREE.ConeGeometry(0.006, 0.03, 4);
      g.rotateX(Math.PI);
      g.translate(Math.sin(a) * sp.W * 0.4, mouthY + 0.01, snoutZ - 0.02 - Math.abs(a) * 0.02);
      parts.light.push(g);
    }
  }
  if (flags.includes('dome')) {
    parts.glow.push(new THREE.SphereGeometry(sp.W * 0.9, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1.6).translate(0, H * 0.6, 0.32));
  }
  if (flags.includes('earflap')) {
    for (const s of [-1, 1]) parts.dark.push(new THREE.CircleGeometry(0.025, 8).rotateY(s * Math.PI / 2).translate(s * sp.W * 0.75, H * 0.15, 0.3));
  }
  const out = {};
  for (const k of Object.keys(parts)) if (parts[k].length) out[k] = mergeGeometries(parts[k].map(normalizeAttrs));
  return out;
}

function eyeGeometry(species, sp) {
  const big = species.flags.includes('bigeye') ? 1.6 : 1;
  const r = Math.max(0.012, Math.min(0.04, sp.H * 0.16)) * big;
  const u = species.shape === 'angler' ? 0.88 : species.shape === 'ray' || species.shape === 'flatfish' ? 0.86 : 0.9;
  const hz = sp.H * envelope(u, sp.hPos, sp.blunt, sp.ped);
  const wz = sp.W * envelope(u, Math.min(0.8, sp.hPos + 0.05), sp.blunt * 0.9, sp.ped * 0.9);
  const z = u - 0.5;
  const y = species.shape === 'ray' ? hz * 0.9 : hz * 0.3;
  const eyes = [], pupils = [];
  for (const s of [-1, 1]) {
    const x = species.shape === 'ray' ? s * 0.06 : s * wz * 0.9;
    eyes.push(new THREE.SphereGeometry(r, 10, 8).translate(x, y, z));
    pupils.push(new THREE.SphereGeometry(r * 0.6, 8, 6).translate(x + s * r * 0.55, y, z + r * 0.1));
  }
  return { eye: mergeGeometries(eyes), pupil: mergeGeometries(pupils) };
}

function getGeometries(species, detail) {
  const key = species.id + ':' + detail;
  if (geoCache.has(key)) return geoCache.get(key);
  const sp = SHAPE_PARAMS[species.shape] || SHAPE_PARAMS.fusiform;
  const nx = [16, 26, 34][detail], nr = [8, 12, 16][detail];
  const g = {
    sp,
    body: bodyGeometry(sp, species.flags, nx, nr),
    fins: buildFins(species, sp, species.flags),
    eyes: eyeGeometry(species, sp),
    extras: extrasGeometry(species, sp),
  };
  geoCache.set(key, g);
  return g;
}

const SWIM_VERTEX = `
  float swimT = 0.5 - transformed.z;
  float swimK = smoothstep(-0.15, 1.0, swimT);
  #ifdef RAY_SWIM
    transformed.y += sin(uSwimTime * uSwimFreq + transformed.z * 4.0) * uSwimAmp * 2.0 * abs(transformed.x) * 2.0;
  #else
    transformed.x += sin(uSwimTime * uSwimFreq - swimT * uSwimWave) * uSwimAmp * swimK * swimK + uBend * swimT * swimT;
  #endif
`;

function patchSwim(material, uniforms, ray) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSwimTime = uniforms.uSwimTime;
    shader.uniforms.uSwimAmp = uniforms.uSwimAmp;
    shader.uniforms.uSwimFreq = uniforms.uSwimFreq;
    shader.uniforms.uSwimWave = uniforms.uSwimWave;
    shader.uniforms.uBend = uniforms.uBend;
    shader.vertexShader = 'uniform float uSwimTime;\nuniform float uSwimAmp;\nuniform float uSwimFreq;\nuniform float uSwimWave;\nuniform float uBend;\n' +
      (ray ? '#define RAY_SWIM 1\n' : '') +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWIM_VERTEX);
  };
  material.customProgramCacheKey = () => 'fishswim' + (ray ? 'ray' : '');
}

/**
 * Creates a renderable fish instance.
 * @returns {{ object: THREE.Group, uniforms, lengthM, species, update(dt, speed, bend) }}
 */
export function createFish(species, opts = {}) {
  const detail = opts.detail === undefined ? 1 : opts.detail;
  const variant = opts.variant || 'normal';
  const standard = opts.standard !== false && detail > 0;
  const lengthM = (opts.lengthCm || (species.lenMin + species.lenMax) / 2) / 100;
  const g = getGeometries(species, detail);
  const tex = paintBody(species, g.sp, detail >= 1 ? 512 : 256, variant);
  const uniforms = {
    uSwimTime: { value: Math.random() * 10 },
    uSwimAmp: { value: 0.03 },
    uSwimFreq: { value: 7 },
    uSwimWave: { value: species.shape === 'eel' || species.shape === 'ribbon' ? 14 : 5 },
    uBend: { value: 0 },
  };
  const ray = species.shape === 'ray';
  const glow = species.flags.includes('glow');
  const shiny = variant === 'shiny';
  const MatClass = standard ? THREE.MeshStandardMaterial : THREE.MeshLambertMaterial;
  const bodyOpts = { map: tex.map };
  if (standard) Object.assign(bodyOpts, { roughness: shiny ? 0.2 : 0.38, metalness: shiny ? 0.5 : 0.12 });
  if (tex.emissive) Object.assign(bodyOpts, { emissiveMap: tex.emissive, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 1.6 });
  if (species.flags.includes('albino') || species.flags.includes('gold')) bodyOpts.emissive = bodyOpts.emissive || new THREE.Color(species.flags.includes('gold') ? 0x3a2a00 : 0x202020);
  const bodyMat = new MatClass(bodyOpts);
  const finMat = new MatClass(Object.assign({ map: finTexture(species.colors.fin), transparent: true, side: THREE.DoubleSide, depthWrite: false }, standard ? { roughness: 0.6 } : {}));
  const eyeMat = new MatClass(Object.assign({ color: species.flags.includes('redeye') ? 0xd04020 : glow ? 0x80a0ff : 0xe0c860 }, standard ? { roughness: 0.15, metalness: 0.3 } : {}));
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const darkMat = new MatClass({ color: new THREE.Color(species.colors.body).multiplyScalar(0.5) });
  const lightMat = new MatClass({ color: 0xf4f0e0 });
  const billMat = new MatClass({ color: new THREE.Color(species.colors.body).multiplyScalar(0.8) });
  const glowMat = new THREE.MeshBasicMaterial({ color: species.flags.includes('dome') ? 0x8ac8ff : species.colors.pattern, transparent: species.flags.includes('dome'), opacity: species.flags.includes('dome') ? 0.35 : 1 });
  const mats = [bodyMat, finMat, eyeMat, pupilMat, darkMat, lightMat, billMat, glowMat];
  for (const m of mats) patchSwim(m, uniforms, ray);

  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = !!opts.shadows; inner.add(m); return m; };
  add(g.body, bodyMat);
  add(g.fins, finMat).renderOrder = 2;
  add(g.eyes.eye, eyeMat);
  add(g.eyes.pupil, pupilMat);
  if (g.extras.dark) add(g.extras.dark, darkMat);
  if (g.extras.light) add(g.extras.light, lightMat);
  if (g.extras.bill) add(g.extras.bill, billMat);
  if (g.extras.glow) add(g.extras.glow, glowMat);
  if (g.sp.flat) inner.rotation.z = Math.PI / 2;
  group.scale.setScalar(lengthM);
  group.userData.fish = species.id;

  const baseFreq = 4 + species.speed * 6;
  return {
    object: group,
    uniforms,
    lengthM,
    species,
    materials: mats,
    /** speed: 0..1 (rest..burst), bend: -1..1 turning */
    update(dt, speed = 0.3, bend = 0) {
      const sp = Math.max(0.05, speed);
      uniforms.uSwimFreq.value = 1;
      uniforms.uSwimTime.value += dt * baseFreq * (0.5 + sp * 1.6);
      const amp = ray ? 0.05 : species.shape === 'eel' || species.shape === 'ribbon' ? 0.06 : 0.035;
      uniforms.uSwimAmp.value = amp * (0.5 + sp * 1.2);
      uniforms.uBend.value += (bend * 0.12 - uniforms.uBend.value) * Math.min(1, dt * 5);
    },
    dispose() { for (const m of mats) m.dispose(); },
  };
}

export function fishShapeParams(species) { return SHAPE_PARAMS[species.shape] || SHAPE_PARAMS.fusiform; }
