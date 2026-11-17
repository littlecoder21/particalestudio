import test from "node:test";
import assert from "node:assert/strict";
import { GENERATORS } from "../../src/studio3d/generators/index";
import { allocFormation, finalizeFormation } from "../../src/studio3d/sampling";
import { Rng } from "../../src/studio3d/math";

test("the library holds exactly 150 unique presets", () => {
  assert.equal(GENERATORS.length, 150);
  const ids = GENERATORS.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate generator ids");
  assert.ok(ids.includes("text3d"));
});

test("every preset produces finite, non-degenerate thumbnails", () => {
  for (const def of GENERATORS) {
    if (def.id === "text3d") continue; // needs a text mask from the browser
    const n = 1400, params: Record<string, unknown> = {};
    for (const p of def.params) params[p.key] = p.def;
    Object.assign(params, def.recipe.params ?? {});
    const f = allocFormation(n), rng = new Rng(7);
    def.generate({ n, rng, seed: 7, params, text: () => null } as never, f);
    finalizeFormation(f, rng);
    let extent = 0;
    for (const a of [f.pos, f.nrm, f.t, f.size, f.alpha]) for (let i = 0; i < a.length; i++) assert.ok(Number.isFinite(a[i]), `${def.id}: non-finite value`);
    for (let i = 0; i < n; i++) extent = Math.max(extent, Math.abs(f.pos[i * 3]), Math.abs(f.pos[i * 3 + 1]), Math.abs(f.pos[i * 3 + 2]));
    assert.ok(extent > 0.3 && extent < 12, `${def.id}: implausible extent ${extent}`);
  }
});
