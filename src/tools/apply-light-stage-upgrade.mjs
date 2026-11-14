#!/usr/bin/env node
/**
 * Applies the Light Stage + Particle FX upgrade to the four existing files it has to touch:
 *   src/studio3d/types.ts · project.ts · renderer.ts · Studio3D.tsx
 *
 * Usage (from the repository root, after copying the new files in):
 *   node tools/apply-light-stage-upgrade.mjs            apply
 *   node tools/apply-light-stage-upgrade.mjs --check    dry run: report what would change, write nothing
 *   node tools/apply-light-stage-upgrade.mjs <repoRoot> apply to another folder
 *
 * Safe by design: every edit is an exact-text anchor that must match exactly once; if ANY anchor in ANY file is
 * missing or ambiguous nothing is written. Already-applied edits are skipped, so it can be run twice. CRLF files stay CRLF.
 * To undo: `git checkout -- src/studio3d/types.ts src/studio3d/project.ts src/studio3d/renderer.ts src/studio3d/Studio3D.tsx`
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const dry = args.includes("--check");
const root = resolve(args.find((a) => !a.startsWith("--")) ?? ".");
const S3D = "src/studio3d";

const rep = (label, find, replace, done, optional = false) => ({ kind: "replace", label, find, replace, done, optional });
const region = (label, start, end, replace, done) => ({ kind: "region", label, start, end, replace, done });

const EDITS = {
  [`${S3D}/types.ts`]: [
    rep("import light-stage types", 'import type { Rng } from "./math";', 'import type { Rng } from "./math";\nimport type { LightStage, ParticleFx } from "./lightStage";', 'from "./lightStage"'),
    rep("schema version 3 -> 4", "export const SCHEMA_VERSION = 3;", "export const SCHEMA_VERSION = 4;", "SCHEMA_VERSION = 4;"),
    rep("advanced beam fields", "  motion: number;\n  seed: number;\n}", [
      "  motion: number;",
      "  seed: number;",
      "  /** Advanced beam shaping (optional: beams saved before these existed keep the original look). */",
      "  halo?: number;",
      "  haloSize?: number;",
      "  coreSharp?: number;",
      "  shimmer?: number;",
      "  lightColor?: string;",
      "  lightMix?: number;",
      "}",
    ].join("\n"), "halo?: number;"),
    rep("project: stage + particles", "  timeline: TimelineSettings;\n  quality: QualityLevel;\n}", "  timeline: TimelineSettings;\n  quality: QualityLevel;\n  /** Light stage (how beams reveal and glint particles). Absent = original behaviour. */\n  stage?: LightStage;\n  /** Per-particle appearance and air motion. Absent = original behaviour. */\n  particles?: ParticleFx;\n}", "stage?: LightStage;"),
  ],

  [`${S3D}/project.ts`]: [
    rep("imports", 'import { makeLightBeam } from "./lightBeams";', 'import { applyBeamExtras, makeLightBeam } from "./lightBeams";\nimport { defaultFx, defaultStage, normalizeFx, normalizeStage } from "./lightStage";', "applyBeamExtras"),
    rep("keep stage + particles when switching formation", "beams: prev ? prev.beams.map((beam) => ({ ...beam, origin: [...beam.origin] as Vec3 })) : [],",
      "beams: prev ? prev.beams.map((beam) => ({ ...beam, origin: [...beam.origin] as Vec3 })) : [],\n    stage: prev?.stage ? { ...prev.stage } : defaultStage(), particles: prev?.particles ? { ...prev.particles } : defaultFx(),", "stage: prev?.stage"),
    rep("validate beams + stage + particles on load", ".map(parseBeam).filter((beam): beam is LightBeam => beam !== null),",
      ".map((entry, index) => applyBeamExtras(parseBeam(entry, index), entry)).filter((beam): beam is LightBeam => beam !== null),\n    stage: normalizeStage(raw.stage), particles: normalizeFx(raw.particles),", "normalizeStage(raw.stage)"),
  ],

  [`${S3D}/renderer.ts`]: [
    rep("imports", 'import { createLightBeamFrame, updateLightBeamFrame } from "./lightBeams";',
      'import { createLightBeamFrame, updateLightBeamFrame } from "./lightBeams";\nimport { createStageUniforms, packStageUniforms, type LightStage, type ParticleFx } from "./lightStage";\nimport { FRAG_SHADER, STAGE_UNIFORM_NAMES, VERT_SHADER } from "./shaders";\nimport { BeamGuides } from "./beamGuides";', 'from "./shaders"'),
    rep("RenderInput: stage + fx", "beams: LightBeam[]; bloomLevel: number; focus: number; range: number;", "beams: LightBeam[]; stage?: LightStage; fx?: ParticleFx; bloomLevel: number; focus: number; range: number;", "stage?: LightStage; fx?: ParticleFx;"),
    region("vertex shader -> shaders.ts", "export const VERT = `", "export const FRAG = `", "export const VERT = VERT_SHADER;\n", "export const VERT = VERT_SHADER;"),
    region("fragment shader -> shaders.ts", "export const FRAG = `", "const FS_VERT = `", "export const FRAG = FRAG_SHADER;\n", "export const FRAG = FRAG_SHADER;"),
    rep("register new uniforms", '"uBeamSideA", "uBeamSideB"]);', '"uBeamSideA", "uBeamSideB", ...STAGE_UNIFORM_NAMES]);', "...STAGE_UNIFORM_NAMES"),
    rep("fields", "private beamFrame = createLightBeamFrame();", "private beamFrame = createLightBeamFrame();\n  private stageU = createStageUniforms();\n  private guides = new BeamGuides();", "new BeamGuides()"),
    rep("init guides with the GL context", "this.vao = gl.createVertexArray()!; this.emptyVao = gl.createVertexArray()!;", "this.guides.init(gl);\n    this.vao = gl.createVertexArray()!; this.emptyVao = gl.createVertexArray()!;", "this.guides.init(gl)"),
    rep("upload stage + fx uniforms", "gl.uniform4fv(U.uBeamTint, this.beamFrame.tint); gl.uniform4fv(U.uBeamSideA, this.beamFrame.sideA); gl.uniform4fv(U.uBeamSideB, this.beamFrame.sideB);",
      [
        "gl.uniform4fv(U.uBeamTint, this.beamFrame.tint); gl.uniform4fv(U.uBeamSideA, this.beamFrame.sideA); gl.uniform4fv(U.uBeamSideB, this.beamFrame.sideB);",
        "    gl.uniform4fv(U.uBeamExtra, this.beamFrame.extra); gl.uniform4fv(U.uBeamColor, this.beamFrame.color);",
        "    const SU = packStageUniforms(inp.stage, inp.fx, this.stageU);",
        "    gl.uniform4fv(U.uStageA, SU.stageA); gl.uniform4fv(U.uStageB, SU.stageB); gl.uniform4fv(U.uStageC, SU.stageC); gl.uniform4fv(U.uStageColor, SU.stageColor);",
        "    gl.uniform4fv(U.uFxA, SU.fxA); gl.uniform4fv(U.uFxB, SU.fxB); gl.uniform4fv(U.uFxC, SU.fxC); gl.uniform4fv(U.uFxD, SU.fxD); gl.uniform4fv(U.uFxE, SU.fxE);",
      ].join("\n"), "packStageUniforms(inp.stage"),
    rep("draw beam guides after the particles", "gl.drawArrays(gl.POINTS, 0, n);", "gl.drawArrays(gl.POINTS, 0, n);\n    if (inp.stage?.guides) this.guides.draw(gl, this.beamFrame, cam.view, cam.proj);", "this.guides.draw("),
    rep("release guide GL objects", "gl.deleteVertexArray(this.vao); gl.deleteVertexArray(this.emptyVao);", "gl.deleteVertexArray(this.vao); gl.deleteVertexArray(this.emptyVao); this.guides.dispose(gl);", "this.guides.dispose(gl)"),
  ],

  [`${S3D}/Studio3D.tsx`]: [
    rep("imports", 'import { makeLightBeam } from "./lightBeams";',
      'import { makeLightBeam } from "./lightBeams";\nimport { BeamAdvanced, LightStagePanel, ParticlePanel } from "./LightStagePanel";\nimport { defaultFx, defaultStage, STAGE_PRESETS, type LightStage, type ParticleFx } from "./lightStage";', "LightStagePanel"),
    rep("tab id", '| "timeline" | "export";', '| "timeline" | "export" | "fx";', '| "export" | "fx";'),
    rep("tab button", '{ id: "look", label: "Look" },', '{ id: "look", label: "Look" }, { id: "fx", label: "Particle FX" },', 'id: "fx"'),
    rep("simulation speed", "sim.update(dt); cam.update(dt);", "sim.update(dt * (p.particles?.timeScale ?? 1)); cam.update(dt);", "p.particles?.timeScale"),
    rep("render input (live)", "beams: p.beams, bloomLevel: QUALITY[p.quality].bloom, focus: cam.distance", "beams: p.beams, stage: p.stage, fx: p.particles, bloomLevel: QUALITY[p.quality].bloom, focus: cam.distance", "stage: p.stage, fx: p.particles"),
    rep("render input (PNG export, guides hidden)", "beams: p.beams, bloomLevel: QUALITY[p.quality].bloom, focus: c.distance", "beams: p.beams, stage: p.stage ? { ...p.stage, guides: false } : undefined, fx: p.particles, bloomLevel: QUALITY[p.quality].bloom, focus: c.distance", "guides: false } : undefined"),
    rep("light-look + stage + fx handlers", "const beamPanel = (", [
      "const setStage = (patch: Partial<LightStage>) => upd((p) => ({ ...p, stage: { ...(p.stage ?? defaultStage()), ...patch } }));",
      "  const setFx = (patch: Partial<ParticleFx>) => upd((p) => ({ ...p, particles: { ...(p.particles ?? defaultFx()), ...patch } }));",
      "  const applyLightLook = (id: string) => {",
      "    const preset = STAGE_PRESETS.find((item) => item.id === id); if (!preset) return;",
      "    const built = preset.build();",
      "    if (built.generator) choosePreset(built.generator);",
      "    upd((p) => ({ ...p, count: built.count ?? p.count, stage: built.stage, particles: built.particles, beams: built.beams, look: { ...p.look, ...built.look } }));",
      "  };",
      "  const beamPanel = (",
    ].join("\n"), "const applyLightLook"),
    rep("light stage controls at the top of Dust & beams", '<Section title="Dust formations">',
      '<LightStagePanel stage={project.stage ?? defaultStage()} beamCount={project.beams.length} onChange={setStage} onReset={() => upd((p) => ({ ...p, stage: defaultStage() }))} onPreset={applyLightLook} />\n      <Section title="Dust formations">', "<LightStagePanel"),
    rep("advanced controls inside each beam", '<Range label="Seed" value={beam.seed} min={0} max={999} step={1} onChange={(value) => setBeam(beam.id, { seed: value })} />',
      '<Range label="Seed" value={beam.seed} min={0} max={999} step={1} onChange={(value) => setBeam(beam.id, { seed: value })} />\n            <BeamAdvanced beam={beam} onChange={(patch) => setBeam(beam.id, patch)} />', "<BeamAdvanced"),
    rep("Particle FX tab", "const body = { presets, shape, dust: beamPanel, interact, text: textPanel, motion, look, camera, timeline, export: exportPanel }[tab];",
      "const fxPanel = <ParticlePanel fx={project.particles ?? defaultFx()} onChange={setFx} onReset={() => upd((p) => ({ ...p, particles: defaultFx() }))} />;\n  const body = { presets, shape, dust: beamPanel, fx: fxPanel, interact, text: textPanel, motion, look, camera, timeline, export: exportPanel }[tab];", "fx: fxPanel"),
    rep("hint text", "The same lights work with every 3D preset and never change particle size.", 'The same lights work with every 3D preset. Particle size only changes if you raise "Lit particle growth".', 'only changes if you raise "Lit particle growth"', true),
  ],
};

/* ───────────── engine ───────────── */
const count = (text, needle) => (needle ? text.split(needle).length - 1 : 0);

function plan(file, raw) {
  const crlf = raw.includes("\r\n");
  let text = raw.replace(/\r\n/g, "\n");
  const notes = [], errors = [];
  for (const edit of EDITS[file]) {
    if (text.includes(edit.done)) { notes.push(`  = already applied: ${edit.label}`); continue; }
    if (edit.kind === "replace") {
      const n = count(text, edit.find);
      if (n !== 1) {
        if (edit.optional && n === 0) { notes.push(`  ~ skipped (optional, text not found): ${edit.label}`); continue; }
        errors.push(`  ✗ ${edit.label}: expected the anchor exactly once, found ${n}\n      anchor: ${edit.find.split("\n")[0].slice(0, 110)}`);
        continue;
      }
      text = text.replace(edit.find, () => edit.replace);
      notes.push(`  + ${edit.label}`);
    } else {
      const sCount = count(text, edit.start), s = text.indexOf(edit.start);
      const e = s < 0 ? -1 : text.indexOf(edit.end, s + edit.start.length);
      if (sCount !== 1 || e < 0) { errors.push(`  ✗ ${edit.label}: start anchor found ${sCount}×, end anchor ${e < 0 ? "missing" : "ok"}`); continue; }
      text = text.slice(0, s) + edit.replace + text.slice(e);
      notes.push(`  + ${edit.label}`);
    }
  }
  return { out: crlf ? text.replace(/\n/g, "\r\n") : text, notes, errors, changed: text.replace(/\n/g, "\n") !== raw.replace(/\r\n/g, "\n") };
}

console.log(`Light Stage upgrade ${dry ? "(dry run) " : ""}in ${root}\n`);
const missing = ["lightStage.ts", "shaders.ts", "beamGuides.ts", "LightStagePanel.tsx", "lightBeams.ts"].filter((f) => !existsSync(join(root, S3D, f)));
if (missing.length) {
  console.error(`✗ Copy the new files into ${S3D}/ first. Missing: ${missing.join(", ")}`);
  process.exit(1);
}
if (!readFileSync(join(root, S3D, "lightBeams.ts"), "utf8").includes("applyBeamExtras")) {
  console.error(`✗ ${S3D}/lightBeams.ts is the old version. Replace it with the one from the zip first.`);
  process.exit(1);
}

const results = [];
let failed = false;
for (const file of Object.keys(EDITS)) {
  const path = join(root, file);
  if (!existsSync(path)) { console.error(`✗ ${file} not found (run this from the repository root).`); process.exit(1); }
  const r = plan(file, readFileSync(path, "utf8"));
  results.push({ file, path, ...r });
  console.log(file);
  for (const line of r.notes) console.log(line);
  for (const line of r.errors) console.log(line);
  if (r.errors.length) failed = true;
}
if (failed) {
  console.error("\nNothing was written: at least one anchor did not match your copy of the file.\nSend me the lines marked ✗ (or the file) and I'll adjust the patch.");
  process.exit(1);
}
const changed = results.filter((r) => r.changed);
if (dry) { console.log(`\nDry run OK: ${changed.length} file(s) would change.`); process.exit(0); }
for (const r of changed) writeFileSync(r.path, r.out);
console.log(changed.length ? `\nDone: updated ${changed.length} file(s). Run \`npm run build\` to type-check.` : "\nNothing to do: everything was already applied.");
