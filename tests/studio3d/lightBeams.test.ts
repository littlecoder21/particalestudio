import assert from "node:assert/strict";
import test from "node:test";
import { createLightBeamFrame, makeLightBeam, sampleLightBeams, updateLightBeamFrame } from "../../src/studio3d/lightBeams";
import { defaultParams, generateLayer, getGenerator } from "../../src/studio3d/generators";
import { defaultProject, migrateProject } from "../../src/studio3d/project";

test("the three dust formations generate deterministic particle data", () => {
  for (const id of ["dust-cloud", "dust-veil", "dust-motes"] as const) {
    const def = getGenerator(id);
    const layer = { generator: id, params: defaultParams(def), seed: 42 };
    const first = generateLayer(layer, 500);
    const second = generateLayer(layer, 500);
    assert.deepEqual(first.pos, second.pos);
    assert.deepEqual(first.alpha, second.alpha);
  }
});

test("light fields illuminate points along the configured beam angles", () => {
  const beam = makeLightBeam({
    origin: [0, 0, 0], azimuth: 0, elevation: 0, length: 2, width: 0.1, spread: 0,
    bend: 0, speed: 0, motion: 0, fadeIn: 0.01, fadeOut: 0.01,
  });
  const frame = createLightBeamFrame();
  updateLightBeamFrame([beam], 0, frame);
  const onAxis = { intensity: 0, colorPosition: 0, directionX: 0, directionY: 0, directionZ: 1, speed: 0 };
  const outside = { ...onAxis };
  sampleLightBeams(frame, 0, 0, 1, 0, onAxis);
  sampleLightBeams(frame, 2, 0, 1, 0, outside);
  assert.ok(onAxis.intensity > 0.5);
  assert.equal(outside.intensity, 0);

  const angledFrame = createLightBeamFrame();
  updateLightBeamFrame([{ ...beam, azimuth: 90 }], 0, angledFrame);
  const angled = { ...onAxis };
  sampleLightBeams(angledFrame, 1, 0, 0, 0, angled);
  assert.ok(angled.intensity > 0.5);
  assert.equal(angled.directionX, 1);
});

test("light field updates deterministically and has no output when every beam is disabled", () => {
  const beam = makeLightBeam({ seed: 9, style: "helix" });
  const first = createLightBeamFrame(), second = createLightBeamFrame();
  updateLightBeamFrame([beam], 2.5, first);
  updateLightBeamFrame([beam], 2.5, second);
  assert.deepEqual(first, second);
  updateLightBeamFrame(Array.from({ length: 24 }, (_, index) => makeLightBeam({ seed: index })), 2.5, first);
  assert.equal(first.count, 20);
  updateLightBeamFrame([{ ...beam, enabled: false }], 2.5, first);
  assert.equal(first.count, 0);
});

test("project migration caps and normalizes independently editable beams", () => {
  const raw = defaultProject();
  raw.beams = Array.from({ length: 24 }, (_, index) => makeLightBeam({ seed: index, width: 9, origin: [20, 0, 0] }));
  const legacy = { ...raw, version: 2, beams: raw.beams.map((beam) => ({ ...beam, direction: [1, 0, 0], azimuth: undefined, elevation: undefined })) };
  const migrated = migrateProject(legacy).project;
  assert.equal(migrated.beams.length, 20);
  assert.equal(migrated.beams[0].width, 0.5);
  assert.equal(migrated.beams[0].origin[0], 4);
  assert.equal(migrated.beams[0].azimuth, 90);
  assert.equal(migrated.beams[0].elevation, 0);
});
