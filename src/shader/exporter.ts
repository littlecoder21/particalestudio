import {
  VERTEX_SOURCE,
  buildFragmentSource,
  motionOf,
  staticUniforms,
} from "./builder";
import { GENERATOR_MAP } from "./generators";
import type { ShaderProject } from "./types";

/* ───────────────────────── bundle ───────────────────────── */

export interface ShaderCodeBundle {
  standaloneHtml: string;
  html: string;
  css: string;
  javascript: string;
  fragment: string;
  react: string;
  json: string;
  readme: string;
}

export const EXPORT_FORMATS = [
  { id: "standaloneHtml", label: "Standalone HTML", file: "shader.html", mime: "text/html" },
  { id: "html", label: "HTML document", file: "index.html", mime: "text/html" },
  { id: "css", label: "CSS stylesheet", file: "style.css", mime: "text/css" },
  { id: "javascript", label: "JavaScript runtime", file: "shader.js", mime: "text/javascript" },
  { id: "fragment", label: "Fragment shader (GLSL)", file: "shader.frag", mime: "text/plain" },
  { id: "react", label: "React component (TSX)", file: "ShaderBackground.tsx", mime: "text/plain" },
] as const;

export type ExportFormatId = (typeof EXPORT_FORMATS)[number]["id"];

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "shader";
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const escapeTemplate = (text: string): string =>
  text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

/** Rounds long floats so the exported config stays readable. */
function roundNumbers(value: unknown): unknown {
  if (typeof value === "number") return Number(value.toFixed(5));
  if (Array.isArray(value)) return value.map(roundNumbers);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, roundNumbers(v)]));
  }
  return value;
}

function buildConfig(p: ShaderProject): string {
  const uniforms: Record<string, number | number[]> = {};
  for (const [name, value] of staticUniforms(p)) uniforms[name] = value;
  return JSON.stringify(roundNumbers({ uniforms, motion: motionOf(p) }), null, 2);
}

/* ───────────────────────── runtime ───────────────────────── */

/**
 * The runtime is written once. `{{T:Type}}` is a TypeScript-only annotation:
 * it becomes `: Type` in the React export and disappears in the plain-JS export.
 */
const RUNTIME = /* js */`
function createShader(canvas{{T:HTMLCanvasElement}}, isPaused{{T:() => boolean}}){{T:() => void}} {
  const noop = () => {};
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) {
    canvas.setAttribute("data-shader-error", "WebGL2 is not available");
    return noop;
  }
  const GL{{T:WebGL2RenderingContext}} = gl;

  const compile = (type{{T:number}}, source{{T:string}}) => {
    const shader = GL.createShader(type);
    if (!shader) return null;
    GL.shaderSource(shader, source);
    GL.compileShader(shader);
    if (!GL.getShaderParameter(shader, GL.COMPILE_STATUS)) {
      console.error(GL.getShaderInfoLog(shader));
      GL.deleteShader(shader);
      return null;
    }
    return shader;
  };
  const vs = compile(GL.VERTEX_SHADER, VERTEX);
  const fs = compile(GL.FRAGMENT_SHADER, FRAGMENT);
  const program = GL.createProgram();
  if (!vs || !fs || !program) {
    canvas.setAttribute("data-shader-error", "Shader failed to compile");
    return noop;
  }
  GL.attachShader(program, vs);
  GL.attachShader(program, fs);
  GL.linkProgram(program);
  GL.deleteShader(vs);
  GL.deleteShader(fs);
  if (!GL.getProgramParameter(program, GL.LINK_STATUS)) {
    console.error(GL.getProgramInfoLog(program));
    canvas.setAttribute("data-shader-error", "Shader failed to link");
    return noop;
  }
  GL.useProgram(program);
  const vao = GL.createVertexArray();
  GL.bindVertexArray(vao);

  const cache{{T:Map<string, WebGLUniformLocation | null>}} = new Map();
  const loc = (name{{T:string}}) => {
    if (!cache.has(name)) cache.set(name, GL.getUniformLocation(program, name));
    return cache.get(name) ?? null;
  };
  const set = (name{{T:string}}, value{{T:number | number[]}}) => {
    const l = loc(name);
    if (l === null) return;
    if (typeof value === "number") GL.uniform1f(l, value);
    else if (name === "uPal[0]") GL.uniform3fv(l, value);
    else if (value.length === 2) GL.uniform2fv(l, value);
    else if (value.length === 3) GL.uniform3fv(l, value);
    else GL.uniform4fv(l, value);
  };
  for (const name of Object.keys(CONFIG.uniforms)) set(name, CONFIG.uniforms[name]);

  /* sizing — the buffer follows the canvas box; quality drops on slow GPUs */
  let quality = 1;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75) * quality;
    const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    GL.viewport(0, 0, canvas.width, canvas.height);
  };
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  if (observer) observer.observe(canvas);
  window.addEventListener("resize", resize);
  resize();

  /* pointer — listens on the window so it also works behind page content */
  const M = CONFIG.motion;
  let tx = 0, ty = 0, mx = 0, my = 0, stir = 0, press = 0, down = false, idle = 3.5;
  const ripples{{T:Ripple[]}} = [];
  let rippleIndex = 0;
  const toSpace = (cx{{T:number}}, cy{{T:number}}) => {
    const r = canvas.getBoundingClientRect();
    const h = Math.max(1, r.height);
    return [(cx - r.left - r.width / 2) / h, -(cy - r.top - r.height / 2) / h];
  };
  const onMove = (e{{T:PointerEvent}}) => {
    const p = toSpace(e.clientX, e.clientY);
    tx = p[0];
    ty = p[1];
    idle = 0;
  };
  const onDown = (e{{T:PointerEvent}}) => {
    onMove(e);
    down = true;
    if (M.ripples) ripples[rippleIndex++ % 4] = { x: tx, y: ty, t0: performance.now() };
  };
  const onUp = () => { down = false; };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);

  /* animation loop */
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const slow = reduced ? 0.35 : 1;
  const rip = new Float32Array(16);
  let time = 0, spin = 0, palette = 0, last = performance.now(), raf = 0, ema = 0.016, frames = 0, alive = true;

  const frame = (now{{T:number}}) => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (document.hidden || isPaused()) return;

    if (M.playing) {
      time += dt * M.speed * slow;
      spin += dt * M.spin * slow;
      palette += dt * M.paletteSpeed * 0.08 * slow;
    }
    idle += dt;
    let targetX = tx, targetY = ty;
    if (M.idleDrift && idle > 3) {
      const k = now / 1000;
      targetX = Math.sin(k * 0.21) * 0.28;
      targetY = Math.cos(k * 0.17) * 0.18;
    }
    const px = mx, py = my, k1 = Math.min(1, dt * 7);
    mx += (targetX - mx) * k1;
    my += (targetY - my) * k1;
    const speed = Math.hypot(mx - px, my - py) / Math.max(dt, 1e-3);
    stir += (Math.min(1, speed * 0.8) - stir) * Math.min(1, dt * 4);
    press += ((down ? 1 : 0) - press) * Math.min(1, dt * (down ? 2.2 : 1.6));

    const clock = performance.now();
    for (let i = 0; i < 4; i++) {
      const r = ripples[i];
      const age = r ? (clock - r.t0) / 1000 : 99;
      if (r && age < 5) { rip[i * 4] = r.x; rip[i * 4 + 1] = r.y; rip[i * 4 + 2] = age; rip[i * 4 + 3] = 1; }
      else { rip[i * 4] = 0; rip[i * 4 + 1] = 0; rip[i * 4 + 2] = -1; rip[i * 4 + 3] = 0; }
    }
    set("uRes", [canvas.width, canvas.height]);
    set("uTime", time);
    set("uRot", M.rotation + spin);
    set("uPalShift", M.paletteShift + palette);
    set("uMouse", [mx, my]);
    set("uStir", stir);
    set("uPress", press);
    const ripLoc = loc("uRip[0]");
    if (ripLoc !== null) GL.uniform4fv(ripLoc, rip);
    GL.drawArrays(GL.TRIANGLES, 0, 3);

    ema = ema * 0.95 + dt * 0.05;
    frames++;
    if (frames % 90 === 0 && ema > 0.026 && quality > 0.5) {
      quality *= 0.82;
      ema = 0.016;
      resize();
    }
  };
  raf = requestAnimationFrame(frame);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    if (observer) observer.disconnect();
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    GL.deleteProgram(program);
    GL.deleteVertexArray(vao);
    const lose = GL.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
  };
}
`;

const runtime = (typed: boolean): string =>
  RUNTIME.replace(/\{\{T:([^}]*)\}\}/g, (_m, type: string) => (typed ? `: ${type}` : ""));

const indent = (text: string, pad: string): string =>
  text.split("\n").map((line) => (line ? pad + line : line)).join("\n");

/* ───────────────────────── files ───────────────────────── */

function buildCss(p: ShaderProject): string {
  const bg = p.palette[0] ?? "#000000";
  return `/* ${p.name} — generated by Particle Studio · Shader Studio */
:root {
  --shader-bg: ${bg};
  color-scheme: dark;
}

* { box-sizing: border-box; }

html,
body {
  min-height: 100%;
  margin: 0;
  background: var(--shader-bg);
  color: #fff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

/* The shader fills the viewport. Put your content above it (z-index > 0). */
#shader-canvas {
  position: fixed;
  inset: 0;
  z-index: 0;
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.hero {
  position: relative;
  z-index: 1;
  display: grid;
  min-height: 100vh;
  place-content: center;
  padding: 32px;
  text-align: center;
  pointer-events: none;
}

.hero h1 {
  margin: 0;
  font-size: clamp(2.4rem, 8vw, 6rem);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
  text-shadow: 0 6px 40px rgba(0, 0, 0, 0.35);
}

.hero p {
  margin: 14px 0 0;
  font-size: clamp(0.95rem, 2vw, 1.15rem);
  opacity: 0.8;
}

/* Shown only when WebGL2 is unavailable */
#shader-canvas[data-shader-error] {
  background: radial-gradient(circle at 50% 40%, ${p.palette[Math.min(2, p.palette.length - 1)] ?? "#444"}, ${bg});
}
`;
}

function buildHtml(p: ShaderProject, tag: string, inline: { css?: string; js?: string } = {}): string {
  const title = escapeHtml(p.name);
  const style = inline.css ? `<style>\n${indent(inline.css, "    ")}\n    </style>` : `<link rel="stylesheet" href="style.css" />`;
  const script = inline.js ? `<script>\n${indent(inline.js.replace(/<\/script/gi, "<\\/script"), "    ")}\n    </script>` : `<script src="shader.js"></script>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    ${style}
  </head>
  <body>
    <canvas id="shader-canvas" aria-hidden="true"></canvas>
    <main class="hero">
      <h1>${title}</h1>
      <p>${escapeHtml(tag)}</p>
    </main>
    ${script}
  </body>
</html>
`;
}

function buildJavascript(p: ShaderProject): string {
  const frag = escapeTemplate(buildFragmentSource(p));
  const vert = escapeTemplate(VERTEX_SOURCE);
  return `/* ${p.name} — generated by Particle Studio · Shader Studio
 * Generator: ${GENERATOR_MAP[p.generator].name}${p.overlay.enabled ? ` + ${GENERATOR_MAP[p.overlay.generator].name} overlay` : ""}
 *
 * Usage:
 *   <canvas id="shader-canvas"></canvas>
 *   <script src="shader.js"></script>
 *
 * The script starts automatically. To control it yourself:
 *   const stop = ShaderFX.create(document.querySelector("canvas"), () => false);
 *   stop(); // removes listeners and frees the GPU context
 */
(function () {
  "use strict";

  const VERTEX = \`${vert}\`;
  const FRAGMENT = \`${frag}\`;

  const CONFIG = ${buildConfig(p)};
${indent(runtime(false), "  ")}

  window.ShaderFX = { create: createShader, config: CONFIG };

  const start = () => {
    const canvas = document.getElementById("shader-canvas");
    if (canvas) createShader(canvas, () => false);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
`;
}

function buildReact(p: ShaderProject): string {
  const frag = escapeTemplate(buildFragmentSource(p));
  const vert = escapeTemplate(VERTEX_SOURCE);
  return `/**
 * ${p.name} — generated by Particle Studio · Shader Studio
 *
 * Drop this file into your project and render <ShaderBackground />.
 * The canvas fills its parent, so give the parent a size (or position: fixed; inset: 0).
 *
 *   <div style={{ position: "fixed", inset: 0 }}>
 *     <ShaderBackground />
 *   </div>
 */
import { useEffect, useRef, type CSSProperties } from "react";

interface Ripple {
  x: number;
  y: number;
  t0: number;
}

interface ShaderConfig {
  uniforms: Record<string, number | number[]>;
  motion: {
    speed: number;
    spin: number;
    rotation: number;
    paletteSpeed: number;
    paletteShift: number;
    idleDrift: boolean;
    ripples: boolean;
    playing: boolean;
  };
}

const VERTEX = \`${vert}\`;
const FRAGMENT = \`${frag}\`;

const CONFIG: ShaderConfig = ${buildConfig(p)};

${runtime(true)}
export interface ShaderBackgroundProps {
  className?: string;
  style?: CSSProperties;
  /** Freeze the animation without tearing down the GPU context. */
  paused?: boolean;
}

export function ShaderBackground({ className, style, paused = false }: ShaderBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return createShader(canvas, () => pausedRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ display: "block", width: "100%", height: "100%", touchAction: "none", ...style }}
    />
  );
}

export default ShaderBackground;
`;
}

function buildReadme(p: ShaderProject): string {
  return `# ${p.name}

Generated by Particle Studio · Shader Studio.

## Files

- index.html — page with a full-screen canvas and a placeholder hero
- style.css — layout (the canvas is fixed behind your content)
- shader.js — the WebGL2 runtime (shader source + settings are embedded)
- shader.frag — the fragment shader on its own (GLSL ES 3.00)
- project.json — the project; load it back into Shader Studio to keep editing
- react/ShaderBackground.tsx — the same shader as a React component

## Run it

Open index.html in a browser. WebGL2 is required (all current browsers).

## Tweak it

Open shader.js and edit CONFIG: "uniforms" holds every colour and strength value,
"motion" holds speed, spin and palette cycling. Keep CONFIG in sync with the
shader defines at the top of the fragment source if you change effects on/off.
`;
}

export function generateShaderCode(p: ShaderProject): ShaderCodeBundle {
  const tag = `Procedural shader · ${GENERATOR_MAP[p.generator].name}`;
  const css = buildCss(p);
  const javascript = buildJavascript(p);
  return {
    standaloneHtml: buildHtml(p, tag, { css, js: javascript }),
    html: buildHtml(p, tag),
    css,
    javascript,
    fragment: `// ${p.name} — fragment shader (GLSL ES 3.00), generated by Shader Studio\n// Uniforms are listed below; see shader.js for the values it sets each frame.\n${buildFragmentSource(p)}`,
    react: buildReact(p),
    json: JSON.stringify({ app: "particle-studio-shader", version: 1, project: p }, null, 2),
    readme: buildReadme(p),
  };
}

/* ───────────────────────── ZIP (store, no compression) ───────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = (CRC_TABLE[(crc ^ (data[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  content: string;
}

export function buildZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const head = new Uint8Array(46 + name.length);
    const hv = new DataView(head.buffer);
    hv.setUint32(0, 0x02014b50, true);
    hv.setUint16(4, 20, true);
    hv.setUint16(6, 20, true);
    hv.setUint16(8, 0x0800, true);
    hv.setUint16(10, 0, true);
    hv.setUint16(12, dosTime, true);
    hv.setUint16(14, dosDate, true);
    hv.setUint32(16, crc, true);
    hv.setUint32(20, data.length, true);
    hv.setUint32(24, data.length, true);
    hv.setUint16(28, name.length, true);
    hv.setUint32(42, offset, true);
    head.set(name, 46);

    parts.push(local, data);
    central.push(head);
    offset += local.length + data.length;
  }

  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end] as unknown as BlobPart[], { type: "application/zip" });
}

/** The full web bundle: page, stylesheet, runtime, GLSL, project file and React component. */
export function buildProjectZip(p: ShaderProject): Blob {
  const code = generateShaderCode(p);
  return buildZip([
    { name: "index.html", content: code.html },
    { name: "style.css", content: code.css },
    { name: "shader.js", content: code.javascript },
    { name: "shader.frag", content: code.fragment },
    { name: "project.json", content: code.json },
    { name: "react/ShaderBackground.tsx", content: code.react },
    { name: "README.md", content: code.readme },
  ]);
}

/* ───────────────────────── project JSON ───────────────────────── */

/** Pulls the project out of a file saved by Shader Studio (also accepts a bare project object). */
export function extractProject(text: string): unknown {
  const parsed: unknown = JSON.parse(text);
  if (parsed && typeof parsed === "object" && "project" in parsed) return (parsed as { project: unknown }).project;
  return parsed;
}
