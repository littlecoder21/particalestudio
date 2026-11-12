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

function packFormation(formation: Formation): { packed: string; radius: number } {
  const { n, pos, t, size, alpha, layer } = formation, bytes = new Uint8Array(n * 10), view = new DataView(bytes.buffer);
  const radius = Math.max(formation.radius, 0.1);
  for (let i = 0; i < n; i++) {
    const o = i * 3, at = i * 10;
    for (let axis = 0; axis < 3; axis++) view.setInt16(at + axis * 2, Math.round(Math.max(-1, Math.min(1, pos[o + axis] / radius)) * 32767), true);
    bytes[at + 6] = Math.round(Math.max(0, Math.min(1, t[i])) * 255);
    bytes[at + 7] = Math.round(Math.max(0, Math.min(3, size[i])) / 3 * 255);
    bytes[at + 8] = Math.round(Math.max(0, Math.min(1, alpha[i])) * 255);
    bytes[at + 9] = Math.min(3, layer[i]);
  }
  let binary = "";
  const chunk = 0x8000;
  for (let start = 0; start < bytes.length; start += chunk) {
    binary += String.fromCharCode(...bytes.subarray(start, Math.min(bytes.length, start + chunk)));
  }
  return { packed: btoa(binary), radius };
}

const css = `:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#05070d;color:#eef2ff}*{box-sizing:border-box}html,body,#scene{width:100%;height:100%;margin:0;overflow:hidden}#scene{display:block;touch-action:none;background:#05070d;cursor:grab}#scene:active{cursor:grabbing}.scene-label{position:fixed;left:16px;bottom:14px;color:#aab4ca;font:12px system-ui;pointer-events:none;text-shadow:0 1px 5px #000}`;

function runtime(dataScript: string): string {
  return `${dataScript}
(() => {
  "use strict";
  const S = window.PARTICLE_SCENE, P = S.project, L = P.look, canvas = document.getElementById("scene");
  if (!S || !canvas) return;
  const ctx = canvas.getContext("2d", { alpha: L.transparent });
  if (!ctx) { document.body.textContent = "Canvas 2D is not available in this browser."; return; }
  const raw = atob(S.packed), bytes = new Uint8Array(raw.length);
  for (let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
  const view = new DataView(bytes.buffer), n = S.count, radius = S.radius;
  const camera = P.camera, palettes = P.layers.map(layer => layer.palette || L.palette);
  let yaw = camera.yaw, pitch = camera.pitch, down = false, px = 0, py = 0, auto = camera.autoRotate;
  const resize = () => { const d=Math.min(devicePixelRatio||1,2); canvas.width=Math.max(2,Math.floor(innerWidth*d)); canvas.height=Math.max(2,Math.floor(innerHeight*d)); ctx.setTransform(d,0,0,d,0,0); };
  addEventListener("resize",resize); resize();
  const colorAt = (t, stops) => {
    let a=stops[0], b=stops[stops.length-1];
    for(let i=1;i<stops.length;i++) if(t<=stops[i].t){a=stops[i-1];b=stops[i];break;}
    const q=Math.max(0,Math.min(1,(t-a.t)/Math.max(.0001,b.t-a.t)));
    const c=x=>parseInt(x.slice(1),16), ca=c(a.color), cb=c(b.color);
    return [0,1,2].map(k=>Math.round(((ca>>(16-k*8))&255)*(1-q)+((cb>>(16-k*8))&255)*q));
  };
  canvas.addEventListener("pointerdown",e=>{down=true;px=e.clientX;py=e.clientY;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener("pointermove",e=>{if(!down)return;yaw-=(e.clientX-px)*.006;pitch=Math.max(-1.45,Math.min(1.45,pitch+(e.clientY-py)*.006));px=e.clientX;py=e.clientY;});
  const up=()=>{down=false;}; canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",up);
  canvas.addEventListener("wheel",e=>{camera.distance=Math.max(.5,Math.min(40,camera.distance*Math.exp(e.deltaY*.001)));e.preventDefault();},{passive:false});
  const fov=Math.max(15,Math.min(100,camera.fov))*Math.PI/180, size=Math.max(.002,L.size), bg=L.background||"#05070d";
  const draw=()=>{
    const w=innerWidth,h=innerHeight, scale=h/(2*Math.tan(fov/2)), cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),dist=camera.distance;
    ctx.globalCompositeOperation="source-over";ctx.globalAlpha=1;ctx.fillStyle=L.transparent?"rgba(0,0,0,0)":bg;ctx.clearRect(0,0,w,h);if(!L.transparent){ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);}
    ctx.globalCompositeOperation=L.blend==="alpha"?"source-over":"lighter";
    for(let i=0;i<n;i++){
      const o=i*10,x=view.getInt16(o,true)/32767*radius,y=view.getInt16(o+2,true)/32767*radius,z=view.getInt16(o+4,true)/32767*radius;
      const rx=x*cy-z*sy,rz=x*sy+z*cy,ry=y*cp-rz*sp,depth=dist+y*sp+rz*cp;
      if(depth<=.05)continue;
      const k=scale/depth,sx=w*.5+rx*k,sy0=h*.5-ry*k;
      if(sx< -4||sx>w+4||sy0< -4||sy0>h+4)continue;
      const at=i*10,t=bytes[at+6]/255,sz=bytes[at+7]/255*3,alpha=bytes[at+8]/255*L.opacity,li=bytes[at+9];
      const c=colorAt(t,palettes[li]||L.palette),d=Math.max(.65,Math.min(12,size*k*(1+sz)));
      ctx.globalAlpha=Math.max(0,Math.min(1,alpha));ctx.fillStyle="rgb("+c.join(",")+")";ctx.fillRect(sx-d*.5,sy0-d*.5,d,d);
    }
    ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";
    if(!down)yaw+=auto/60;
    requestAnimationFrame(draw);
  };
  draw();
})();`;
}

export function generate3DCode(project: Project3D, formation: Formation): CodeBundle {
  const { packed, radius } = packFormation(formation);
  const projectJson = serializeProject(project);
  const data = `window.PARTICLE_SCENE=${jsonForScript({ project, count: formation.n, radius, packed })};`;
  const js = runtime("/* scene-data.js must load before this runtime. */\n");
  const html = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="${project.look.background}"><title>${project.name.replace(/[&<>"]/g, "")} · 3D Particle Scene</title><link rel="stylesheet" href="style.css"></head><body><canvas id="scene" aria-label="Interactive 3D particle scene"></canvas><div class="scene-label">${project.name.replace(/[&<>"]/g, "")} · drag to orbit · scroll to zoom</div><script src="scene-data.js"></script><script src="scene.js"></script></body></html>`;
  const standaloneHtml = html.replace('<link rel="stylesheet" href="style.css">', `<style>${css}</style>`).replace('<script src="scene-data.js"></script><script src="scene.js"></script>', `<script>${runtime(data)}</script>`);
  const component = slugify(project.name).split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("") || "ParticleScene";
  const react = `import Studio3D from "./src/studio3d/Studio3D";\nimport type { Project3D } from "./src/studio3d/types";\n\nconst initialProject: Project3D = ${projectJson};\n\nexport default function ${/^\d/.test(component) ? `Scene${component}` : component}() {\n  return <Studio3D active initialProject={initialProject} modeSwitch={null} />;\n}\n`;
  const readme = `# ${project.name} · 3D particle scene\n\nOpen scene.html directly in a modern browser. It is a standalone interactive export with the particle positions embedded; drag to orbit and scroll to zoom.\n\nFor separate files, keep index.html, style.css, scene.js and scene-data.js together. WebGL is not required by the exported lightweight Canvas 2D viewer.\n\nThe React component and TypeScript project config use the Particle Studio source modules.\n`;
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
