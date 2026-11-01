import {
  VERTEX_SOURCE,
  buildFragmentSource,
  motionOf,
  programKey,
  staticUniforms,
  type MotionConfig,
  type UniformEntry,
} from "./builder";
import type { ShaderProject } from "./types";

export interface RendererStats {
  fps: number;
  quality: number;
}

export interface RendererOptions {
  /** Track pointer movement, hold and click ripples on the canvas. */
  interactive?: boolean;
  /** Keep the drawing buffer sized to the canvas' CSS box (live preview). */
  autoSize?: boolean;
  onStats?: (stats: RendererStats) => void;
  /** Called with the compiler log when a shader fails, and with null on success. */
  onError?: (message: string | null) => void;
}

interface Ripple {
  x: number;
  y: number;
  t0: number;
}

const MAX_DPR = 1.75;

export class ShaderRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly supported: boolean;

  private readonly gl: WebGL2RenderingContext | null;
  private readonly options: RendererOptions;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private readonly locations = new Map<string, WebGLUniformLocation | null>();
  private key = "";
  private project: ShaderProject | null = null;
  private motion: MotionConfig | null = null;
  private statics: UniformEntry[] = [];

  private raf = 0;
  private running = false;
  private last = 0;
  private time = 0;
  private spinAcc = 0;
  private palAcc = 0;
  private ema = 0.016;
  private frames = 0;
  private statsClock = 0;
  private quality = 1;
  private observer: ResizeObserver | null = null;
  private readonly reduced: boolean;

  /* pointer state — same model as the exported runtime */
  private tx = 0;
  private ty = 0;
  private mx = 0;
  private my = 0;
  private stir = 0;
  private press = 0;
  private down = false;
  private idle = 3.5;
  private readonly ripples: Ripple[] = [];
  private rippleIndex = 0;
  private readonly ripData = new Float32Array(16);
  private readonly cleanups: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    this.canvas = canvas;
    this.options = options;
    this.reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.supported = this.gl !== null;
    if (!this.gl) return;

    this.vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(this.vao);

    const onLost = (event: Event) => {
      event.preventDefault();
      this.stopLoop();
    };
    const onRestored = () => {
      this.program = null;
      this.key = "";
      this.locations.clear();
      this.vao = this.gl ? this.gl.createVertexArray() : null;
      if (this.gl) this.gl.bindVertexArray(this.vao);
      if (this.project) this.setProject(this.project);
      if (this.wantsLoop) this.start();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    this.cleanups.push(() => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    });

    if (options.interactive) this.bindPointer();
    if (options.autoSize) {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas);
    }
  }

  private wantsLoop = false;

  /* ───────────── project ───────────── */

  setProject(project: ShaderProject): void {
    this.project = project;
    this.motion = motionOf(project);
    const gl = this.gl;
    if (!gl) return;
    const nextKey = programKey(project);
    if (nextKey !== this.key || !this.program) {
      if (this.compile(project)) {
        this.key = nextKey;
        this.quality = 1;
        this.resize();
      }
    }
    this.statics = staticUniforms(project);
    this.uploadStatics();
  }

  private compile(project: ShaderProject): boolean {
    const gl = this.gl;
    if (!gl) return false;
    const fragment = buildFragmentSource(project);
    const vs = this.shader(gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fs = this.shader(gl.FRAGMENT_SHADER, fragment);
    if (typeof vs === "string" || typeof fs === "string") {
      const log = typeof fs === "string" ? fs : typeof vs === "string" ? vs : "Shader failed to compile.";
      if (typeof vs !== "string") gl.deleteShader(vs);
      if (typeof fs !== "string") gl.deleteShader(fs);
      this.options.onError?.(log);
      return false;
    }
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      this.options.onError?.("Could not create a WebGL program.");
      return false;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? "Shader failed to link.";
      gl.deleteProgram(program);
      this.options.onError?.(log);
      return false;
    }
    if (this.program) gl.deleteProgram(this.program);
    this.program = program;
    this.locations.clear();
    gl.useProgram(program);
    this.options.onError?.(null);
    return true;
  }

  /** Returns the compiled shader, or the info log string when compilation failed. */
  private shader(type: number, source: string): WebGLShader | string {
    const gl = this.gl;
    if (!gl) return "WebGL2 is not available.";
    const shader = gl.createShader(type);
    if (!shader) return "Could not create a shader.";
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? "Shader failed to compile.";
      gl.deleteShader(shader);
      return log;
    }
    return shader;
  }

  private loc(name: string): WebGLUniformLocation | null {
    const gl = this.gl;
    if (!gl || !this.program) return null;
    if (!this.locations.has(name)) this.locations.set(name, gl.getUniformLocation(this.program, name));
    return this.locations.get(name) ?? null;
  }

  private setUniform(name: string, value: number | number[]): void {
    const gl = this.gl;
    if (!gl) return;
    const location = this.loc(name);
    if (location === null) return;
    if (typeof value === "number") {
      gl.uniform1f(location, value);
    } else if (name === "uPal[0]") {
      gl.uniform3fv(location, value);
    } else if (value.length === 2) {
      gl.uniform2fv(location, value);
    } else if (value.length === 3) {
      gl.uniform3fv(location, value);
    } else if (value.length === 4) {
      gl.uniform4fv(location, value);
    }
  }

  private uploadStatics(): void {
    if (!this.gl || !this.program) return;
    this.gl.useProgram(this.program);
    for (const [name, value] of this.statics) this.setUniform(name, value);
  }

  /* ───────────── sizing ───────────── */

  resize(): void {
    const gl = this.gl;
    if (!gl || !this.options.autoSize) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR) * this.quality;
    const w = Math.max(2, Math.floor(rect.width * dpr));
    const h = Math.max(2, Math.floor(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (!this.running) this.draw();
  }

  /** Fixed-size mode for thumbnails and exports. */
  setSize(width: number, height: number): void {
    const gl = this.gl;
    if (!gl) return;
    this.canvas.width = Math.max(2, Math.floor(width));
    this.canvas.height = Math.max(2, Math.floor(height));
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /* ───────────── pointer ───────────── */

  private toSpace(clientX: number, clientY: number): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    const h = Math.max(1, rect.height);
    return [(clientX - rect.left - rect.width / 2) / h, -(clientY - rect.top - rect.height / 2) / h];
  }

  private bindPointer(): void {
    const canvas = this.canvas;
    const move = (e: PointerEvent) => {
      [this.tx, this.ty] = this.toSpace(e.clientX, e.clientY);
      this.idle = 0;
    };
    const downHandler = (e: PointerEvent) => {
      [this.tx, this.ty] = this.toSpace(e.clientX, e.clientY);
      this.idle = 0;
      this.down = true;
      if (this.project?.ripples) {
        this.ripples[this.rippleIndex++ % 4] = { x: this.tx, y: this.ty, t0: performance.now() };
      }
    };
    const up = () => { this.down = false; };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerdown", downHandler);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    this.cleanups.push(() => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", downHandler);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    });
  }

  /* ───────────── loop ───────────── */

  start(): void {
    this.wantsLoop = true;
    if (this.running || !this.gl) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.wantsLoop = false;
    this.stopLoop();
  }

  private stopLoop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(dt, now);
    this.draw();

    this.ema = this.ema * 0.95 + dt * 0.05;
    this.frames++;
    this.statsClock += dt;
    if (this.frames % 90 === 0 && this.ema > 0.026 && this.quality > 0.5) {
      this.quality *= 0.82;
      this.ema = 0.016;
      this.resize();
    }
    if (this.statsClock >= 0.5) {
      this.statsClock = 0;
      this.options.onStats?.({ fps: Math.min(120, Math.round(1 / Math.max(this.ema, 0.004))), quality: this.quality });
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private step(dt: number, now: number): void {
    const m = this.motion;
    if (!m) return;
    const slow = this.reduced ? 0.35 : 1;
    if (m.playing) {
      this.time += dt * m.speed * slow;
      this.spinAcc += dt * m.spin * slow;
      this.palAcc += dt * m.paletteSpeed * 0.08 * slow;
    }
    this.idle += dt;

    let tx = this.tx;
    let ty = this.ty;
    if (m.idleDrift && this.idle > 3) {
      const k = now / 1000;
      tx = Math.sin(k * 0.21) * 0.28;
      ty = Math.cos(k * 0.17) * 0.18;
    }
    const px = this.mx;
    const py = this.my;
    const k1 = Math.min(1, dt * 7);
    this.mx += (tx - this.mx) * k1;
    this.my += (ty - this.my) * k1;
    const speed = Math.hypot(this.mx - px, this.my - py) / Math.max(dt, 1e-3);
    this.stir += (Math.min(1, speed * 0.8) - this.stir) * Math.min(1, dt * 4);
    this.press += ((this.down ? 1 : 0) - this.press) * Math.min(1, dt * (this.down ? 2.2 : 1.6));
  }

  /** Render a single frame at an explicit shader time (thumbnails, stills). */
  renderStill(timeSeconds: number): void {
    this.time = timeSeconds;
    this.spinAcc = 0;
    this.palAcc = 0;
    this.mx = 0;
    this.my = 0;
    this.stir = 0;
    this.press = 0;
    this.draw();
  }

  private draw(): void {
    const gl = this.gl;
    const m = this.motion;
    if (!gl || !m || !this.program) return;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    const now = performance.now();
    for (let i = 0; i < 4; i++) {
      const r = this.ripples[i];
      const age = r ? (now - r.t0) / 1000 : 99;
      if (r && age < 5) this.ripData.set([r.x, r.y, age, 1], i * 4);
      else this.ripData.set([0, 0, -1, 0], i * 4);
    }

    this.setUniform("uRes", [this.canvas.width, this.canvas.height]);
    this.setUniform("uTime", this.time);
    this.setUniform("uRot", m.rotation + this.spinAcc);
    this.setUniform("uPalShift", m.paletteShift + this.palAcc);
    this.setUniform("uMouse", [this.mx, this.my]);
    this.setUniform("uStir", this.stir);
    this.setUniform("uPress", this.press);
    const ripLoc = this.loc("uRip[0]");
    if (ripLoc !== null) gl.uniform4fv(ripLoc, this.ripData);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ───────────── exports ───────────── */

  /** Renders the current frame at the requested size and returns an image blob. */
  async snapshot(width: number, height: number, type = "image/png"): Promise<Blob | null> {
    const gl = this.gl;
    if (!gl) return null;
    const maxSize = (gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number | null) ?? 4096;
    const w = Math.min(Math.round(width), maxSize);
    const h = Math.min(Math.round(height), maxSize);
    const prevW = this.canvas.width;
    const prevH = this.canvas.height;
    this.canvas.width = w;
    this.canvas.height = h;
    gl.viewport(0, 0, w, h);
    this.draw();
    const blob = new Promise<Blob | null>((resolve) => this.canvas.toBlob(resolve, type, 0.95));
    this.canvas.width = prevW;
    this.canvas.height = prevH;
    gl.viewport(0, 0, prevW, prevH);
    this.draw();
    return blob;
  }

  /** `release` also frees the GPU context — only for canvases you will never reuse. */
  dispose(release = false): void {
    this.stop();
    this.observer?.disconnect();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    const gl = this.gl;
    if (!gl) return;
    if (this.program) gl.deleteProgram(this.program);
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.program = null;
    if (release) gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
