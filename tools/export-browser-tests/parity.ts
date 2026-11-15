/**
 * Visual parity: the Studio's own GLRenderer versus the exported engine, same particles, same camera, same instant,
 * 640x400 at pixel ratio 1, rendered in the same browser on the same GPU. Prints measured differences; does not assume them.
 */
import { build } from "esbuild";
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeLightBeam } from "../../src/studio3d/lightBeams";
import { makeLayer, projectFromGenerator } from "../../src/studio3d/project";
import { buildFormation } from "../../src/studio3d/generators";
import { packParticles, type ExportMode, type CompressionLevel } from "../../src/studio3d/export/packing";
import { defaultSettings, localThree, makeScene, resetDir, serveDirectory, THREE_URL, write, writeWebsite, type SceneSpec } from "./lib";
import type { Project3D } from "../../src/studio3d/types";

const W = 640, H = 400, TIME = 3.5;
const out = join(process.env.PS_OUT ?? "/tmp/ps-browser", "parity");
resetDir(out);

const scene = (id: any, mutate: (p: Project3D) => void, count = 14000): SceneSpec => {
  const base = projectFromGenerator(id);
  return makeScene((p) => { Object.assign(p, { ...base, behaviors: [], deformers: [], beams: [] }); p.interaction = { ...p.interaction, tool: "none" }; mutate(p); }, count, TIME);
};

const ALL_SCENES: { id: string; spec: SceneSpec }[] = [
  { id: "sphere-default", spec: scene("sphere", () => {}) },
  { id: "galaxy-alpha-hard", spec: scene("galaxy", (p) => { p.look = { ...p.look, blend: "alpha", shape: "hard" }; }) },
  { id: "torus-screen-ring-lit", spec: scene("torus", (p) => { p.look = { ...p.look, blend: "screen", shape: "ring", lighting: 1, edgeBrightness: 1.4 }; }) },
  { id: "knot-lit-spark-depth", spec: scene("knot", (p) => { p.look = { ...p.look, lighting: 1, lightAzimuth: 40, lightElevation: 30, depthColor: 0.6, depthFade: 0.8, shape: "spark", sizeVariation: 0.6 }; }) },
  { id: "helix-diamond-ortho-fx", spec: scene("helix", (p) => { p.camera = { ...p.camera, projection: "orthographic" }; p.look = { ...p.look, shape: "diamond", vignette: 0.5, grain: 0.4 }; }) },
  { id: "square-attenuation-off", spec: scene("cube", (p) => { p.look = { ...p.look, shape: "square", sizeAttenuation: false, size: 3, opacity: 0.8 }; }) },
  { id: "two-layers", spec: scene("sphere", (p) => {
      p.layers = [p.layers[0]!, makeLayer("torus", { palette: [{ t: 0, color: "#ff5a36" }, { t: 1, color: "#ffd86b" }], sizeMul: 1.6, opacityMul: 0.7 })]; p.layers[0]!.share = 0.6; p.layers[1]!.share = 0.4;
    }) },
  { id: "light-beams", spec: scene("sphere", (p) => { p.beams = [makeLightBeam({ origin: [-1.6, 1.3, 0], azimuth: 90, elevation: -35, length: 3.6, width: 0.2, intensity: 1.4, seed: 1 }), makeLightBeam({ origin: [1.7, -0.85, 0.1], azimuth: -90, elevation: 25, length: 3.4, width: 0.2, intensity: 1.2, seed: 2 })]; }) },
  { id: "velocity-stretch-color", spec: scene("vortex", (p) => { p.look = { ...p.look, velocityStretch: 0.8, velocityColor: 0.6 }; }) },
  { id: "transparent-bg", spec: scene("sphere", (p) => { p.look = { ...p.look, transparent: true }; }) },
  { id: "quality-low-no-bloom", spec: scene("sphere", (p) => { p.quality = "low"; }) },
  { id: "quality-medium-bloom", spec: scene("sphere", (p) => { p.quality = "medium"; p.look = { ...p.look, glow: 1, glowRadius: 0.8 }; }) },
];
const SCENES = process.env.PS_SCENES ? ALL_SCENES.filter((s) => process.env.PS_SCENES!.split(",").includes(s.id)) : ALL_SCENES;
const VARIANTS: { id: string; mode: ExportMode; compression: CompressionLevel }[] = [
  { id: "hero-lossless", mode: "hero", compression: "off" },
  { id: "hero-compact", mode: "hero", compression: "auto" },
  { id: "animated-compact", mode: "animated", compression: "auto" },
  { id: "full", mode: "full", compression: "auto" },
];

const harness = await build({ entryPoints: ["tools/export-browser-tests/harness.ts"], bundle: true, format: "iife", platform: "browser", target: "es2020", write: false });
write(out, "harness.js", harness.outputFiles[0]!.text);
write(out, "index.html", "<!doctype html><meta charset=utf-8><body><script src=\"harness.js\"></script>");

const meta: Record<string, any> = {};
for (const { id, spec } of SCENES) {
  const source = packParticles(spec.capture.source, spec.project, { mode: "full", compression: "off" }).bytes;
  write(out, `${id}/studio.psb`, source);
  write(out, `${id}/project.json`, JSON.stringify({ look: spec.project.look, layers: spec.project.layers, beams: spec.project.beams, camera: spec.capture.camera, quality: spec.project.quality, radius: spec.capture.source.radius }));
  for (const v of VARIANTS) await writeWebsite(out, `${id}/${v.id}`, spec, defaultSettings({ mode: v.mode, compression: v.compression, adaptive: false }));
  meta[id] = { bytes: Object.fromEntries(VARIANTS.map((v) => [v.id, readFileSync(join(out, id, v.id, "particle-export/particle-data.bin")).length])) };
}
const { server, origin } = await serveDirectory(out);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const three = localThree();
await page.route(THREE_URL, (route) => three ? route.fulfill({ status: 200, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: readFileSync(three) }) : route.continue());
await page.goto(`${origin}/index.html`);

const rows: any[] = [];
for (const { id, spec } of SCENES) {
  const projectJson = JSON.parse(readFileSync(join(out, id, "project.json"), "utf8"));
  const studioUrl: string = await page.evaluate(async ([project, bytes, w, h, t, r]) => (window as any).PS.studioFrame(project, new Uint8Array(bytes as number[]), w, h, t, r),
    [projectJson, Array.from(readFileSync(join(out, id, "studio.psb"))), W, H, TIME, projectJson.radius] as const);
  write(out, `${id}/studio.png`, Buffer.from(studioUrl.split(",")[1]!, "base64"));
  for (const v of VARIANTS) {
    const exportUrl: string = await page.evaluate(([base, w, h]) => (window as any).PS.exportFrame(base, w, h), [`${origin}/${id}/${v.id}`, W, H] as const);
    const d: any = await page.evaluate(([a, b]) => (window as any).PS.diff(a, b), [studioUrl, exportUrl] as const);
    write(out, `${id}/${v.id}.export.png`, Buffer.from(exportUrl.split(",")[1]!, "base64"));
    if (d.diffUrl) write(out, `${id}/${v.id}.diff.png`, Buffer.from(d.diffUrl.split(",")[1]!, "base64"));
    rows.push({ scene: id, variant: v.id, bytesPerParticle: +(meta[id].bytes[v.id] / spec.capture.source.n).toFixed(1), ...(d.error ? { error: d.error } : { mae: +d.mae.toFixed(3), psnr: Number.isFinite(d.psnr) ? +d.psnr.toFixed(1) : "inf", max: d.max, pctOver4: +d.pctOver4.toFixed(3), pctOver16: +d.pctOver16.toFixed(3), pmMax: +d.pmMax.toFixed(2), alphaMax: d.alphaMax, lumaStudio: +d.meanLumaStudio.toFixed(2), lumaExport: +d.meanLumaExport.toFixed(2) }) });
  }
}
await browser.close(); server.close();
writeFileSync(join(out, "report.json"), JSON.stringify({ size: `${W}x${H}`, time: TIME, rows, pageErrors: errors }, null, 2));
console.log("scene".padEnd(26), "variant".padEnd(18), "B/part", "MAE".padStart(7), "PSNR".padStart(6), "max".padStart(4), "%>4".padStart(7), "%>16".padStart(7), "pmMax", "aMax", "luma S/E");
for (const r of rows) console.log(r.scene.padEnd(26), r.variant.padEnd(18), String(r.bytesPerParticle).padStart(6), r.error ? r.error : `${String(r.mae).padStart(7)} ${String(r.psnr).padStart(6)} ${String(r.max).padStart(4)} ${String(r.pctOver4).padStart(7)} ${String(r.pctOver16).padStart(7)} ${String(r.pmMax).padStart(5)} ${String(r.alphaMax).padStart(4)} ${r.lumaStudio}/${r.lumaExport}`);
if (errors.length) console.log("page errors:", errors);
