import type { ExportConfig } from "./config";
import { embedBytes, type Embedded } from "./compress";
import { escapeHtml } from "./snippets";

/** One self-contained HTML file: engine, particle data and config are inline; only Three.js comes from the CDN. */
export interface StandaloneInput {
  config: ExportConfig;
  psb: Uint8Array;
  /** The standalone bundle matching the mode (boot code + engine, minified). */
  bundleJs: string;
  embedding: "auto" | "base64" | "deflate";
  /** Reuse an already-computed embedding (sizes + build share one compression pass). */
  embedded?: Embedded;
  /** Render a fixed-size, paused, pixel-ratio-1 frame and post it to the parent window (visual comparison). */
  capture?: { width: number; height: number };
}
export interface StandaloneResult { html: string; bytes: number; embedded: Embedded }

const jsonForScript = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const inertScript = (code: string) => code.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
const safeColor = (value: string) => (/^#[0-9a-f]{3,8}$/i.test(value) ? value : "#05070d");

export function interactionHint(config: ExportConfig): string {
  const parts = [config.name];
  const i = config.interaction;
  if (i.enabled) {
    if (i.orbit) parts.push("drag to orbit");
    if (i.zoom === "always") parts.push("scroll to zoom");
    else if (i.zoom === "modifier") parts.push("Ctrl/Cmd + scroll to zoom");
    parts.push("shift/right-drag to pan");
    if (i.touch === "capture") parts.push("pinch to zoom/pan");
    if (i.tool !== "none" && config.mode !== "hero") parts.push(`move pointer to ${i.tool} particles`);
  }
  return parts.join(" · ");
}

export async function buildStandaloneHtml(input: StandaloneInput): Promise<StandaloneResult> {
  const { config } = input;
  const embedded = input.embedded ?? await embedBytes(input.psb, input.embedding);
  const title = escapeHtml(config.name);
  const bg = config.scene.look.transparent ? "#05070d" : safeColor(config.scene.look.background);
  const embed = { enc: embedded.encoding, data: embedded.text, config, label: `${config.name} (interactive 3D particle scene)`, hint: interactionHint(config), ...(input.capture ? { capture: input.capture } : {}) };
  const css = `html,body{height:100%;margin:0}body{background:${bg};color:#eef2ff;font:12px system-ui,sans-serif;overflow:hidden}#ps-root{position:fixed;inset:0}` +
    `.ps-bar{position:fixed;left:16px;right:16px;bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;pointer-events:none}` +
    `#ps-label{color:#aab4ca;text-shadow:0 1px 5px #000}` +
    `#ps-toggle,.ps-retry{pointer-events:auto;padding:8px 11px;border:1px solid #ffffff35;border-radius:8px;background:#0b1020cc;color:#eef2ff;font:12px system-ui,sans-serif;cursor:pointer}` +
    `.ps-retry{margin-left:12px}.ps-particle__message{font-size:14px}`;
  const bar = input.capture ? "" : `<div class="ps-bar"><span id="ps-label"></span><button id="ps-toggle" type="button" aria-pressed="false">Pause animation</button></div>`;
  const html = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="${bg}"><title>${title} · 3D Particle Scene</title><style>${css}</style></head>` +
    `<body><div id="ps-root"></div>${bar}<noscript>This 3D scene needs JavaScript.</noscript>` +
    `<script type="module">const __PS_EMBED__=${jsonForScript(embed)};\n${inertScript(input.bundleJs)}</script></body></html>`;
  return { html, bytes: new TextEncoder().encode(html).length, embedded };
}
