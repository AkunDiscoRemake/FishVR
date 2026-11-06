// World-space UI panel rendered to a canvas texture with an immediate-mode widget API.
// Large fonts/buttons for legibility in low-resolution headsets (Oculus Go).
import * as THREE from 'three';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
export const COLORS = {
  bg: 'rgba(8,18,28,0.92)', panel: 'rgba(20,38,54,0.95)', panel2: 'rgba(30,54,74,0.95)',
  accent: '#2ec4ff', accent2: '#ffd23f', text: '#eef6ff', dim: '#8aa4b8', good: '#5ddc5d', bad: '#ff5a4a',
  btn: '#1d4f73', btnHover: '#2b77a8', btnActive: '#ffd23f', btnDisabled: '#2a3a46',
};

class Gui {
  constructor(panel) {
    this.p = panel;
    this.ctx = panel.ctx;
    this.widgets = [];
    this.W = panel.canvas.width;
    this.H = panel.canvas.height;
  }
  hover(x, y, w, h) {
    const pt = this.p.pointerPx;
    return !!pt && pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + h;
  }
  rect(x, y, w, h, color, r = 14) {
    const c = this.ctx;
    c.fillStyle = color;
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
    c.fill();
  }
  stroke(x, y, w, h, color, lw = 3, r = 14) {
    const c = this.ctx;
    c.strokeStyle = color; c.lineWidth = lw;
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
    c.stroke();
  }
  text(str, x, y, opts = {}) {
    const c = this.ctx;
    c.font = `${opts.weight || 600} ${opts.size || 30}px ${FONT}`;
    c.fillStyle = opts.color || COLORS.text;
    c.textAlign = opts.align || 'left';
    c.textBaseline = opts.baseline || 'middle';
    if (opts.maxWidth) {
      let s = String(str);
      while (s.length > 3 && c.measureText(s).width > opts.maxWidth) s = s.slice(0, -2);
      if (s !== String(str)) s = s.slice(0, -1) + '…';
      c.fillText(s, x, y);
    } else c.fillText(String(str), x, y);
  }
  wrap(str, x, y, maxW, lineH, opts = {}) {
    const c = this.ctx;
    c.font = `${opts.weight || 500} ${opts.size || 26}px ${FONT}`;
    const words = String(str).split(' ');
    let line = '';
    let yy = y;
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (c.measureText(t).width > maxW && line) { this.text(line, x, yy, opts); line = w; yy += lineH; } else line = t;
    }
    if (line) this.text(line, x, yy, opts);
    return yy + lineH;
  }
  button(x, y, w, h, label, onClick, opts = {}) {
    const hov = !opts.disabled && this.hover(x, y, w, h);
    const bg = opts.disabled ? COLORS.btnDisabled : opts.active ? COLORS.btnActive : hov ? COLORS.btnHover : (opts.color || COLORS.btn);
    this.rect(x, y, w, h, bg, opts.radius || 16);
    if (hov) this.stroke(x, y, w, h, '#ffffff', 4, opts.radius || 16);
    this.text(label, x + w / 2, y + h / 2 + 1, {
      align: 'center', size: opts.size || Math.min(40, h * 0.42), weight: 700,
      color: opts.active ? '#1a1a1a' : opts.disabled ? '#6a7a86' : '#ffffff', maxWidth: w - 16,
    });
    if (!opts.disabled && onClick) this.widgets.push({ x, y, w, h, onClick, id: opts.id || label + '@' + x + ',' + y });
    return hov;
  }
  bar(x, y, w, h, value, color, bg = 'rgba(255,255,255,0.12)') {
    this.rect(x, y, w, h, bg, h / 2);
    if (value > 0) this.rect(x, y, Math.max(h, w * Math.min(1, value)), h, color, h / 2);
  }
  area(x, y, w, h, onClick, id) { this.widgets.push({ x, y, w, h, onClick, id: id || 'area@' + x + ',' + y }); return this.hover(x, y, w, h); }
}

export class Panel {
  constructor(name, widthM, heightM, ppm = 640) {
    this.name = name;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(widthM * ppm);
    this.canvas.height = Math.round(heightM * ppm);
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), this.material);
    this.mesh.renderOrder = 100;
    this.mesh.userData.panel = this;
    this.widgets = [];
    this.pointerPx = null;
    this.hoverId = null;
    this.dirty = true;
    this.drawFn = null;
    this.interactive = true;
    this.autoRefresh = 0; // seconds; >0 redraws periodically
    this._acc = 0;
  }
  set visible(v) { this.mesh.visible = v; }
  get visible() { return this.mesh.visible; }

  setDraw(fn) { this.drawFn = fn; this.dirty = true; }

  redraw() {
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const g = new Gui(this);
    if (this.drawFn) this.drawFn(g, this.canvas.width, this.canvas.height);
    this.widgets = g.widgets;
    this.texture.needsUpdate = true;
    this.dirty = false;
  }

  update(dt) {
    if (this.autoRefresh > 0) {
      this._acc += dt;
      if (this._acc >= this.autoRefresh) { this._acc = 0; this.dirty = true; }
    }
    if (this.dirty && this.mesh.visible) this.redraw();
  }

  /** uv in [0,1]^2 from raycast. Returns widget under pointer. */
  setPointer(uv) {
    if (!uv) {
      if (this.pointerPx) { this.pointerPx = null; this.dirty = true; }
      this.hoverId = null;
      return null;
    }
    const px = { x: uv.x * this.canvas.width, y: (1 - uv.y) * this.canvas.height };
    this.pointerPx = px;
    let hit = null;
    for (const w of this.widgets) if (px.x >= w.x && px.x <= w.x + w.w && px.y >= w.y && px.y <= w.y + w.h) hit = w;
    const id = hit ? hit.id : null;
    if (id !== this.hoverId) { this.hoverId = id; this.dirty = true; }
    return hit;
  }
}
