import assert from "node:assert/strict";
import test from "node:test";
import { buildFormation } from "../../src/studio3d/generators";
import { defaultProject } from "../../src/studio3d/project";
import { makeBehavior, makeDeformer } from "../../src/studio3d/behaviors";
import { decodePsb, readFloat32, readRaw } from "../../src/studio3d/export/format";
import { analyzeScene, estimatePackedBytes, packParticles, planAttributes, type ExportMode, type PackOptions, type ParticleSource } from "../../src/studio3d/export/packing";
import type { Project3D } from "../../src/studio3d/types";

function scene(overrides: (p: Project3D) => void = () => {}, count = 3000) {
  const project = defaultProject();
  project.behaviors = [];
  project.deformers = [];
  project.beams = [];
  project.interaction = { ...project.interaction, tool: "none" };
  project.look = { ...project.look, sizeVariation: 0, velocityColor: 0, velocityStretch: 0 };
  overrides(project);
  const formation = buildFormation(project.layers, count);
  const velocity = Float32Array.from(formation.pos, (v, i) => Math.sin(i * 0.1) * 2.5 + v * 0.05);
  const homeBase = Float32Array.from(formation.pos, (v) => v * 0.9);
  const source: ParticleSource = { ...formation, velocity, homeBase };
  return { project, formation, source };
}
const names = (project: Project3D, options: PackOptions) => planAttributes(project, options).map((p) => p.name);

test("scene analysis recommends hero, animated or full quality from what actually moves", () => {
  const { project } = scene();
  assert.equal(analyzeScene(project, false).recommendedMode, "hero");
  assert.equal(analyzeScene(project, false).needsSimulation, false);

  project.interaction = { ...project.interaction, tool: "swirl" };
  assert.equal(analyzeScene(project, true).recommendedMode, "animated");
  assert.equal(analyzeScene(project, false).recommendedMode, "hero", "pointer tools only count when interaction is exported");

  project.deformers = [makeDeformer({ type: "wave", amount: 0.3 })];
  assert.match(analyzeScene(project, false).reasons.join(" "), /deformer/);
  assert.equal(analyzeScene(project, false).recommendedMode, "animated");

  project.behaviors = [makeBehavior({ type: "cohesion", intensity: 1 })];
  assert.equal(analyzeScene(project, false).recommendedMode, "full");

  const holdOnly = scene((p) => { p.behaviors = [makeBehavior({ type: "home", intensity: 40 })]; }).project;
  assert.equal(analyzeScene(holdOnly, false).needsSimulation, false, "a spring that only holds the shape needs no simulation");
});

test("hero strips simulation-only attributes, animated and full keep what the simulation reads", () => {
  const { project } = scene();
  const hero = names(project, { mode: "hero", compression: "auto" });
  assert.deepEqual(hero, ["position", "normal", "t", "size", "alpha", "phase", "layer"]);
  assert.ok(!hero.includes("velocity") && !hero.includes("homeBase") && !hero.includes("weight"));
  for (const mode of ["animated", "full"] as ExportMode[]) {
    const kept = names(project, { mode, compression: "auto" });
    for (const required of ["position", "normal", "velocity", "homeBase", "t", "size", "alpha", "phase", "weight", "layer"]) assert.ok(kept.includes(required as never), `${mode} keeps ${required}`);
  }
  const velocityLook = scene((p) => { p.look = { ...p.look, velocityStretch: 0.8 }; }).project;
  assert.ok(names(velocityLook, { mode: "hero", compression: "auto" }).includes("velocity"), "hero keeps velocity when the look reads it");
});

test("particle count is preserved in every mode and compression setting", () => {
  const { project, source } = scene(undefined, 2500);
  for (const mode of ["hero", "animated", "full"] as ExportMode[]) {
    for (const compression of ["auto", "off"] as const) {
      const decoded = decodePsb(packParticles(source, project, { mode, compression }).bytes);
      assert.equal(decoded.count, source.n, `${mode}/${compression}`);
      assert.equal(readFloat32(decoded, "position")!.length, source.n * 3);
    }
  }
});

test("positions are always bit-exact; full quality is lossless for every attribute", () => {
  const { project, source } = scene(undefined, 1500);
  for (const mode of ["hero", "animated", "full"] as ExportMode[]) {
    const out = readFloat32(decodePsb(packParticles(source, project, { mode, compression: "auto" }).bytes), "position")!;
    for (let i = 0; i < source.pos.length; i++) assert.equal(out[i], source.pos[i], `${mode} position ${i}`);
  }
  const decoded = decodePsb(packParticles(source, project, { mode: "full", compression: "auto" }).bytes);
  const pairs: [string, Float32Array][] = [["normal", source.nrm], ["velocity", source.velocity], ["homeBase", source.homeBase], ["t", source.t], ["size", source.size], ["alpha", source.alpha], ["phase", source.phase], ["weight", source.weight]];
  for (const [name, expected] of pairs) {
    const got = readFloat32(decoded, name as never)!;
    for (let i = 0; i < expected.length; i++) assert.equal(got[i], expected[i], `${name}[${i}]`);
  }
  const layer = readRaw(decoded, "layer") as Uint8Array;
  for (let i = 0; i < source.n; i++) assert.equal(layer[i], Math.min(3, source.layer[i]!));
  assert.equal(packParticles(source, project, { mode: "full", compression: "auto" }).bytesPerParticle, 69, "same payload as the original exporter, plus nothing");
});

test("hero precision: GPU-exact normals and bounded error on compacted attributes", () => {
  const { project, source } = scene(undefined, 4000);
  const result = packParticles(source, project, { mode: "hero", compression: "auto" });
  const decoded = decodePsb(result.bytes);

  const rawNormal = readRaw(decoded, "normal") as Int8Array;
  for (let i = 0; i < source.nrm.length; i++) assert.equal(rawNormal[i], Math.trunc(source.nrm[i]! * 127) | 0);

  const t = readFloat32(decoded, "t")!, size = readFloat32(decoded, "size")!, alpha = readFloat32(decoded, "alpha")!;
  const range = (a: Float32Array) => a.reduce((r, v) => [Math.min(r[0], v), Math.max(r[1], v)], [Infinity, -Infinity] as [number, number]);
  const [tMin, tMax] = range(source.t), [aMin, aMax] = range(source.alpha);
  for (let i = 0; i < source.n; i++) {
    assert.ok(Math.abs(t[i]! - source.t[i]!) <= (tMax - tMin) / 65535 / 2 + 1e-7, "t within half a 16-bit step");
    assert.ok(Math.abs(alpha[i]! - source.alpha[i]!) <= (aMax - aMin) / 255 / 2 + 1e-6, "alpha within half an 8-bit step");
    assert.ok(Math.abs(size[i]! - source.size[i]!) <= source.size[i]! * 2 ** -10, "size within half-float precision");
  }
  assert.ok(result.bytesPerParticle <= 23, `hero is ${result.bytesPerParticle} B/particle (was 69)`);
  assert.equal(result.report.maxError.position, 0);
});

test("phase stays Float32 when the shaders hash it (size variation, beams), and is compacted when safe", () => {
  const safe = scene();
  assert.equal(planAttributes(safe.project, { mode: "hero", compression: "auto" }).find((p) => p.name === "phase")!.dtype, "u16");
  const jitter = scene((p) => { p.look = { ...p.look, sizeVariation: 0.35 }; });
  assert.equal(analyzeScene(jitter.project).phaseSensitive, true);
  const hero = packParticles(jitter.source, jitter.project, { mode: "hero", compression: "auto" });
  const phase = readFloat32(decodePsb(hero.bytes), "phase")!;
  for (let i = 0; i < jitter.source.n; i++) assert.equal(phase[i], jitter.source.phase[i], "phase is bit-exact so per-particle size jitter matches the preview");
});

test("animated mode compacts without touching home positions", () => {
  const { project, source } = scene(undefined, 2000);
  const result = packParticles(source, project, { mode: "animated", compression: "auto" });
  const decoded = decodePsb(result.bytes);
  const home = readFloat32(decoded, "homeBase")!, vel = readFloat32(decoded, "velocity")!, normal = readFloat32(decoded, "normal")!;
  for (let i = 0; i < source.homeBase.length; i++) {
    assert.equal(home[i], source.homeBase[i], "home positions are exact");
    assert.ok(Math.abs(vel[i]! - source.velocity[i]!) <= Math.abs(source.velocity[i]!) * 2 ** -10 + 2 ** -24);
    assert.ok(Math.abs(normal[i]! - source.nrm[i]!) <= 1 / 32767 + 1e-7, "normals feed the deformers, so they keep 16 bits");
  }
  assert.ok(result.bytesPerParticle < 69 && result.bytesPerParticle > 23);
});

test("compression off keeps Float32 for everything that is written", () => {
  const { project, source } = scene(undefined, 500);
  for (const mode of ["hero", "animated", "full"] as ExportMode[]) {
    for (const item of planAttributes(project, { mode, compression: "off" })) assert.ok(item.dtype === "f32" || item.name === "layer", `${mode} ${item.name} is ${item.dtype}`);
  }
  const decoded = decodePsb(packParticles(source, project, { mode: "hero", compression: "off" }).bytes);
  const alpha = readFloat32(decoded, "alpha")!;
  for (let i = 0; i < source.n; i++) assert.equal(alpha[i], source.alpha[i]);
});

test("overrides are honoured when safe and ignored when they would break the scene", () => {
  const { project } = scene();
  const plan = planAttributes(project, { mode: "animated", compression: "auto", overrides: { alpha: "u16", velocity: "omit", position: "f16" as never, size: "u8" as never } });
  assert.equal(plan.find((p) => p.name === "alpha")!.dtype, "u16");
  assert.ok(!plan.some((p) => p.name === "velocity"));
  assert.equal(plan.find((p) => p.name === "position")!.dtype, "f32", "positions cannot be overridden");
  assert.equal(plan.find((p) => p.name === "size")!.dtype, "f16", "disallowed override is ignored");
  assert.ok(planAttributes(project, { mode: "hero", compression: "auto", overrides: { homeBase: "f32" } }).some((p) => p.name === "homeBase"), "an override can add an attribute a mode drops");
});

test("estimated size equals the packed size exactly", () => {
  const { project, source } = scene(undefined, 1234);
  for (const mode of ["hero", "animated", "full"] as ExportMode[]) {
    for (const compression of ["auto", "off"] as const) {
      const options: PackOptions = { mode, compression };
      const estimate = estimatePackedBytes(source.n, source.radius, project, options);
      const packed = packParticles(source, project, options);
      assert.equal(estimate.bytes, packed.bytes.length, `${mode}/${compression}`);
      assert.equal(estimate.bytesPerParticle, packed.bytesPerParticle);
    }
  }
});

test("export mode selection changes the written layout, not the particle count", () => {
  const { project, source } = scene(undefined, 800);
  const sizes = (["hero", "animated", "full"] as ExportMode[]).map((mode) => packParticles(source, project, { mode, compression: "auto" }).bytes.length);
  assert.ok(sizes[0]! < sizes[1]! && sizes[1]! < sizes[2]!, `hero < animated < full (${sizes.join(" < ")})`);
});
