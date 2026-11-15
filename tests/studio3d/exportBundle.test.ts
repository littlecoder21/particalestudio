import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildEngineBundles, type EngineBundles } from "../../tools/engineBundles";
import { buildFormation } from "../../src/studio3d/generators";
import { defaultProject } from "../../src/studio3d/project";
import { makeBehavior, makeDeformer } from "../../src/studio3d/behaviors";
import { DEFAULT_POST_EFFECTS, CONFIG_SCHEMA, CONFIG_VERSION, ConfigError, mergeConfig, parseConfig, serializeConfig } from "../../src/studio3d/export/config";
import { decodePsb, readFloat32 } from "../../src/studio3d/export/format";
import { embedBytes, inflateRaw } from "../../src/studio3d/export/compress";
import { crc32 } from "../../src/studio3d/export/format";
import { buildProjectZip, buildStandalone, buildWebsiteFiles, buildWebsiteZip, computeSizes, ENGINE_VERSION, prepareExport, projectZipEntries, websiteZipEntries, type ExportCapture, type ExportSettings } from "../../src/studio3d/export/bundle";
import { buildZip } from "../../src/studio3d/export/zip";
import { cssSnippet, htmlSnippet, WEBSITE_PATHS } from "../../src/studio3d/export/snippets";
import type { ParticleSource } from "../../src/studio3d/export/packing";
import type { Project3D } from "../../src/studio3d/types";

let bundlesPromise: Promise<EngineBundles> | null = null;
const bundles = () => (bundlesPromise ??= buildEngineBundles());

function makeScene(mutate: (project: Project3D) => void = () => {}, count = 2000) {
  const project = defaultProject();
  project.behaviors = []; project.deformers = []; project.beams = [];
  project.interaction = { ...project.interaction, tool: "none" };
  mutate(project);
  const formation = buildFormation(project.layers, count);
  const source: ParticleSource = { ...formation, velocity: Float32Array.from(formation.pos, (v) => v * 0.02), homeBase: formation.pos.slice() };
  const capture: ExportCapture = { source, camera: { ...project.camera }, active: formation.n, state: { time: 12.5, tick: 750, cameraYawVelocity: 0.25, cameraPitchVelocity: -0.1 } };
  return { project, capture };
}
const settings = (over: Partial<ExportSettings> = {}): ExportSettings => ({
  mode: "hero", compression: "auto", pixelRatio: null, animation: true, interaction: true, zoom: "modifier", touch: "scroll", effects: DEFAULT_POST_EFFECTS, adaptive: true, embedding: "auto", ...over,
});

/* minimal ZIP reader used to verify archives independently of the writer */
async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  assert.ok(end >= 0, "end of central directory record");
  const total = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < total; i++) {
    assert.equal(view.getUint32(at, true), 0x02014b50, "central header signature");
    const method = view.getUint16(at + 10, true), crc = view.getUint32(at + 16, true), csize = view.getUint32(at + 20, true), usize = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true), extraLength = view.getUint16(at + 30, true), commentLength = view.getUint16(at + 32, true), local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    assert.equal(view.getUint32(local, true), 0x04034b50, "local header signature");
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const stored = bytes.subarray(dataStart, dataStart + csize);
    const data = method === 8 ? await inflateRaw(stored) : stored;
    assert.equal(data.length, usize, `${name} size`);
    assert.equal(crc32(data), crc, `${name} crc`);
    out.set(name, new Uint8Array(data));
    at += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

/** Top-level selectors of a stylesheet (descends into @supports / @media). */
function selectors(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: string[] = [];
  const walk = (block: string) => {
    let i = 0;
    while (i < block.length) {
      const open = block.indexOf("{", i);
      if (open < 0) break;
      const prelude = block.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (j < block.length && depth) { if (block[j] === "{") depth++; else if (block[j] === "}") depth--; j++; }
      const inner = block.slice(open + 1, j - 1);
      if (prelude.startsWith("@")) walk(inner); else found.push(...prelude.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean));
      i = j;
    }
  };
  walk(text);
  return found;
}

test("config round-trips through JSON and validates untrusted input", async () => {
  const { project, capture } = makeScene();
  const prepared = prepareExport(project, capture, settings(), await bundles());
  const roundTrip = parseConfig(serializeConfig(prepared.config));
  assert.deepEqual(roundTrip, prepared.config);
  assert.equal(roundTrip.schema, CONFIG_SCHEMA);
  assert.equal(roundTrip.version, CONFIG_VERSION);
  assert.equal(roundTrip.data.count, capture.source.n);
  assert.equal(roundTrip.state.time, 12.5);
  assert.deepEqual(roundTrip.scene.camera, capture.camera);

  const bad = (mutate: (c: Record<string, any>) => void, pattern: RegExp) => {
    const copy = JSON.parse(serializeConfig(prepared.config));
    mutate(copy);
    assert.throws(() => parseConfig(copy), (error) => error instanceof ConfigError && pattern.test(error.message));
  };
  assert.throws(() => parseConfig("{not json"), /not valid JSON/);
  assert.throws(() => parseConfig([]), ConfigError);
  bad((c) => { c.schema = "other"; }, /schema/);
  bad((c) => { c.version = CONFIG_VERSION + 1; }, /version/);
  bad((c) => { c.mode = "turbo"; }, /mode/);
  bad((c) => { delete c.data; }, /"data"/);
  bad((c) => { c.render.quality = "extreme"; }, /"render"/);
  bad((c) => { delete c.scene.camera; }, /"scene"/);
  bad((c) => { c.engine.simulation = true; }, /"simulation"/);
});

test("config reflects export settings: effects, pixel ratio, interaction, mode-specific blocks", async () => {
  const { project, capture } = makeScene((p) => {
    p.look = { ...p.look, glow: 0.7, vignette: 0.3, grain: 0.2, trails: 0.5 };
    p.interaction = { ...p.interaction, tool: "swirl", clickAction: "burst" };
    p.behaviors = [makeBehavior({ type: "turbulence", intensity: 1 })];
    p.deformers = [makeDeformer({ type: "wave", amount: 0.2 })];
  });
  const b = await bundles();
  const hero = prepareExport(project, capture, settings({ mode: "hero" }), b).config;
  assert.equal(hero.simulation, undefined, "hero carries no simulation block");
  assert.equal(hero.engine.simulation, false);
  assert.equal(hero.interaction.tool, "none", "pointer forces do not exist in a hero export");
  assert.equal(hero.interaction.clickAction, "none");

  const animated = prepareExport(project, capture, settings({ mode: "animated", pixelRatio: 1.5, animation: false, interaction: false, zoom: "always", touch: "capture" }), b).config;
  assert.equal(animated.engine.simulation, true);
  assert.equal(animated.simulation!.behaviors.length, 1);
  assert.equal(animated.simulation!.deformers.length, 1);
  assert.equal(animated.interaction.tool, "swirl");
  assert.equal(animated.render.pixelRatio, 1.5);
  assert.equal(animated.animation.enabled, false);
  assert.equal(animated.interaction.enabled, false);
  assert.equal(animated.interaction.zoom, "always");
  assert.equal(animated.interaction.touch, "capture");

  const noFx = prepareExport(project, capture, settings({ effects: { bloom: false, vignette: false, grain: false, trails: false } }), b).config;
  assert.deepEqual([noFx.scene.look.glow, noFx.scene.look.vignette, noFx.scene.look.grain, noFx.scene.look.trails, noFx.render.bloomLevel], [0, 0, 0, 0, 0]);
  assert.equal(project.look.glow, 0.7, "the project itself is not modified");
  assert.equal(prepareExport(project, capture, settings(), b).config.render.pixelRatio, 2, "default pixel ratio follows the quality profile");
});

test("mergeConfig deep-merges objects, replaces arrays and refuses prototype pollution", () => {
  const base = { a: { b: 1, c: [1, 2] }, d: 5 };
  assert.deepEqual(mergeConfig(base, { a: { c: [9] }, e: 1 }), { a: { b: 1, c: [9] }, d: 5, e: 1 });
  assert.deepEqual(base, { a: { b: 1, c: [1, 2] }, d: 5 }, "input is not mutated");
  mergeConfig({}, JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}'));
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("engine bundles: public API, no simulation in the hero build, versions agree", async () => {
  const b = await bundles();
  for (const [name, js] of Object.entries(b)) assert.ok(js.length > 20_000, `${name} is a real bundle`);
  for (const js of [b.engineStatic, b.engineSim]) {
    assert.match(js, /export\s*\{[^}]*createParticleScene/, "exports createParticleScene");
    assert.match(js, /particleEngineStats/);
    for (const method of ["destroy", "resize", "play", "pause", "setInteraction", "updateConfig"]) assert.ok(js.includes(`${method}(`), `${method}() exists`);
    assert.ok(!/\brequire\(/.test(js), "no CommonJS");
    assert.ok(!/from\s*["']\.{1,2}\//.test(js), "no unresolved relative imports");
    assert.ok(!/(^|[^\w.])import\s*\(\s*["']\./.test(js), "no relative dynamic imports");
  }
  assert.ok(b.engineSim.includes("applyDeformers") && b.engineSim.includes("springScale"), "simulation build has the simulation");
  assert.ok(!b.engineStatic.includes("applyDeformers") && !b.engineStatic.includes("springScale"), "hero build has no simulation code");
  assert.ok(b.engineStatic.length < b.engineSim.length - 15_000, `hero engine is leaner (${b.engineStatic.length} < ${b.engineSim.length})`);
  const source = readFileSync(new URL("../../src/studio3d/engine/particleEngine.js", import.meta.url), "utf8");
  assert.match(source, new RegExp(`ENGINE_VERSION = "${ENGINE_VERSION}"`), "bundle.ts and the engine agree on the version");
  assert.match(b.engineStatic, /three@0\.170\.0\/build\/three\.module\.js/);
  assert.ok(!/(^|[^\w.])import\s+[^;]*from\s*["']https?:/.test(b.engineStatic), "Three.js is loaded lazily, never as a static import");
});

test("website files: the four-file folder, snippets and README", async () => {
  const { project, capture } = makeScene();
  const prepared = prepareExport(project, capture, settings(), await bundles());
  const files = buildWebsiteFiles(prepared);
  assert.equal(files.engine, prepared.engineJs);
  assert.deepEqual(decodePsb(files.data).meta.mode, "hero");
  assert.equal(decodePsb(files.data).count, capture.source.n);
  assert.equal(parseConfig(files.config).data.count, capture.source.n);
  assert.match(files.html, /import \{ createParticleScene \} from "\.\/particle-export\/particle-engine\.js"/);
  assert.match(files.html, /data: "\.\/particle-export\/particle-data\.bin"/);
  assert.match(files.html, /config: "\.\/particle-export\/particle-config\.json"/);
  assert.match(files.html, /<section class="ps-hero">/);
  assert.match(files.readme, new RegExp(`${capture.source.n.toLocaleString("en-US")} particles`));
  assert.match(files.readme, /three\.module\.js/);

  const zip = await readZip(await buildWebsiteZip(prepared, new Date(2026, 10, 14)));
  assert.deepEqual([...zip.keys()].sort(), ["particle-export/README.md", "particle-export/particle-config.json", "particle-export/particle-data.bin", "particle-export/particle-engine.js", "snippet.css", "snippet.html"]);
  assert.deepEqual(zip.get("particle-export/particle-data.bin"), prepared.pack.bytes, "the .bin in the ZIP is byte-identical to the packed data");
  assert.equal(websiteZipEntries(prepared).length, 6);
});

test("CSS snippet is fully scoped: no global selectors, every rule starts with .ps-", () => {
  const { project } = makeScene();
  const css = cssSnippet({ name: project.name, background: project.look.background, transparent: false, mode: "hero", count: 1, bytesPerParticle: 1, simulation: false, dataBytes: 1, engineBytes: 1, configBytes: 1, engineVersion: ENGINE_VERSION, threeUrl: "" });
  const list = selectors(css);
  assert.ok(list.length >= 8, `found ${list.length} selectors`);
  for (const selector of list) {
    assert.match(selector, /^\.ps-/, `selector "${selector}" is scoped`);
    // Elements named inside :where()/:is() are descendants of the .ps- scope, so only the part outside them is checked.
    const outside = selector.replace(/:(where|is)\([^)]*\)/g, "");
    assert.doesNotMatch(outside, /(^|[\s>+~,])(html|body|h[1-6]|p|a|ul|li|img|button|\*)([\s>+~.#:[,]|$)/, `"${selector}" must not target a global element`);
  }
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /:root|@import|@font-face|!important/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /--ps-min-height/);
  assert.match(css, /aspect-ratio/);
  assert.match(htmlSnippet({} as never, WEBSITE_PATHS), /type="module"/);
});

test("standalone HTML: one file, inline engine and data, correct payload, no local dependencies", async () => {
  const { project, capture } = makeScene((p) => { p.behaviors = [makeBehavior({ type: "turbulence", intensity: 1 })]; });
  const b = await bundles();
  for (const mode of ["hero", "animated"] as const) {
    for (const embedding of ["base64", "deflate"] as const) {
      const prepared = prepareExport(project, capture, settings({ mode, embedding }), b);
      const { html, embedded } = await buildStandalone(prepared);
      assert.equal(embedded.encoding, embedding === "base64" ? "b64" : "b64z");
      assert.equal((html.match(/<\/script/gi) ?? []).length, 1, "only the closing tag; engine text cannot terminate the script early");
      assert.doesNotMatch(html, /<link\b|<script\b[^>]*\bsrc=|<img\b|<iframe\b/i, "no external local files");
      assert.match(html, /<script type="module">const __PS_EMBED__=/);
      assert.ok(html.includes(mode === "hero" ? "hero build" : "simulation build"), `${mode} uses its own engine`);
      assert.ok(mode === "hero" ? !html.includes("applyDeformers") : html.includes("applyDeformers"));
      const embed = JSON.parse(/const __PS_EMBED__=(\{.*?\});\n/s.exec(html)![1]!.replace(/\\u003c/g, "<"));
      let bytes = Uint8Array.from(Buffer.from(embed.data, "base64"));
      if (embed.enc === "b64z") bytes = new Uint8Array(await inflateRaw(bytes));
      assert.deepEqual(bytes, prepared.pack.bytes, `${mode}/${embedding}: embedded payload equals the packed data`);
      assert.equal(decodePsb(bytes).count, capture.source.n);
      assert.deepEqual(parseConfig(embed.config), prepared.config);
      assert.match(embed.hint, /drag to orbit/);
    }
  }
  const capturePage = await buildStandalone(prepareExport(project, capture, settings(), b), undefined, { width: 320, height: 200 });
  assert.match(capturePage.html, /"capture":\{"width":320,"height":200\}/);
  assert.doesNotMatch(capturePage.html, /id="ps-toggle"/, "capture pages have no UI");
});

test("auto embedding only deflates when it saves real space", async () => {
  const random = new Uint8Array(20_000);
  let seed = 123456789;
  for (let i = 0; i < random.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; random[i] = seed & 255; } // xorshift: incompressible
  assert.equal((await embedBytes(random, "auto")).encoding, "b64", "incompressible data stays plain base64");
  assert.equal((await embedBytes(new Uint8Array(20_000), "auto")).encoding, "b64z", "highly compressible data is deflated");
  assert.equal((await embedBytes(new Uint8Array(20_000), "base64")).encoding, "b64");
  const forced = await embedBytes(random, "deflate");
  assert.equal(forced.encoding, "b64z");
});

test("project ZIP contains every required file and is a valid archive", async () => {
  const { project, capture } = makeScene((p) => { p.behaviors = [makeBehavior({ type: "turbulence", intensity: 1 })]; });
  const prepared = prepareExport(project, capture, settings({ mode: "animated" }), await bundles());
  const zipBytes = await buildProjectZip(prepared, new Date(2026, 10, 14));
  const files = await readZip(zipBytes);
  for (const required of ["index.html", "style.css", "particle-engine.js", "particle-data.bin", "particle-config.json", "README.md"]) assert.ok(files.has(required), `${required} is in the ZIP`);
  for (const optional of ["particle-engine.d.ts", "react/ParticleSceneView.tsx", "examples/existing-site.html", "docs/CONFIGURATION.md", "project.particle3d.json"]) assert.ok(files.has(optional), `${optional} is in the ZIP`);
  assert.deepEqual(files.get("particle-data.bin"), prepared.pack.bytes);
  assert.equal(new TextDecoder().decode(files.get("particle-engine.js")), prepared.engineJs);
  const index = new TextDecoder().decode(files.get("index.html"));
  assert.match(index, /href="style\.css"/);
  assert.match(index, /from "\.\/particle-engine\.js"/);
  assert.match(index, /file:/, "explains the file:// limitation");
  assert.equal(JSON.parse(new TextDecoder().decode(files.get("project.particle3d.json"))).name, project.name, "the Studio project file reloads");
  assert.match(new TextDecoder().decode(files.get("react/ParticleSceneView.tsx")), /createParticleScene/);
  assert.match(new TextDecoder().decode(files.get("README.md")), /npx serve/);
  assert.equal(projectZipEntries(prepared).length, files.size);
});

test("ZIP writer: stores or deflates per entry, UTF-8 names, reproducible with a fixed date", async () => {
  const entries = [{ path: "a.txt", data: "x".repeat(5000) }, { path: "ünï/b.bin", data: Uint8Array.from({ length: 300 }, (_, i) => (i * 7919) & 255) }, { path: "tiny", data: "hi" }];
  const date = new Date(2026, 0, 2, 3, 4, 6);
  const one = await buildZip(entries, { date }), two = await buildZip(entries, { date });
  assert.deepEqual(one, two);
  const files = await readZip(one);
  assert.equal(new TextDecoder().decode(files.get("a.txt")), "x".repeat(5000));
  assert.ok(files.has("ünï/b.bin"));
  assert.ok(one.length < 5000, "repetitive text is deflated");
  const stored = await buildZip(entries, { date, compress: false });
  assert.ok(stored.length > 5300, "compress:false stores everything");
  assert.equal((await readZip(stored)).size, 3);
});

test("sizes are real: every figure equals the byte length of the file it describes", async () => {
  const { project, capture } = makeScene(undefined, 3000);
  const prepared = prepareExport(project, capture, settings(), await bundles());
  const date = new Date(2026, 10, 14);
  const sizes = await computeSizes(prepared, date);
  const files = buildWebsiteFiles(prepared);
  const utf8 = (s: string) => new TextEncoder().encode(s).length;
  assert.equal(sizes.particles.rawBytes, prepared.pack.bytes.length);
  assert.equal(sizes.particles.legacyBytes, capture.source.n * 69);
  assert.equal(sizes.particles.count, capture.source.n);
  assert.ok(sizes.particles.savedPercent > 50, `hero saves ${sizes.particles.savedPercent}% versus the 69 B/particle exporter`);
  assert.equal(sizes.website.data, files.data.length);
  assert.equal(sizes.website.engine, utf8(files.engine));
  assert.equal(sizes.website.config, utf8(files.config));
  assert.equal(sizes.website.total, sizes.website.engine + sizes.website.data + sizes.website.config);
  assert.ok(sizes.website.gzip && sizes.website.gzip.engine < sizes.website.engine && sizes.website.gzip.total === sizes.website.gzip.engine + sizes.website.gzip.data + sizes.website.gzip.config);
  const standalone = await buildStandalone(prepared);
  assert.equal(sizes.standalone.html, standalone.bytes, "the standalone figure is the built file's length");
  assert.equal(sizes.standalone.dataRawBytes, prepared.pack.bytes.length);
  assert.ok(sizes.standalone.dataEncodedChars >= Math.ceil(sizes.standalone.dataStoredBytes / 3) * 4, "base64 text is at least 4/3 of the stored bytes");
  assert.equal(sizes.project.zip, (await buildProjectZip(prepared, date)).length, "the ZIP figure is the built archive's length");
  assert.equal(sizes.project.files.find((f) => f.path === "particle-data.bin")!.bytes, prepared.pack.bytes.length);
  assert.equal(sizes.runtime.threeUrl, "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js");
  assert.ok(sizes.runtime.rawBytes > 1_000_000);
  assert.equal(sizes.particles.layout[0], "position:f32");
});

test("static exports do not carry simulation-only attributes; full quality keeps them", async () => {
  const { project, capture } = makeScene();
  const b = await bundles();
  const hero = decodePsb(prepareExport(project, capture, settings({ mode: "hero" }), b).pack.bytes);
  assert.equal(hero.attributes.homeBase, undefined);
  assert.equal(hero.attributes.velocity, undefined);
  assert.equal(hero.attributes.weight, undefined);
  const full = decodePsb(prepareExport(project, capture, settings({ mode: "full", compression: "auto" }), b).pack.bytes);
  const home = readFloat32(full, "homeBase")!;
  for (let i = 0; i < home.length; i++) assert.equal(home[i], capture.source.homeBase[i]);
});
