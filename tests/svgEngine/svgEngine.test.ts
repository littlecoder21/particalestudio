import test from "node:test";
import assert from "node:assert/strict";
import { flattenPath, multiply, parseTransform, primitiveToPath } from "../../src/svgEngine/pathData.ts";
import { KIND_BORDER, KIND_EDGE, KIND_STROKE, computeCurvature, traceMask } from "../../src/svgEngine/trace.ts";
import { buildAnalysis } from "../../src/svgEngine/analyze.ts";
import { generateSamples, type SamplerOptions } from "../../src/svgEngine/sampler.ts";

/** Anti-aliased synthetic artwork: alpha from a signed-distance function (positive = inside). */
function render(width: number, height: number, inside: (x: number, y: number) => number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const k = (y * width + x) * 4;
      rgba[k] = 200;
      rgba[k + 1] = 120;
      rgba[k + 2] = 40;
      rgba[k + 3] = Math.round(Math.min(1, Math.max(0, inside(x + 0.5, y + 0.5) + 0.5)) * 255);
    }
  }
  return rgba;
}

const options: SamplerOptions = {
  mode: "Combined", distribution: "Uniform", spacing: 12, borderDetail: 35, edgeDetail: 25, cornerSharpness: 60,
};
const disk = (cx: number, cy: number, r: number) => (x: number, y: number) => r - Math.hypot(x - cx, y - cy);

test("path flattening is accurate and handles relative commands, arcs and implicit repeats", () => {
  const circle = flattenPath(primitiveToPath("circle", (n) => ({ cx: "50", cy: "50", r: "40" } as Record<string, string>)[n] ?? null)!, [1, 0, 0, 1, 0, 0], 0.01);
  assert.equal(circle.length, 1);
  assert.ok(circle[0].closed);
  const pts = circle[0].pts;
  let length = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const j = (i + 2) % pts.length;
    length += Math.hypot(pts[j] - pts[i], pts[j + 1] - pts[i + 1]);
    assert.ok(Math.abs(Math.hypot(pts[i] - 50, pts[i + 1] - 50) - 40) < 0.03);
  }
  assert.ok(Math.abs(length - 2 * Math.PI * 40) / (2 * Math.PI * 40) < 0.001);

  const relative = flattenPath("M0 0 l10 0 0 10 z", [1, 0, 0, 1, 0, 0], 0.1);
  assert.equal(relative[0].pts.length, 6);
  assert.ok(relative[0].closed);
  const curves = flattenPath("M0 0 C 10 0 10 10 0 10 S -10 20 0 20 Q 5 25 0 30 T 0 40", [2, 0, 0, 2, 5, 5], 0.05);
  assert.ok(curves[0].pts.length > 20);
  assert.ok(curves[0].pts.every(Number.isFinite));
  // Compact arc flags ("0 00.5.5") must parse.
  assert.doesNotThrow(() => flattenPath("M0 0a1 1 0 00.5.5", [1, 0, 0, 1, 0, 0], 0.05));
});

test("transform parsing composes left to right", () => {
  const m = parseTransform("translate(10 20) scale(2)");
  assert.deepEqual(m, multiply([1, 0, 0, 1, 10, 20], [2, 0, 0, 2, 0, 0]));
  const r = parseTransform("rotate(90 5 5)");
  assert.ok(Math.abs(r[4] - 10) < 1e-9 && Math.abs(r[5]) < 1e-9);
});

test("marching squares traces a disk to a fraction of a pixel", () => {
  const w = 400, h = 400, R = 150;
  const rgba = render(w, h, disk(200, 200, R));
  const contours = traceMask(rgba, w, h, 128, { minLength: 3, smoothing: 2 });
  assert.equal(contours.length, 1);
  const [c] = contours;
  assert.equal(c.kind, KIND_BORDER);
  assert.ok(c.closed);
  assert.ok(Math.abs(c.length - 2 * Math.PI * R) / (2 * Math.PI * R) < 0.003);
  let worst = 0;
  for (let i = 0; i < c.pts.length; i += 2) worst = Math.max(worst, Math.abs(Math.hypot(c.pts[i] - 200, c.pts[i + 1] - 200) - R));
  assert.ok(worst < 0.35, `worst radial error ${worst}`);
});

test("a thick ring has an outer border and an inner edge", () => {
  const w = 600, h = 600;
  const rgba = render(w, h, (x, y) => Math.min(250 - Math.hypot(x - 300, y - 300), Math.hypot(x - 300, y - 300) - 100));
  const contours = traceMask(rgba, w, h, 128, { minLength: 3, smoothing: 2 });
  assert.equal(contours.filter((c) => c.kind === KIND_BORDER).length, 1);
  assert.equal(contours.filter((c) => c.kind === KIND_EDGE).length, 1);
});

test("an outline with gaps still counts as the outer border", () => {
  // Thin ring (8 px wide) with two 12 px gaps: the inside is connected to the outside.
  const w = 600, h = 600;
  const rgba = render(w, h, (x, y) => {
    const d = Math.hypot(x - 300, y - 300);
    const ring = 4 - Math.abs(d - 220);
    const angle = Math.atan2(y - 300, x - 300);
    const gap = Math.abs(((angle + Math.PI) % Math.PI) - 1.0) * 220 < 6 ? -1 : 1;
    return gap < 0 ? -1 : ring;
  });
  const contours = traceMask(rgba, w, h, 128, { minLength: 3, smoothing: 2 });
  const border = contours.filter((c) => c.kind === KIND_BORDER);
  assert.ok(border.length >= 1);
  const borderLength = border.reduce((sum, c) => sum + c.length, 0);
  assert.ok(borderLength > 2 * Math.PI * 220 * 0.8, `border length ${borderLength}`);
});

test("curvature is high only at corners", () => {
  const square = new Float32Array(2 * 80);
  for (let i = 0; i < 80; i += 1) {
    const side = Math.floor(i / 20);
    const t = (i % 20) * 5;
    const p = [[t, 0], [100, t], [100 - t, 100], [0, 100 - t]][side];
    square[2 * i] = p[0];
    square[2 * i + 1] = p[1];
  }
  const curv = computeCurvature(square, true);
  assert.ok(curv[0] > 200 && curv[20] > 200 && curv[40] > 200 && curv[60] > 200);
  assert.ok(curv[10] === 0 && curv[30] === 0);
});

test("samples are evenly spaced on the border, inside the shape, ordered by layer and deterministic", () => {
  const w = 800, h = 800, R = 300;
  const a = buildAnalysis({ rgba: render(w, h, disk(400, 400, R)), width: w, height: h, strokes: [] });
  assert.equal(a.borders.length, 1);
  assert.equal(a.edges.length, 0);
  const set = generateSamples(a, options, 2000);
  assert.ok(Math.abs(set.stats.total - 2000) <= 20, `total ${set.stats.total}`);
  assert.equal(set.stats.total, set.stats.border + set.stats.edges + set.stats.fill);
  for (let i = 1; i < set.layer.length; i += 1) assert.ok(set.layer[i] >= set.layer[i - 1]);
  for (let i = 0; i < set.x.length; i += 1) {
    assert.ok(Math.hypot(set.x[i] - 400, set.y[i] - 400) <= R + 0.6);
  }
  // Border spacing is uniform (angle order): coefficient of variation of neighbour distances.
  const n = set.stats.border;
  assert.ok(n > 500);
  const gaps: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    gaps.push(Math.hypot(set.x[j] - set.x[i], set.y[j] - set.y[i]));
  }
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
  assert.ok(sd / mean < 0.1, `spacing variation ${sd / mean}`);
  const again = generateSamples(a, options, 2000);
  assert.deepEqual(Array.from(again.x.slice(0, 50)), Array.from(set.x.slice(0, 50)));
  // Fill points keep clear of the border particles.
  let closest = Infinity;
  for (let i = set.stats.border; i < set.stats.total; i += 1) {
    for (let j = 0; j < set.stats.border; j += 1) closest = Math.min(closest, Math.hypot(set.x[i] - set.x[j], set.y[i] - set.y[j]));
  }
  assert.ok(closest > 2, `fill/border distance ${closest}`);
});

test("modes and distributions place particles where they should", () => {
  const w = 600, h = 600;
  const ring = render(w, h, (x, y) => Math.min(250 - Math.hypot(x - 300, y - 300), Math.hypot(x - 300, y - 300) - 100));
  const a = buildAnalysis({ rgba: ring, width: w, height: h, strokes: [] });
  const outline = generateSamples(a, { ...options, mode: "Outline" }, 1000);
  assert.equal(outline.stats.fill, 0);
  assert.ok(outline.stats.border > 0 && outline.stats.edges > 0);
  const fill = generateSamples(a, { ...options, mode: "Fill" }, 1000);
  assert.equal(fill.stats.border + fill.stats.edges, 0);
  assert.ok(fill.stats.fill > 950);
  for (const distribution of ["Uniform", "Random", "Weighted", "Density"] as const) {
    const s = generateSamples(a, { ...options, distribution, spacing: 6 }, 800);
    assert.ok(s.stats.total > 300, `${distribution} produced ${s.stats.total}`);
    for (let i = 0; i < s.x.length; i += 1) {
      const d = Math.hypot(s.x[i] - 300, s.y[i] - 300);
      assert.ok(d >= 99 && d <= 251, `${distribution} point outside the ring (${d})`);
    }
  }
});

test("sharp corners keep a particle on the apex", () => {
  const w = 500, h = 500;
  const square = render(w, h, (x, y) => Math.min(x - 50, 450 - x, y - 50, 450 - y));
  const a = buildAnalysis({ rgba: square, width: w, height: h, strokes: [] });
  const set = generateSamples(a, { ...options, mode: "Outline", borderDetail: 100, edgeDetail: 0, cornerSharpness: 100 }, 400);
  for (const [cx, cy] of [[50, 50], [450, 50], [450, 450], [50, 450]]) {
    let best = Infinity;
    for (let i = 0; i < set.x.length; i += 1) best = Math.min(best, Math.hypot(set.x[i] - cx, set.y[i] - cy));
    assert.ok(best < 4, `nearest sample to corner is ${best}px away`);
  }
});

test("stroke-only art uses the centre line", () => {
  const w = 300, h = 300;
  const pts = new Float32Array([30, 150, 150, 150, 270, 150]);
  const strokes = [{ pts, curv: computeCurvature(pts, false), closed: false, length: 240, kind: KIND_STROKE }];
  const rgba = render(w, h, (x, y) => 4 - Math.abs(y - 150) + (x < 30 || x > 270 ? -9 : 0));
  const a = buildAnalysis({ rgba, maskRgba: new Uint8ClampedArray(w * h * 4), width: w, height: h, strokes });
  const set = generateSamples(a, { ...options, mode: "Outline" }, 120);
  assert.ok(set.stats.total >= 100);
  for (let i = 0; i < set.x.length; i += 1) assert.ok(Math.abs(set.y[i] - 150) < 0.01);
});

test("empty artwork is rejected", () => {
  const w = 64, h = 64;
  assert.throws(() => buildAnalysis({ rgba: new Uint8ClampedArray(w * h * 4), width: w, height: h, strokes: [] }), /no visible/);
});
