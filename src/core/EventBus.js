// Minimal pub/sub used to decouple game systems.
export class EventBus {
  constructor() { this.map = new Map(); }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) { const s = this.map.get(name); if (s) s.delete(fn); }
  emit(name, data) {
    const s = this.map.get(name);
    if (!s) return;
    for (const fn of Array.from(s)) {
      try { fn(data); } catch (e) { console.error('[event ' + name + ']', e); }
    }
  }
}
export const bus = new EventBus();
