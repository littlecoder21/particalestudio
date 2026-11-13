import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import "./studio3d.css";
import type { Behavior, BehaviorType, Deformer, DeformerType, GeneratorId, Layer, LightBeam, LightBeamStyle, Look, ParamDef, Project3D, QualityLevel } from "./types";
import { MAX_LAYERS, MAX_LIGHT_BEAMS, QUALITY } from "./types";
import { OrbitCamera } from "./camera";
import { Simulation } from "./simulation";
import { GLRenderer, type Renderer, type RenderInput } from "./renderer";
import { createRenderer } from "./renderer2d";
import { PointerController } from "./interaction";
import { GENERATORS, buildFormation, generateLayer, getGenerator, defaultParams } from "./generators/index";
import { BEHAVIOR_DEFS, BEHAVIOR_TYPES, DEFORMER_DEFS, DEFORMER_TYPES, makeBehavior, makeDeformer, newId } from "./behaviors";
import { DEFAULT_LOOK, defaultProject, makeLayer, migrateProject, projectFromGenerator, serializeProject } from "./project";
import { makeLightBeam } from "./lightBeams";
import { PALETTE_PRESETS, samplePalette } from "./palette";
import { clamp, EASING_NAMES, type EasingName } from "./math";
import { GradientEditor, Range, Section, Segmented, Select, TextField, Toggle, Vec3Input } from "./controls3d";
import { EXPORT_FORMATS, build3DProjectZip, exportSlug, generate3DCode, type CodeBundle, type ExportFormat } from "./codeExport";

const STORE_KEY = "particle-studio-3d-project-v1";
type Tab = "presets" | "shape" | "dust" | "interact" | "text" | "motion" | "look" | "camera" | "timeline" | "export";
const TABS: { id: Tab; label: string }[] = [{ id: "presets", label: "Presets" }, { id: "shape", label: "Shape" }, { id: "dust", label: "Dust & beams" }, { id: "interact", label: "Interact" }, { id: "text", label: "Text" }, { id: "motion", label: "Motion" }, { id: "look", label: "Look" }, { id: "camera", label: "Camera" }, { id: "timeline", label: "Timeline" }, { id: "export", label: "Export" }];
const DUST_PRESETS: { id: GeneratorId; label: string }[] = [
  { id: "dust-cloud", label: "Dust Cloud" },
  { id: "dust-veil", label: "Dust Veil" },
  { id: "dust-motes", label: "Floating Motes" },
];
const DOCK_KEY = "particle-studio-3d-dock";
const DOCK_DEFAULT = 0.5;
const DOCK_MIN = 0.28;
const DOCK_MAX = 0.8;
const BAR_H = 40;
const CLOSE_BELOW = 110;
const MOBILE_QUERY = "(max-width: 720px)";

interface DockDrag {
  id: number;
  startY: number;
  offset: number;
  wsH: number;
  wsBottom: number;
  h: number;
  moved: boolean;
}

function loadDock(): number {
  try {
    const value = Number(localStorage.getItem(DOCK_KEY));
    return value >= DOCK_MIN && value <= DOCK_MAX ? value : DOCK_DEFAULT;
  } catch {
    return DOCK_DEFAULT;
  }
}

function subscribeMobile(notify: () => void): () => void {
  if (typeof matchMedia !== "function") return () => undefined;
  const query = matchMedia(MOBILE_QUERY);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

const getMobile = (): boolean => typeof matchMedia === "function" && matchMedia(MOBILE_QUERY).matches;
const useMobile = (): boolean => useSyncExternalStore(subscribeMobile, getMobile, () => false);

function loadSaved(): Project3D {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return migrateProject(JSON.parse(raw)).project; } catch { /* ignore */ }
  return defaultProject();
}
const download = (blob: Blob, name: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };

/* ───────── preset thumbnails: tiny real renderings of each generator ───────── */
const thumbCache = new Map<GeneratorId, string>();
function makeThumb(id: GeneratorId): string {
  const hit = thumbCache.get(id); if (hit) return hit;
  const def = getGenerator(id), f = generateLayer({ generator: id, params: defaultParams(def), seed: 5 }, 1400, { text: () => null }), c = document.createElement("canvas"), S = 96;
  c.width = S; c.height = S; const g = c.getContext("2d")!; g.fillStyle = "#07080c"; g.fillRect(0, 0, S, S); g.globalCompositeOperation = "lighter";
  const cam = new OrbitCamera(); cam.apply({ ...(def.recipe.camera ? { projection: "perspective", fov: 45, distance: 3.4, yaw: 0.45, pitch: 0.22, target: [0, 0, 0], near: 0.05, far: 60, autoRotate: 0, ...def.recipe.camera } : { projection: "perspective", fov: 45, distance: 3.4, yaw: 0.45, pitch: 0.22, target: [0, 0, 0], near: 0.05, far: 60, autoRotate: 0 }) } as never);
  cam.autoRotate = 0; cam.frame(Math.max(0.6, f.radius), 1.15); cam.updateMatrices(1);
  const pal = def.recipe.look?.palette ?? DEFAULT_LOOK.palette, tmp: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < f.n; i++) {
    cam.project(f.pos[i * 3], f.pos[i * 3 + 1], f.pos[i * 3 + 2], tmp); if (tmp[2] <= 0) continue;
    const col = samplePalette(pal, f.t[i]); g.fillStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${0.5 * f.alpha[i]})`;
    g.fillRect((tmp[0] * 0.5 + 0.5) * S - 0.8, (1 - (tmp[1] * 0.5 + 0.5)) * S - 0.8, 1.7, 1.7);
  }
  const url = c.toDataURL("image/png"); thumbCache.set(id, url); return url;
}

export default function Studio3D({ active, modeSwitch, initialProject }: { active: boolean; modeSwitch: ReactNode; initialProject?: Project3D }) {
  const [project, setProject] = useState<Project3D>(() => initialProject ? migrateProject(initialProject).project : loadSaved());
  const mobile = useMobile();
  const [tab, setTab] = useState<Tab>("presets");
  const [presetSearch, setPresetSearch] = useState("");
  const [presetCategory, setPresetCategory] = useState("All");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("standaloneHtml");
  const [exportBundle, setExportBundle] = useState<CodeBundle | null>(null);
  const [textDraft, setTextDraft] = useState("PARTICLE");
  const [collapsed, setCollapsed] = useState(false);
  const [dockFrac, setDockFrac] = useState<number>(loadDock);
  const [settle, setSettle] = useState(0);
  const [stats, setStats] = useState({ fps: 0, sim: 0, gpu: 0, n: 0, backend: "", gpuName: "", hdr: false, active: 1 });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [playing, setPlaying] = useState(false);
  const [adaptive, setAdaptive] = useState(true);
  const [expOpts, setExpOpts] = useState({ scale: 2, transparent: false, seconds: 8 });
  const [recording, setRecording] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DockDrag | null>(null);
  const simRef = useRef<Simulation | null>(null);
  const camRef = useRef<OrbitCamera | null>(null);
  const rendRef = useRef<Renderer | null>(null);
  const projRef = useRef(project); projRef.current = project;
  const activeRef = useRef(active); activeRef.current = active;
  const adaptiveRef = useRef(adaptive); adaptiveRef.current = adaptive;
  const morphDur = useRef(0.5);
  const firstLoad = useRef(true);
  const playRef = useRef({ playing: false, idx: 0, t: 0, dir: 1 });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const q = QUALITY[project.quality];
  const count = Math.min(project.count, q.maxCount);
  const activeLayer = project.layers.find((l) => l.id === project.activeLayer) ?? project.layers[0];
  const upd = useCallback((fn: (p: Project3D) => Project3D) => setProject((p) => fn(p)), []);

  useEffect(() => {
    try { localStorage.setItem(DOCK_KEY, String(dockFrac)); } catch { /* storage can be unavailable in private windows */ }
  }, [dockFrac]);
  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    dock.style.height = "";
    dock.style.transition = "";
    dock.classList.remove("dragging");
  }, [collapsed, dockFrac, settle]);
  const onBarPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const workspace = workspaceRef.current, dock = dockRef.current;
    if (!workspace || !dock) return;
    const ws = workspace.getBoundingClientRect(), dr = dock.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: event.pointerId,
      startY: event.clientY,
      offset: dr.top - event.clientY,
      wsH: ws.height,
      wsBottom: ws.bottom,
      h: dr.height,
      moved: false,
    };
  };
  const onBarPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current, dock = dockRef.current;
    if (!drag || !dock || drag.id !== event.pointerId) return;
    if (!drag.moved) {
      if (Math.abs(event.clientY - drag.startY) < 6) return;
      drag.moved = true;
      dock.classList.add("dragging");
      dock.style.transition = "none";
    }
    drag.h = clamp(drag.wsBottom - (event.clientY + drag.offset), BAR_H, drag.wsH * DOCK_MAX);
    dock.style.height = `${drag.h}px`;
  };
  const finishDockDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag.moved) {
      if (!cancelled) setCollapsed((value) => !value);
      return;
    }
    if (drag.h < CLOSE_BELOW) setCollapsed(true);
    else {
      setCollapsed(false);
      setDockFrac(clamp(drag.h / drag.wsH, DOCK_MIN, DOCK_MAX));
    }
    setSettle((value) => value + 1);
  };
  const onBarKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setCollapsed((value) => !value);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const step = event.key === "ArrowUp" ? 0.06 : -0.06;
      if (collapsed) {
        if (step > 0) setCollapsed(false);
        return;
      }
      setDockFrac((value) => clamp(value + step, DOCK_MIN, DOCK_MAX));
    }
  };

  /* engine lifecycle */
  useEffect(() => {
    const canvas = canvasRef.current!, host = hostRef.current!;
    const sim = new Simulation(), cam = new OrbitCamera(), renderer = createRenderer(canvas, GLRenderer, GLRenderer.supported);
    simRef.current = sim; camRef.current = cam; rendRef.current = renderer; cam.apply(projRef.current.camera);
    const ptr = new PointerController(canvas, cam, sim, () => projRef.current.interaction);
    const ro = new ResizeObserver(() => { const r = host.getBoundingClientRect(); renderer.resize(r.width, r.height, Math.min(window.devicePixelRatio || 1, QUALITY[projRef.current.quality].dpr)); });
    ro.observe(host);
    let raf = 0, last = performance.now(), acc = 0, frames = 0, slow = 0, fast = 0, scale = 1, statT = performance.now(), visible = true;
    const io = new IntersectionObserver((e) => { visible = e[0]?.isIntersecting ?? true; }); io.observe(host);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!activeRef.current || document.hidden || !visible) { last = now; return; }
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const p = projRef.current, pr = playRef.current;
      if (pr.playing && !sim.morphing && p.timeline.steps.length) {
        pr.t += dt;
        const step = p.timeline.steps[pr.idx % p.timeline.steps.length];
        if (pr.t >= step.hold) {
          pr.t = 0;
          let next = pr.idx + pr.dir;
          if (p.timeline.mode === "pingpong") { if (next >= p.timeline.steps.length || next < 0) { pr.dir = -pr.dir; next = pr.idx + pr.dir; } }
          else if (next >= p.timeline.steps.length) { if (p.timeline.mode === "once") { pr.playing = false; setPlaying(false); next = pr.idx; } else next = 0; }
          if (next !== pr.idx || !pr.playing) {
            pr.idx = Math.max(0, Math.min(p.timeline.steps.length - 1, next));
            const g = p.timeline.steps[pr.idx].generator, f = buildFormation([makeLayer(g)], Math.min(p.count, QUALITY[p.quality].maxCount), 1);
            sim.morphTo(f, { duration: p.timeline.morph, easing: p.timeline.easing });
          }
        }
      }
      const t0 = performance.now();
      sim.update(dt); cam.update(dt);
      const simMs = performance.now() - t0;
      const input: RenderInput = { n: sim.active, pos: sim.pos, vel: sim.vel, nrm: sim.nrm, t: sim.t, size: sim.size, alpha: sim.alpha, phase: sim.phase, layer: sim.layer, attrVersion: sim.attrVersion, time: sim.time, camera: cam, look: p.look, layers: p.layers.map((l) => ({ palette: l.palette, sizeMul: l.sizeMul, opacityMul: l.opacityMul })), beams: p.beams, bloomLevel: QUALITY[p.quality].bloom, focus: cam.distance, range: Math.max(0.5, sim.radius) };
      renderer.render(input);
      frames++; acc += dt;
      if (adaptiveRef.current) { const ft = dt * 1000; if (ft > 24) { slow++; fast = 0; } else if (ft < 14) { fast++; slow = 0; } else { slow = 0; fast = 0; } if (slow > 40 && scale > 0.25) { scale *= 0.85; sim.setActiveFraction(scale); slow = 0; } if (fast > 240 && scale < 1) { scale = Math.min(1, scale * 1.08); sim.setActiveFraction(scale); fast = 0; } } else if (scale < 1) { scale = 1; sim.setActiveFraction(1); }
      if (now - statT > 600) { setStats({ fps: Math.round(frames / Math.max(0.001, acc)), sim: Math.round(simMs * 10) / 10, gpu: Math.round(renderer.renderMs * 10) / 10, n: sim.active, backend: renderer.info.kind, gpuName: renderer.info.gpu, hdr: renderer.info.hdr, active: scale }); frames = 0; acc = 0; statT = now; }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); ptr.dispose(); renderer.dispose(); simRef.current = null; rendRef.current = null; };
  }, []);

  /* formation: debounce regeneration, morph on change */
  const genKey = useMemo(() => JSON.stringify([project.layers.map((l) => [l.generator, l.params, l.seed, l.share, l.visible, l.offset, l.scale, l.rotY]), count]), [project.layers, count]);
  useEffect(() => {
    const sim = simRef.current; if (!sim) return;
    const heavy = project.layers.some((l) => getGenerator(l.generator).heavy);
    const id = window.setTimeout(() => {
      setBusy(true);
      window.setTimeout(() => {
        try {
          const current = projRef.current;
          const f = buildFormation(current.layers, count, 1);
          if (firstLoad.current || sim.n === 0) { sim.load(f); firstLoad.current = false; } else sim.morphTo(f, { duration: morphDur.current, easing: "easeInOut" });
          morphDur.current = 0.5;
        } finally { setBusy(false); }
      }, 20);
    }, firstLoad.current ? 0 : heavy ? 380 : 140);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genKey]);
  useEffect(() => { simRef.current?.configure(project.sim, project.behaviors, project.deformers, q); }, [project.sim, project.behaviors, project.deformers, q]);
  useEffect(() => { const c = camRef.current; if (!c) return; c.ortho = project.camera.projection === "orthographic"; c.fov = project.camera.fov; c.autoRotate = project.camera.autoRotate; c.near = project.camera.near; c.far = project.camera.far; }, [project.camera.projection, project.camera.fov, project.camera.autoRotate, project.camera.near, project.camera.far]);
  useEffect(() => { const r = hostRef.current?.getBoundingClientRect(); if (r) rendRef.current?.resize(r.width, r.height, Math.min(window.devicePixelRatio || 1, q.dpr)); }, [q.dpr]);
  useEffect(() => { const id = window.setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(project)); } catch { /* ignore */ } }, 700); return () => window.clearTimeout(id); }, [project]);
  useEffect(() => {
    if (tab !== "export") return;
    let cancelled = false;
    setExportBundle(null);
    setBusy(true);
    const id = window.setTimeout(() => {
      try {
        const current = projRef.current;
        const exportProject = { ...current, camera: camRef.current?.toSettings() ?? current.camera };
        const formation = buildFormation(exportProject.layers, Math.min(exportProject.count, QUALITY[exportProject.quality].maxCount), 1);
        const bundle = generate3DCode(exportProject, formation);
        if (!cancelled) setExportBundle(bundle);
      } catch (error) {
        if (!cancelled) setNotice(`Code export failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 20);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [tab, project, count]);
  useEffect(() => { // lazily render real preset thumbnails when the presets tab is open
    if (tab !== "presets" || !active) return;
    let i = 0, stop = false;
    const next = () => { if (stop || i >= GENERATORS.length) return; const g = GENERATORS[i++]; try { const u = makeThumb(g.id); setThumbs((t) => (t[g.id] ? t : { ...t, [g.id]: u })); } catch { /* skip */ } window.setTimeout(next, 16); };
    next(); return () => { stop = true; };
  }, [tab, active]);
  useEffect(() => { if (!notice) return; const id = window.setTimeout(() => setNotice(""), 5000); return () => window.clearTimeout(id); }, [notice]);

  /* actions */
  const choosePreset = (id: GeneratorId) => {
    morphDur.current = 1.8; const next = projectFromGenerator(id, projRef.current); camRef.current?.apply({ ...next.camera, autoRotate: next.camera.autoRotate }); setProject(next);
  };
  const addLayer = (g: GeneratorId) => upd((p) => { if (p.layers.length >= MAX_LAYERS) return p; const l = makeLayer(g, { seed: p.layers.length + 1, share: 0.5, name: getGenerator(g).name }); return { ...p, layers: [...p.layers, l], activeLayer: l.id }; });
  const setLayer = (id: string, patch: Partial<Layer>) => upd((p) => ({ ...p, layers: p.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const setBeam = (id: string, patch: Partial<LightBeam>) => upd((p) => ({ ...p, beams: p.beams.map((beam) => (beam.id === id ? { ...beam, ...patch } : beam)) }));
  const addBeam = (style: LightBeamStyle = "shaft") => {
    if (projRef.current.beams.length >= MAX_LIGHT_BEAMS) { setNotice(`Projects support up to ${MAX_LIGHT_BEAMS} light beams.`); return; }
    upd((p) => {
      if (p.beams.length >= MAX_LIGHT_BEAMS) return p;
      const beam = makeLightBeam({ style, name: `${style[0].toUpperCase()}${style.slice(1)} beam ${p.beams.length + 1}`, seed: p.beams.length + 1 });
      return { ...p, beams: [...p.beams, beam] };
    });
  };
  const duplicateBeam = (beam: LightBeam) => {
    if (projRef.current.beams.length >= MAX_LIGHT_BEAMS) { setNotice(`Projects support up to ${MAX_LIGHT_BEAMS} light beams.`); return; }
    upd((p) => p.beams.length >= MAX_LIGHT_BEAMS ? p : {
      ...p, beams: [...p.beams, { ...beam, id: newId("beam"), name: `${beam.name} copy`, origin: [...beam.origin] }],
    });
  };
  const setLook = (patch: Partial<Look>) => upd((p) => ({ ...p, look: { ...p.look, ...patch } }));
  const snapshotInput = (): RenderInput | null => { const s = simRef.current, c = camRef.current; if (!s || !c) return null; const p = projRef.current; return { n: s.active, pos: s.pos, vel: s.vel, nrm: s.nrm, t: s.t, size: s.size, alpha: s.alpha, phase: s.phase, layer: s.layer, attrVersion: s.attrVersion + 1000000, time: s.time, camera: c, look: p.look, layers: p.layers.map((l) => ({ palette: l.palette, sizeMul: l.sizeMul, opacityMul: l.opacityMul })), beams: p.beams, bloomLevel: QUALITY[p.quality].bloom, focus: c.distance, range: Math.max(0.5, s.radius) }; };
  const exportPng = async () => {
    const r = rendRef.current, inp = snapshotInput(), host = hostRef.current; if (!r || !inp || !host) return;
    const b = host.getBoundingClientRect(), w = Math.round(b.width * expOpts.scale), h = Math.round(b.height * expOpts.scale);
    setBusy(true); const blob = await r.snapshot(inp, Math.min(w, 8192), Math.min(h, 8192), expOpts.transparent); setBusy(false);
    if (blob) download(blob, `particle-studio-3d-${Date.now()}.png`); else setNotice("PNG export failed (canvas too large for this device).");
  };
  const exportJson = () => { const c = camRef.current; const p = { ...projRef.current, camera: c ? c.toSettings() : projRef.current.camera }; download(new Blob([serializeProject(p)], { type: "application/json" }), `${p.name.replace(/\W+/g, "-").toLowerCase()}.particle3d.json`); };
  const importJson = async (file: File) => {
    try { const res = migrateProject(JSON.parse(await file.text())); morphDur.current = 1; setProject(res.project); camRef.current?.apply(res.project.camera); setNotice(res.warnings.length ? res.warnings.join(" ") : "Project loaded."); } catch { setNotice("That file is not valid JSON."); }
  };
  const recordVideo = () => {
    const canvas = canvasRef.current; if (!canvas || recording || typeof MediaRecorder === "undefined") { if (typeof MediaRecorder === "undefined") setNotice("Video recording is not supported in this browser."); return; }
    const stream = canvas.captureStream(30), mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)), rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 }), chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); }; rec.onstop = () => { download(new Blob(chunks, { type: "video/webm" }), `particle-studio-3d-${Date.now()}.webm`); setRecording(false); };
    rec.start(); setRecording(true); window.setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, expOpts.seconds * 1000);
  };
  const togglePlay = () => { const pr = playRef.current; pr.playing = !pr.playing; pr.t = 0; setPlaying(pr.playing); };
  const explode = () => { const s = simRef.current; if (s) s.burst(0, 0, 0, 0, 9 * Math.max(0.5, s.radius)); };
  const addTextLayer = () => {
    const existing = project.layers.find((l) => l.generator === "text3d");
    if (existing) { upd((p) => ({ ...p, activeLayer: existing.id })); setTab("text"); return; }
    if (project.layers.length >= MAX_LAYERS) { setNotice(`Remove a layer first; projects support up to ${MAX_LAYERS} layers.`); return; }
    const layer = makeLayer("text3d", { name: "3D Text", share: 0.4, seed: project.layers.length + 1, params: { ...defaultParams(getGenerator("text3d")), text: textDraft.slice(0, 48) } });
    upd((p) => ({ ...p, layers: [...p.layers, layer], activeLayer: layer.id }));
    setTab("text");
  };
  const beamPanel = (
    <>
      <Section title="Dust formations">
        <p className="s3-hint">Choose one of three deterministic dust volumes. Their particles use the same simulation, interactions, and rendering as the other 3D formations.</p>
        <div className="s3-actions">
          {DUST_PRESETS.map((preset) => <button key={preset.id} type="button" className="s3-btn" onClick={() => choosePreset(preset.id)}>{preset.label}</button>)}
        </div>
      </Section>
      <Section title={`Light beams · ${project.beams.length}/${MAX_LIGHT_BEAMS}`} right={
        <Select value={"" as LightBeamStyle | ""} options={[
          { value: "", label: "+ Add beam" } as never,
          ...(["shaft", "fan", "arc", "helix"] as LightBeamStyle[]).map((style) => ({ value: style, label: style[0].toUpperCase() + style.slice(1) })),
        ]} onChange={(style) => style && addBeam(style as LightBeamStyle)} />
      }>
        <p className="s3-hint">Light beams stay invisible; only existing particles inside them reflect the light. The same lights work with every 3D preset and never change particle size.</p>
        {project.beams.map((beam, i) => (
          <details key={beam.id} className={"s3-item" + (beam.enabled ? "" : " off")}>
            <summary>
              <input type="checkbox" checked={beam.enabled} onClick={(event) => event.stopPropagation()} onChange={(event) => setBeam(beam.id, { enabled: event.target.checked })} aria-label={`Enable ${beam.name}`} />
              <span>{beam.name || `Beam ${i + 1}`}</span>
            </summary>
            <TextField label="Name" value={beam.name} onChange={(value) => setBeam(beam.id, { name: value.slice(0, 32) })} />
            <Select label="Beam style" value={beam.style} options={[
              { value: "shaft", label: "Soft shaft" },
              { value: "fan", label: "Widening fan" },
              { value: "arc", label: "Curved arc" },
              { value: "helix", label: "Helical beam" },
            ]} onChange={(value) => setBeam(beam.id, { style: value })} />
            <Vec3Input label="Origin" value={beam.origin} range={1} onChange={(origin) => setBeam(beam.id, { origin })} />
            <Range label="Azimuth" value={beam.azimuth} min={-180} max={180} step={1} onChange={(value) => setBeam(beam.id, { azimuth: value })} hint="Horizontal angle around the scene." />
            <Range label="Elevation" value={beam.elevation} min={-89} max={89} step={1} onChange={(value) => setBeam(beam.id, { elevation: value })} hint="Vertical angle above or below the horizon." />
            <Range label="Length" value={beam.length} min={0.05} max={8} step={0.01} onChange={(value) => setBeam(beam.id, { length: value })} />
            <Range label="Width" value={beam.width} min={0.002} max={0.5} step={0.002} onChange={(value) => setBeam(beam.id, { width: value })} />
            <Range label="Spread" value={beam.spread} min={0} max={3} step={0.01} onChange={(value) => setBeam(beam.id, { spread: value })} />
            {beam.style === "arc" && <Range label="Bend" value={beam.bend} min={-2} max={2} step={0.01} onChange={(value) => setBeam(beam.id, { bend: value })} />}
            {beam.style === "helix" && <Range label="Twist turns" value={beam.twist} min={-8} max={8} step={0.05} onChange={(value) => setBeam(beam.id, { twist: value })} />}
            <Range label="Intensity" value={beam.intensity} min={0} max={2} step={0.01} onChange={(value) => setBeam(beam.id, { intensity: value })} />
            <Range label="Palette position" value={beam.colorPosition} min={0} max={1} step={0.01} onChange={(value) => setBeam(beam.id, { colorPosition: value })} hint="Selects a position in the shared Look palette." />
            <Range label="Fade in" value={beam.fadeIn} min={0.01} max={1} step={0.01} onChange={(value) => setBeam(beam.id, { fadeIn: value })} />
            <Range label="Fade out" value={beam.fadeOut} min={0.01} max={1} step={0.01} onChange={(value) => setBeam(beam.id, { fadeOut: value })} />
            <Range label="Motion speed" value={beam.speed} min={0} max={8} step={0.01} onChange={(value) => setBeam(beam.id, { speed: value })} />
            <Range label="Shape motion" value={beam.motion} min={0} max={1} step={0.01} onChange={(value) => setBeam(beam.id, { motion: value })} />
            <Range label="Seed" value={beam.seed} min={0} max={999} step={1} onChange={(value) => setBeam(beam.id, { seed: value })} />
            <div className="s3-actions">
              <button type="button" className="s3-btn" disabled={project.beams.length >= MAX_LIGHT_BEAMS} onClick={() => duplicateBeam(beam)}>Duplicate</button>
              <button type="button" className="s3-btn danger" onClick={() => upd((p) => ({ ...p, beams: p.beams.filter((item) => item.id !== beam.id) }))}>Remove</button>
            </div>
          </details>
        ))}
        {!project.beams.length && <p className="s3-hint">No beams yet. Add one above, then duplicate or tune each beam independently.</p>}
      </Section>
    </>
  );

  /* panels */
  const presetGroups = [...new Set(GENERATORS.map((g) => g.tag))];
  const shownGenerators = GENERATORS.filter((g) =>
    (presetCategory === "All" || g.tag === presetCategory) &&
    `${g.name} ${g.tag} ${g.description}`.toLowerCase().includes(presetSearch.trim().toLowerCase()),
  );
  const presets = (
    <>
      <p className="s3-hint">70 procedural formations plus editable 3D text. Search or filter by category, then pick one to morph the particles into it.</p>
      <TextField label="Search presets" value={presetSearch} onChange={setPresetSearch} />
      <Select label="Category" value={presetCategory} options={["All", ...presetGroups].map((v) => ({ value: v, label: v }))} onChange={setPresetCategory} />
      <div className="s3-grid">
        {shownGenerators.map((g) => (
          <button key={g.id} type="button" className={"s3-card" + (activeLayer.generator === g.id && project.layers.length === 1 ? " on" : "")} onClick={() => choosePreset(g.id)} title={g.description}>
            <span className="s3-thumb">{thumbs[g.id] ? <img src={thumbs[g.id]} alt="" /> : <i />}</span>
            <b>{g.name}</b><small>{g.tag}</small>
          </button>
        ))}
      </div>
      {!shownGenerators.length && <p className="s3-hint">No presets match that search.</p>}
    </>
  );
  const def = getGenerator(activeLayer.generator);
  const setParam = (key: string, v: number | boolean | string) => setLayer(activeLayer.id, { params: { ...activeLayer.params, [key]: v } });
  const paramControl = (d: ParamDef) => {
    const v = activeLayer.params[d.key];
    if (d.type === "range") return <Range key={d.key} label={d.label} value={typeof v === "number" ? v : d.def} min={d.min} max={d.max} step={d.step} hint={d.hint} onChange={(x) => setParam(d.key, x)} />;
    if (d.type === "toggle") return <Toggle key={d.key} label={d.label} value={typeof v === "boolean" ? v : d.def} hint={d.hint} onChange={(x) => setParam(d.key, x)} />;
    if (d.type === "select") return <Select key={d.key} label={d.label} value={typeof v === "string" ? v : d.def} options={d.options} hint={d.hint} onChange={(x) => setParam(d.key, x)} />;
    return <TextField key={d.key} label={d.label} value={typeof v === "string" ? v : d.def} hint={d.hint} onChange={(x) => setParam(d.key, x)} />;
  };
  const shape = (
    <>
      <Section title="Particles">
        <Range label="Particle count" value={project.count} min={2000} max={q.maxCount} step={1000} onChange={(v) => upd((p) => ({ ...p, count: v }))} hint={`Capped at ${q.maxCount.toLocaleString()} by the ${project.quality} quality level.`} />
        <Select label="Quality" value={project.quality} options={(["low", "medium", "high", "ultra"] as QualityLevel[]).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} onChange={(v) => upd((p) => ({ ...p, quality: v }))} />
        <Toggle label="Adaptive quality (auto-reduce on slow devices)" value={adaptive} onChange={setAdaptive} />
      </Section>
      <Section title="Layers" right={<Select value={"" as GeneratorId | ""} options={[{ value: "", label: "+ Add layer" } as never, ...GENERATORS.map((g) => ({ value: g.id, label: g.name }))]} onChange={(v) => v && addLayer(v as GeneratorId)} />}>
        <div className="s3-layers">
          {project.layers.map((l) => (
            <div key={l.id} className={"s3-layer" + (l.id === activeLayer.id ? " on" : "")}>
              <button type="button" onClick={() => upd((p) => ({ ...p, activeLayer: l.id }))}>{l.name}</button>
              <label title="Visible"><input type="checkbox" checked={l.visible} onChange={(e) => setLayer(l.id, { visible: e.target.checked })} /></label>
              <button type="button" className="s3-x" disabled={project.layers.length <= 1} onClick={() => upd((p) => { const ls = p.layers.filter((x) => x.id !== l.id); return { ...p, layers: ls, activeLayer: ls[0].id }; })} aria-label="Remove layer">×</button>
            </div>
          ))}
        </div>
        <Range label="Share of particles" value={activeLayer.share} min={0.05} max={4} step={0.05} onChange={(v) => setLayer(activeLayer.id, { share: v })} />
        <Range label="Scale" value={activeLayer.scale} min={0.2} max={3} step={0.01} onChange={(v) => setLayer(activeLayer.id, { scale: v })} />
        <Range label="Rotate Y (°)" value={activeLayer.rotY} min={-180} max={180} step={1} onChange={(v) => setLayer(activeLayer.id, { rotY: v })} />
        <Vec3Input label="Offset" value={activeLayer.offset} onChange={(v) => setLayer(activeLayer.id, { offset: v })} />
        <Range label="Seed" value={activeLayer.seed} min={1} max={999} step={1} onChange={(v) => setLayer(activeLayer.id, { seed: v })} />
      </Section>
      <Section title={def.name} right={<small className="s3-method" title={def.method}>{def.method.split(",")[0]}</small>}>
        <p className="s3-hint">{def.description}</p>
        {def.params.map(paramControl)}
        <button type="button" className="s3-btn" onClick={() => setLayer(activeLayer.id, { params: defaultParams(def) })}>Reset shape settings</button>
      </Section>
    </>
  );
  const textLayer = project.layers.find((l) => l.generator === "text3d");
  const textPanel = (
    <>
      <Section title="3D text">
        <p className="s3-hint">Create editable particle text as its own layer. Use Shape → Layers to position it and choose its colour palette.</p>
        {textLayer ? (
          <>
            <Select label="Text layer" value={textLayer.id} options={project.layers.filter((l) => l.generator === "text3d").map((l) => ({ value: l.id, label: l.name }))} onChange={(id) => upd((p) => ({ ...p, activeLayer: id }))} />
            <TextField label="Text content" value={String(textLayer.params.text ?? "PARTICLE")} onChange={(value) => setLayer(textLayer.id, { params: { ...textLayer.params, text: value.slice(0, 48) } })} hint="Up to 48 characters." />
            <Range label="Text size" value={Number(textLayer.params.textScale ?? 0.9)} min={0.3} max={1.5} step={0.01} onChange={(value) => setLayer(textLayer.id, { params: { ...textLayer.params, textScale: value } })} />
            <Range label="Extrusion depth" value={Number(textLayer.params.depth ?? 0.12)} min={0} max={0.5} step={0.01} onChange={(value) => setLayer(textLayer.id, { params: { ...textLayer.params, depth: value } })} />
            <div className="s3-actions">
              <button type="button" className="s3-btn" onClick={() => upd((p) => ({ ...p, activeLayer: textLayer.id }))}>Select in Shape panel</button>
              <button type="button" className="s3-btn danger" onClick={() => upd((p) => { const layers = p.layers.filter((l) => l.id !== textLayer.id); return { ...p, layers, activeLayer: layers[0]?.id ?? p.activeLayer }; })}>Remove text</button>
            </div>
          </>
        ) : (
          <>
            <TextField label="New text" value={textDraft} onChange={(value) => setTextDraft(value.slice(0, 48))} hint="Up to 48 characters." />
            <button type="button" className="s3-btn on" onClick={addTextLayer}>Add 3D text layer</button>
          </>
        )}
      </Section>
      <Section title="Pointer gestures">
        <p className="s3-hint">Drag to orbit; Shift-drag or right-drag to pan; wheel or pinch to zoom. Pointer forces and tap bursts are configured in Interact.</p>
      </Section>
    </>
  );
  const setBeh = (id: string, patch: Partial<Behavior>) => upd((p) => ({ ...p, behaviors: p.behaviors.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  const moveBeh = (i: number, d: number) => upd((p) => { const a = [...p.behaviors], j = i + d; if (j < 0 || j >= a.length) return p; [a[i], a[j]] = [a[j], a[i]]; return { ...p, behaviors: a }; });
  const setDef = (id: string, patch: Partial<Deformer>) => upd((p) => ({ ...p, deformers: p.deformers.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  const interact = (
    <>
      <Section title="Pointer interaction">
        <Select label="Hover / drag force" value={project.interaction.tool} options={(["none", "attract", "repel", "swirl", "vortex", "push", "pull", "stir", "scatter", "gather", "distort"] as const).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} onChange={(v) => upd((p) => ({ ...p, interaction: { ...p.interaction, tool: v } }))} />
        <Range label="Radius" value={project.interaction.radius} min={0.05} max={2} step={0.01} onChange={(v) => upd((p) => ({ ...p, interaction: { ...p.interaction, radius: v } }))} />
        <Range label="Strength" value={project.interaction.strength} min={0} max={5} step={0.05} onChange={(v) => upd((p) => ({ ...p, interaction: { ...p.interaction, strength: v } }))} />
        <Segmented value={project.interaction.dragMode} options={[{ value: "orbit", label: "Drag = orbit" }, { value: "force", label: "Drag = force" }]} onChange={(v) => upd((p) => ({ ...p, interaction: { ...p.interaction, dragMode: v } }))} />
        <Toggle label="Click / tap bursts particles" value={project.interaction.clickAction === "burst"} onChange={(v) => upd((p) => ({ ...p, interaction: { ...p.interaction, clickAction: v ? "burst" : "none" } }))} />
        <div className="s3-actions"><button type="button" className="s3-btn" onClick={explode}>Burst now</button><button type="button" className="s3-btn" onClick={() => simRef.current?.reset()}>Reset particles</button></div>
      </Section>
    </>
  );
  const motion = (
    <>
      <Section title="Behaviours (top to bottom)" right={<Select value={"" as BehaviorType | ""} options={[{ value: "", label: "+ Add" } as never, ...BEHAVIOR_TYPES.map((t) => ({ value: t, label: BEHAVIOR_DEFS[t].label }))]} onChange={(v) => v && upd((p) => ({ ...p, behaviors: [...p.behaviors, makeBehavior({ type: v as BehaviorType })] }))} />}>
        {project.behaviors.map((b, i) => { const d = BEHAVIOR_DEFS[b.type]; return (
          <details key={b.id} className={"s3-item" + (b.enabled ? "" : " off")}>
            <summary><input type="checkbox" checked={b.enabled} onClick={(e) => e.stopPropagation()} onChange={(e) => setBeh(b.id, { enabled: e.target.checked })} aria-label="Enabled" /><span>{d.label}</span></summary>
            <p className="s3-hint">{d.hint}</p>
            {d.fields.map((f) => <Range key={f.key} label={f.label} value={b[f.key]} min={f.min} max={f.max} step={f.step} onChange={(v) => setBeh(b.id, { [f.key]: v } as Partial<Behavior>)} />)}
            {d.dir && <Vec3Input label="Direction" value={b.dir} onChange={(v) => setBeh(b.id, { dir: v })} />}
            {d.center && <Vec3Input label="Centre" value={b.center} onChange={(v) => setBeh(b.id, { center: v })} />}
            {d.falloff && <Select label="Falloff" value={b.falloff} options={(["none", "linear", "smooth", "inverse"] as const).map((v) => ({ value: v, label: v }))} onChange={(v) => setBeh(b.id, { falloff: v })} />}
            {d.expr && (["ax", "ay", "az"] as const).map((n, k) => <TextField key={n} mono label={n} value={b.expr?.[k] ?? "0"} onChange={(v) => { const e = [...(b.expr ?? ["0", "0", "0"])] as [string, string, string]; e[k] = v; setBeh(b.id, { expr: e }); }} />)}
            <Select label="Blend" value={b.blend} options={[{ value: "add", label: "Add" }, { value: "replace", label: "Replace locally" }, { value: "max", label: "Strongest wins" }]} onChange={(v) => setBeh(b.id, { blend: v })} />
            <Select label="Animate strength" value={b.anim} options={[{ value: "none", label: "Off" }, { value: "sine", label: "Sine" }, { value: "pulse", label: "Pulse" }, { value: "noise", label: "Noise" }]} onChange={(v) => setBeh(b.id, { anim: v })} />
            {b.anim !== "none" && <><Range label="Rate (Hz)" value={b.animRate} min={0.05} max={6} step={0.05} onChange={(v) => setBeh(b.id, { animRate: v })} /><Range label="Depth" value={b.animDepth} min={0} max={2} step={0.01} onChange={(v) => setBeh(b.id, { animDepth: v })} /></>}
            <div className="s3-actions"><button type="button" className="s3-btn" onClick={() => moveBeh(i, -1)}>↑</button><button type="button" className="s3-btn" onClick={() => moveBeh(i, 1)}>↓</button><button type="button" className="s3-btn danger" onClick={() => upd((p) => ({ ...p, behaviors: p.behaviors.filter((x) => x.id !== b.id) }))}>Remove</button></div>
          </details>); })}
      </Section>
      <Section title="Shape deformers" right={<Select value={"" as DeformerType | ""} options={[{ value: "", label: "+ Add" } as never, ...DEFORMER_TYPES.map((t) => ({ value: t, label: DEFORMER_DEFS[t].label }))]} onChange={(v) => v && upd((p) => ({ ...p, deformers: [...p.deformers, makeDeformer({ type: v as DeformerType })] }))} />}>
        {project.deformers.map((dz) => { const d = DEFORMER_DEFS[dz.type]; return (
          <details key={dz.id} className={"s3-item" + (dz.enabled ? "" : " off")}>
            <summary><input type="checkbox" checked={dz.enabled} onClick={(e) => e.stopPropagation()} onChange={(e) => setDef(dz.id, { enabled: e.target.checked })} aria-label="Enabled" /><span>{d.label}</span></summary>
            <p className="s3-hint">{d.hint}</p>
            <Range label={d.amount[0]} value={dz.amount} min={d.amount[1]} max={d.amount[2]} step={d.amount[3]} onChange={(v) => setDef(dz.id, { amount: v })} />
            {d.scale && <Range label={d.scale[0]} value={dz.scale} min={d.scale[1]} max={d.scale[2]} step={d.scale[3]} onChange={(v) => setDef(dz.id, { scale: v })} />}
            {d.speed && <Range label={d.speed[0]} value={dz.speed} min={d.speed[1]} max={d.speed[2]} step={d.speed[3]} onChange={(v) => setDef(dz.id, { speed: v })} />}
            {d.axis && <Segmented value={dz.axis} options={[{ value: "x", label: "X" }, { value: "y", label: "Y" }, { value: "z", label: "Z" }]} onChange={(v) => setDef(dz.id, { axis: v })} />}
            <button type="button" className="s3-btn danger" onClick={() => upd((p) => ({ ...p, deformers: p.deformers.filter((x) => x.id !== dz.id) }))}>Remove</button>
          </details>); })}
      </Section>
      <Section title="Physics">
        <Range label="Substeps" value={project.sim.substeps} min={1} max={4} step={1} onChange={(v) => upd((p) => ({ ...p, sim: { ...p.sim, substeps: v } }))} hint="Higher = stiffer, more accurate springs (costs CPU)." />
        <Range label="Max speed" value={project.sim.maxSpeed} min={2} max={80} step={1} onChange={(v) => upd((p) => ({ ...p, sim: { ...p.sim, maxSpeed: v } }))} />
        <Range label="Mass variation" value={project.sim.massVariation} min={0} max={1} step={0.01} onChange={(v) => upd((p) => ({ ...p, sim: { ...p.sim, massVariation: v } }))} />
        <Range label="Mass influence" value={project.sim.massInfluence} min={0} max={1} step={0.01} onChange={(v) => upd((p) => ({ ...p, sim: { ...p.sim, massInfluence: v } }))} />
      </Section>
    </>
  );
  const look = (
    <>
      <Section title="Colour">
        <div className="s3-chips">{PALETTE_PRESETS.map((pr) => <button key={pr.name} type="button" className="s3-chip" style={{ background: `linear-gradient(90deg, ${pr.stops.map((s) => s.color).join(",")})` }} onClick={() => setLook({ palette: pr.stops.map((s) => ({ ...s })) })} title={pr.name} aria-label={pr.name} />)}</div>
        <GradientEditor stops={project.look.palette} onChange={(s) => setLook({ palette: s })} />
        <Range label="Depth colour shift" value={project.look.depthColor} min={-1} max={1} step={0.01} onChange={(v) => setLook({ depthColor: v })} />
        <Range label="Speed colour shift" value={project.look.velocityColor} min={0} max={1} step={0.01} onChange={(v) => setLook({ velocityColor: v })} />
      </Section>
      <Section title="Particles">
        <Range label="Size" value={project.look.size} min={0.002} max={0.04} step={0.0005} onChange={(v) => setLook({ size: v })} />
        <Range label="Size variation" value={project.look.sizeVariation} min={0} max={1} step={0.01} onChange={(v) => setLook({ sizeVariation: v })} />
        <Toggle label="Perspective sizing (nearer = bigger)" value={project.look.sizeAttenuation} onChange={(v) => setLook({ sizeAttenuation: v })} />
        <Select label="Shape" value={project.look.shape} options={(["soft", "hard", "ring", "spark", "square", "diamond"] as const).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} onChange={(v) => setLook({ shape: v })} />
        <Range label="Softness" value={project.look.softness} min={0} max={1} step={0.01} onChange={(v) => setLook({ softness: v })} />
        <Range label="Streak along motion" value={project.look.velocityStretch} min={0} max={2} step={0.01} onChange={(v) => setLook({ velocityStretch: v })} />
        <Range label="Spin" value={project.look.spin} min={-6} max={6} step={0.05} onChange={(v) => setLook({ spin: v })} />
      </Section>
      <Section title="Light & depth">
        <Select label="Blend" value={project.look.blend} options={[{ value: "additive", label: "Additive glow" }, { value: "screen", label: "Screen" }, { value: "alpha", label: "Alpha (opaque)" }]} onChange={(v) => setLook({ blend: v })} />
        <Range label="Opacity" value={project.look.opacity} min={0.05} max={2} step={0.01} onChange={(v) => setLook({ opacity: v })} />
        <Range label="Emission" value={project.look.emission} min={0.1} max={4} step={0.01} onChange={(v) => setLook({ emission: v })} />
        <Toggle label="Keep brightness constant when count changes" value={project.look.autoNormalize} onChange={(v) => setLook({ autoNormalize: v })} />
        <Range label="Edge brightness" value={project.look.edgeBrightness} min={0} max={3} step={0.01} onChange={(v) => setLook({ edgeBrightness: v })} />
        <Range label="Depth fade" value={project.look.depthFade} min={0} max={1} step={0.01} onChange={(v) => setLook({ depthFade: v })} />
        <Range label="Surface lighting" value={project.look.lighting} min={0} max={1} step={0.01} onChange={(v) => setLook({ lighting: v })} />
        <Range label="Light azimuth (°)" value={project.look.lightAzimuth} min={-180} max={180} step={1} onChange={(v) => setLook({ lightAzimuth: v })} />
        <Range label="Light elevation (°)" value={project.look.lightElevation} min={-90} max={90} step={1} onChange={(v) => setLook({ lightElevation: v })} />
      </Section>
      <Section title="Post-processing">
        <Range label="Glow (bloom)" value={project.look.glow} min={0} max={3} step={0.01} onChange={(v) => setLook({ glow: v })} />
        <Range label="Glow spread" value={project.look.glowRadius} min={0} max={1.5} step={0.01} onChange={(v) => setLook({ glowRadius: v })} />
        <Range label="Trails" value={project.look.trails} min={0} max={0.95} step={0.01} onChange={(v) => setLook({ trails: v })} />
        <Range label="Exposure" value={project.look.exposure} min={0.2} max={4} step={0.01} onChange={(v) => setLook({ exposure: v })} />
        <Range label="Film grain" value={project.look.grain} min={0} max={1} step={0.01} onChange={(v) => setLook({ grain: v })} />
        <Range label="Vignette" value={project.look.vignette} min={0} max={1} step={0.01} onChange={(v) => setLook({ vignette: v })} />
        <label className="s3-text"><span>Background</span><input type="color" value={project.look.background} onChange={(e) => setLook({ background: e.target.value })} /></label>
        <Toggle label="Transparent background" value={project.look.transparent} onChange={(v) => setLook({ transparent: v })} />
      </Section>
    </>
  );
  const camera = (
    <Section title="Camera">
      <Segmented value={project.camera.projection} options={[{ value: "perspective", label: "Perspective" }, { value: "orthographic", label: "Orthographic" }]} onChange={(v) => upd((p) => ({ ...p, camera: { ...p.camera, projection: v } }))} />
      <Range label="Field of view (°)" value={project.camera.fov} min={15} max={100} step={1} onChange={(v) => upd((p) => ({ ...p, camera: { ...p.camera, fov: v } }))} />
      <Range label="Auto-rotate (rad/s)" value={project.camera.autoRotate} min={-1.5} max={1.5} step={0.01} onChange={(v) => upd((p) => ({ ...p, camera: { ...p.camera, autoRotate: v } }))} />
      <Range label="Near plane" value={project.camera.near} min={0.01} max={2} step={0.01} onChange={(v) => upd((p) => ({ ...p, camera: { ...p.camera, near: v } }))} />
      <Range label="Far plane" value={project.camera.far} min={5} max={200} step={1} onChange={(v) => upd((p) => ({ ...p, camera: { ...p.camera, far: v } }))} />
      <div className="s3-actions"><button type="button" className="s3-btn" onClick={() => { const c = camRef.current; if (c) { c.target = [0, 0, 0]; c.frame(simRef.current?.radius ?? 1, 1.25); } }}>Frame shape</button><button type="button" className="s3-btn" onClick={() => camRef.current?.apply(def.recipe.camera ? { ...project.camera, ...def.recipe.camera, target: [0, 0, 0] } : project.camera)}>Reset view</button></div>
      <p className="s3-hint">Drag to orbit, right-drag or Shift-drag to pan, wheel or pinch to zoom, click to burst.</p>
    </Section>
  );
  const timeline = (
    <>
      <Section title="Morph sequence" right={<button type="button" className={"s3-btn" + (playing ? " on" : "")} onClick={togglePlay}>{playing ? "Pause" : "Play"}</button>}>
        <p className="s3-hint">Plays presets one after another; particles keep their identity and flow into the next shape.</p>
        {project.timeline.steps.map((s, i) => (
          <div className="s3-step" key={s.id}>
            <Select value={s.generator} options={GENERATORS.map((g) => ({ value: g.id, label: g.name }))} onChange={(v) => upd((p) => ({ ...p, timeline: { ...p.timeline, steps: p.timeline.steps.map((x) => (x.id === s.id ? { ...x, generator: v } : x)) } }))} />
            <input type="number" min={0.2} max={60} step={0.5} value={s.hold} onChange={(e) => upd((p) => ({ ...p, timeline: { ...p.timeline, steps: p.timeline.steps.map((x) => (x.id === s.id ? { ...x, hold: Math.max(0.2, Number(e.target.value) || 3) } : x)) } }))} aria-label="Hold seconds" />
            <button type="button" className="s3-btn" onClick={() => { const f = buildFormation([makeLayer(s.generator)], count, 1); playRef.current.idx = i; simRef.current?.morphTo(f, { duration: project.timeline.morph, easing: project.timeline.easing }); }}>Go</button>
            <button type="button" className="s3-x" onClick={() => upd((p) => ({ ...p, timeline: { ...p.timeline, steps: p.timeline.steps.filter((x) => x.id !== s.id) } }))} aria-label="Remove step">×</button>
          </div>
        ))}
        <button type="button" className="s3-btn" disabled={project.timeline.steps.length >= 12} onClick={() => upd((p) => ({ ...p, timeline: { ...p.timeline, steps: [...p.timeline.steps, { id: newId("s"), generator: "sphere", hold: 3 }] } }))}>+ Add step</button>
      </Section>
      <Section title="Timing">
        <Range label="Morph duration (s)" value={project.timeline.morph} min={0.2} max={10} step={0.1} onChange={(v) => upd((p) => ({ ...p, timeline: { ...p.timeline, morph: v } }))} />
        <Select label="Easing" value={project.timeline.easing} options={EASING_NAMES.map((v) => ({ value: v as EasingName, label: v }))} onChange={(v) => upd((p) => ({ ...p, timeline: { ...p.timeline, easing: v } }))} />
        <Segmented value={project.timeline.mode} options={[{ value: "once", label: "Once" }, { value: "loop", label: "Loop" }, { value: "pingpong", label: "Ping-pong" }]} onChange={(v) => upd((p) => ({ ...p, timeline: { ...p.timeline, mode: v } }))} />
        <button type="button" className="s3-btn" onClick={explode}>Explode &amp; reform</button>
      </Section>
    </>
  );
  const selectedExport = EXPORT_FORMATS.find((format) => format.id === exportFormat) ?? EXPORT_FORMATS[0];
  const copyCode = async () => {
    if (!exportBundle) return;
    try { await navigator.clipboard.writeText(exportBundle[exportFormat]); setNotice("Code copied."); }
    catch { setNotice("Clipboard access failed; download the code instead."); }
  };
  const exportCode = (
    <Section title="Code and web export">
      <p className="s3-hint">Export a portable standalone scene or the separate HTML, CSS, runtime JavaScript and particle-data files. The standalone page embeds its particle data and runs without the studio or external dependencies. This lightweight export renders the selected formation, not the studio's full simulation engine.</p>
      <Select label="Format" value={exportFormat} options={EXPORT_FORMATS.map((format) => ({ value: format.id, label: format.label }))} onChange={setExportFormat} />
      <textarea className="s3-code" readOnly spellCheck={false} aria-label="Generated 3D scene code" value={exportBundle?.[exportFormat] ?? (busy ? "Preparing scene export…" : "")} />
      <div className="s3-actions">
        <button type="button" className="s3-btn" disabled={!exportBundle} onClick={() => void copyCode()}>Copy code</button>
        <button type="button" className="s3-btn" disabled={!exportBundle} onClick={() => exportBundle && download(new Blob([exportBundle[exportFormat]], { type: selectedExport.mime }), selectedExport.file)}>Download {selectedExport.file}</button>
      </div>
      <button type="button" className="s3-btn" disabled={!exportBundle} onClick={() => exportBundle && download(build3DProjectZip(exportBundle), `${exportSlug(project.name)}-3d-project.zip`)}>Download full project ZIP · HTML · CSS · JS · data · JSON · React</button>
    </Section>
  );
  const exportPanel = (
    <>
      <Section title="Project file">
        <TextField label="Name" value={project.name} onChange={(v) => upd((p) => ({ ...p, name: v }))} />
        <div className="s3-actions"><button type="button" className="s3-btn" onClick={exportJson}>Save JSON</button><button type="button" className="s3-btn" onClick={() => fileRef.current?.click()}>Load JSON</button><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ""; }} /></div>
        <button type="button" className="s3-btn danger" onClick={() => { morphDur.current = 1; const p = defaultProject(); setProject(p); camRef.current?.apply(p.camera); }}>Reset everything</button>
      </Section>
      {exportCode}
      <Section title="Image">
        <Segmented value={String(expOpts.scale) as "1" | "2" | "4"} options={[{ value: "1", label: "1×" }, { value: "2", label: "2×" }, { value: "4", label: "4×" }]} onChange={(v) => setExpOpts((o) => ({ ...o, scale: Number(v) }))} />
        <Toggle label="Transparent PNG" value={expOpts.transparent} onChange={(v) => setExpOpts((o) => ({ ...o, transparent: v }))} />
        <button type="button" className="s3-btn" onClick={() => void exportPng()}>Download PNG</button>
      </Section>
      <Section title="Video">
        <Range label="Length (s)" value={expOpts.seconds} min={2} max={30} step={1} onChange={(v) => setExpOpts((o) => ({ ...o, seconds: v }))} />
        <button type="button" className="s3-btn" disabled={recording} onClick={recordVideo}>{recording ? "Recording…" : "Record WebM"}</button>
      </Section>
      <Section title="Performance">
        <dl className="s3-stats"><dt>Renderer</dt><dd>{stats.backend || "…"}{stats.hdr ? " · HDR" : ""}</dd><dt>GPU</dt><dd>{stats.gpuName || "—"}</dd><dt>Frame rate</dt><dd>{stats.fps} fps</dd><dt>Particles</dt><dd>{stats.n.toLocaleString()} / {count.toLocaleString()}</dd><dt>Simulation</dt><dd>{stats.sim} ms</dd><dt>Render</dt><dd>{stats.gpu} ms</dd></dl>
      </Section>
    </>
  );
  const body = { presets, shape, dust: beamPanel, interact, text: textPanel, motion, look, camera, timeline, export: exportPanel }[tab];

  return (
    <div className="studio s3d" data-active={active}>
      <header className="s3-top">
        <div className="s3-brand"><b>Particle Studio</b><span>3D engine</span></div>
        {modeSwitch}
        <div className="s3-top-actions"><button type="button" className="s3-btn" onClick={explode}>Burst</button></div>
      </header>
      <div className="s3-main" ref={workspaceRef} style={{ "--s3-dock-frac": dockFrac } as CSSProperties}>
        <div className="s3-view" ref={hostRef}>
          <canvas ref={canvasRef} aria-label="3D particle preview" />
          <div className="s3-hud"><b>{def.name}</b><span>{stats.n.toLocaleString()} particles · {stats.fps} fps{stats.active < 0.99 ? ` · adaptive ${Math.round(stats.active * 100)}%` : ""}</span></div>
          {busy && <div className="s3-busy">Generating…</div>}
          {notice && <div className="s3-notice" role="status">{notice}</div>}
        </div>
        <aside className={"s3-dock" + (collapsed ? " collapsed" : "")} ref={dockRef}>
          {mobile ? (
            <>
              <div
                className="s3-dock-bar"
                role="group"
                aria-label="3D controls panel — drag to resize, tap to fold"
                tabIndex={0}
                onPointerDown={onBarPointerDown}
                onPointerMove={onBarPointerMove}
                onPointerUp={(event) => finishDockDrag(event, false)}
                onPointerCancel={(event) => finishDockDrag(event, true)}
                onKeyDown={onBarKeyDown}
              >
                <span className="s3-dock-bar-label"><span aria-hidden="true">◉</span>{def.name}</span>
                <span className="s3-dock-grip" aria-hidden="true" />
                <span className="s3-dock-bar-actions">
                  <button type="button" className="s3-bar-icon" aria-label={collapsed ? "Show 3D controls" : "Hide 3D controls"} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "⌃" : "⌄"}</button>
                </span>
              </div>
              <div className="s3-dock-body" id="s3-panel-body" aria-hidden={collapsed}>
                <nav className="s3-tabs" role="tablist">{TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)} type="button">{t.label}</button>)}</nav>
                <div className="s3-scroll">{body}</div>
              </div>
            </>
          ) : (
            <>
              <div className="s3-dock-head">
                <div><span>PARTICLE STUDIO</span><b>Control your particles</b></div>
                <button type="button" className="s3-x" aria-label={collapsed ? "Expand controls" : "Collapse controls"} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "‹" : "›"}</button>
              </div>
              {collapsed ? (
                <button type="button" className="s3-dock-summary" onClick={() => setCollapsed(false)}>
                  <span className="s3-summary-icon">◉</span>
                  <span><b>Particle controls</b><small>{def.name} · click to customize</small></span>
                  <span className="s3-summary-arrow">‹</span>
                </button>
              ) : (
                <div className="s3-dock-body">
                  <nav className="s3-tabs" role="tablist">{TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)} type="button">{t.label}</button>)}</nav>
                  <div className="s3-scroll">{body}</div>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
