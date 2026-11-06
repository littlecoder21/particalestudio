import {
  ARRAY_UNIFORMS,
  VERTEX_SOURCE,
  buildFragmentSource,
  motionOf,
  programKey,
  staticUniforms,
  type MotionConfig,
  type UniformEntry,
} from "./builder";
import type { MaskPixels } from "./mask";
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
  /**
   * Milliseconds to wait after the last project change before compiling a new GLSL
   * variant. While waiting (and while compiling) the previous shader keeps running.
   * 0 (default) compiles synchronously inside setProject — what thumbnails and exports need.
   */
  compileDelay?: number;
  onStats?: (stats: RendererStats) => void;
  /** Called with the compiler log when a shader fails, and with null once a shader is running again. */
  onError?: (message: string | null) => void;
}

/** Counters for tests, the profiler and future "compile cost" readouts. */
export interface RendererDiagnostics {
  /** shaders compiled and linked since creation */
  compiles: number;
  /** switches served from the program cache without compiling */
  cacheHits: number;
  /** programs currently cached */
  cached: number;
  /** a compile is waiting for its debounce timer or the GPU */
  compiling: boolean;
  contextLost: boolean;
  paused: boolean;
  quality: number;
  activeKey: string;
}

/** Uniform locations every program has; resolved once per program instead of once per frame. */
interface FrameLocations {
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  rot: WebGLUniformLocation | null;
  palShift: WebGLUniformLocation | null;
  mouse: WebGLUniformLocation | null;
  vel: WebGLUniformLocation | null;
  stir: WebGLUniformLocation | null;
  press: WebGLUniformLocation | null;
  rip: WebGLUniformLocation | null;
  trail: WebGLUniformLocation | null;
}

interface ProgramEntry {
  key: string;
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
  frame: FrameLocations;
  used: number;
}

/** A program that is linking (possibly on another thread) but not yet usable. */
interface LinkJob {
  key: string;
  program: WebGLProgram;
  vs: WebGLShader;
  fs: WebGLShader;
  started: number;
}

interface Ripple {
  x: number;
  y: number;
  /** performance.now() when it started; negative = slot is free */
  t0: number;
}

const MAX_DPR = 1.75;
const TRAIL_POINTS = 12;
const RIPPLES = 4;
/** compiled programs kept for instant switching back and forth between configurations */
const MAX_CACHED_PROGRAMS = 8;
const MAX_REMEMBERED_FAILURES = 24;

/* adaptive resolution */
const MIN_QUALITY = 0.5;
const FRAME_SLOW = 0.026;
const FRAME_FAST = 0.0185;
const ADAPT_WINDOW = 60;
const SETTLE_FRAMES = 45;
const RECOVER_WINDOWS = 4;
const RECOVER_WINDOWS_MAX = 16;

interface ParallelCompileExt {
  COMPLETION_STATUS_KHR: number;
}

export class ShaderRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly supported: boolean;

  private readonly gl: WebGL2RenderingContext | null;
  private readonly options: RendererOptions;
  private readonly compileDelay: number;
  private parallel: ParallelCompileExt | null = null;

  private vao: WebGLVertexArrayObject | null = null;
  private active: ProgramEntry | null = null;
  private readonly cache = new Map<string, ProgramEntry>();
  /** keys whose GLSL failed to compile → compiler log, so a broken configuration is not rebuilt every frame */
  private readonly failed = new Map<string, string>();
  private latest: ShaderProject | null = null;
  private motion: MotionConfig | null = null;
  private lastError: string | null = null;

  private compileTimer = 0;
  private pollTimer = 0;
  private job: LinkJob | null = null;
  private compiles = 0;
  private cacheHits = 0;

  private maskTex: WebGLTexture | null = null;
  private maskData: MaskPixels | null = null;

  private raf = 0;
  private running = false;
  private wantsLoop = false;
  private contextLost = false;
  private last = 0;
  private time = 0;
  private spinAcc = 0;
  private palAcc = 0;
  private readonly reduced: boolean;
  private observer: ResizeObserver | null = null;

  /* adaptive quality */
  private ema = 0.016;
  private frames = 0;
  private statsClock = 0;
  private quality = 1;
  private settle = 0;
  private fastWindows = 0;
  private recoverNeeded = RECOVER_WINDOWS;
  private lastRaisedAt = 0;

  /* pointer state — same model as the exported runtime */
  private tx = 0;
  private ty = 0;
  private mx = 0;
  private my = 0;
  private vx = 0;
  private vy = 0;
  private stir = 0;
  private press = 0;
  private down = false;
  private idle = 3.5;
  private readonly ripples: Ripple[] = Array.from({ length: RIPPLES }, () => ({ x: 0, y: 0, t0: -1 }));
  private rippleIndex = 0;
  private readonly ripData = new Float32Array(RIPPLES * 4);
  private readonly trail: Ripple[] = Array.from({ length: TRAIL_POINTS }, () => ({ x: 0, y: 0, t0: -1 }));
  private trailIndex = 0;
  private trailX = 0;
  private trailY = 0;
  private readonly trailData = new Float32Array(TRAIL_POINTS * 4);
  private readonly cleanups: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    this.canvas = canvas;
    this.options = options;
    this.compileDelay = Math.max(0, options.compileDelay ?? 0);
    this.reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.supported = this.gl !== null;
    if (!this.gl) return;

    if (this.compileDelay > 0) this.parallel = this.gl.getExtension("KHR_parallel_shader_compile") as ParallelCompileExt | null;
    this.vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(this.vao);

    const onLost = (event: Event) => {
      // preventDefault is what allows the browser to restore the context later
      event.preventDefault();
      this.contextLost = true;
      this.cancelCompile();
      this.stopLoop();
    };
    const onRestored = () => this.restoreContext();
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    this.cleanups.push(() => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    });

    // A hidden tab gets no animation frames worth drawing: stop instead of burning the GPU.
    if (typeof document !== "undefined") {
      const onVisibility = () => {
        if (document.hidden) this.stopLoop();
        else if (this.wantsLoop) this.start();
      };
      document.addEventListener("visibilitychange", onVisibility);
      this.cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));
    }

    this.uploadMask();
    if (options.interactive) this.bindPointer();
    if (options.autoSize) {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas);
    }
  }

  /* ───────────── project ───────────── */

  /**
   * Applies a project. Plain value changes (sliders, colours) only upload uniforms. A change
   * that needs different GLSL switches to a cached program, or compiles a new one — and
   * if that fails the previous program keeps running with its own, still valid, uniforms.
   */
  setProject(project: ShaderProject): void {
    this.latest = project;
    // motion drives uniforms every program has (time, rotation, pointer), so it is always current
    this.motion = motionOf(project);
    const gl = this.gl;
    if (!gl || this.contextLost) return;

    const key = programKey(project);
    if (this.active && key === this.active.key) {
      this.cancelCompile();
      this.uploadStatics(this.active, project);
      this.reportError(null);
      return;
    }
    const cached = this.cache.get(key);
    if (cached) {
      this.cancelCompile();
      this.cacheHits++;
      this.activate(cached, project);
      return;
    }
    const knownFailure = this.failed.get(key);
    if (knownFailure !== undefined) {
      this.cancelCompile();
      this.reportError(knownFailure);
      return;
    }
    // nothing running yet, or the caller wants the result immediately → compile now
    if (!this.active || this.compileDelay === 0) {
      this.cancelCompile();
      this.compileNow(project, key);
      return;
    }
    this.scheduleCompile();
  }

  /** Sets (or clears, with null) the packed mask texture the shader samples. */
  setMask(pixels: MaskPixels | null): void {
    this.maskData = pixels;
    this.uploadMask();
    if (!this.running) this.draw();
  }

  diagnostics(): RendererDiagnostics {
    return {
      compiles: this.compiles,
      cacheHits: this.cacheHits,
      cached: this.cache.size,
      compiling: this.compileTimer !== 0 || this.job !== null,
      contextLost: this.contextLost,
      paused: this.wantsLoop && !this.running,
      quality: this.quality,
      activeKey: this.active?.key ?? "",
    };
  }

  private reportError(message: string | null): void {
    if (message === this.lastError) return;
    this.lastError = message;
    this.options.onError?.(message);
  }

  private uploadMask(): void {
    const gl = this.gl;
    if (!gl || this.contextLost) return;
    if (!this.maskTex) this.maskTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const px = this.maskData;
    if (px) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, px.size, px.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, px.data);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /* ───────────── compilation ───────────── */

  private scheduleCompile(): void {
    window.clearTimeout(this.compileTimer);
    this.compileTimer = window.setTimeout(() => {
      this.compileTimer = 0;
      this.settleProject();
    }, this.compileDelay);
  }

  private cancelCompile(): void {
    window.clearTimeout(this.compileTimer);
    this.compileTimer = 0;
    // a job that is already linking cannot be aborted; it finishes into the cache and is picked up by settleProject
  }

  /** Brings the running program in line with the newest requested project. */
  private settleProject(): void {
    const project = this.latest;
    const gl = this.gl;
    if (!project || !gl || this.contextLost) return;
    const key = programKey(project);
    if (this.active && key === this.active.key) {
      this.uploadStatics(this.active, project);
      this.reportError(null);
      return;
    }
    const cached = this.cache.get(key);
    if (cached) {
      this.activate(cached, project);
      return;
    }
    const knownFailure = this.failed.get(key);
    if (knownFailure !== undefined) {
      this.reportError(knownFailure);
      return;
    }
    if (this.job) return; // finishJob() calls settleProject() again when it is done
    const job = this.startLink(project, key, Boolean(this.parallel && this.active));
    if (job) this.finishJob(job);
  }

  private compileNow(project: ShaderProject, key: string): void {
    const job = this.startLink(project, key, false);
    if (job) this.finishJob(job);
  }

  /** Creates and links a program. With `async` the GPU driver may keep compiling in the background. */
  private startLink(project: ShaderProject, key: string, async = true): LinkJob | null {
    const gl = this.gl;
    if (!gl) return null;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      if (program) gl.deleteProgram(program);
      this.rememberFailure(key, "Could not create WebGL shader objects.");
      return null;
    }
    gl.shaderSource(vs, VERTEX_SOURCE);
    gl.compileShader(vs);
    gl.shaderSource(fs, buildFragmentSource(project));
    gl.compileShader(fs);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    const job: LinkJob = { key, program, vs, fs, started: performance.now() };
    if (async && this.parallel) {
      this.job = job;
      this.pollJob();
      return null;
    }
    return job;
  }

  private pollJob = (): void => {
    const gl = this.gl;
    const job = this.job;
    if (!gl || !job || !this.parallel) return;
    if (gl.isContextLost()) return;
    if (gl.getProgramParameter(job.program, this.parallel.COMPLETION_STATUS_KHR) === true) {
      this.pollTimer = 0;
      this.finishJob(job);
      return;
    }
    this.pollTimer = window.setTimeout(this.pollJob, 10);
  };

  /** Checks the link result: caches and (if still wanted) activates the program, or records the failure. */
  private finishJob(job: LinkJob): void {
    const gl = this.gl;
    if (this.job === job) this.job = null;
    if (!gl) return;
    const linked = !gl.isContextLost() && gl.getProgramParameter(job.program, gl.LINK_STATUS) === true;
    if (!linked) {
      const log = gl.isContextLost() ? "WebGL context lost while compiling." : this.logOf(job);
      gl.deleteShader(job.vs);
      gl.deleteShader(job.fs);
      gl.deleteProgram(job.program);
      if (!gl.isContextLost()) this.rememberFailure(job.key, log);
      this.settleAfterJob(job.key);
      return;
    }
    gl.deleteShader(job.vs);
    gl.deleteShader(job.fs);
    this.compiles++;
    const entry = this.createEntry(job.key, job.program);
    this.remember(entry);
    this.settleAfterJob(job.key);
  }

  private settleAfterJob(key: string): void {
    const project = this.latest;
    if (!project) return;
    const wanted = programKey(project) === key;
    if (wanted) this.settleProject();
    else if (this.compileTimer === 0) this.settleProject(); // a newer request arrived while linking
  }

  /** Shader info log when there is one (it names the offending line), otherwise the link log. */
  private logOf(job: LinkJob): string {
    const gl = this.gl;
    if (!gl) return "Shader failed to compile.";
    const fragment = gl.getShaderParameter(job.fs, gl.COMPILE_STATUS) === false ? gl.getShaderInfoLog(job.fs) : null;
    const vertex = gl.getShaderParameter(job.vs, gl.COMPILE_STATUS) === false ? gl.getShaderInfoLog(job.vs) : null;
    return fragment || vertex || gl.getProgramInfoLog(job.program) || "Shader failed to link.";
  }

  private rememberFailure(key: string, log: string): void {
    if (this.failed.size >= MAX_REMEMBERED_FAILURES) this.failed.clear();
    this.failed.set(key, log);
  }

  private createEntry(key: string, program: WebGLProgram): ProgramEntry {
    const gl = this.gl as WebGL2RenderingContext;
    const uniforms = new Map<string, WebGLUniformLocation | null>();
    const at = (name: string) => gl.getUniformLocation(program, name);
    const entry: ProgramEntry = {
      key,
      program,
      uniforms,
      used: 0,
      frame: {
        res: at("uRes"),
        time: at("uTime"),
        rot: at("uRot"),
        palShift: at("uPalShift"),
        mouse: at("uMouse"),
        vel: at("uVel"),
        stir: at("uStir"),
        press: at("uPress"),
        rip: at("uRip[0]"),
        trail: at("uTrail[0]"),
      },
    };
    gl.useProgram(program);
    const maskLoc = at("uMaskTex");
    if (maskLoc !== null) gl.uniform1i(maskLoc, 0);
    return entry;
  }

  /** Adds to the cache, evicting the least recently used program that is not running. */
  private remember(entry: ProgramEntry): void {
    const gl = this.gl;
    this.cache.set(entry.key, entry);
    entry.used = performance.now();
    if (!gl) return;
    while (this.cache.size > MAX_CACHED_PROGRAMS) {
      let oldest: ProgramEntry | null = null;
      for (const candidate of this.cache.values()) {
        if (candidate === this.active) continue;
        if (!oldest || candidate.used < oldest.used) oldest = candidate;
      }
      if (!oldest) break;
      this.cache.delete(oldest.key);
      gl.deleteProgram(oldest.program);
    }
  }

  /** Makes a compiled program the live one and gives it the uniforms of `project` (whose key it matches). */
  private activate(entry: ProgramEntry, project: ShaderProject): void {
    entry.used = performance.now();
    this.active = entry;
    this.uploadStatics(entry, project);
    this.reportError(null);
    this.resize(); // repaints when the buffer changed or the loop is not running
  }

  private loc(entry: ProgramEntry, name: string): WebGLUniformLocation | null {
    const gl = this.gl;
    if (!gl) return null;
    let location = entry.uniforms.get(name);
    if (location === undefined) {
      location = gl.getUniformLocation(entry.program, name);
      entry.uniforms.set(name, location);
    }
    return location;
  }

  private setUniform(entry: ProgramEntry, name: string, value: number | number[]): void {
    const gl = this.gl;
    if (!gl) return;
    const location = this.loc(entry, name);
    if (location === null) return;
    if (typeof value === "number") {
      gl.uniform1f(location, value);
      return;
    }
    const arrayDim = ARRAY_UNIFORMS[name];
    if (arrayDim === 1) gl.uniform1fv(location, value);
    else if (arrayDim === 3) gl.uniform3fv(location, value);
    else if (arrayDim === 4) gl.uniform4fv(location, value);
    else if (value.length === 2) gl.uniform2fv(location, value);
    else if (value.length === 3) gl.uniform3fv(location, value);
    else if (value.length === 4) gl.uniform4fv(location, value);
  }

  /** Only ever called with the program the project's key belongs to, so every name and size matches. */
  private uploadStatics(entry: ProgramEntry, project: ShaderProject): void {
    const gl = this.gl;
    if (!gl || this.contextLost) return;
    gl.useProgram(entry.program);
    const statics: UniformEntry[] = staticUniforms(project);
    for (const [name, value] of statics) this.setUniform(entry, name, value);
  }

  /** Every GL object died with the context. Rebuild them and carry on where we were. */
  private restoreContext(): void {
    const gl = this.gl;
    if (!gl) return;
    this.contextLost = false;
    this.cache.clear();
    this.failed.clear();
    this.active = null;
    this.job = null;
    this.maskTex = null;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.uploadMask();
    if (this.latest) this.setProject(this.latest);
    if (this.wantsLoop) this.start();
  }

  /* ───────────── sizing ───────────── */

  private previewScale(): number {
    const base = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (!this.latest) return base * this.quality;
    const layerCount = this.latest.layers.filter((layer) => layer.visible).length;
    const layerPenalty = Math.max(0.55, 1 - Math.max(0, layerCount - 3) * 0.12);
    const maskPenalty = this.latest.mask.enabled ? 0.9 : 1;
    const scaled = base * this.quality * layerPenalty * maskPenalty;
    return Math.max(0.5, Math.min(MAX_DPR, scaled));
  }

  resize(): void {
    const gl = this.gl;
    if (!gl || !this.options.autoSize || this.contextLost) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const dpr = this.previewScale();
    const w = Math.max(2, Math.floor(rect.width * dpr));
    const h = Math.max(2, Math.floor(rect.height * dpr));
    let changed = false;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      changed = true;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    // Resizing clears the drawing buffer, so repaint straight away — otherwise
    // dragging the preview/panel divider would flash a blank frame on every step.
    if (changed || !this.running) this.draw();
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
      if (this.latest?.ripples) {
        const slot = this.ripples[this.rippleIndex++ % RIPPLES];
        slot.x = this.tx;
        slot.y = this.ty;
        slot.t0 = performance.now();
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
    if (this.running || !this.gl || this.contextLost) return;
    if (typeof document !== "undefined" && document.hidden) return; // the visibility handler resumes it
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
    this.adapt(dt, now);

    this.statsClock += dt;
    if (this.statsClock >= 0.5) {
      this.statsClock = 0;
      this.options.onStats?.({ fps: Math.min(120, Math.round(1 / Math.max(this.ema, 0.004))), quality: this.quality });
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  /**
   * Resolution follows the measured frame time: down quickly when frames are slow, back up
   * slowly (and only after several consistently fast windows) so it does not oscillate.
   */
  private adapt(dt: number, now: number): void {
    this.ema = this.ema * 0.95 + dt * 0.05;
    this.frames++;
    if (this.settle > 0) {
      this.settle--;
      return;
    }
    if (this.frames % ADAPT_WINDOW !== 0) return;

    if (this.ema > FRAME_SLOW && this.quality > MIN_QUALITY) {
      // dropping soon after raising means the higher quality was too much: wait longer before trying again
      if (now - this.lastRaisedAt < 8000) this.recoverNeeded = Math.min(RECOVER_WINDOWS_MAX, this.recoverNeeded * 2);
      this.fastWindows = 0;
      this.setQuality(Math.max(MIN_QUALITY, this.quality * 0.82));
    } else if (this.ema < FRAME_FAST && this.quality < 1) {
      if (++this.fastWindows >= this.recoverNeeded) {
        this.fastWindows = 0;
        this.lastRaisedAt = now;
        this.setQuality(Math.min(1, this.quality * 1.1));
        if (this.quality >= 1) this.recoverNeeded = RECOVER_WINDOWS;
      }
    } else {
      this.fastWindows = 0;
    }
  }

  private setQuality(value: number): void {
    this.quality = value;
    this.ema = 0.017;
    this.settle = SETTLE_FRAMES;
    this.resize();
  }

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
    const k1 = Math.min(1, dt * Math.max(1, m.follow));
    this.mx += (tx - this.mx) * k1;
    this.my += (ty - this.my) * k1;

    const dtc = Math.max(dt, 1e-3);
    const kv = Math.min(1, dt * 10);
    this.vx += ((this.mx - px) / dtc - this.vx) * kv;
    this.vy += ((this.my - py) / dtc - this.vy) * kv;
    const vm = Math.hypot(this.vx, this.vy);
    if (vm > 3) {
      this.vx *= 3 / vm;
      this.vy *= 3 / vm;
    }

    const speed = Math.hypot(this.mx - px, this.my - py) / dtc;
    this.stir += (Math.min(1, speed * 0.8) - this.stir) * Math.min(1, dt * 4);
    this.press += ((this.down ? 1 : 0) - this.press) * Math.min(1, dt * (this.down ? 2.2 : 1.6));

    if (Math.hypot(this.mx - this.trailX, this.my - this.trailY) > 0.012) {
      const slot = this.trail[this.trailIndex++ % TRAIL_POINTS];
      slot.x = this.mx;
      slot.y = this.my;
      slot.t0 = performance.now();
      this.trailX = this.mx;
      this.trailY = this.my;
    }
  }

  /** Render a single frame at an explicit shader time (thumbnails, stills). */
  renderStill(timeSeconds: number): void {
    this.time = timeSeconds;
    this.spinAcc = 0;
    this.palAcc = 0;
    this.mx = 0;
    this.my = 0;
    this.vx = 0;
    this.vy = 0;
    this.stir = 0;
    this.press = 0;
    for (const point of this.trail) point.t0 = -1;
    this.trailIndex = 0;
    this.draw();
  }

  private draw(): void {
    const gl = this.gl;
    const m = this.motion;
    const entry = this.active;
    if (!gl || !m || !entry || this.contextLost || gl.isContextLost()) return;
    const f = entry.frame;
    gl.useProgram(entry.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);

    const now = performance.now();
    const rip = this.ripData;
    for (let i = 0; i < RIPPLES; i++) {
      const r = this.ripples[i];
      const age = r.t0 >= 0 ? (now - r.t0) / 1000 : 99;
      const live = r.t0 >= 0 && age < 5;
      const o = i * 4;
      rip[o] = live ? r.x : 0;
      rip[o + 1] = live ? r.y : 0;
      rip[o + 2] = live ? age : -1;
      rip[o + 3] = live ? 1 : 0;
    }
    const trailSeconds = Math.max(0.1, m.trail);
    const trail = this.trailData;
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const point = this.trail[i];
      const age = point.t0 >= 0 ? (now - point.t0) / 1000 : 99;
      const life = point.t0 >= 0 ? Math.max(0, 1 - age / trailSeconds) : 0;
      const o = i * 4;
      const live = point.t0 >= 0 && life > 0;
      trail[o] = live ? point.x : 0;
      trail[o + 1] = live ? point.y : 0;
      trail[o + 2] = live ? age : -1;
      trail[o + 3] = live ? life : 0;
    }

    if (f.res !== null) gl.uniform2f(f.res, this.canvas.width, this.canvas.height);
    if (f.time !== null) gl.uniform1f(f.time, this.time);
    if (f.rot !== null) gl.uniform1f(f.rot, m.rotation + this.spinAcc);
    if (f.palShift !== null) gl.uniform1f(f.palShift, m.paletteShift + this.palAcc);
    if (f.mouse !== null) gl.uniform2f(f.mouse, this.mx, this.my);
    if (f.vel !== null) gl.uniform2f(f.vel, this.vx, this.vy);
    if (f.stir !== null) gl.uniform1f(f.stir, this.stir);
    if (f.press !== null) gl.uniform1f(f.press, this.press);
    if (f.rip !== null) gl.uniform4fv(f.rip, rip);
    if (f.trail !== null) gl.uniform4fv(f.trail, trail);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ───────────── exports ───────────── */

  /** Renders the current frame at the requested size and returns an image blob. */
  async snapshot(width: number, height: number, type = "image/png"): Promise<Blob | null> {
    const gl = this.gl;
    if (!gl || this.contextLost) return null;
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
    this.cancelCompile();
    window.clearTimeout(this.pollTimer);
    this.pollTimer = 0;
    this.observer?.disconnect();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    const gl = this.gl;
    if (!gl) return;
    const job = this.job;
    this.job = null;
    if (job) {
      gl.deleteShader(job.vs);
      gl.deleteShader(job.fs);
      gl.deleteProgram(job.program);
    }
    for (const entry of this.cache.values()) gl.deleteProgram(entry.program);
    this.cache.clear();
    this.failed.clear();
    this.active = null;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.maskTex) gl.deleteTexture(this.maskTex);
    this.vao = null;
    this.maskTex = null;
    if (release) gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
