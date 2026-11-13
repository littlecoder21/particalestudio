/** Software fallback for devices without WebGL2: additive splatting into a float buffer + cheap bloom. */
import type { Renderer, RenderInput, RendererInfo } from "./renderer";
import { paletteBytes, parseColor } from "./palette";
import { createLightBeamFrame, sampleLightBeams, updateLightBeamFrame, type LightBeamSample } from "./lightBeams";

const hash = (value: number) => {
  const result = Math.sin(value * 127.1) * 43758.5453;
  return result - Math.floor(result);
};

export class Canvas2DRenderer implements Renderer {
  info: RendererInfo = { kind: "canvas2d", gpu: "Software (Canvas 2D)", hdr: false, maxPoint: 4 };
  renderMs = 0;
  private ctx: CanvasRenderingContext2D; private w = 1; private h = 1; private acc = new Float32Array(0); private img: ImageData | null = null; private small: HTMLCanvasElement; private sctx: CanvasRenderingContext2D; private lut: Uint8Array = new Uint8Array(0); private lutKey = "";
  private beamFrame = createLightBeamFrame();
  private beamSample: LightBeamSample = { intensity: 0, colorPosition: 0, directionX: 0, directionY: 0, directionZ: 1, speed: 0 };
  constructor(readonly canvas: HTMLCanvasElement) {
    const c = canvas.getContext("2d"); if (!c) throw new Error("Canvas 2D unavailable");
    this.ctx = c; this.small = document.createElement("canvas"); this.sctx = this.small.getContext("2d")!;
  }
  resize(cssW: number, cssH: number, dpr: number) {
    const w = Math.max(2, Math.floor(cssW * Math.min(dpr, 1.25))), h = Math.max(2, Math.floor(cssH * Math.min(dpr, 1.25)));
    if (w === this.w && h === this.h && this.canvas.width === w) return;
    this.canvas.width = w; this.canvas.height = h; this.w = w; this.h = h; this.acc = new Float32Array(w * h * 3); this.img = this.ctx.createImageData(w, h);
    this.small.width = Math.max(2, w >> 2); this.small.height = Math.max(2, h >> 2);
  }
  render(inp: RenderInput, transparent = false) {
    const t0 = performance.now(), { look, camera: cam } = inp, W = this.w, H = this.h, acc = this.acc;
    const rows = [0, 1, 2, 3].map((i) => inp.layers[i]?.palette ?? look.palette), key = JSON.stringify(rows);
    if (key !== this.lutKey) { this.lutKey = key; this.lut = paletteBytes(rows); }
    acc.fill(0); cam.updateMatrices(W / H);
    updateLightBeamFrame(inp.beams, inp.time, this.beamFrame);
    const m = cam.viewProj, n = Math.min(inp.n, 70000), norm = look.autoNormalize ? Math.min(3, Math.max(0.35, Math.sqrt(80000 / inp.n))) : 1, k = look.opacity * norm * look.emission * 0.9;
    for (let i = 0; i < n; i++) {
      const o = i * 3, x = inp.pos[o], y = inp.pos[o + 1], z = inp.pos[o + 2], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (cw <= 0.01) continue;
      const sx = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / cw * 0.5 + 0.5) * W, sy = (1 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / cw * 0.5 + 0.5)) * H;
      if (sx < 0 || sy < 0 || sx >= W - 1 || sy >= H - 1) continue;
      const nz = inp.nrm[o] * cam.view[2] + inp.nrm[o + 1] * cam.view[6] + inp.nrm[o + 2] * cam.view[10], hasN = inp.nrm[o] * inp.nrm[o] + inp.nrm[o + 1] * inp.nrm[o + 1] + inp.nrm[o + 2] * inp.nrm[o + 2] > 0.01;
      const rim = hasN ? 1 - nz * nz : 0.5, dz = Math.min(1, Math.max(0, (cw - (inp.focus - inp.range)) / (2 * inp.range))), fade = 1 + look.depthFade * (0.26 + 0.74 * (1 - dz) - 1);
      const a = k * inp.alpha[i] * fade * (1 + look.edgeBrightness * (rim * rim * 1.3 - 0.35)), li = Math.min(3, inp.layer[i]) * 256 + Math.round(Math.min(1, Math.max(0, inp.t[i])) * 255);
      let r = this.lut[li * 4] / 255 * a, g = this.lut[li * 4 + 1] / 255 * a, b = this.lut[li * 4 + 2] / 255 * a;
      if (this.beamFrame.count) {
        sampleLightBeams(this.beamFrame, x, y, z, inp.time, this.beamSample);
        const illumination = this.beamSample.intensity;
        if (illumination > 0.0001) {
          const phase = inp.phase[i], normalLength = Math.hypot(inp.nrm[o], inp.nrm[o + 1], inp.nrm[o + 2]);
          const facing = normalLength > 1e-4
            ? 0.3 + 0.7 * Math.max(0, -(inp.nrm[o] * this.beamSample.directionX + inp.nrm[o + 1] * this.beamSample.directionY + inp.nrm[o + 2] * this.beamSample.directionZ) / normalLength)
            : 0.25 + 0.75 * hash(phase * 113.1);
          const glint = Math.pow(Math.max(0, Math.sin(inp.time * (0.6 + this.beamSample.speed) + phase * 6.2831853)), 8);
          const reflection = Math.min(2.5, illumination) * facing * (0.82 + 0.18 * glint);
          const beamIndex = (Math.min(3, inp.layer[i]) * 256 + Math.round(this.beamSample.colorPosition * 255)) * 4;
          r += this.lut[beamIndex] / 255 * a * reflection * 1.25;
          g += this.lut[beamIndex + 1] / 255 * a * reflection * 1.25;
          b += this.lut[beamIndex + 2] / 255 * a * reflection * 1.25;
        }
      }
      const ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy;
      for (let q = 0; q < 4; q++) { const w = (q & 1 ? fx : 1 - fx) * (q & 2 ? fy : 1 - fy), p = ((iy + (q >> 1)) * W + ix + (q & 1)) * 3; acc[p] += r * w; acc[p + 1] += g * w; acc[p + 2] += b * w; }
    }
    const img = this.img!, d = img.data, bg = parseColor(look.background), ex = look.exposure;
    for (let p = 0, q = 0; p < W * H; p++, q += 4) {
      const r = 1 - Math.exp(-acc[p * 3] * ex), g = 1 - Math.exp(-acc[p * 3 + 1] * ex), b = 1 - Math.exp(-acc[p * 3 + 2] * ex), c = Math.min(1, Math.max(r, g, b));
      d[q] = r * 255 + bg[0] * (1 - c); d[q + 1] = g * 255 + bg[1] * (1 - c); d[q + 2] = b * 255 + bg[2] * (1 - c); d[q + 3] = transparent || look.transparent ? c * 255 : 255;
    }
    this.ctx.putImageData(img, 0, 0);
    if (look.glow > 0.01 && inp.bloomLevel > 0) {
      this.sctx.clearRect(0, 0, this.small.width, this.small.height); this.sctx.drawImage(this.canvas, 0, 0, this.small.width, this.small.height);
      this.ctx.save(); this.ctx.globalCompositeOperation = "lighter"; this.ctx.globalAlpha = Math.min(1, look.glow * 0.7); this.ctx.imageSmoothingEnabled = true; this.ctx.drawImage(this.small, 0, 0, W, H); this.ctx.restore();
    }
    this.renderMs = this.renderMs * 0.9 + (performance.now() - t0) * 0.1;
  }
  snapshot(inp: RenderInput, w: number, h: number, transparent: boolean): Promise<Blob | null> {
    const ow = this.w, oh = this.h; this.canvas.width = w; this.canvas.height = h; this.w = w; this.h = h; this.acc = new Float32Array(w * h * 3); this.img = this.ctx.createImageData(w, h); this.small.width = Math.max(2, w >> 2); this.small.height = Math.max(2, h >> 2);
    this.render(inp, transparent);
    return new Promise((res) => this.canvas.toBlob((b) => { this.resize(ow, oh, 1); res(b); }, "image/png"));
  }
  dispose() { /* nothing to release */ }
}
export function createRenderer(canvas: HTMLCanvasElement, GL: new (c: HTMLCanvasElement) => Renderer, supportsGL: () => boolean): Renderer {
  if (supportsGL()) { try { return new GL(canvas); } catch { /* fall through to software */ } }
  return new Canvas2DRenderer(canvas);
}
