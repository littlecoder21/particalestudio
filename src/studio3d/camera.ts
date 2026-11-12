import type { CameraSettings, Vec3 } from "./types";
import { clamp, mat4, mat4LookAt, mat4Mul, mat4Ortho, mat4Perspective, type Mat4 } from "./math";

export const DEFAULT_CAMERA: CameraSettings = { projection: "perspective", fov: 45, distance: 3.4, yaw: 0.45, pitch: 0.22, target: [0, 0, 0], near: 0.05, far: 60, autoRotate: 0.12 };

/** Orbit camera with inertia, pan, dolly, perspective / orthographic projection and picking rays. */
export class OrbitCamera {
  target: Vec3 = [0, 0, 0];
  yaw = 0.45; pitch = 0.22; distance = 3.4; fov = 45; near = 0.05; far = 60;
  ortho = false; autoRotate = 0.12;
  yawVel = 0; pitchVel = 0; dragging = false;
  readonly view: Mat4 = mat4(); readonly proj: Mat4 = mat4(); readonly viewProj: Mat4 = mat4();
  aspect = 1; private ex = 0; private ey = 0; private ez = 0;

  apply(s: CameraSettings) {
    this.ortho = s.projection === "orthographic"; this.fov = s.fov; this.distance = s.distance; this.yaw = s.yaw; this.pitch = s.pitch;
    this.target = [s.target[0], s.target[1], s.target[2]]; this.near = s.near; this.far = s.far; this.autoRotate = s.autoRotate;
    this.yawVel = 0; this.pitchVel = 0;
  }
  toSettings(): CameraSettings {
    return { projection: this.ortho ? "orthographic" : "perspective", fov: this.fov, distance: this.distance, yaw: this.yaw, pitch: this.pitch, target: [...this.target] as Vec3, near: this.near, far: this.far, autoRotate: this.autoRotate };
  }
  /** Advances inertia + auto rotation (dt in seconds). */
  update(dt: number) {
    if (!this.dragging) {
      this.yaw += this.yawVel * dt; this.pitch = clamp(this.pitch + this.pitchVel * dt, -1.5, 1.5);
      const k = Math.exp(-dt * 4);
      this.yawVel = this.autoRotate + (this.yawVel - this.autoRotate) * k; this.pitchVel *= k;
    }
    this.pitch = clamp(this.pitch, -1.52, 1.52);
    this.distance = clamp(this.distance, 0.4, 40);
  }
  orbit(dx: number, dy: number) { this.yaw += dx; this.pitch = clamp(this.pitch + dy, -1.52, 1.52); }
  dolly(f: number) { this.distance = clamp(this.distance * f, 0.4, 40); }
  /** Pans in the view plane; dx,dy are fractions of the viewport height. */
  pan(dx: number, dy: number) {
    const s = this.visibleHeight(), r = this.right(), u = this.up();
    for (let i = 0; i < 3; i++) this.target[i] += (-r[i] * dx + u[i] * dy) * s;
  }
  visibleHeight() { return 2 * this.distance * Math.tan((this.fov * Math.PI) / 360); }
  eye(): Vec3 {
    const cp = Math.cos(this.pitch);
    return [this.target[0] + this.distance * cp * Math.sin(this.yaw), this.target[1] + this.distance * Math.sin(this.pitch), this.target[2] + this.distance * cp * Math.cos(this.yaw)];
  }
  forward(): Vec3 { const e = this.eye(), x = this.target[0] - e[0], y = this.target[1] - e[1], z = this.target[2] - e[2], l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }
  right(): Vec3 { const f = this.forward(), x = -f[2], z = f[0], l = Math.hypot(x, z) || 1; return [x / l, 0, z / l]; }
  up(): Vec3 { const f = this.forward(), r = this.right(); return [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]; }
  /** Rebuilds view/proj matrices. */
  updateMatrices(aspect: number) {
    this.aspect = aspect;
    const e = this.eye(); this.ex = e[0]; this.ey = e[1]; this.ez = e[2];
    mat4LookAt(this.view, e[0], e[1], e[2], this.target[0], this.target[1], this.target[2]);
    if (this.ortho) mat4Ortho(this.proj, this.visibleHeight() / 2, aspect, this.near, this.far); else mat4Perspective(this.proj, (this.fov * Math.PI) / 180, aspect, this.near, this.far);
    mat4Mul(this.viewProj, this.proj, this.view);
  }
  /** Pixels per world unit at view depth 1 (perspective) or per unit (orthographic), for a viewport of the given pixel height. */
  pixelScale(heightPx: number): number {
    return this.ortho ? heightPx / this.visibleHeight() : heightPx / (2 * Math.tan((this.fov * Math.PI) / 360));
  }
  /** World-space picking ray through normalised device coordinates (-1..1). */
  ray(ndcX: number, ndcY: number): { o: Vec3; d: Vec3 } {
    const f = this.forward(), r = this.right(), u = this.up(), th = Math.tan((this.fov * Math.PI) / 360);
    if (this.ortho) {
      const h = this.visibleHeight() / 2, e = this.eye();
      return { o: [e[0] + r[0] * ndcX * h * this.aspect + u[0] * ndcY * h, e[1] + r[1] * ndcX * h * this.aspect + u[1] * ndcY * h, e[2] + r[2] * ndcX * h * this.aspect + u[2] * ndcY * h], d: f };
    }
    const dx = f[0] + r[0] * ndcX * th * this.aspect + u[0] * ndcY * th, dy = f[1] + r[1] * ndcX * th * this.aspect + u[1] * ndcY * th, dz = f[2] + r[2] * ndcX * th * this.aspect + u[2] * ndcY * th, l = Math.hypot(dx, dy, dz) || 1;
    return { o: [this.ex, this.ey, this.ez], d: [dx / l, dy / l, dz / l] };
  }
  /** Projects a world point to NDC; returns [x, y, depth] (depth = view-space distance, >0 in front). */
  project(x: number, y: number, z: number, out: Vec3): Vec3 {
    const v = this.view, p = this.proj;
    const vx = v[0] * x + v[4] * y + v[8] * z + v[12], vy = v[1] * x + v[5] * y + v[9] * z + v[13], vz = v[2] * x + v[6] * y + v[10] * z + v[14];
    const cx = p[0] * vx, cy = p[5] * vy, cw = p[11] * vz + p[15];
    out[0] = cx / (cw || 1); out[1] = cy / (cw || 1); out[2] = -vz;
    return out;
  }
  /** Frames a bounding sphere of the given radius. */
  frame(radius: number, margin = 1.25) {
    this.distance = (radius * margin) / Math.sin((Math.min(this.fov, 80) * Math.PI) / 360);
  }
}
