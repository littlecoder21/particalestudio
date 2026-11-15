import type { CameraSettings, Project3D } from "../types";
import { serializeProject } from "../project";
import { PSB_VERSION } from "./format";
import { analyzeScene, packParticles, type CompressionLevel, type ExportMode, type PackResult, type ParticleSource, type SceneAnalysis } from "./packing";
import { buildExportConfig, serializeConfig, type ExportConfig, type PostEffects, type TouchBehavior, type WheelZoom } from "./config";
import { embedBytes, gzipLength, compressionSupported, type Embedded } from "./compress";
import { buildStandaloneHtml } from "./standalone";
import { buildZip, type ZipEntry } from "./zip";
import { ENGINE_DTS } from "./engineTypes";
import {
  PROJECT_PATHS, WEBSITE_PATHS, configDocs, cssSnippet, htmlSnippet, integrationExample, projectIndexHtml, projectReadmeText, projectStyleCss, reactComponent, websiteReadme,
  type SnippetContext,
} from "./snippets";

export const ENGINE_VERSION = "1.0.0";
export const THREE_CDN_URL = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";
/** Measured on three@0.170.0 build/three.module.js (gzip -9). jsDelivr may serve it Brotli-compressed, which is smaller still. */
export const THREE_CDN_SIZE = { rawBytes: 1_314_681, gzipBytes: 264_941 };

export interface EngineBundleSet { engineStatic: string; engineSim: string; standaloneStatic: string; standaloneSim: string }

export interface ExportSettings {
  mode: ExportMode;
  compression: CompressionLevel;
  /** null = the project's quality profile decides. */
  pixelRatio: number | null;
  animation: boolean;
  interaction: boolean;
  zoom: WheelZoom;
  touch: TouchBehavior;
  effects: PostEffects;
  adaptive: boolean;
  embedding: "auto" | "base64" | "deflate";
}

export interface ExportCapture {
  source: ParticleSource;
  camera: CameraSettings;
  state: ExportConfig["state"];
  /** Particles the studio currently draws; exports always carry and draw every particle (see `active`). */
  active: number;
}

export interface PreparedExport {
  settings: ExportSettings;
  analysis: SceneAnalysis;
  config: ExportConfig;
  configJson: string;
  pack: PackResult;
  engineJs: string;
  standaloneBundle: string;
  context: SnippetContext;
  project: Project3D;
}

const utf8 = (text: string) => new TextEncoder().encode(text);

export function prepareExport(project: Project3D, capture: ExportCapture, settings: ExportSettings, bundles: EngineBundleSet): PreparedExport {
  const analysis = analyzeScene(project, settings.interaction);
  const pack = packParticles(capture.source, project, { mode: settings.mode, compression: settings.compression, interaction: settings.interaction });
  const config = buildExportConfig(project, capture.camera, {
    mode: settings.mode, pixelRatio: settings.pixelRatio, animation: settings.animation, interaction: settings.interaction, zoom: settings.zoom, touch: settings.touch,
    effects: settings.effects, adaptive: settings.adaptive, state: capture.state, count: capture.source.n, radius: capture.source.radius, active: capture.active, dataVersion: PSB_VERSION,
  });
  const configJson = serializeConfig(config);
  const simulation = settings.mode !== "hero";
  const engineJs = simulation ? bundles.engineSim : bundles.engineStatic;
  const standaloneBundle = simulation ? bundles.standaloneSim : bundles.standaloneStatic;
  const context: SnippetContext = {
    name: project.name, background: project.look.background, transparent: project.look.transparent, mode: settings.mode, count: capture.source.n,
    bytesPerParticle: pack.bytesPerParticle, simulation, dataBytes: pack.bytes.length, engineBytes: utf8(engineJs).length, configBytes: utf8(configJson).length,
    engineVersion: ENGINE_VERSION, threeUrl: THREE_CDN_URL,
  };
  return { settings, analysis, config, configJson, pack, engineJs, standaloneBundle, context, project };
}

/* ───────────── website integration ───────────── */

export interface WebsiteFiles {
  engine: string;
  data: Uint8Array;
  config: string;
  readme: string;
  html: string;
  css: string;
}
export function buildWebsiteFiles(p: PreparedExport): WebsiteFiles {
  return { engine: p.engineJs, data: p.pack.bytes, config: p.configJson, readme: websiteReadme(p.context), html: htmlSnippet(p.context, WEBSITE_PATHS), css: cssSnippet(p.context) };
}

export function websiteZipEntries(p: PreparedExport): ZipEntry[] {
  const f = buildWebsiteFiles(p);
  return [
    { path: "particle-export/particle-engine.js", data: f.engine },
    { path: "particle-export/particle-data.bin", data: f.data },
    { path: "particle-export/particle-config.json", data: f.config },
    { path: "particle-export/README.md", data: f.readme },
    { path: "snippet.html", data: f.html },
    { path: "snippet.css", data: f.css },
  ];
}

/* ───────────── complete project ───────────── */

export function projectZipEntries(p: PreparedExport): ZipEntry[] {
  const ctx = p.context;
  return [
    { path: "index.html", data: projectIndexHtml(ctx) },
    { path: "style.css", data: projectStyleCss(ctx) },
    { path: "particle-engine.js", data: p.engineJs },
    { path: "particle-data.bin", data: p.pack.bytes },
    { path: "particle-config.json", data: p.configJson },
    { path: "README.md", data: projectReadmeText(ctx, PROJECT_PATHS) },
    { path: "particle-engine.d.ts", data: ENGINE_DTS },
    { path: "react/ParticleSceneView.tsx", data: reactComponent() },
    { path: "examples/existing-site.html", data: integrationExample(ctx) },
    { path: "docs/CONFIGURATION.md", data: configDocs(ctx) },
    { path: "project.particle3d.json", data: serializeProject(p.project) },
  ];
}

export const buildProjectZip = (p: PreparedExport, date?: Date) => buildZip(projectZipEntries(p), { date });
export const buildWebsiteZip = (p: PreparedExport, date?: Date) => buildZip(websiteZipEntries(p), { date });

/* ───────────── standalone ───────────── */

export async function buildStandalone(p: PreparedExport, embedded?: Embedded, capture?: { width: number; height: number }) {
  return buildStandaloneHtml({ config: p.config, psb: p.pack.bytes, bundleJs: p.standaloneBundle, embedding: p.settings.embedding, embedded, capture });
}

/* ───────────── sizes ───────────── */

export interface SizeReport {
  particles: { count: number; mode: ExportMode; bytesPerParticle: number; legacyBytesPerParticle: 69; rawBytes: number; legacyBytes: number; savedPercent: number; layout: string[] };
  website: { engine: number; data: number; config: number; total: number; gzip: { engine: number; data: number; config: number; total: number } | null };
  standalone: { html: number; engine: number; embedding: Embedded["encoding"]; dataRawBytes: number; dataStoredBytes: number; dataEncodedChars: number };
  project: { zip: number; files: { path: string; bytes: number }[] };
  /** Not part of any exported file: loaded at runtime from the CDN. */
  runtime: { threeUrl: string; rawBytes: number; gzipBytes: number };
}

/**
 * Real sizes, not estimates: every figure comes from actually building the file (or compressing the real bytes).
 * Runs the compression passes, so call it debounced and ignore stale results.
 */
export async function computeSizes(p: PreparedExport, date?: Date): Promise<SizeReport> {
  const dataBytes = p.pack.bytes.length;
  const engine = utf8(p.engineJs), config = utf8(p.configJson);
  const embedded = await embedBytes(p.pack.bytes, p.settings.embedding);
  const standalone = await buildStandalone(p, embedded);
  const entries = projectZipEntries(p);
  const zip = await buildProjectZip(p, date);
  const gz = compressionSupported()
    ? await Promise.all([gzipLength(engine), gzipLength(p.pack.bytes), gzipLength(config)]).then(([e, d, c]) => ({ engine: e, data: d, config: c, total: e + d + c }))
    : null;
  const legacyBytes = p.context.count * 69;
  return {
    particles: {
      count: p.context.count, mode: p.settings.mode, bytesPerParticle: p.pack.bytesPerParticle, legacyBytesPerParticle: 69, rawBytes: dataBytes, legacyBytes,
      savedPercent: Math.round((1 - dataBytes / legacyBytes) * 1000) / 10, layout: p.pack.plan.map((item) => `${item.name}:${item.dtype}`),
    },
    website: { engine: engine.length, data: dataBytes, config: config.length, total: engine.length + dataBytes + config.length, gzip: gz },
    standalone: { html: standalone.bytes, engine: utf8(p.standaloneBundle).length, embedding: embedded.encoding, dataRawBytes: dataBytes, dataStoredBytes: embedded.storedBytes, dataEncodedChars: embedded.text.length },
    project: { zip: zip.length, files: entries.map((entry) => ({ path: entry.path, bytes: typeof entry.data === "string" ? utf8(entry.data).length : entry.data.length })) },
    runtime: { threeUrl: THREE_CDN_URL, ...THREE_CDN_SIZE },
  };
}
