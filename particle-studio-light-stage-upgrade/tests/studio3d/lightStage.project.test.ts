// Needs the full repository (project.ts + generators) with tools/apply-light-stage-upgrade.mjs already applied.
import assert from "node:assert/strict";
import test from "node:test";
import { makeLightBeam } from "../../src/studio3d/lightBeams";
import { DEFAULT_FX, DEFAULT_STAGE, STAGE_PRESETS } from "../../src/studio3d/lightStage";
import { defaultProject, migrateProject, projectFromGenerator, serializeProject } from "../../src/studio3d/project";
import { SCHEMA_VERSION } from "../../src/studio3d/types";

test("a project saved before the light stage existed migrates with defaults that keep its look", () => {
  const old = JSON.parse(JSON.stringify(defaultProject())) as Record<string, unknown>;
  delete old.stage; delete old.particles; old.version = 3;
  old.beams = [{ ...makeLightBeam({ seed: 2 }), halo: undefined, haloSize: undefined, lightColor: undefined }];
  const { project } = migrateProject(old);
  assert.equal(project.version, SCHEMA_VERSION);
  assert.deepEqual(project.stage, DEFAULT_STAGE); assert.deepEqual(project.particles, DEFAULT_FX);
  assert.equal(project.beams[0].halo, 0.28); assert.equal(project.beams[0].haloSize, 2.8);
});

test("hostile stage / particle / beam values are clamped on load", () => {
  const raw = { ...JSON.parse(serializeProject(defaultProject())), stage: { reveal: 40, gain: "no", lightColor: "<script>" }, particles: { minPx: 99, maxPx: 1, timeScale: -5 } };
  raw.beams = [{ ...makeLightBeam(), halo: 1e9, lightMix: -3 }];
  const { project } = migrateProject(raw);
  assert.equal(project.stage?.reveal, 1); assert.equal(project.stage?.gain, 1); assert.equal(project.stage?.lightColor, DEFAULT_STAGE.lightColor);
  assert.equal(project.particles?.minPx, 8); assert.ok((project.particles?.maxPx ?? 0) >= 8); assert.equal(project.particles?.timeScale, 0);
  assert.equal(project.beams[0].halo, 1); assert.equal(project.beams[0].lightMix, 0);
});

test("stage settings round-trip through save and load, and survive switching presets", () => {
  const look = STAGE_PRESETS[0].build();
  const p = { ...defaultProject(), stage: look.stage, particles: look.particles, beams: look.beams };
  const again = migrateProject(JSON.parse(serializeProject(p))).project;
  assert.deepEqual(again.stage, look.stage); assert.deepEqual(again.particles, look.particles);
  assert.deepEqual(again.beams.map((b) => [b.style, b.halo, b.lightColor, b.lightMix]), look.beams.map((b) => [b.style, b.halo, b.lightColor, b.lightMix]));
  const next = projectFromGenerator("sphere", p);
  assert.deepEqual(next.stage, look.stage); assert.deepEqual(next.particles, look.particles);
  assert.notEqual(next.stage, p.stage, "stage is copied, not shared");
});
