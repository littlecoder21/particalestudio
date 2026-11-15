import type { ExportMode } from "./packing";

/**
 * Text deliverables: the copyable HTML and CSS snippets, READMEs, the React wrapper, the integration example and the
 * configuration reference. Every number that appears in them comes from the real export (SnippetContext).
 */
export interface SnippetContext {
  name: string;
  background: string;
  transparent: boolean;
  mode: ExportMode;
  count: number;
  bytesPerParticle: number;
  simulation: boolean;
  dataBytes: number;
  engineBytes: number;
  configBytes: number;
  engineVersion: string;
  threeUrl: string;
}

export interface SnippetPaths { engine: string; data: string; config: string }
export const WEBSITE_PATHS: SnippetPaths = { engine: "./particle-export/particle-engine.js", data: "./particle-export/particle-data.bin", config: "./particle-export/particle-config.json" };
export const PROJECT_PATHS: SnippetPaths = { engine: "./particle-engine.js", data: "./particle-data.bin", config: "./particle-config.json" };

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const safeColor = (value: string) => (/^#[0-9a-f]{3,8}$/i.test(value) ? value : "#05070d");
const kb = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`);
const MODE_LABEL: Record<ExportMode, string> = { hero: "Hero", animated: "Animated", full: "Full quality" };

export function htmlSnippet(_ctx: SnippetContext, paths: SnippetPaths = WEBSITE_PATHS): string {
  return `<section class="ps-hero">
  <div id="particle-scene" class="ps-hero__scene"></div>
  <div class="ps-hero__content">
    <h1>Your Website Content</h1>
  </div>
</section>

<script type="module">
  import { createParticleScene } from "${paths.engine}";

  const scene = await createParticleScene({
    container: "#particle-scene",
    data: "${paths.data}",
    config: "${paths.config}"
  });
</script>
`;
}

/** Scoped component styles. Nothing here targets html, body, headings, or the universal selector. */
export function cssSnippet(ctx: SnippetContext): string {
  return `/* Particle Studio scene: component styles.
   Every selector starts with .ps-, so nothing here can touch your site's own styles.
   It deliberately does not style html, body, headings or "*". */

.ps-hero {
  --ps-bg: ${ctx.transparent ? "transparent" : safeColor(ctx.background)};   /* shown while the scene loads */
  --ps-min-height: 70vh;                                                   /* change per page */
  position: relative;
  isolation: isolate;       /* keeps the scene's stacking inside this block */
  overflow: hidden;
  min-height: var(--ps-min-height);
  background: var(--ps-bg);
}
.ps-hero--full { min-height: 100vh; }
@supports (height: 100svh) { .ps-hero--full { min-height: 100svh; } }   /* mobile browser toolbars */

/* The canvas fills the scene layer; your content sits above it. */
.ps-hero__scene { position: absolute; inset: 0; z-index: 0; }
.ps-hero__scene > canvas { display: block; width: 100%; height: 100%; }
.ps-hero__content { position: relative; z-index: 1; pointer-events: none; }
/* Links, buttons and form controls stay clickable; empty areas pass drags and hovers to the scene.
   Delete both pointer-events rules if you need selectable text over the scene. */
.ps-hero__content :where(a, button, input, select, textarea, summary, label, [role="button"], [tabindex]) { pointer-events: auto; }

/* Pure background: the scene never receives pointer input (add class ps-hero--passive to the section). */
.ps-hero--passive .ps-hero__scene { pointer-events: none; }

/* A scene in a fixed-size or aspect-ratio box instead of a hero section: <div class="ps-box" id="particle-scene"> */
.ps-box { position: relative; width: var(--ps-width, 100%); max-width: 100%; height: var(--ps-height, 480px); overflow: hidden; }
.ps-box--wide { height: auto; aspect-ratio: 16 / 9; }

/* Optional: the engine sets data-ps-state to idle | loading | ready | paused | sleeping | error. */
/* .ps-hero__scene[data-ps-state="error"] { background: url("fallback.jpg") center / cover; } */
`;
}

export function websiteReadme(ctx: SnippetContext): string {
  return `# ${ctx.name} · Particle Studio website export

A real 3D particle scene (${ctx.count.toLocaleString("en-US")} particles, ${MODE_LABEL[ctx.mode]} mode) for your own website. Rendering is identical to the Studio preview and
to the standalone HTML export: they all run the same engine.

## Files

| File | Size | What it is |
| --- | --- | --- |
| \`particle-engine.js\` | ${kb(ctx.engineBytes)} | The engine (ES module, no dependencies of its own; loads Three.js on demand). |
| \`particle-data.bin\` | ${kb(ctx.dataBytes)} | The particles: ${ctx.bytesPerParticle} bytes each, in a versioned binary container with a checksum. |
| \`particle-config.json\` | ${kb(ctx.configBytes)} | Look, camera, interaction and (for ${ctx.simulation ? "this export" : "Animated / Full exports"}) simulation settings. |

Three.js (r170) is **not** included. The engine imports it once from \`${ctx.threeUrl}\`. Every scene on the page shares that one download.

## Add it to a page

1. Copy the \`particle-export/\` folder next to your \`index.html\`.
2. Paste the CSS from the Studio's *Copy CSS* button (or \`snippet.css\`) into your stylesheet. All selectors start with \`.ps-\`.
3. Paste the HTML from *Copy HTML* (or \`snippet.html\`) where the scene should appear:

\`\`\`html
${htmlSnippet(ctx).trim()}
\`\`\`

The page must be served over http(s) (any static host, or \`npx serve\` / \`python3 -m http.server\` locally): browsers do not
allow ES modules or \`fetch\` from \`file://\`. If your site is on another origin than the files, serve them with
\`Access-Control-Allow-Origin\`. Serve \`.bin\` as \`application/octet-stream\` (the default on every common host).

## API

\`\`\`js
const scene = await createParticleScene({ container, data, config, /* options */ });

scene.play();                       // resume animation
scene.pause();                      // freeze animation (still interactive)
scene.resize();                     // re-measure after a layout change (automatic for container resizes)
scene.setInteraction(false);        // or { orbit: false, zoom: "always", touch: "capture", tool: "repel" }
scene.updateConfig({ scene: { look: { size: 0.01, glow: 0.4 } }, render: { pixelRatio: 1.5 } });
scene.capture();                    // PNG data URL of the current frame
scene.destroy();                    // removes the canvas, frees GPU memory, removes every listener
\`\`\`

Options: \`lazy\` (default true: loads when the scene is within 200px of the viewport), \`autoplay\`, \`respectReducedMotion\` (default true),
\`interaction\`, \`pixelRatio\`, \`transparent\`, \`maxActiveContexts\`, \`three\` / \`threeUrl\`, \`onReady\`, \`onError\`. Types are in \`particle-engine.d.ts\` (project ZIP).
With \`lazy: false\` the returned promise waits for the first frame and rejects on failure; otherwise watch \`scene.ready\` or \`onError\`.

## Behaviour you should know about

- **${MODE_LABEL[ctx.mode]} mode.** ${ctx.mode === "hero" ? "A static snapshot of the scene: orbit, zoom, auto-rotation and the shader animation (spin, light beams, glints) run; force behaviours, deformers and pointer forces do not. The engine file is the lean build without the particle simulation." : "The particle simulation runs in the browser: behaviours, deformers and pointer forces move the particles as in the Studio."}
- **Page scrolling is never hijacked.** The mouse wheel only zooms with Ctrl/Cmd held; on touch screens vertical swipes scroll the page and horizontal drags orbit. Change this with \`setInteraction({ zoom: "always", touch: "capture" })\`.
- **Performance.** The scene renders only while it is on screen and the tab is visible, caps devicePixelRatio (see \`render.pixelRatio\`), and lowers its internal resolution automatically if frames get slow (\`render.adaptive\`). Particle count is never reduced.
- **Several scenes.** One Three.js download is shared. Each visible scene holds one WebGL context; browsers allow about 16, so offscreen scenes beyond \`maxActiveContexts\` (default 8) sleep and wake when scrolled back into view.
- **Reduced motion.** Visitors who prefer reduced motion get a still scene; they can still drag to orbit.
- **If something fails** the container gets \`data-ps-state="error"\` and \`onError\` fires; the page is otherwise unaffected.

Generated by Particle Studio · engine ${ctx.engineVersion} · data format PSB1.
`;
}

export function projectIndexHtml(ctx: SnippetContext): string {
  const title = escapeHtml(ctx.name);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="${safeColor(ctx.background)}">
  <title>${title} · 3D Particle Scene</title>
  <link rel="stylesheet" href="style.css">
</head>
<body class="demo">
  <main>
    <section class="ps-hero ps-hero--full">
      <div id="particle-scene" class="ps-hero__scene"></div>
      <div class="ps-hero__content demo-content">
        <h1>${title}</h1>
        <p>Drag to orbit. Hold Ctrl or Cmd and scroll to zoom. Edit <code>index.html</code>, <code>style.css</code> or <code>particle-config.json</code>.</p>
      </div>
    </section>
  </main>

  <script>
    // ES modules and fetch() do not work from file://. Say so instead of showing a blank page.
    if (location.protocol === "file:") {
      document.addEventListener("DOMContentLoaded", function () {
        var note = document.createElement("p");
        note.className = "demo-note";
        note.textContent = "Serve this folder over http to see the scene: run  npx serve .  or  python3 -m http.server  and open the printed address.";
        document.querySelector(".ps-hero__content").appendChild(note);
      });
    }
  </script>
  <script type="module">
    import { createParticleScene } from "./particle-engine.js";

    const scene = await createParticleScene({
      container: "#particle-scene",
      data: "./particle-data.bin",
      config: "./particle-config.json"
    });
  </script>
</body>
</html>
`;
}

export function projectStyleCss(ctx: SnippetContext): string {
  return `${cssSnippet(ctx)}
/* ───────── demo page only: delete this block when you move the component into your own site ───────── */
body.demo { margin: 0; background: ${safeColor(ctx.background)}; color: #eef2ff; font-family: system-ui, sans-serif; }
.demo-content { display: grid; align-content: end; gap: 8px; min-height: 100svh; padding: clamp(20px, 5vw, 56px); box-sizing: border-box; }
.demo-content h1 { margin: 0; font-size: clamp(32px, 6vw, 72px); line-height: 1; letter-spacing: -0.02em; }
.demo-content p { margin: 0; max-width: 52ch; color: #aab4ca; }
.demo-content code { padding: 1px 5px; border-radius: 4px; background: #ffffff14; }
.demo-note { padding: 10px 12px; border-radius: 8px; background: #ffffff14; pointer-events: auto; }
`;
}

export function reactComponent(): string {
  return `import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { createParticleScene } from "../particle-engine";
import type { ParticleScene, ParticleSceneOptions } from "../particle-engine";

export interface ParticleSceneViewProps extends Omit<ParticleSceneOptions, "container"> {
  className?: string;
  style?: CSSProperties;
  /** Called once the scene object exists, e.g. to keep it in a ref and call pause() / play(). */
  onScene?: (scene: ParticleScene) => void;
}

/** Give it a size, e.g. className="ps-box" with the CSS from style.css. Re-creates the scene when data or config change. */
export default function ParticleSceneView({ className, style, onScene, ...options }: ParticleSceneViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onScene);
  callback.current = onScene;

  useEffect(() => {
    let cancelled = false;
    let scene: ParticleScene | undefined;
    void createParticleScene({ ...options, container: host.current! }).then((created) => {
      if (cancelled) { created.destroy(); return; }
      scene = created;
      callback.current?.(created);
    }).catch((error) => {
      // With lazy:false a failed load rejects. It is also reported through onError and data-ps-state="error".
      if (!options.onError) console.error(error);
    });
    return () => { cancelled = true; scene?.destroy(); };
    // The scene is rebuilt only when its inputs change, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.data, options.config]);

  return <div ref={host} className={className} style={style} />;
}
`;
}

export function integrationExample(ctx: SnippetContext): string {
  const title = escapeHtml(ctx.name);
  return `<!doctype html>
<!-- Integration example: an existing page with its own global styles. The scene's CSS is scoped, so nothing below changes. -->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Existing site + ${title}</title>
  <style>
    /* Your site's global styles: the particle component does not interfere with any of them. */
    * { box-sizing: content-box; }
    body { margin: 0; font: 16px/1.6 Georgia, serif; background: #fff; color: #222; }
    h1 { font-size: 40px; color: #b3261e; text-transform: uppercase; }
    p { max-width: 60ch; margin: 24px auto; }
    nav { padding: 16px 24px; background: #222; }
    nav a { color: #fff; margin-right: 16px; }
  </style>
  <link rel="stylesheet" href="../style.css">
</head>
<body>
  <nav><a href="#">Home</a><a href="#about">About</a><a href="#contact">Contact</a></nav>

  <section class="ps-hero" style="--ps-min-height: 60vh">
    <div id="particle-scene" class="ps-hero__scene"></div>
    <div class="ps-hero__content">
      <h1>Particles behind your headline</h1>
      <p>Links like <a href="#about" style="color:#9cf">this one</a> stay clickable; empty space passes drags to the scene.</p>
    </div>
  </section>

  <p id="about">The rest of the page scrolls normally: the mouse wheel never zooms the scene unless Ctrl or Cmd is held, and touch swipes scroll the page.</p>
  <p id="contact">A second, smaller scene can share the same data: see the box below.</p>
  <div class="ps-box ps-box--wide" id="second-scene" style="max-width: 640px; margin: 0 auto;"></div>
  <p>&nbsp;</p>

  <script type="module">
    import { createParticleScene } from "../particle-engine.js";
    const options = { data: "../particle-data.bin", config: "../particle-config.json" };
    await createParticleScene({ ...options, container: "#particle-scene" });
    await createParticleScene({ ...options, container: "#second-scene", pixelRatio: 1.5 });
  </script>
</body>
</html>
`;
}

export function configDocs(ctx: SnippetContext): string {
  return `# Configuration reference

\`particle-config.json\` is validated when the scene loads; \`updateConfig(patch)\` deep-merges into it at runtime (objects merge, arrays replace).
\`schema\`, \`version\`, \`mode\`, \`data\` and \`engine\` are fixed by the exported particle data and ignored by \`updateConfig\`.

| Path | Meaning |
| --- | --- |
| \`mode\` | \`hero\`, \`animated\` or \`full\`. This export: **${ctx.mode}**. |
| \`data.count\` / \`data.radius\` / \`data.active\` | Particles in \`particle-data.bin\` (${ctx.count.toLocaleString("en-US")}), bounding radius, particles drawn. |
| \`engine.simulation\` | Whether the particle simulation is needed (${ctx.simulation}). The Hero engine file has no simulation code. |
| \`state\` | Simulation clock and camera inertia at the moment you exported. |
| \`render.pixelRatio\` | Cap for devicePixelRatio. |
| \`render.adaptive\` | Lower internal resolution automatically when frames are slow (never below 60 %). |
| \`render.bloomLevel\` | 0 off, 1 half, 2 full glow chain. |
| \`render.quality\` | Studio quality profile (affects simulation substeps / neighbour stride). |
| \`animation.enabled\` | Start animating. \`respectReducedMotion\` starts still for visitors who ask for it. |
| \`interaction.enabled\` | false = a background that never receives pointer input. |
| \`interaction.orbit\` | Dragging orbits the camera. |
| \`interaction.zoom\` | \`off\`, \`modifier\` (Ctrl/Cmd + wheel), \`always\`. |
| \`interaction.touch\` | \`scroll\` (page scrolls vertically, horizontal drag orbits) or \`capture\` (scene owns touches). |
| \`interaction.tool\` / \`radius\` / \`strength\` / \`clickAction\` | Pointer force and click burst (Animated / Full only). |
| \`scene.look\` | Colours, size, shape, blend, glow, vignette, grain, trails, lighting, exposure, background. Same fields as the Studio's Look panel. |
| \`scene.layers\` | Per-layer palette and size / opacity multipliers. |
| \`scene.beams\` | Light beams. |
| \`scene.camera\` | Projection, fov, distance, yaw, pitch, target, auto-rotate speed. |
| \`simulation\` | Behaviours, deformers and simulation settings (Animated / Full only). |

## Examples

\`\`\`js
scene.updateConfig({ scene: { look: { background: "#101820", glow: 0.3 }, camera: { autoRotate: 0 } } });
scene.updateConfig({ render: { pixelRatio: 1 } });          // cheaper on phones
scene.setInteraction({ zoom: "always", touch: "capture" });  // a full-screen viewer
\`\`\`

## Binary format (PSB1)

Header (32 bytes, little endian: magic "PSB1", version, header size, particle count, attribute count, flags, metadata length, payload length, CRC-32),
an attribute table (id, type, components, offset, length, value range), JSON metadata, then 4-byte-aligned attribute arrays.
Position is always Float32. The loader validates the magic, version, lengths and checksum and reports a specific error.
`;
}

export function projectReadmeText(ctx: SnippetContext, paths: SnippetPaths = PROJECT_PATHS): string {
  return `# ${ctx.name} · Particle Studio project

A complete, editable web project for a real 3D particle scene (${ctx.count.toLocaleString("en-US")} particles, ${MODE_LABEL[ctx.mode]} mode).
It uses the same engine, particle data and shaders as the Studio preview and the other export formats.

## Run it

Browsers block ES modules and \`fetch\` on \`file://\`, so serve the folder:

\`\`\`sh
npx serve .                    # or:  python3 -m http.server 8080
\`\`\`

then open the address it prints. Three.js (r170) is loaded once from ${ctx.threeUrl} (needs an internet connection; not included in this folder).

## What is in here

| Path | What it is |
| --- | --- |
| \`index.html\`, \`style.css\` | A demo page. The component CSS (everything starting with \`.ps-\`) is scoped and safe to paste into another site; the block after the "demo page only" comment is yours to delete. |
| \`particle-engine.js\` | The engine (${kb(ctx.engineBytes)}). ES module, no build step. |
| \`particle-data.bin\` | The particles (${kb(ctx.dataBytes)}, ${ctx.bytesPerParticle} bytes each, versioned binary format with checksum). |
| \`particle-config.json\` | Look, camera, interaction and simulation settings. Edit it and reload. |
| \`particle-engine.d.ts\` | TypeScript types for the engine API. |
| \`react/ParticleSceneView.tsx\` | A small React wrapper (creates the scene on mount, destroys it on unmount). |
| \`examples/existing-site.html\` | The component dropped into a page with hostile global styles, plus a second scene. |
| \`docs/CONFIGURATION.md\` | Every config field and the runtime API. |
| \`project.particle3d.json\` | The Studio project. Use *Load JSON* in Particle Studio to keep editing the scene. |

## Use it in your own site

\`\`\`html
${htmlSnippet(ctx, paths).trim()}
\`\`\`

API: \`scene.play() / pause() / resize() / setInteraction() / updateConfig() / capture() / destroy()\`. See \`docs/CONFIGURATION.md\`.

## Notes

- ${ctx.mode === "hero" ? "Hero mode is a static snapshot: orbit, zoom, auto-rotation and shader animation run; force behaviours, deformers and pointer forces do not. To get them, export again in Animated or Full quality mode." : "The particle simulation runs in the browser, as in the Studio."}
- The mouse wheel zooms only with Ctrl/Cmd held and vertical touch swipes scroll the page, so the scene does not trap page scrolling. Change it in \`particle-config.json\` (\`interaction.zoom\`, \`interaction.touch\`).
- To re-export with different settings, open the Studio (*Load JSON* with \`project.particle3d.json\`) and use its Export tab.
`;
}
