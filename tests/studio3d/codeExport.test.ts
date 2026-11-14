import assert from "node:assert/strict";
import test from "node:test";
import { buildFormation } from "../../src/studio3d/generators";
import { generate3DCode } from "../../src/studio3d/codeExport";
import { defaultProject } from "../../src/studio3d/project";

test("standalone export uses the Three.js renderer and preserves evaluated formation attributes", () => {
  const project = defaultProject();
  const formation = buildFormation(project.layers, 256);
  const velocity = Float32Array.from(formation.pos, (value) => value * 0.1);
  const homeBase = Float32Array.from(formation.pos, (value) => value * 0.8);
  const runtime = "window.__previewRuntimeLoaded = true;";
  const state = {
    active: 128,
    velocity,
    homeBase,
    time: 12.5,
    tick: 750,
    cameraYawVelocity: 0.25,
    cameraPitchVelocity: -0.5,
  };
  const bundle = generate3DCode(project, formation, runtime, state);
  const payload = JSON.parse(bundle.data.slice("window.PARTICLE_SCENE=".length, -1)) as {
    count: number;
    radius: number;
    active: number;
    time: number;
    tick: number;
    velocity?: unknown;
    packed: string;
  };
  const packed = Buffer.from(payload.packed, "base64");
  const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);

  assert.equal(packed.length, formation.n * 69);
  assert.equal(payload.active, state.active);
  assert.equal(payload.time, state.time);
  assert.equal(payload.tick, state.tick);
  assert.equal(payload.velocity, undefined);
  assert.ok(bundle.standaloneHtml.includes(runtime));
  assert.ok(bundle.javascript.includes(runtime));
  assert.match(bundle.javascript, /three@0\.170\.0\/build\/three\.module\.js/);
  assert.match(bundle.javascript, /window\.THREE=THREE/);
  assert.match(bundle.standaloneHtml, /<script type="module">/);
  assert.match(bundle.html, /id="toggle-animation"/);
  assert.match(bundle.html, /pinch to zoom\/pan/);
  assert.match(bundle.html, /<script type="module" src="scene\.js"><\/script>/);
  assert.doesNotMatch(bundle.readme, /Canvas 2D renderer/);
  assert.match(bundle.html, /drag to orbit/);
  assert.match(bundle.html, /move pointer to swirl particles/);

  const sample = 17, o = sample * 3, at = sample * 69;
  for (let axis = 0; axis < 3; axis++) {
    assert.equal(view.getFloat32(at + axis * 4, true), formation.pos[o + axis]);
    assert.equal(view.getFloat32(at + 12 + axis * 4, true), formation.nrm[o + axis]);
    assert.equal(view.getFloat32(at + 24 + axis * 4, true), velocity[o + axis]);
    assert.equal(view.getFloat32(at + 36 + axis * 4, true), homeBase[o + axis]);
  }
  assert.equal(view.getFloat32(at + 48, true), formation.t[sample]);
  assert.equal(view.getFloat32(at + 60, true), formation.phase[sample]);
  assert.equal(packed[at + 68], formation.layer[sample]);
});
