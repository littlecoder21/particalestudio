import assert from "node:assert/strict";
import test from "node:test";
import { applyBeamExtras, BEAM_DEFAULTS, createLightBeamFrame, hexToRgb01, makeLightBeam, sampleLightBeams, updateLightBeamFrame, type LightBeamFrame, type LightBeamSample } from "../../src/studio3d/lightBeams";
import {
  DEFAULT_FX, DEFAULT_STAGE, FX_LIMITS, STAGE_LIMITS, STAGE_PRESETS, createStageUniforms, defaultFx, defaultStage, normalizeFx, normalizeStage, packStageUniforms,
} from "../../src/studio3d/lightStage";
import { MAX_LIGHT_BEAMS } from "../../src/studio3d/types";

const sample = (): LightBeamSample => ({ intensity: 0, colorPosition: 0, directionX: 0, directionY: 0, directionZ: 1, speed: 0 });
const smooth = (v: number) => { const t = Math.min(1, Math.max(0, v)); return t * t * (3 - 2 * t); };
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

/** The beam intensity formula exactly as it was before the advanced controls existed (constants inlined). */
function legacyIntensity(frame: LightBeamFrame, x: number, y: number, z: number, time: number): number {
  let total = 0;
  for (let i = 0; i < frame.count; i++) {
    const o = i * 4, length = frame.originLength[o + 3];
    const dx = frame.directionWidth[o], dy = frame.directionWidth[o + 1], dz = frame.directionWidth[o + 2];
    const rx = x - frame.originLength[o], ry = y - frame.originLength[o + 1], rz = z - frame.originLength[o + 2];
    const along = (rx * dx + ry * dy + rz * dz) / length;
    if (along < 0 || along > 1) continue;
    const speed = frame.animation[o], phase = frame.animation[o + 1], motion = frame.tint[o + 1], style = frame.profile[o], spread = frame.profile[o + 1], bend = frame.profile[o + 2];
    const radialX = rx - dx * along * length, radialY = ry - dy * along * length, radialZ = rz - dz * along * length;
    const sideA = radialX * frame.sideA[o] + radialY * frame.sideA[o + 1] + radialZ * frame.sideA[o + 2];
    const sideB = radialX * frame.sideB[o] + radialY * frame.sideB[o + 1] + radialZ * frame.sideB[o + 2];
    let bendA = 0, bendB = 0;
    if (style === 2) bendA = bend * Math.sin(Math.PI * along) + bend * 0.22 * motion * Math.sin(along * 7.5 + phase + time * speed * 0.31);
    else if (style === 3) {
      const turn = along * Math.PI * 2 * Math.max(0.25, Math.abs(frame.tint[o + 2])) + phase + time * speed * 0.31, radius = frame.directionWidth[o + 3] * (0.8 + spread * 0.12);
      bendA = Math.cos(turn) * radius; bendB = Math.sin(turn) * radius;
    }
    const widen = style === 1 ? spread : spread * 0.12, swell = 1 + 0.38 * motion * Math.sin(along * 4.2 + phase + time * speed * 0.33);
    const radius = frame.directionWidth[o + 3] * (1 + widen * along) * swell, q = Math.hypot(sideA - bendA, sideB - bendB) / Math.max(0.001, radius);
    if (q > 7.4) continue;
    const profile = 0.8 * Math.exp(-q * q) + 0.28 * Math.exp(-Math.pow(q / 2.8, 2));
    const alongFade = smooth(along / frame.animation[o + 2]) * (1 - smooth((along - (1 - frame.animation[o + 3])) / frame.animation[o + 3]));
    const wave = 0.84 + 0.16 * Math.sin(along * 9 - time * speed * 0.5 + phase) + 0.07 * Math.sin(along * 23 + q * 0.6 + time * speed * 1.6 + phase);
    total += profile * alongFade * Math.max(0, wave) * frame.profile[o + 3];
  }
  return Math.min(3, total);
}

test("default beam extras reproduce the original beam profile exactly (existing projects look unchanged)", () => {
  const beams = (["shaft", "fan", "arc", "helix"] as const).map((style, i) => makeLightBeam({ style, seed: i + 1, origin: [i * 0.2 - 0.3, 0.1, 0], azimuth: i * 50 - 60, elevation: 10 + i * 12, length: 2.2, width: 0.1 }));
  const next = rng(7);
  for (let step = 0; step < 4; step++) {
    const time = step * 1.7, frame = createLightBeamFrame(), out = sample();
    updateLightBeamFrame(beams, time, frame);
    let lit = 0;
    for (let n = 0; n < 300; n++) {
      const x = next() * 3 - 1.5, y = next() * 3 - 1.5, z = next() * 3 - 1.5;
      sampleLightBeams(frame, x, y, z, time, out);
      const expected = legacyIntensity(frame, x, y, z, time);
      assert.ok(Math.abs(out.intensity - expected) < 1e-6, // the GPU frame is float32, the old formula used a double 2.8
         `mismatch at (${x}, ${y}, ${z}): ${out.intensity} vs ${expected}`);
      if (expected > 0.01) lit++;
    }
    assert.ok(lit > 5, "the comparison must include lit points");
  }
});

test("advanced beam controls change the profile in the expected direction", () => {
  const base = { origin: [0, 0, 0] as [number, number, number], azimuth: 0, elevation: 0, length: 2, width: 0.1, spread: 0, speed: 0, motion: 0, fadeIn: 0.01, fadeOut: 0.01 };
  const at = (over: Parameters<typeof makeLightBeam>[0], x: number, z = 1) => { const f = createLightBeamFrame(), o = sample(); updateLightBeamFrame([makeLightBeam({ ...base, ...over })], 0, f); sampleLightBeams(f, x, 0, z, 0, o); return o.intensity; };
  assert.ok(at({ halo: 0 }, 0.3) < at({}, 0.3), "no halo is dimmer off-axis");
  assert.ok(at({ halo: 1 }, 0.3) > at({}, 0.3), "stronger halo is brighter off-axis");
  assert.ok(at({ coreSharp: 4 }, 0.1) < at({ coreSharp: 1 }, 0.1), "sharper core is narrower");
  assert.ok(at({ haloSize: 8 }, 0.7) > at({ haloSize: 2.8 }, 0.7), "bigger halo reaches further");
  assert.equal(at({}, 1.5), 0, "default cut-off (7.4 beam widths) is unchanged");
  assert.ok(at({ haloSize: 8, halo: 1 }, 1.5) > 0, "a larger halo extends the cut-off");
  const flat = (z: number) => at({ shimmer: 0 }, 0, z), rippled = (z: number) => at({ shimmer: 3 }, 0, z);
  const spread = (fn: (z: number) => number) => { const v = [0.5, 0.7, 0.9, 1.1, 1.3].map(fn); return Math.max(...v) - Math.min(...v); };
  assert.ok(spread(rippled) > spread(flat), "shimmer adds ripple along the beam");
});

test("beam extras are validated and clamped", () => {
  assert.equal(applyBeamExtras(null, {}), null);
  const beam = makeLightBeam();
  const hostile = applyBeamExtras(beam, { halo: 99, haloSize: -4, coreSharp: "x", shimmer: Number.NaN, lightColor: "red", lightMix: 5 })!;
  assert.equal(hostile.halo, 1); assert.equal(hostile.haloSize, 1); assert.equal(hostile.coreSharp, BEAM_DEFAULTS.coreSharp);
  assert.equal(hostile.shimmer, BEAM_DEFAULTS.shimmer); assert.equal(hostile.lightColor, BEAM_DEFAULTS.lightColor); assert.equal(hostile.lightMix, 1);
  const legacy = applyBeamExtras(beam, undefined)!;
  assert.equal(legacy.halo, 0.28); assert.equal(legacy.haloSize, 2.8); assert.equal(legacy.lightMix, 0);
  assert.deepEqual(hexToRgb01("#ff0000"), [1, 0, 0]); assert.deepEqual(hexToRgb01("#0f0"), [0, 1, 0]); assert.deepEqual(hexToRgb01("nope"), hexToRgb01("#eef0f6"));
});

test("frame packing is deterministic and carries the advanced beam fields", () => {
  const beam = makeLightBeam({ seed: 4, halo: 0.5, haloSize: 4, coreSharp: 2, shimmer: 0.5, lightColor: "#ff0000", lightMix: 0.75 });
  const a = createLightBeamFrame(), b = createLightBeamFrame();
  updateLightBeamFrame([beam], 3.3, a); updateLightBeamFrame([beam], 3.3, b);
  assert.deepEqual(a, b);
  assert.deepEqual(Array.from(a.extra.slice(0, 4)), [0.5, 4, 2, 0.5]);
  assert.deepEqual(Array.from(a.color.slice(0, 4)), [1, 0, 0, 0.75]);
  updateLightBeamFrame(Array.from({ length: 30 }, (_, i) => makeLightBeam({ seed: i })), 0, a);
  assert.equal(a.count, MAX_LIGHT_BEAMS);
  updateLightBeamFrame([], 0, a);
  assert.equal(a.count, 0); assert.ok(a.extra.every((v) => v === 0) && a.color.every((v) => v === 0));
});

test("stage and particle settings validate hostile and partial input", () => {
  assert.deepEqual(normalizeStage(undefined), DEFAULT_STAGE); assert.deepEqual(normalizeStage(42), DEFAULT_STAGE); assert.deepEqual(normalizeFx([]), DEFAULT_FX);
  const s = normalizeStage({ reveal: 5, ambient: -1, gain: Number.POSITIVE_INFINITY, glintSharpness: "9", litKnee: 0, lightColor: "javascript:1", guides: "yes", extra: 1 });
  assert.equal(s.reveal, STAGE_LIMITS.reveal[1]); assert.equal(s.ambient, 0); assert.equal(s.gain, DEFAULT_STAGE.gain);
  assert.equal(s.glintSharpness, DEFAULT_STAGE.glintSharpness); assert.equal(s.litKnee, STAGE_LIMITS.litKnee[0]);
  assert.equal(s.lightColor, DEFAULT_STAGE.lightColor); assert.equal(s.guides, false); assert.ok(!("extra" in s));
  const f = normalizeFx({ minPx: 6, maxPx: 2, timeScale: 99, moteShare: -3, sizeCurve: Number.NaN });
  assert.equal(f.minPx, 6); assert.ok(f.maxPx >= f.minPx, "max size can never be below min size");
  assert.equal(f.timeScale, FX_LIMITS.timeScale[1]); assert.equal(f.moteShare, 0); assert.equal(f.sizeCurve, DEFAULT_FX.sizeCurve);
  assert.deepEqual(normalizeStage(defaultStage()), defaultStage()); assert.deepEqual(normalizeFx(defaultFx()), defaultFx());
  assert.notEqual(defaultStage(), DEFAULT_STAGE, "defaults are returned as copies");
});

test("default settings pack to the original renderer's constants", () => {
  const u = packStageUniforms(undefined, undefined, createStageUniforms());
  assert.deepEqual(Array.from(u.stageA), [0, Math.fround(0.15), 0.5, 1]); // reveal 0, gain 1
  assert.deepEqual(Array.from(u.stageB).slice(1), [Math.fround(0.18), 8, 1]);  // glint 0.18, sharpness 8, rate 1
  assert.deepEqual(Array.from(u.stageC), [0, 0, 1, 1]);                         // boost 0, growth 0, bias 1, normals fully used
  assert.equal(u.stageColor[3], 0);                                              // no colour override
  assert.deepEqual(Array.from(u.fxA), [1, 1, 120, 0]);                           // size clamp 1..120 px, no motes
  assert.deepEqual([u.fxB[2], u.fxB[3], u.fxC[0], u.fxC[3], u.fxD[1], u.fxD[3]], [0, 0, 0, 0, 0, 0]); // no jitter / twinkle / dof / wander / flow
  const custom = packStageUniforms({ ...defaultStage(), lightColor: "#00ff00", lightColorMix: 0.5, reveal: 1 }, { ...defaultFx(), maxPx: 64, flow: 0.1 }, createStageUniforms());
  assert.deepEqual(Array.from(custom.stageColor), [0, 1, 0, 0.5]); assert.equal(custom.stageA[0], 1); assert.equal(custom.fxA[2], 64); assert.ok(Math.abs(custom.fxD[3] - 0.1) < 1e-6);
  assert.ok([...Object.values(custom)].every((v) => v.every(Number.isFinite)), "no NaN or Infinity reaches the GPU");
});

test("every light look is valid, bounded and deterministic", () => {
  const allowed = new Set(["sphere", "dust-cloud", "dust-veil", "dust-motes"]);
  assert.ok(STAGE_PRESETS.length >= 4);
  for (const preset of STAGE_PRESETS) {
    const a = preset.build(), b = preset.build();
    assert.ok(a.beams.length >= 1 && a.beams.length <= MAX_LIGHT_BEAMS, preset.id);
    assert.ok(!a.generator || allowed.has(a.generator), `${preset.id} uses an unknown generator`);
    assert.deepEqual(normalizeStage(a.stage), a.stage); assert.deepEqual(normalizeFx(a.particles), a.particles);
    const strip = (x: typeof a) => ({ ...x, beams: x.beams.map(({ id: _id, ...rest }) => rest) });
    assert.deepEqual(strip(a), strip(b), `${preset.id} is not deterministic`);
    assert.equal(new Set(a.beams.map((x) => x.id)).size, a.beams.length, "beam ids are unique");
    assert.ok(a.stage.reveal > 0, "looks are about revealing particles with light");
    const frame = createLightBeamFrame(); updateLightBeamFrame(a.beams, 1.5, frame);
    assert.equal(frame.count, a.beams.length);
    for (const arr of [frame.originLength, frame.directionWidth, frame.profile, frame.animation, frame.tint, frame.sideA, frame.sideB, frame.extra, frame.color]) assert.ok(arr.every(Number.isFinite), `${preset.id} frame has NaN/Infinity`);
    if (a.look.palette) assert.ok(a.look.palette.length >= 2 && a.look.palette.every((s) => s.t >= 0 && s.t <= 1));
  }
});

test("beam guides: one axis, two rings and four rails per beam, all finite and inside the buffer", async () => {
  const { GUIDE_VERTS_PER_BEAM, buildGuideLines } = await import("../../src/studio3d/beamGuides");
  const beams = [makeLightBeam({ origin: [0, 0, 0], azimuth: 0, elevation: 0, length: 2, width: 0.1, spread: 0, motion: 0, speed: 0 }), makeLightBeam({ style: "fan", spread: 1.5, seed: 3 })];
  const frame = createLightBeamFrame(); updateLightBeamFrame(beams, 0, frame);
  const out = new Float32Array(MAX_LIGHT_BEAMS * GUIDE_VERTS_PER_BEAM * 3);
  const floats = buildGuideLines(frame, out);
  assert.equal(floats, beams.length * GUIDE_VERTS_PER_BEAM * 3);
  assert.ok(out.subarray(0, floats).every(Number.isFinite));
  assert.deepEqual(Array.from(out.subarray(0, 6)), [0, 0, 0, 0, 0, 2]); // axis runs origin -> origin + direction * length
  const full = createLightBeamFrame(); updateLightBeamFrame(Array.from({ length: 30 }, (_, i) => makeLightBeam({ seed: i })), 0, full);
  assert.equal(buildGuideLines(full, out), MAX_LIGHT_BEAMS * GUIDE_VERTS_PER_BEAM * 3, "never writes past the buffer");
  updateLightBeamFrame([], 0, full); assert.equal(buildGuideLines(full, out), 0);
});
