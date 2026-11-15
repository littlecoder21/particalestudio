import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { buildEngineBundles, type EngineBundles } from "../engineBundles";
import { buildFormation } from "../../src/studio3d/generators";
import { defaultProject } from "../../src/studio3d/project";
import { DEFAULT_POST_EFFECTS } from "../../src/studio3d/export/config";
import { prepareExport, buildWebsiteFiles, buildStandalone, type ExportCapture, type ExportSettings, type PreparedExport } from "../../src/studio3d/export/bundle";
import type { ParticleSource } from "../../src/studio3d/export/packing";
import type { Project3D } from "../../src/studio3d/types";

export const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".bin": "application/octet-stream", ".css": "text/css", ".png": "image/png", ".map": "application/json" };

export function serveDirectory(root: string): Promise<{ server: Server; origin: string; hits: Map<string, number> }> {
  const hits = new Map<string, number>();
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    hits.set(path, (hits.get(path) ?? 0) + 1);
    const file = normalize(join(root, path));
    if (!file.startsWith(resolve(root)) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404, { "content-type": "text/plain" }); res.end("not found"); return; }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "access-control-allow-origin": "*" });
    res.end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    done({ server, origin: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`, hits });
  }));
}

export function write(root: string, path: string, data: string | Uint8Array) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}
export const resetDir = (dir: string) => { rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); };

let bundles: Promise<EngineBundles> | null = null;
export const engineBundles = () => (bundles ??= buildEngineBundles());

export const defaultSettings = (over: Partial<ExportSettings> = {}): ExportSettings => ({
  mode: "hero", compression: "auto", pixelRatio: null, animation: true, interaction: true, zoom: "modifier", touch: "scroll", effects: DEFAULT_POST_EFFECTS, adaptive: true, embedding: "auto", ...over,
});

export interface SceneSpec { project: Project3D; capture: ExportCapture }
/** A formation with deterministic, non-trivial velocities so velocity-driven looks have something to show. */
export function makeScene(mutate: (p: Project3D) => void = () => {}, count = 12000, time = 3.5): SceneSpec {
  const project = defaultProject();
  project.behaviors = []; project.deformers = []; project.beams = [];
  project.interaction = { ...project.interaction, tool: "none" };
  mutate(project);
  const formation = buildFormation(project.layers, count);
  const velocity = Float32Array.from(formation.pos, (v, i) => Math.sin(i * 0.37 + v) * 1.8);
  const source: ParticleSource = { ...formation, velocity, homeBase: formation.pos.slice() };
  return { project, capture: { source, camera: { ...project.camera }, active: formation.n, state: { time, tick: Math.round(time * 60), cameraYawVelocity: 0, cameraPitchVelocity: 0 } } };
}

/** Writes the website package (particle-export/) for a scene under root/<name>/ and returns the prepared export. */
export async function writeWebsite(root: string, name: string, spec: SceneSpec, settings: ExportSettings): Promise<PreparedExport> {
  const prepared = prepareExport(spec.project, spec.capture, settings, await engineBundles());
  const files = buildWebsiteFiles(prepared);
  write(root, `${name}/particle-export/particle-engine.js`, files.engine);
  write(root, `${name}/particle-export/particle-data.bin`, files.data);
  write(root, `${name}/particle-export/particle-config.json`, files.config);
  write(root, `${name}/particle-export/README.md`, files.readme);
  return prepared;
}

export async function writeStandalone(root: string, name: string, prepared: PreparedExport) {
  const { html } = await buildStandalone(prepared);
  write(root, `${name}.html`, html);
  return html;
}

/** Where to find Three.js r170 for offline runs. Set THREE_MODULE to a local three.module.js; otherwise the real CDN is used. */
export function localThree(): string | null {
  const candidates = [process.env.THREE_MODULE, "node_modules/three/build/three.module.js"].filter(Boolean) as string[];
  for (const candidate of candidates) if (existsSync(candidate)) return resolve(candidate);
  return null;
}
