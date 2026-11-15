import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Project3D } from "../types";
import { Section, Segmented, Select, Toggle } from "../controls3d";
import { EXPORT_MODES, analyzeScene, type CompressionLevel, type ExportMode } from "./packing";
import { DEFAULT_POST_EFFECTS, type PostEffects, type TouchBehavior, type WheelZoom } from "./config";
import {
  THREE_CDN_URL, buildProjectZip, buildStandalone, buildWebsiteFiles, buildWebsiteZip, computeSizes, prepareExport,
  type EngineBundleSet, type ExportCapture, type ExportSettings, type PreparedExport, type SizeReport,
} from "./bundle";
import { compareImages, parityVerdict, type ParityVerdict, type PixelDiff } from "./parity";

/** What the Studio hands the panel. Both functions read the live simulation, so each call is a fresh snapshot. */
export interface ExportFrame {
  capture: ExportCapture;
  /** The studio's own renderer drawing exactly that state at width × height (null when it is not WebGL2). */
  studio: Promise<Blob | null>;
  width: number;
  height: number;
  /** Particles the studio draws right now (adaptive quality can lower this) and the total the export carries. */
  drawn: number;
  total: number;
  backend: string;
}
export interface ExportPanelProps {
  project: Project3D;
  capture: () => ExportCapture | null;
  frame: (maxSide: number) => ExportFrame | null;
  notify: (message: string) => void;
}

type Format = "website" | "standalone" | "project";
const FORMATS: { id: Format; title: string; text: string }[] = [
  { id: "website", title: "Website integration", text: "particle-export/ folder with engine, data and config, plus copy-paste HTML and CSS for an existing page." },
  { id: "standalone", title: "Standalone HTML", text: "One file with the data embedded. Open it from disk; Three.js loads from a CDN." },
  { id: "project", title: "Complete project ZIP", text: "Runnable demo page, engine, data, config, README, React component, types and docs." },
];

const SETTINGS_KEY = "particle-studio-3d-export-v1";
const DEFAULTS: Omit<ExportSettings, "mode"> & { mode: ExportMode | "auto" } = {
  mode: "auto", compression: "auto", pixelRatio: null, animation: true, interaction: true, zoom: "modifier", touch: "scroll",
  effects: DEFAULT_POST_EFFECTS, adaptive: true, embedding: "auto",
};
type Draft = typeof DEFAULTS;

function loadDraft(): Draft {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<Draft> | null;
    if (raw && typeof raw === "object") return { ...DEFAULTS, ...raw, effects: { ...DEFAULTS.effects, ...(raw.effects ?? {}) } };
  } catch { /* storage can be unavailable or hold something else */ }
  return DEFAULTS;
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "particle-scene";
const save = (blob: Blob, name: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
const bin = (bytes: Uint8Array, type: string) => new Blob([bytes as BlobPart], { type });

export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);
/** Exact byte count plus a readable figure, so "how big is it" never needs a guess. */
const exact = (n: number) => `${n.toLocaleString("en-US")} B${n >= 1024 ? ` · ${formatBytes(n)}` : ""}`;

function Row({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return <><dt title={note}>{label}</dt><dd>{value}</dd></>;
}

interface Comparison { studioUrl: string; exportUrl: string; diffUrl: string; diff: PixelDiff; verdict: ParityVerdict; width: number; height: number; drawn: number; total: number; mode: ExportMode }

export default function ExportPanel({ project, capture, frame, notify }: ExportPanelProps) {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [format, setFormat] = useState<Format>("website");
  const [bundles, setBundles] = useState<EngineBundleSet | null>(null);
  const [bundleError, setBundleError] = useState("");
  const [sizes, setSizes] = useState<SizeReport | null>(null);
  const [measureError, setMeasureError] = useState("");
  const [measuring, setMeasuring] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState("");
  const [snippet, setSnippet] = useState<"html" | "css">("html");
  const [preview, setPreview] = useState<string | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [compareError, setCompareError] = useState("");
  const urls = useRef<string[]>([]);

  useEffect(() => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(draft)); } catch { /* ignore */ } }, [draft]);
  useEffect(() => {
    let live = true;
    import("virtual:studio3d-engine-bundles").then((m) => { if (live) setBundles(m.default); }, (e: unknown) => { if (live) setBundleError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, []);
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url); urls.current = []; }, []);

  const analysis = useMemo(() => analyzeScene(project, draft.interaction), [project, draft.interaction]);
  const mode: ExportMode = draft.mode === "auto" ? analysis.recommendedMode : draft.mode;
  const settings: ExportSettings = useMemo(() => ({ ...draft, mode }), [draft, mode]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setEffect = (key: keyof PostEffects, value: boolean) => setDraft((d) => ({ ...d, effects: { ...d.effects, [key]: value } }));

  /** Everything a download needs, from the live scene right now. */
  const prepare = (live: ExportCapture | null = capture()): PreparedExport => {
    if (!bundles) throw new Error("The export engine is still loading.");
    if (!live) throw new Error("The 3D scene is not ready yet.");
    return prepareExport({ ...project, camera: live.camera }, live, settings, bundles);
  };

  /* Exact sizes: debounced, stale results dropped. They come from actually building the files. */
  useEffect(() => {
    if (!bundles) return;
    let cancelled = false;
    setMeasuring(true);
    const timer = window.setTimeout(async () => {
      try {
        const report = await computeSizes(prepare());
        if (!cancelled) { setSizes(report); setMeasureError(""); }
      } catch (error) {
        if (!cancelled) setMeasureError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setMeasuring(false);
      }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // prepare() closes over project/settings/bundles, which are all listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundles, project, settings, refresh]);

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    try { await work(); } catch (error) { notify(`Export failed: ${error instanceof Error ? error.message : String(error)}`); } finally { setBusy(""); }
  };
  const name = slug(project.name);
  const downloadWebsite = () => run("website", async () => { const p = prepare(); save(bin(await buildWebsiteZip(p), "application/zip"), `${name}-website-export.zip`); });
  const downloadProject = () => run("project", async () => { const p = prepare(); save(bin(await buildProjectZip(p), "application/zip"), `${name}-3d-project.zip`); });
  const downloadStandalone = () => run("standalone", async () => { const p = prepare(); const { html } = await buildStandalone(p); save(new Blob([html], { type: "text/html" }), `${name}.html`); });
  const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => notify(`${what} copied.`), () => notify("Clipboard access failed; download the package instead."));

  const [snippetText, setSnippetText] = useState({ html: "", css: "" });
  useEffect(() => {
    if (!bundles || format !== "website") return;
    try { const f = buildWebsiteFiles(prepare()); setSnippetText({ html: f.html, css: f.css }); } catch { /* shown once the scene is ready */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundles, format, project, settings, refresh]);

  const openPreview = () => run("preview", async () => {
    const p = prepare();
    const { html } = await buildStandalone(p);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    urls.current.push(url);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return url; });
  });
  const closePreview = () => setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; });

  /** Renders the studio and the export from the same instant and measures the difference. */
  const compare = () => run("compare", async () => {
    setCompareError(""); setComparison(null);
    const f = frame(960);
    if (!f) throw new Error("The 3D scene is not ready yet.");
    if (f.backend !== "webgl2") throw new Error("The studio is using its Canvas 2D fallback, which does not render like the WebGL export. Compare on a WebGL2 device.");
    const p = prepare(f.capture);
    const studioBlob = await f.studio;
    if (!studioBlob) throw new Error("The studio could not produce a comparison frame.");
    const { html } = await buildStandalone(p, undefined, { width: f.width, height: f.height });
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    try {
      const shot = await new Promise<string>((resolve, reject) => {
        const frameEl = document.createElement("iframe");
        frameEl.setAttribute("sandbox", "allow-scripts");
        frameEl.setAttribute("aria-hidden", "true");
        frameEl.tabIndex = -1;
        // Invisible but laid out inside the viewport, so the engine treats it as visible.
        frameEl.style.cssText = `position:fixed;left:0;top:0;width:${f.width}px;height:${f.height}px;border:0;opacity:0;pointer-events:none;z-index:-1`;
        const timer = window.setTimeout(() => done(() => reject(new Error("The exported scene did not respond in 40 s. It needs an internet connection to load Three.js and a WebGL2 browser."))), 40000);
        const onMessage = (event: MessageEvent) => {
          if (event.source !== frameEl.contentWindow) return;
          const data = event.data as { type?: string; png?: string; message?: string } | null;
          if (data?.type === "ps-capture" && typeof data.png === "string") done(() => resolve(data.png!));
          else if (data?.type === "ps-capture-error") done(() => reject(new Error(data.message || "The exported scene failed to start.")));
        };
        function done(finish: () => void) { window.clearTimeout(timer); window.removeEventListener("message", onMessage); frameEl.remove(); finish(); }
        window.addEventListener("message", onMessage);
        frameEl.src = url;
        document.body.appendChild(frameEl);
      });
      const diff = await compareImages(studioBlob, shot);
      const studioUrl = URL.createObjectURL(studioBlob);
      urls.current.push(studioUrl);
      setComparison({ studioUrl, exportUrl: shot, diffUrl: diff.diffUrl, diff, verdict: parityVerdict(diff), width: f.width, height: f.height, drawn: f.drawn, total: f.total, mode });
    } catch (error) {
      setCompareError(error instanceof Error ? error.message : String(error));
    } finally {
      URL.revokeObjectURL(url);
    }
  });

  const modeInfo = EXPORT_MODES.find((m) => m.id === mode)!;
  const heroLosesMotion = mode === "hero" && analysis.needsSimulation;
  const ready = !!bundles && !busy;

  return (
    <>
      <Section title="Export for the web" right={<button type="button" className="s3-btn" onClick={() => setRefresh((v) => v + 1)} title="Re-measure from the live scene">Refresh</button>}>
        <p className="s3-hint">Three ways to ship this scene. All of them run the same engine and draw the same pixels as the studio preview; only the packaging differs.</p>
        <div className="s3-fmt" role="radiogroup" aria-label="Export format">
          {FORMATS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={format === f.id} className={`s3-fmt-card${format === f.id ? " on" : ""}`} onClick={() => setFormat(f.id)}>
              <b>{f.title}</b><small>{f.text}</small>
            </button>
          ))}
        </div>
        {bundleError && <p className="s3-warn">The export engine failed to load: {bundleError}</p>}
      </Section>

      <Section title="Particle data">
        <Segmented value={draft.mode === "auto" ? "auto" : draft.mode} options={[{ value: "auto", label: "Auto" }, ...EXPORT_MODES.map((m) => ({ value: m.id, label: m.label }))]} onChange={(v) => set("mode", v)} />
        <p className="s3-hint"><b>{modeInfo.label}{draft.mode === "auto" ? " (recommended)" : ""}.</b> {modeInfo.summary}</p>
        {draft.mode !== "auto" && draft.mode !== analysis.recommendedMode && <p className="s3-hint">This scene would normally use <b>{EXPORT_MODES.find((m) => m.id === analysis.recommendedMode)!.label}</b>{analysis.reasons.length ? `: ${analysis.reasons.join("; ")}.` : "."}</p>}
        {draft.mode === "auto" && analysis.reasons.length > 0 && <p className="s3-hint">Why: {analysis.reasons.join("; ")}.</p>}
        {heroLosesMotion && <p className="s3-warn">Hero is a frozen snapshot: it matches the studio exactly as a still frame, but the behaviours and deformers in this scene will not move. Choose Animated or Full quality to keep them.</p>}
        <Segmented value={draft.compression} options={[{ value: "auto", label: "Compact data" }, { value: "off", label: "Lossless (Float32)" }]} onChange={(v: CompressionLevel) => set("compression", v)} />
        <p className="s3-hint">Positions are always exact Float32 and every particle is kept. Compact data stores normals, colour parameter and size in smaller types (at most 1–2 / 255 difference on screen); Lossless stores everything as Float32.</p>
      </Section>

      <Section title="Rendering and behaviour">
        <Select label="Pixel ratio cap" value={draft.pixelRatio === null ? "auto" : String(draft.pixelRatio)} options={[{ value: "auto", label: `Auto (${project.quality} profile)` }, { value: "1", label: "1×" }, { value: "1.5", label: "1.5×" }, { value: "2", label: "2×" }, { value: "3", label: "3×" }]} onChange={(v) => set("pixelRatio", v === "auto" ? null : Number(v))} hint="Upper limit for the device pixel ratio. Retina screens render at this or their own ratio, whichever is lower." />
        <Toggle label="Adaptive resolution" value={draft.adaptive} onChange={(v) => set("adaptive", v)} hint="Lowers the render resolution on slow devices and restores it when frames are fast again." />
        <Toggle label="Animation" value={draft.animation} onChange={(v) => set("animation", v)} hint="Off: the scene opens as a still frame (visitors can still orbit). Reduced-motion visitors always start paused." />
        <Toggle label="Interaction" value={draft.interaction} onChange={(v) => set("interaction", v)} hint="Orbit, zoom and pointer forces. Off makes the scene a pure background that never captures the pointer." />
        {draft.interaction && <>
          <Select<WheelZoom> label="Mouse wheel zoom" value={draft.zoom} options={[{ value: "modifier", label: "Ctrl / Cmd + scroll" }, { value: "always", label: "Always" }, { value: "off", label: "Off" }]} onChange={(v) => set("zoom", v)} hint="Ctrl / Cmd keeps ordinary scrolling working when the scene sits inside a page." />
          <Select<TouchBehavior> label="Touch" value={draft.touch} options={[{ value: "scroll", label: "Swipe scrolls the page" }, { value: "capture", label: "Scene captures touch" }]} onChange={(v) => set("touch", v)} hint="With 'scrolls the page' a vertical swipe scrolls and a horizontal drag orbits." />
        </>}
        <p className="s3-hint">Post-processing</p>
        <Toggle label="Bloom" value={draft.effects.bloom} onChange={(v) => setEffect("bloom", v)} />
        <Toggle label="Vignette" value={draft.effects.vignette} onChange={(v) => setEffect("vignette", v)} />
        <Toggle label="Film grain" value={draft.effects.grain} onChange={(v) => setEffect("grain", v)} />
        <Toggle label="Trails" value={draft.effects.trails} onChange={(v) => setEffect("trails", v)} />
        {format === "standalone" && <Select label="Embedded data" value={draft.embedding} options={[{ value: "auto", label: "Auto (compress if it saves ≥ 8 %)" }, { value: "base64", label: "Base64 (largest, no decompression)" }, { value: "deflate", label: "Deflate + Base64 (smallest)" }]} onChange={(v) => set("embedding", v)} />}
      </Section>

      <Section title="File sizes" right={<span className="s3-method">{measuring ? "measuring…" : sizes ? "measured" : ""}</span>}>
        {measureError && <p className="s3-warn">{measureError}</p>}
        {sizes ? (
          <>
            <dl className="s3-stats">
              <Row label="Particles" value={`${sizes.particles.count.toLocaleString("en-US")} · all kept`} />
              <Row label="Per particle" value={`${sizes.particles.bytesPerParticle} B (was ${sizes.particles.legacyBytesPerParticle} B)`} note={sizes.particles.layout.join(", ")} />
              <Row label="Raw particle data" value={exact(sizes.particles.rawBytes)} note="The .bin file, before any compression." />
              <Row label="vs. classic export" value={sizes.particles.savedPercent > 0 ? `${sizes.particles.savedPercent}% smaller` : "same size"} />
            </dl>
            <p className="s3-sub">{format === "website" ? "Website package" : format === "standalone" ? "Standalone HTML" : "Project ZIP"}</p>
            <dl className="s3-stats">
              {format === "website" && <>
                <Row label="particle-engine.js" value={exact(sizes.website.engine)} />
                <Row label="particle-data.bin" value={exact(sizes.website.data)} />
                <Row label="particle-config.json" value={exact(sizes.website.config)} />
                <Row label="Files total" value={exact(sizes.website.total)} />
                {sizes.website.gzip && <Row label="Over the wire (gzip)" value={exact(sizes.website.gzip.total)} note="What a server with gzip transfers: engine + data + config compressed separately." />}
              </>}
              {format === "standalone" && <>
                <Row label="Downloaded .html file" value={exact(sizes.standalone.html)} />
                <Row label="Embedded as" value={sizes.standalone.embedding === "b64z" ? "Deflate + Base64" : "Base64"} />
                <Row label="Raw data" value={exact(sizes.standalone.dataRawBytes)} />
                <Row label="Encoded in the file" value={`${sizes.standalone.dataEncodedChars.toLocaleString("en-US")} chars`} note={`${exact(sizes.standalone.dataStoredBytes)} stored before Base64`} />
                <Row label="Engine code" value={exact(sizes.standalone.engine)} />
              </>}
              {format === "project" && <>
                <Row label="Downloaded .zip" value={exact(sizes.project.zip)} />
                <Row label="Files inside" value={`${sizes.project.files.length}`} note={sizes.project.files.map((f) => `${f.path} ${f.bytes} B`).join("\n")} />
                <Row label="particle-data.bin" value={exact(sizes.particles.rawBytes)} />
              </>}
            </dl>
            <p className="s3-hint">Not included in any file: Three.js is loaded from <code>{THREE_CDN_URL.replace("https://", "")}</code> at runtime ({formatBytes(sizes.runtime.rawBytes)}, about {formatBytes(sizes.runtime.gzipBytes)} gzipped; browsers cache it across sites).</p>
          </>
        ) : <p className="s3-hint">{bundles ? "Measuring…" : "Loading the export engine…"}</p>}
      </Section>

      <Section title={FORMATS.find((f) => f.id === format)!.title}>
        {format === "website" && <>
          <div className="s3-actions">
            <button type="button" className="s3-btn on" disabled={!ready} onClick={() => void downloadWebsite()}>{busy === "website" ? "Building…" : "Download website package (.zip)"}</button>
          </div>
          <Segmented value={snippet} options={[{ value: "html", label: "HTML snippet" }, { value: "css", label: "CSS snippet" }]} onChange={setSnippet} />
          <textarea className="s3-code s3-code-sm" readOnly spellCheck={false} aria-label={`${snippet === "html" ? "HTML" : "CSS"} snippet`} value={snippetText[snippet]} />
          <div className="s3-actions">
            <button type="button" className="s3-btn" disabled={!snippetText[snippet]} onClick={() => void copy(snippetText[snippet], snippet === "html" ? "HTML snippet" : "CSS snippet")}>Copy {snippet.toUpperCase()}</button>
          </div>
          <p className="s3-hint">Unzip <code>particle-export/</code> into your site, paste the HTML where the scene should go and the CSS into your stylesheet. All selectors are prefixed <code>.ps-</code>, so nothing else on the page changes. The page must be served over http(s).</p>
        </>}
        {format === "standalone" && <>
          <div className="s3-actions">
            <button type="button" className="s3-btn on" disabled={!ready} onClick={() => void downloadStandalone()}>{busy === "standalone" ? "Building…" : `Download ${name}.html`}</button>
            <button type="button" className="s3-btn" disabled={!ready} onClick={() => void openPreview()}>{busy === "preview" ? "Building…" : "Preview here"}</button>
          </div>
          <p className="s3-hint">Works from a double-click (file://). It shows a message with a Try again button if the Three.js CDN cannot be reached.</p>
          {preview && (
            <div className="s3-preview">
              <iframe title="Standalone export preview" src={preview} sandbox="allow-scripts" />
              <button type="button" className="s3-btn" onClick={closePreview}>Close preview</button>
            </div>
          )}
        </>}
        {format === "project" && <>
          <div className="s3-actions">
            <button type="button" className="s3-btn on" disabled={!ready} onClick={() => void downloadProject()}>{busy === "project" ? "Building…" : "Download project (.zip)"}</button>
          </div>
          <p className="s3-hint">Contains index.html, style.css, particle-engine.js, particle-data.bin, particle-config.json, README.md, TypeScript types, a React component, an existing-site example, configuration docs and the editable project JSON. Serve the folder over http to open it.</p>
        </>}
      </Section>

      <Section title="Check against the studio">
        <p className="s3-hint">Renders the studio and the export from the same instant at the same size, then measures the difference. Needs an internet connection (the export loads Three.js) and WebGL2.</p>
        <div className="s3-actions"><button type="button" className="s3-btn" disabled={!ready} onClick={() => void compare()}>{busy === "compare" ? "Comparing…" : "Compare export with studio"}</button></div>
        {compareError && <p className="s3-warn">{compareError}</p>}
        {comparison && (
          <div className="s3-compare">
            <p className={`s3-verdict ${comparison.verdict.level}`}>{comparison.verdict.label}</p>
            <div className="s3-compare-imgs">
              <figure><img src={comparison.studioUrl} alt="Studio preview" /><figcaption>Studio</figcaption></figure>
              <figure><img src={comparison.exportUrl} alt="Export" /><figcaption>Export ({EXPORT_MODES.find((m) => m.id === comparison.mode)!.label})</figcaption></figure>
              <figure><img src={comparison.diffUrl} alt="Difference, amplified 8 times" /><figcaption>Difference ×8</figcaption></figure>
            </div>
            <dl className="s3-stats">
              <Row label="Size" value={`${comparison.width} × ${comparison.height}`} />
              <Row label="Largest difference" value={`${comparison.diff.max} / 255 (${comparison.diff.pmMax.toFixed(2)} on screen)`} note="Straight RGBA, and premultiplied by alpha: the second is what is actually composited." />
              <Row label="Mean error" value={`${comparison.diff.mae.toFixed(3)} / 255`} />
              <Row label="PSNR" value={Number.isFinite(comparison.diff.psnr) ? `${comparison.diff.psnr.toFixed(1)} dB` : "∞ (identical)"} />
              <Row label="Pixels off by > 4" value={`${comparison.diff.pctOver4.toFixed(3)} %`} />
            </dl>
            {comparison.drawn < comparison.total && <p className="s3-warn">The studio is drawing {comparison.drawn.toLocaleString("en-US")} of {comparison.total.toLocaleString("en-US")} particles (adaptive quality). The comparison used the same count, so it is still like-for-like; the exported scene itself draws all {comparison.total.toLocaleString("en-US")}.</p>}
            {comparison.verdict.level === "differs" && <p className="s3-hint">A real difference. Try Lossless data to rule out compact storage, and check for a changed Look or camera between taps.</p>}
          </div>
        )}
      </Section>
    </>
  );
}
