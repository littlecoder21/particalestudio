import type { Formation, Project3D } from "./types";
import { serializeProject } from "./project";

export const EXPORT_FORMATS = [
  { id: "standaloneHtml", label: "Standalone HTML", file: "scene.html", mime: "text/html" },
  { id: "html", label: "HTML document", file: "index.html", mime: "text/html" },
  { id: "css", label: "CSS stylesheet", file: "style.css", mime: "text/css" },
  { id: "javascript", label: "JavaScript runtime", file: "scene.js", mime: "text/javascript" },
  { id: "data", label: "Particle data (JavaScript)", file: "scene-data.js", mime: "text/javascript" },
  { id: "react", label: "React component (TSX)", file: "Scene3D.tsx", mime: "text/typescript" },
  { id: "json", label: "Project JSON", file: "project.particle3d.json", mime: "application/json" },
] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number]["id"];
export type CodeBundle = Record<ExportFormat, string> & { readme: string };

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "particle-scene";
const jsonForScript = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

export interface ExportSimulationState {
  active: number;
  velocity: Float32Array;
  homeBase: Float32Array;
  time: number;
  tick: number;
  cameraYawVelocity: number;
  cameraPitchVelocity: number;
}

function packFormation(formation: Formation, state: ExportSimulationState): { packed: string; radius: number } {
  const { n, pos, nrm, t, size, alpha, phase, weight, layer } = formation, bytes = new Uint8Array(n * 69), view = new DataView(bytes.buffer);
  const radius = Math.max(formation.radius, 0.1);
  for (let i = 0; i < n; i++) {
    const o = i * 3, at = i * 69;
    for (let axis = 0; axis < 3; axis++) {
      view.setFloat32(at + axis * 4, pos[o + axis], true);
      view.setFloat32(at + 12 + axis * 4, nrm[o + axis], true);
      view.setFloat32(at + 24 + axis * 4, state.velocity[o + axis], true);
      view.setFloat32(at + 36 + axis * 4, state.homeBase[o + axis], true);
    }
    view.setFloat32(at + 48, t[i], true);
    view.setFloat32(at + 52, size[i], true);
    view.setFloat32(at + 56, alpha[i], true);
    view.setFloat32(at + 60, phase[i], true);
    view.setFloat32(at + 64, weight[i], true);
    bytes[at + 68] = Math.min(3, layer[i]);
  }
  let binary = "";
  const chunk = 0x8000;
  for (let start = 0; start < bytes.length; start += chunk) {
    binary += String.fromCharCode(...bytes.subarray(start, Math.min(bytes.length, start + chunk)));
  }
  return { packed: btoa(binary), radius };
}

const makeCss = (background: string, transparent: boolean) => `:root{color-scheme:dark;font-family:system-ui,sans-serif;background:${transparent ? "transparent" : background};color:#eef2ff}*{box-sizing:border-box}html,body,#scene{width:100%;height:100%;margin:0;overflow:hidden}#scene{display:block;touch-action:none;background:transparent;cursor:grab}#scene:active{cursor:grabbing}.scene-label{position:fixed;left:16px;bottom:14px;color:#aab4ca;font:12px system-ui;pointer-events:none;text-shadow:0 1px 5px #000}.animation-toggle{position:fixed;right:16px;bottom:12px;padding:8px 11px;border:1px solid #ffffff35;border-radius:8px;background:#0b1020cc;color:#eef2ff;font:12px system-ui;cursor:pointer}`;

function runtime(dataScript: string, engineRuntime: string): string {
  return `import * as THREE from ${JSON.stringify(THREE_CDN)};\nwindow.THREE=THREE;\n${dataScript}\n${engineRuntime}`;
}

export function generate3DCode(project: Project3D, formation: Formation, engineRuntime: string, state: ExportSimulationState): CodeBundle {
  const { packed, radius } = packFormation(formation, state);
  const projectJson = serializeProject(project);
  const data = `window.PARTICLE_SCENE=${jsonForScript({
    project,
    count: formation.n,
    radius,
    active: state.active,
    time: state.time,
    tick: state.tick,
    cameraYawVelocity: state.cameraYawVelocity,
    cameraPitchVelocity: state.cameraPitchVelocity,
    packed,
  })};`;
  const js = runtime("/* scene-data.js must load before this runtime. */\n", engineRuntime);
  const title = project.name.replace(/[&<>"]/g, "");
  const dragHint = project.interaction.dragMode === "orbit" ? "drag to orbit" : "drag to interact";
  const toolHint = project.interaction.tool === "none" ? "" : ` · move pointer to ${project.interaction.tool} particles`;
  const css = makeCss(project.look.background, project.look.transparent);
  const controls = `${title} · ${dragHint} · scroll to zoom · shift/right-drag to pan · pinch to zoom/pan${toolHint}`;
  const html = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="${project.look.background}"><title>${title} · 3D Particle Scene</title><link rel="stylesheet" href="style.css"></head><body><canvas id="scene" aria-label="Interactive 3D particle scene"></canvas><div class="scene-label">${controls}</div><button id="toggle-animation" class="animation-toggle" type="button" aria-pressed="false">Pause animation</button><script src="scene-data.js"></script><script type="module" src="scene.js"></script></body></html>`;
  const standaloneHtml = html.replace('<link rel="stylesheet" href="style.css">', `<style>${css}</style>`).replace('<script src="scene-data.js"></script><script type="module" src="scene.js"></script>', `<script>${data}</script><script type="module">${runtime("", engineRuntime)}</script>`);
  const component = slugify(project.name).split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("") || "ParticleScene";
  const react = `import Studio3D from "./src/studio3d/Studio3D";\nimport type { Project3D } from "./src/studio3d/types";\n\nconst initialProject: Project3D = ${projectJson};\n\nexport default function ${/^\d/.test(component) ? `Scene${component}` : component}() {\n  return <Studio3D active initialProject={initialProject} modeSwitch={null} />;\n}\n`;
  const readme = `# ${project.name} · 3D particle scene\n\nOpen scene.html in a modern browser with an internet connection. Three.js is loaded from jsDelivr; no React or Particle Studio application files are needed. The export captures the current evaluated particle positions, normals, colors, sizes, alpha, phases, layers, velocities, and camera state, then continues the preview simulation and pointer interactions with GPU rendering. Use the pause button to stop or resume particle animation.\n\nDrag to orbit, scroll to zoom, shift/right-drag to pan, or use a two-finger pinch and pan on touch screens. For separate files, keep index.html, style.css, scene.js and scene-data.js together. The WebGL renderer uses the same particle, lighting, bloom, trails, and composite shaders as the Studio preview.\n\nThe optional React component and TypeScript project config use the Particle Studio source modules.\n`;
  return {
    standaloneHtml, html, css,
    javascript: js,
    data,
    react,
    json: JSON.stringify({ app: "particle-studio-3d", version: 1, project }, null, 2),
    readme,
  };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i++) {
    let c = i;
    for (let b = 0; b < 8; b++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 255] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function build3DProjectZip(code: CodeBundle): Blob {
  const encoder = new TextEncoder(), now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const files = [
    ["index.html", code.html], ["style.css", code.css], ["scene.js", code.javascript],
    ["scene-data.js", code.data], ["project.particle3d.json", code.json],
    ["Scene3D.tsx", code.react], ["README.md", code.readme],
  ] as const;
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const [filename, content] of files) {
    const name = encoder.encode(filename), data = encoder.encode(content), crc = crc32(data);
    const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true); local.set(name, 30);
    const head = new Uint8Array(46 + name.length), hv = new DataView(head.buffer);
    hv.setUint32(0, 0x02014b50, true); hv.setUint16(4, 20, true); hv.setUint16(6, 20, true); hv.setUint16(8, 0x0800, true);
    hv.setUint16(10, 0, true); hv.setUint16(12, dosTime, true); hv.setUint16(14, dosDate, true); hv.setUint32(16, crc, true);
    hv.setUint32(20, data.length, true); hv.setUint32(24, data.length, true); hv.setUint16(28, name.length, true);
    hv.setUint32(42, offset, true); head.set(name, 46); parts.push(local, data); central.push(head); offset += local.length + data.length;
  }
  const centralSize = central.reduce((sum, entry) => sum + entry.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end] as BlobPart[], { type: "application/zip" });
}

export const exportSlug = slugify;
