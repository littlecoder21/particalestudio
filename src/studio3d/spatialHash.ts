/** Uniform-grid spatial hash (linked cell lists, zero allocation per query). */
export class SpatialHash {
  private head: Int32Array; private next: Int32Array; private mask: number; inv = 1;
  constructor(tableBits = 16) { this.head = new Int32Array(1 << tableBits).fill(-1); this.mask = (1 << tableBits) - 1; this.next = new Int32Array(0); }
  private cell(ix: number, iy: number, iz: number) { return ((Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791)) >>> 0) & this.mask; }
  /** Inserts particles i = offset, offset+stride, ... (< n). */
  build(pos: Float32Array, n: number, cellSize: number, stride = 1, offset = 0) {
    if (this.next.length < n) this.next = new Int32Array(n);
    this.head.fill(-1); this.inv = 1 / cellSize;
    for (let i = offset; i < n; i += stride) {
      const h = this.cell(Math.floor(pos[i * 3] * this.inv), Math.floor(pos[i * 3 + 1] * this.inv), Math.floor(pos[i * 3 + 2] * this.inv));
      this.next[i] = this.head[h]; this.head[h] = i;
    }
  }
  /** Writes up to out.length neighbour indices within `r` of (x,y,z); returns the count. */
  query(pos: Float32Array, x: number, y: number, z: number, r: number, out: Int32Array, self = -1): number {
    let c = 0;
    const r2 = r * r, ix = Math.floor(x * this.inv), iy = Math.floor(y * this.inv), iz = Math.floor(z * this.inv), span = Math.max(1, Math.ceil(r * this.inv));
    for (let a = -span; a <= span; a++) for (let b = -span; b <= span; b++) for (let d = -span; d <= span; d++) {
      for (let j = this.head[this.cell(ix + a, iy + b, iz + d)]; j >= 0; j = this.next[j]) {
        if (j === self) continue;
        const dx = pos[j * 3] - x, dy = pos[j * 3 + 1] - y, dz = pos[j * 3 + 2] - z;
        if (dx * dx + dy * dy + dz * dz <= r2) { if (c < out.length) out[c] = j; c++; }
      }
    }
    return Math.min(c, out.length);
  }
}
