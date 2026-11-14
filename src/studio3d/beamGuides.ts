/**
 * Preview-only beam guides: each beam's axis, start/end cross-sections and four rails, as GL lines.
 * Self-contained (own program, VAO and buffer) so the particle renderer only needs three one-line hooks.
 */
import type { LightBeamFrame } from "./lightBeams";
import { MAX_LIGHT_BEAMS } from "./types";
import { GUIDE_FRAG, GUIDE_VERT } from "./shaders";

const RING = 24;
/** Vertices per beam: 1 axis + 2 rings of RING segments + 4 rails (two vertices per line). */
export const GUIDE_VERTS_PER_BEAM = 2 + 2 * RING * 2 + 8;

/** Writes line vertices (x, y, z …) for every active beam into out; returns the number of floats written. */
export function buildGuideLines(frame: LightBeamFrame, out: Float32Array): number {
  let k = 0;
  const push = (x: number, y: number, z: number) => { out[k++] = x; out[k++] = y; out[k++] = z; };
  for (let i = 0; i < frame.count && i < MAX_LIGHT_BEAMS; i++) {
    const o = i * 4, length = frame.originLength[o + 3];
    const ox = frame.originLength[o], oy = frame.originLength[o + 1], oz = frame.originLength[o + 2];
    const dx = frame.directionWidth[o], dy = frame.directionWidth[o + 1], dz = frame.directionWidth[o + 2], width = frame.directionWidth[o + 3];
    const ax = frame.sideA[o], ay = frame.sideA[o + 1], az = frame.sideA[o + 2], bx = frame.sideB[o], by = frame.sideB[o + 1], bz = frame.sideB[o + 2];
    const widen = frame.profile[o] === 1 ? frame.profile[o + 1] : frame.profile[o + 1] * 0.12;
    const ex = ox + dx * length, ey = oy + dy * length, ez = oz + dz * length, r0 = width * 2.2, r1 = width * (1 + widen) * 2.2;
    push(ox, oy, oz); push(ex, ey, ez);
    for (let ring = 0; ring < 2; ring++) {
      const cx = ring ? ex : ox, cy = ring ? ey : oy, cz = ring ? ez : oz, r = ring ? r1 : r0;
      for (let s = 0; s < RING; s++) {
        const a0 = (s / RING) * Math.PI * 2, a1 = ((s + 1) / RING) * Math.PI * 2;
        push(cx + (ax * Math.cos(a0) + bx * Math.sin(a0)) * r, cy + (ay * Math.cos(a0) + by * Math.sin(a0)) * r, cz + (az * Math.cos(a0) + bz * Math.sin(a0)) * r);
        push(cx + (ax * Math.cos(a1) + bx * Math.sin(a1)) * r, cy + (ay * Math.cos(a1) + by * Math.sin(a1)) * r, cz + (az * Math.cos(a1) + bz * Math.sin(a1)) * r);
      }
    }
    for (let q = 0; q < 4; q++) {
      const a = (q / 4) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      push(ox + (ax * c + bx * s) * r0, oy + (ay * c + by * s) * r0, oz + (az * c + bz * s) * r0);
      push(ex + (ax * c + bx * s) * r1, ey + (ay * c + by * s) * r1, ez + (az * c + bz * s) * r1);
    }
  }
  return k;
}

export class BeamGuides {
  private prog: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private buf: WebGLBuffer | null = null;
  private uView: WebGLUniformLocation | null = null;
  private uProj: WebGLUniformLocation | null = null;
  private uColor: WebGLUniformLocation | null = null;
  private data = new Float32Array(MAX_LIGHT_BEAMS * GUIDE_VERTS_PER_BEAM * 3);

  /** Call after the GL context is created (and again after a context restore). */
  init(gl: WebGL2RenderingContext) {
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("Guide shader error: " + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram()!; gl.attachShader(p, mk(gl.VERTEX_SHADER, GUIDE_VERT)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, GUIDE_FRAG)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("Guide link error: " + gl.getProgramInfoLog(p));
    this.prog = p; this.uView = gl.getUniformLocation(p, "uView"); this.uProj = gl.getUniformLocation(p, "uProj"); this.uColor = gl.getUniformLocation(p, "uColor");
    this.vao = gl.createVertexArray(); this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /** Draws additive amber lines into the currently bound framebuffer. Returns the number of vertices drawn. */
  draw(gl: WebGL2RenderingContext, frame: LightBeamFrame, view: Float32Array, proj: Float32Array): number {
    if (!this.prog || !this.vao || !frame.count) return 0;
    const floats = buildGuideLines(frame, this.data);
    if (!floats) return 0;
    gl.useProgram(this.prog); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, floats);
    gl.uniformMatrix4fv(this.uView, false, view); gl.uniformMatrix4fv(this.uProj, false, proj); gl.uniform3f(this.uColor, 0.9, 0.62, 0.2);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.LINES, 0, floats / 3);
    return floats / 3;
  }

  dispose(gl: WebGL2RenderingContext) {
    if (this.prog) gl.deleteProgram(this.prog);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.buf) gl.deleteBuffer(this.buf);
    this.prog = null; this.vao = null; this.buf = null;
  }
}
