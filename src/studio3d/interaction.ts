import type { InteractionSettings, Vec3 } from "./types";
import type { OrbitCamera } from "./camera";
import type { Simulation } from "./simulation";

/** Pointer / touch controller: orbit, pan, pinch-zoom, wheel dolly, hover forces, click burst. */
export class PointerController {
  private pts = new Map<number, { x: number; y: number; slot: number; sx: number; sy: number; t0: number; moved: boolean; btn: number }>();
  private last = new Map<number, Vec3>(); private lastT = 0; private pinch = 0; private cx = 0; private cy = 0;
  constructor(private el: HTMLElement, private cam: OrbitCamera, private sim: Simulation, private get: () => InteractionSettings, private onBurst?: (p: Vec3) => void) {
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", this.down); el.addEventListener("pointermove", this.move); el.addEventListener("pointerup", this.up); el.addEventListener("pointercancel", this.up);
    el.addEventListener("pointerleave", this.leave); el.addEventListener("wheel", this.wheel, { passive: false }); el.addEventListener("contextmenu", this.noMenu);
  }
  dispose() {
    const e = this.el; e.removeEventListener("pointerdown", this.down); e.removeEventListener("pointermove", this.move); e.removeEventListener("pointerup", this.up); e.removeEventListener("pointercancel", this.up);
    e.removeEventListener("pointerleave", this.leave); e.removeEventListener("wheel", this.wheel); e.removeEventListener("contextmenu", this.noMenu);
  }
  private noMenu = (e: Event) => e.preventDefault();
  private ndc(e: PointerEvent): [number, number, number] { const r = this.el.getBoundingClientRect(); this.cam.aspect = r.width / Math.max(1, r.height); return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), r.height]; }
  /** Ray against a sphere around the target; falls back to the closest approach. */
  private hit(nx: number, ny: number): { p: Vec3; d: Vec3 } {
    const { o, d } = this.cam.ray(nx, ny), c = this.cam.target, R = Math.max(0.3, this.sim.radius * 1.05);
    const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2], b = ox * d[0] + oy * d[1] + oz * d[2], q = ox * ox + oy * oy + oz * oz - R * R, disc = b * b - q;
    const t = disc >= 0 ? -b - Math.sqrt(disc) : -b;
    return { p: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], d };
  }
  private force(slot: number, e: PointerEvent, active: boolean) {
    const s = this.get(), f = this.sim.pointers[slot]; if (!f) return;
    if (!active || s.tool === "none") { f.active = false; return; }
    const [nx, ny] = this.ndc(e), h = this.hit(nx, ny), now = performance.now(), dt = Math.max(0.008, (now - this.lastT) / 1000), prev = this.last.get(slot);
    if (prev) { f.vx = f.vx * 0.6 + ((h.p[0] - prev[0]) / dt) * 0.4; f.vy = f.vy * 0.6 + ((h.p[1] - prev[1]) / dt) * 0.4; f.vz = f.vz * 0.6 + ((h.p[2] - prev[2]) / dt) * 0.4; } else { f.vx = f.vy = f.vz = 0; }
    this.last.set(slot, h.p); this.lastT = now;
    f.active = true; f.x = h.p[0]; f.y = h.p[1]; f.z = h.p[2]; f.dx = h.d[0]; f.dy = h.d[1]; f.dz = h.d[2]; f.radius = s.radius; f.strength = s.strength; f.tool = s.tool;
  }
  private down = (e: PointerEvent) => {
    this.el.setPointerCapture?.(e.pointerId);
    const slot = Math.min(3, this.pts.size), [nx, ny] = this.ndc(e);
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, slot, sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: false, btn: e.button });
    this.cam.dragging = true; void nx; void ny;
    if (this.pts.size === 2) { const [a, b] = [...this.pts.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y); this.cx = (a.x + b.x) / 2; this.cy = (a.y + b.y) / 2; }
    if (this.get().dragMode === "force" || e.pointerType === "mouse") this.force(slot, e, true);
  };
  private move = (e: PointerEvent) => {
    const p = this.pts.get(e.pointerId), r = this.el.getBoundingClientRect(), s = this.get();
    if (!p) { if (e.pointerType === "mouse") this.force(0, e, true); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) p.moved = true;
    if (this.pts.size >= 2) {
      const [a, b] = [...this.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (this.pinch > 0 && d > 0) this.cam.dolly(this.pinch / d); this.cam.pan((mx - this.cx) / r.height, (my - this.cy) / r.height); this.pinch = d; this.cx = mx; this.cy = my;
      for (const f of this.sim.pointers) f.active = false; return;
    }
    if (p.btn === 2 || p.btn === 1 || e.shiftKey) this.cam.pan(dx / r.height, dy / r.height);
    else if (s.dragMode === "orbit") { this.cam.orbit(-dx * 0.0065, dy * 0.0065); this.cam.yawVel = (-dx * 0.0065) / 0.016 * 0.35; this.cam.pitchVel = (dy * 0.0065) / 0.016 * 0.35; }
    this.force(p.slot, e, true);
  };
  private up = (e: PointerEvent) => {
    const p = this.pts.get(e.pointerId); if (!p) return;
    this.pts.delete(e.pointerId); this.last.delete(p.slot);
    if (e.pointerType !== "mouse") this.sim.pointers[p.slot].active = false;
    if (!p.moved && performance.now() - p.t0 < 350 && this.get().clickAction === "burst" && p.btn === 0) { const [nx, ny] = this.ndc(e), h = this.hit(nx, ny); this.sim.burst(h.p[0], h.p[1], h.p[2], this.get().radius * 2.4, 5 * this.get().strength); this.onBurst?.(h.p); }
    if (this.pts.size === 0) this.cam.dragging = false;
    if (this.pts.size < 2) this.pinch = 0;
  };
  private leave = () => { for (const f of this.sim.pointers) f.active = false; this.last.clear(); };
  private wheel = (e: WheelEvent) => { e.preventDefault(); this.cam.dolly(Math.exp(e.deltaY * 0.0012)); };
}
