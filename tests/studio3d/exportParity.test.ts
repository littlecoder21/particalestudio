import test from "node:test";
import assert from "node:assert/strict";
import { diffPixels, parityVerdict } from "../../src/studio3d/export/parity";

const solid = (w: number, h: number, rgba: [number, number, number, number]) => {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) out.set(rgba, i * 4);
  return out;
};

test("identical images report zero error and an 'identical' verdict", () => {
  const a = solid(8, 6, [10, 20, 30, 255]);
  const d = diffPixels(a, a.slice(), 8, 6);
  assert.equal(d.max, 0); assert.equal(d.mae, 0); assert.equal(d.pmMax, 0); assert.equal(d.psnr, Infinity);
  assert.equal(parityVerdict(d).level, "identical");
  assert.ok(d.diff.every((v, i) => i % 4 === 3 ? v === 255 : v === 0));
});

test("a single changed pixel is located and measured", () => {
  const a = solid(4, 4, [0, 0, 0, 255]), b = a.slice();
  b.set([40, 0, 0, 255], (2 * 4 + 1) * 4);
  const d = diffPixels(a, b, 4, 4);
  assert.equal(d.max, 40);
  assert.equal(d.pctOver4, 100 / 16); assert.equal(d.pctOver16, 100 / 16);
  assert.equal(d.diff[(2 * 4 + 1) * 4], 255); // 40 * 8 clamps to 255
  assert.equal(d.diff[0], 0);
  assert.equal(parityVerdict(d).level, "differs");
});

test("a ±1 rounding step is a 'match', not a difference", () => {
  const a = solid(10, 10, [100, 100, 100, 255]), b = solid(10, 10, [101, 100, 99, 255]);
  const d = diffPixels(a, b, 10, 10);
  assert.equal(d.max, 1);
  assert.equal(parityVerdict(d).level, "match");
});

test("PNG un-premultiply noise at near-zero alpha does not count as an on-screen difference", () => {
  // Straight colours differ hugely (0 vs 255) but both pixels are 1/255 opaque: premultiplied they differ by < 1.
  const a = solid(2, 2, [0, 0, 0, 1]), b = solid(2, 2, [255, 255, 255, 1]);
  const d = diffPixels(a, b, 2, 2);
  assert.equal(d.max, 255);
  assert.ok(d.pmMax < 1.01, `pmMax ${d.pmMax}`);
});

test("size mismatches are rejected instead of silently compared", () => {
  assert.throws(() => diffPixels(new Uint8ClampedArray(16), new Uint8ClampedArray(12), 2, 2), /do not match/);
});
