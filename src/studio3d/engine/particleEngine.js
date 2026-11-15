/**
 * Particle Studio engine: the one runtime behind the website export, the standalone HTML and the project ZIP.
 *
 *   import { createParticleScene } from "./particle-engine.js";
 *   const scene = await createParticleScene({ container: "#particle-scene", data: "./particle-data.bin", config: "./particle-config.json" });
 *
 * Rendering is the studio's own GLSL, driven through Three.js (see threeParticleRenderer.js). Three.js is a lazy,
 * shared dependency: every scene on a page resolves the same module URL, so it downloads and parses once.
 * This file has no globals and touches the host page only through the container element you pass in.
 *
 * `__PS_SIMULATION__` is replaced by esbuild: false builds the lean "static" engine used by Hero exports
 * (no particle simulation code), true builds the engine for Animated and Full Quality exports.
 */
import { OrbitCamera } from "../camera";
import { PointerController } from "../interaction";
import { QUALITY } from "../types";
import { decodePsb, readFloat32, readRaw, PsbError } from "../export/format";
import { parseConfig, mergeConfig, ConfigError } from "../export/config";
import { makeParticleRenderer, buildMisc, toInt8Normals } from "./threeParticleRenderer";
import { Simulation } from "../simulation";

export const ENGINE_VERSION = "1.0.0";
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";
const LOCKED_CONFIG_KEYS = ["schema", "version", "mode", "data", "engine"];

export class ParticleEngineError extends Error {
  /** @param {string} code @param {string} message @param {unknown} [cause] */
  constructor(code, message, cause) {
    super(message);
    this.name = "ParticleEngineError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

/* ───────────── shared, page-wide state ───────────── */

const rendererClasses = new WeakMap();
const registry = new Set();
let maxActiveContexts = 8;
let warnedContextBudget = false;
let sceneCounter = 0;

export function particleEngineStats() {
  let awake = 0, sleeping = 0;
  for (const scene of registry) { if (scene._renderer) awake++; else if (scene.state === "sleeping") sleeping++; }
  return { engine: ENGINE_VERSION, simulation: __PS_SIMULATION__, scenes: registry.size, awake, sleeping, maxActiveContexts };
}

async function loadThree(options) {
  if (options.three) return options.three;
  const url = options.threeUrl || THREE_URL;
  try {
    return await import(/* @vite-ignore */ url);
  } catch (error) {
    throw new ParticleEngineError("three-load-failed", `Three.js could not be loaded from ${url}. Check the network connection or pass your own copy with the "three" option.`, error);
  }
}

function rendererClassFor(THREE) {
  let Renderer = rendererClasses.get(THREE);
  if (!Renderer) { Renderer = makeParticleRenderer(THREE); rendererClasses.set(THREE, Renderer); }
  return Renderer;
}

async function loadBytes(source, signal) {
  if (source && typeof source.then === "function") source = await source;
  if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) return source;
  if (typeof source !== "string" && !(source instanceof URL)) throw new ParticleEngineError("data-load-failed", 'The "data" option must be a URL, an ArrayBuffer or a typed array.');
  let response;
  try { response = await fetch(String(source), { signal }); }
  catch (error) { if (signal?.aborted) throw error; throw new ParticleEngineError("data-load-failed", `Could not fetch particle data from ${source}.`, error); }
  if (!response.ok) throw new ParticleEngineError("data-load-failed", `Could not load particle data from ${source} (HTTP ${response.status}).`);
  return response.arrayBuffer();
}

async function loadConfig(source, signal) {
  if (source && typeof source.then === "function") source = await source;
  if (source && typeof source === "object") return parseConfig(source);
  let response;
  try { response = await fetch(String(source), { signal }); }
  catch (error) { if (signal?.aborted) throw error; throw new ParticleEngineError("config-invalid", `Could not fetch the scene config from ${source}.`, error); }
  if (!response.ok) throw new ParticleEngineError("config-invalid", `Could not load the scene config from ${source} (HTTP ${response.status}).`);
  return parseConfig(await response.text());
}

const fill = (n, value) => new Float32Array(n).fill(value);

/** Turns decoded container attributes into either a static GPU set or simulation input. Zero-copy where the storage type allows. */
function prepareData(decoded, config) {
  const n = decoded.count;
  const read = (name, fallback) => readFloat32(decoded, name) ?? fallback;
  const pos = readFloat32(decoded, "position");
  const t = read("t", fill(n, 0.5)), size = read("size", fill(n, 1)), alpha = read("alpha", fill(n, 1)), phase = read("phase", fill(n, 0));
  const layer = readRaw(decoded, "layer") ?? new Uint8Array(n);
  const active = Math.min(n, Math.max(1, config.data.active));
  if (!__PS_SIMULATION__ || !config.engine.simulation) {
    const normalAttr = decoded.attributes.normal;
    let nrm8;
    if (!normalAttr) nrm8 = new Int8Array(n * 3);
    else if (normalAttr.dtype === "i8") nrm8 = readRaw(decoded, "normal");
    else nrm8 = toInt8Normals(readFloat32(decoded, "normal"), n);
    return { kind: "fixed", fixed: { n: active, pos, vel: readFloat32(decoded, "velocity") ?? null, nrm8, misc: buildMisc(n, t, size, alpha, layer, phase) } };
  }
  return {
    kind: "simulated",
    formation: { n, pos, nrm: read("normal", new Float32Array(n * 3)), t, size, alpha, phase, weight: read("weight", fill(n, 1)), layer, radius: config.data.radius },
    velocity: read("velocity", new Float32Array(n * 3)),
    homeBase: read("homeBase", pos),
    active,
  };
}

function makeStaticSim(radius) {
  const pointer = () => ({ active: false, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1, vx: 0, vy: 0, vz: 0, radius: 0, strength: 0, tool: "none" });
  return { pointers: [pointer(), pointer(), pointer(), pointer()], radius, burst() {} };
}

const hostWindow = () => (typeof window === "undefined" ? null : window);

/* ───────────── the scene ───────────── */

class ParticleScene {
  constructor(container, options) {
    this.id = ++sceneCounter;
    this.container = container;
    this.options = options;
    this.state = "idle";
    this.config = null;
    this.playing = options.autoplay !== false;
    this.pausedByMotion = false;
    this.visible = true;
    this.docVisible = typeof document === "undefined" || !document.hidden;
    this.dirty = true;
    this.raf = 0;
    this.last = 0;
    this.time = 0;
    this.lastVisibleAt = performance.now();
    this._three = null;
    this._renderer = null;
    this._canvas = null;
    this._poster = null;
    this._pointer = null;
    this._sim = null;
    this._data = null;
    this._camera = new OrbitCamera();
    this._input = null;
    this._abort = new AbortController();
    this._observers = [];
    this._suppressBurst = false;
    this._resScale = 1;
    this._ema = 0;
    this._adaptCooldown = 0;
    this._lastDpr = 0;
    this._needsResize = true;
    this._restorePosition = null;
    this._destroyed = false;
    this._frame = this._frame.bind(this);
    this.ready = new Promise((resolve, reject) => { this._resolveReady = resolve; this._rejectReady = reject; });
    this.ready.catch(() => {});
    const interactionProxy = this;
    this._interaction = {
      get tool() { return interactionProxy.config.interaction.tool; },
      get radius() { return interactionProxy.config.interaction.radius; },
      get strength() { return interactionProxy.config.interaction.strength; },
      get dragMode() { return interactionProxy.config.interaction.orbit ? "orbit" : "force"; },
      get clickAction() { return interactionProxy._suppressBurst ? "none" : interactionProxy.config.interaction.clickAction; },
    };
    this._mount();
    registry.add(this);
  }

  /* public ---------------------------------------------------------- */

  /** The canvas currently showing the scene. It is replaced when a scene sleeps and wakes again. */
  get canvas() { return this._canvas; }
  get isPlaying() { return this.playing && !this._destroyed; }
  get info() {
    const r = this._renderer;
    return {
      version: ENGINE_VERSION, state: this.state, mode: this.config?.mode ?? null, count: this.config?.data.count ?? 0,
      simulation: !!(__PS_SIMULATION__ && this.config?.engine.simulation), hdr: r ? r.info.hdr : false,
      width: r ? r.width : 0, height: r ? r.height : 0, pixelRatio: r ? r.pixelRatio : 0, resolutionScale: this._resScale, playing: this.playing,
    };
  }

  play() {
    if (this._destroyed) return;
    this.pausedByMotion = false;
    this.playing = true;
    this.last = 0;
    if (this.state === "paused") this._setState("ready");
    this._schedule();
  }

  pause() {
    if (this._destroyed) return;
    this.playing = false;
    this.last = 0;
    this._setState(this.state === "ready" ? "paused" : this.state);
  }

  resize() {
    if (this._destroyed) return;
    this._needsResize = true;
    this.requestDraw();
  }

  /** Draws on the next frame even when paused. Cheap to call repeatedly. */
  requestDraw() {
    if (this._destroyed) return;
    this.dirty = true;
    this._schedule();
  }

  /** Shorthand: true / false toggles interaction, an object patches the interaction block of the config. */
  setInteraction(patch) {
    if (this._destroyed) return;
    const next = typeof patch === "boolean" ? { enabled: patch } : patch;
    this.updateConfig({ interaction: next });
  }

  /** Deep-merges a partial config (look, camera, layers, interaction, render, animation, simulation). Data and mode are fixed per export. */
  updateConfig(patch) {
    if (this._destroyed || !patch || typeof patch !== "object") return;
    const clean = { ...patch };
    for (const key of LOCKED_CONFIG_KEYS) {
      if (key in clean) { console.warn(`[particle-engine] updateConfig ignores "${key}": it is fixed by the exported data.`); delete clean[key]; }
    }
    if (!this.config) { this._pendingPatches = [...(this._pendingPatches || []), clean]; return; }
    this.config = mergeConfig(this.config, clean);
    if (clean.scene) {
      this._renderer?.markPaletteDirty();
      if (clean.scene.camera) this._camera.apply(this.config.scene.camera);
    }
    if (clean.render && this._renderer) {
      this._renderer.setPixelRatioCap(this.config.render.pixelRatio);
      this._needsResize = true;
    }
    if (clean.simulation && this._sim && __PS_SIMULATION__) {
      this._sim.configure(this.config.simulation.sim, this.config.simulation.behaviors, this.config.simulation.deformers, QUALITY[this.config.render.quality]);
    }
    if (clean.interaction) this._applyInteraction();
    if (clean.animation && typeof clean.animation.enabled === "boolean") { if (clean.animation.enabled) this.play(); else this.pause(); }
    this.requestDraw();
  }

  /** Renders one frame synchronously and returns it as a PNG data URL. Used by the visual comparison workflow. */
  capture() {
    if (this._destroyed || !this.config) throw new ParticleEngineError("not-ready", "capture() needs a loaded scene.");
    if (!this._renderer) this._wake();
    this._drawNow();
    return this._canvas.toDataURL("image/png");
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    registry.delete(this);
    this._abort.abort();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const dispose of this._observers) dispose();
    this._observers = [];
    this._teardownInteraction();
    this._disposeRenderer();
    this._poster?.remove();
    this._poster = null;
    this._messageEl?.remove();
    if (this._restorePosition !== null) this.container.style.position = this._restorePosition;
    this.container.removeAttribute("data-ps-state");
    this.container.removeAttribute("data-ps-engine");
    this.state = "destroyed";
    this._three = null;
    this._data = null;
    this._sim = null;
    this._input = null;
    this._resolveReady(this);
  }

  /* mounting and loading --------------------------------------------- */

  _mount() {
    const win = hostWindow();
    const c = this.container;
    if (win && win.getComputedStyle(c).position === "static") { this._restorePosition = c.style.position; c.style.position = "relative"; }
    c.setAttribute("data-ps-engine", ENGINE_VERSION);
    this._setState("idle");

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => { this._needsResize = true; this.requestDraw(); });
      ro.observe(c);
      this._observers.push(() => ro.disconnect());
    }
    const onWindowResize = () => { this._needsResize = true; this.requestDraw(); };
    win?.addEventListener("resize", onWindowResize);
    this._observers.push(() => win?.removeEventListener("resize", onWindowResize));

    const onVisibility = () => {
      this.docVisible = !document.hidden;
      if (this.docVisible) { this.last = 0; this.dirty = true; this._schedule(); }
      else if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    };
    document.addEventListener("visibilitychange", onVisibility);
    this._observers.push(() => document.removeEventListener("visibilitychange", onVisibility));

    if (win?.matchMedia && this.options.respectReducedMotion !== false) {
      const mq = win.matchMedia("(prefers-reduced-motion: reduce)");
      const onMotion = () => {
        if (mq.matches && this.playing) { this.pausedByMotion = true; this.pause(); }
        else if (!mq.matches && this.pausedByMotion) { this.play(); }
      };
      if (mq.matches && this.options.autoplay !== false) { this.playing = false; this.pausedByMotion = true; }
      mq.addEventListener?.("change", onMotion);
      this._observers.push(() => mq.removeEventListener?.("change", onMotion));
    }

    const lazy = this.options.lazy !== false && typeof IntersectionObserver !== "undefined";
    if (typeof IntersectionObserver !== "undefined") {
      let started = !lazy;
      const margin = typeof this.options.lazy === "object" && this.options.lazy?.rootMargin ? this.options.lazy.rootMargin : "200px";
      const io = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        this.visible = entry.isIntersecting;
        if (this.visible) {
          this.lastVisibleAt = performance.now();
          if (!started) { started = true; void this._init(); return; }
          if (this.state === "sleeping") this._wake();
          this.last = 0;
          this.dirty = true;
          this._schedule();
        } else if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
      }, { rootMargin: margin });
      io.observe(c);
      this._observers.push(() => io.disconnect());
      if (!lazy) void this._init();
    } else {
      void this._init();
    }
  }

  async _init() {
    if (this._destroyed || this.state === "loading") return;
    this._setState("loading");
    try {
      const signal = this._abort.signal;
      const o = this.options;
      const [config, three, bytes] = await Promise.all([loadConfig(o.config, signal), loadThree(o), loadBytes(o.data, signal)]);
      if (this._destroyed) return;
      let decoded;
      try { decoded = decodePsb(bytes); }
      catch (error) { throw new ParticleEngineError("data-invalid", error instanceof PsbError ? error.message : "The particle data could not be read.", error); }
      if (config.engine.simulation && !__PS_SIMULATION__) throw new ParticleEngineError("unsupported-engine", `This scene was exported in "${config.mode}" mode, which needs the full engine. This particle-engine.js is the lightweight Hero build; re-export or use the matching engine file.`);
      if (decoded.count !== config.data.count) throw new ParticleEngineError("data-invalid", `Config expects ${config.data.count} particles but the data file holds ${decoded.count}. The two files come from different exports.`);

      this.config = config;
      if (this._pendingPatches) { for (const patch of this._pendingPatches) this.config = mergeConfig(this.config, patch); this._pendingPatches = null; }
      if (o.pixelRatio != null) this.config.render.pixelRatio = o.pixelRatio;
      if (o.interaction === false) this.config.interaction.enabled = false;
      if (o.animation === false) this.playing = false;
      this._three = three;
      this._data = prepareData(decoded, this.config);
      this.time = this.config.state.time;
      this._camera.apply(this.config.scene.camera);
      this._camera.yawVel = this.config.state.cameraYawVelocity || 0;
      this._camera.pitchVel = this.config.state.cameraPitchVelocity || 0;
      if (__PS_SIMULATION__ && this._data.kind === "simulated") {
        const sim = new Simulation();
        const quality = QUALITY[this.config.render.quality];
        sim.configure(this.config.simulation.sim, this.config.simulation.behaviors, this.config.simulation.deformers, quality);
        sim.load(this._data.formation);
        sim.vel.set(this._data.velocity);
        sim.homeBase.set(this._data.homeBase);
        sim.active = this._data.active;
        sim.time = this.config.state.time;
        sim.tick = this.config.state.tick;
        this._sim = sim;
        this._data = { kind: "simulated" };
      }
      this._makeBudgetRoom();
      this._createRenderer();
      this._input = this._buildInput();
      this.dirty = true;
      this._setState(this.playing ? "ready" : "paused");
      this._drawNow();
      this.last = 0;
      this._schedule();
      this.options.onReady?.(this);
      this._resolveReady(this);
    } catch (error) {
      if (this._destroyed || error?.name === "AbortError") return;
      this._fail(error);
    }
  }

  _fail(error) {
    const err = error instanceof ParticleEngineError ? error
      : error instanceof ConfigError ? new ParticleEngineError("config-invalid", error.message, error)
        : /webgl/i.test(String(error?.message)) ? new ParticleEngineError("webgl-unsupported", "This browser could not create a WebGL2 context, which the 3D scene needs.", error)
          : new ParticleEngineError("engine-error", String(error?.message ?? error), error);
    this._setState("error");
    this.error = err;
    if (this.options.errorUI === "message") this._showMessage(err);
    if (this.options.onError) this.options.onError(err); else console.error(`[particle-engine] ${err.code}: ${err.message}`, err.cause ?? "");
    this._rejectReady(err);
  }

  _showMessage(err) {
    const el = document.createElement("div");
    el.className = "ps-particle__message";
    el.setAttribute("role", "alert");
    el.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font:14px/1.5 system-ui,sans-serif;color:#cfd6e6;background:rgba(5,7,13,.92);z-index:2";
    el.textContent = `3D scene unavailable: ${err.message}`;
    this.container.appendChild(el);
    this._messageEl = el;
  }

  _setState(state) {
    this.state = state;
    this.container.setAttribute("data-ps-state", state);
  }

  /* GL lifecycle ------------------------------------------------------ */

  _createRenderer() {
    const canvas = document.createElement("canvas");
    canvas.className = "ps-particle__canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", this.options.label || `${this.config.name} (interactive 3D particle scene)`);
    canvas.style.cssText = "display:block;position:absolute;inset:0;width:100%;height:100%;outline:none";
    this.container.appendChild(canvas);
    this._canvas = canvas;
    const Renderer = rendererClassFor(this._three);
    try {
      this._renderer = new Renderer(canvas, { pixelRatioCap: this.config.render.pixelRatio, autoResize: false, preserveDrawingBuffer: !!this.options.preserveDrawingBuffer });
    } catch (error) {
      canvas.remove();
      this._canvas = null;
      throw error;
    }
    this._renderer.setResolutionScale(this._resScale);
    canvas.addEventListener("webglcontextlost", this._onContextLost = (event) => { event.preventDefault(); });
    canvas.addEventListener("webglcontextrestored", this._onContextRestored = () => { this._needsResize = true; this.requestDraw(); });
    this._lastDpr = window.devicePixelRatio || 1;
    this._applyInteraction();
  }

  _disposeRenderer() {
    if (this._canvas && this._onContextLost) {
      this._canvas.removeEventListener("webglcontextlost", this._onContextLost);
      this._canvas.removeEventListener("webglcontextrestored", this._onContextRestored);
    }
    this._renderer?.dispose();
    this._renderer = null;
    this._canvas?.remove();
    this._canvas = null;
  }

  /** Keeps at most `maxActiveContexts` WebGL contexts alive by putting the longest-offscreen scene to sleep. */
  _makeBudgetRoom() {
    let awake = [];
    for (const scene of registry) if (scene !== this && scene._renderer) awake.push(scene);
    if (awake.length < maxActiveContexts) return;
    const sleepers = awake.filter((scene) => !scene.visible).sort((a, b) => a.lastVisibleAt - b.lastVisibleAt);
    const victim = sleepers[0];
    if (victim) { victim._sleep(); return; }
    if (!warnedContextBudget) { warnedContextBudget = true; console.warn(`[particle-engine] more than ${maxActiveContexts} scenes are visible at once; browsers limit WebGL contexts (about 16), so older scenes may be lost.`); }
  }

  _sleep() {
    if (!this._renderer || this._destroyed) return;
    let poster = null;
    try {
      this._drawNow();
      const w = this._canvas.width, h = this._canvas.height;
      if (w > 1 && h > 1) {
        const scale = Math.min(1, 640 / w);
        poster = document.createElement("canvas");
        poster.width = Math.max(1, Math.round(w * scale));
        poster.height = Math.max(1, Math.round(h * scale));
        poster.className = "ps-particle__canvas ps-particle__poster";
        poster.style.cssText = "display:block;position:absolute;inset:0;width:100%;height:100%";
        poster.getContext("2d").drawImage(this._canvas, 0, 0, poster.width, poster.height);
      }
    } catch { poster = null; }
    this._teardownInteraction();
    this._disposeRenderer();
    if (poster) { this.container.appendChild(poster); this._poster = poster; }
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    this._setState("sleeping");
  }

  _wake() {
    if (this._renderer || this._destroyed || !this.config) return;
    this._makeBudgetRoom();
    this._createRenderer();
    this._poster?.remove();
    this._poster = null;
    this._setState(this.playing ? "ready" : "paused");
    this._needsResize = true;
    this.dirty = true;
    this._schedule();
  }

  /* interaction -------------------------------------------------------- */

  _teardownInteraction() {
    this._pointer?.dispose();
    this._pointer = null;
    for (const dispose of this._interactionDisposers || []) dispose();
    this._interactionDisposers = [];
  }

  _applyInteraction() {
    this._teardownInteraction();
    const canvas = this._canvas, cfg = this.config?.interaction;
    if (!canvas || !cfg) return;
    if (!cfg.enabled) { canvas.style.pointerEvents = "none"; canvas.style.touchAction = ""; return; }
    canvas.style.pointerEvents = "";
    const on = (type, handler, opts) => { canvas.addEventListener(type, handler, opts); this._interactionDisposers.push(() => canvas.removeEventListener(type, handler, opts)); };
    // Registered before the PointerController so these capture-phase guards run first on the canvas.
    on("wheel", (event) => {
      const zoom = this.config.interaction.zoom;
      if (zoom === "always" || (zoom === "modifier" && (event.ctrlKey || event.metaKey))) { this.requestDraw(); return; }
      event.stopImmediatePropagation();
    }, { capture: true });
    on("pointercancel", () => {
      // A cancelled touch is the browser taking over for page scrolling: never count it as a tap.
      this._suppressBurst = true;
      setTimeout(() => { this._suppressBurst = false; }, 0);
    }, { capture: true });
    const wake = (event) => { if (event.type !== "pointermove" || event.buttons) this.requestDraw(); };
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) on(type, wake, { passive: true });
    const sim = __PS_SIMULATION__ && this._sim ? this._sim : makeStaticSim(this.config.data.radius);
    this._pointer = new PointerController(canvas, this._camera, sim, () => this._interaction);
    canvas.style.touchAction = cfg.touch === "capture" ? "none" : "pan-y";
  }

  /* frame loop ---------------------------------------------------------- */

  _buildInput() {
    const sim = __PS_SIMULATION__ && this._sim;
    const base = {
      n: 0, time: this.time, camera: this._camera, look: this.config.scene.look, layers: this.config.scene.layers, beams: this.config.scene.beams,
      bloomLevel: this.config.render.bloomLevel, focus: this._camera.distance, range: Math.max(0.5, this.config.data.radius),
    };
    if (sim) {
      return { ...base, n: sim.active, pos: sim.pos, vel: sim.vel, nrm: sim.nrm, t: sim.t, size: sim.size, alpha: sim.alpha, phase: sim.phase, layer: sim.layer, attrVersion: sim.attrVersion };
    }
    return { ...base, n: this._data.fixed.n, fixed: this._data.fixed };
  }

  _canRun() { return !this._destroyed && !!this._renderer && this.visible && this.docVisible; }

  _schedule() {
    if (!this.raf && this._canRun() && (this.playing || this.dirty)) this.raf = requestAnimationFrame(this._frame);
  }

  _advance(dt) {
    if (__PS_SIMULATION__ && this._sim) { this._sim.update(dt); this.time = this._sim.time; }
    else this.time += dt;
    this._camera.update(dt);
  }

  _frame(now) {
    this.raf = 0;
    if (!this._canRun()) return;
    const raw = this.last ? (now - this.last) / 1000 : 0;
    this.last = now;
    const animate = this.playing;
    if (animate) this._advance(Math.min(0.1, raw));
    if (animate || this.dirty) { this.dirty = false; this._drawNow(); }
    if (animate) {
      if (this.config.render.adaptive && raw > 0) this._adapt(raw);
      this._schedule();
    } else this.last = 0;
  }

  _adapt(raw) {
    this._ema = this._ema ? this._ema * 0.92 + raw * 0.08 : raw;
    const now = performance.now();
    if (now < this._adaptCooldown) return;
    // Thresholds sit well below a 30 Hz display's 33 ms frame so power-saving refresh rates are not mistaken for slow GPUs.
    if (this._ema > 1 / 24 && this._resScale > 0.6) {
      this._resScale = Math.max(0.6, this._resScale - 0.15);
      this._renderer.setResolutionScale(this._resScale);
      this._adaptCooldown = now + 1500;
      this._ema = 0;
    } else if (this._ema < 1 / 40 && this._resScale < 1) {
      this._resScale = Math.min(1, this._resScale + 0.1);
      this._renderer.setResolutionScale(this._resScale);
      this._adaptCooldown = now + 4000;
    }
  }

  _drawNow() {
    const r = this._renderer;
    if (!r || !this._input) return;
    const dpr = window.devicePixelRatio || 1;
    if (this._needsResize || dpr !== this._lastDpr) { this._lastDpr = dpr; this._needsResize = false; r.resize(); }
    const input = this._input, cfg = this.config;
    input.time = this.time;
    input.look = cfg.scene.look;
    input.layers = cfg.scene.layers;
    input.beams = cfg.scene.beams;
    input.bloomLevel = cfg.render.bloomLevel;
    input.focus = this._camera.distance;
    if (__PS_SIMULATION__ && this._sim) { input.n = this._sim.active; input.attrVersion = this._sim.attrVersion; }
    r.render(input, !!(this.options.transparent || cfg.scene.look.transparent));
  }
}

/**
 * Creates a scene inside `container`.
 *
 * @param {object} options
 * @param {string | HTMLElement} options.container  CSS selector or element. The engine adds one <canvas> to it.
 * @param {string | ArrayBuffer | ArrayBufferView | Promise<ArrayBuffer>} options.data  particle-data.bin URL or bytes.
 * @param {string | object} options.config  particle-config.json URL or the parsed object.
 * @param {boolean | { rootMargin?: string }} [options.lazy=true]  Load and start only when the container nears the viewport.
 *        With lazy:false the returned promise waits for the first frame and rejects on any error.
 * @param {boolean} [options.autoplay=true]  false starts paused (single still frame).
 * @param {boolean} [options.respectReducedMotion=true]  Start paused for users who prefer reduced motion.
 * @param {boolean} [options.interaction]  false disables all pointer handling.
 * @param {number} [options.pixelRatio]  Cap for devicePixelRatio (overrides the config).
 * @param {boolean} [options.transparent]  Composite over the page instead of the scene background.
 * @param {number} [options.maxActiveContexts=8]  Offscreen scenes beyond this many sleep to free their WebGL context.
 * @param {object} [options.three]  An already-imported Three.js namespace to share.
 * @param {string} [options.threeUrl]  Alternative Three.js module URL.
 * @param {(error: ParticleEngineError) => void} [options.onError]
 * @param {(scene: ParticleScene) => void} [options.onReady]
 * @param {"none" | "message"} [options.errorUI="none"]
 * @returns {Promise<ParticleScene>}
 */
export async function createParticleScene(options = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") throw new ParticleEngineError("no-dom", "createParticleScene needs a browser environment.");
  const target = typeof options.container === "string" ? document.querySelector(options.container) : options.container;
  if (!(target instanceof HTMLElement)) throw new ParticleEngineError("container-not-found", `Container ${typeof options.container === "string" ? `"${options.container}"` : "element"} was not found.`);
  if (options.data == null) throw new ParticleEngineError("data-load-failed", 'The "data" option is required.');
  if (options.config == null) throw new ParticleEngineError("config-invalid", 'The "config" option is required.');
  if (typeof options.maxActiveContexts === "number" && options.maxActiveContexts >= 1) maxActiveContexts = Math.floor(options.maxActiveContexts);
  const scene = new ParticleScene(target, options);
  if (options.lazy === false) await scene.ready;
  return scene;
}
