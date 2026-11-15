/**
 * Real-browser tests for the three export formats. Run:  npm run test:export:browser
 * Needs `playwright` (npm i -D playwright && npx playwright install chromium) or CHROME_PATH pointing at Chrome.
 * Three.js is taken from THREE_MODULE / node_modules/three when available (offline runs), otherwise from the real CDN.
 */
import { chromium, type Browser, type Page } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { makeBehavior } from "../../src/studio3d/behaviors";
import { buildProjectZip } from "../../src/studio3d/export/bundle";
import { engineBundles, defaultSettings, localThree, makeScene, resetDir, serveDirectory, THREE_URL, write, writeStandalone, writeWebsite } from "./lib";
import { prepareExport, projectZipEntries } from "../../src/studio3d/export/bundle";

const out = join(process.env.PS_OUT ?? "/tmp/ps-browser", "suite");
resetDir(out);
const results: { name: string; ok: boolean; detail?: string }[] = [];
const only = process.env.PS_ONLY?.split(",");

async function test(name: string, fn: () => Promise<void>) {
  if (only && !only.some((o) => name.toLowerCase().includes(o.toLowerCase()))) return;
  try { await fn(); results.push({ name, ok: true }); console.log(`PASS  ${name}`); }
  catch (error) { const detail = error instanceof Error ? error.message : String(error); results.push({ name, ok: false, detail }); console.log(`FAIL  ${name}\n      ${detail.split("\n").join("\n      ")}`); }
}
function expect(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

/* ───────────── fixtures ───────────── */

const heroSpec = makeScene((p) => { p.camera = { ...p.camera, autoRotate: 0.4 }; }, 9000);
const animSpec = makeScene((p) => {
  p.camera = { ...p.camera, autoRotate: 0 };
  p.behaviors = [makeBehavior({ type: "turbulence", intensity: 1.2, scale: 1.2, speed: 1 })];
  p.interaction = { ...p.interaction, tool: "repel", radius: 1.4, strength: 2.5, dragMode: "orbit" };
}, 6000);
const heroPrepared = await writeWebsite(out, "hero", heroSpec, defaultSettings());
const animPrepared = await writeWebsite(out, "anim", animSpec, defaultSettings({ mode: "animated", zoom: "always", touch: "capture" }));
await writeStandalone(out, "standalone-hero", heroPrepared);
await writeStandalone(out, "standalone-anim", animPrepared);
const bundles = await engineBundles();

const ENGINE = "/hero/particle-export/particle-engine.js", DATA = "/hero/particle-export/particle-data.bin", CONFIG = "/hero/particle-export/particle-config.json";
const A_ENGINE = "/anim/particle-export/particle-engine.js", A_DATA = "/anim/particle-export/particle-data.bin", A_CONFIG = "/anim/particle-export/particle-config.json";
const page$ = (body: string, script: string, head = "") => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${head}</head><body>${body}<script type="module">${script}</script></body></html>`;
const SCENE_CSS = `<style>.ps-box{position:relative;width:640px;height:400px}</style>`;

/* Hooks installed before every page: GL object accounting, listener accounting, draw counting. */
const INIT = `
window.__name = (f) => f;
window.__gl = { created: {}, deleted: {}, draws: 0 };
for (const kind of ["Texture", "Buffer", "Framebuffer", "Program", "Shader", "VertexArray", "Renderbuffer"]) {
  const proto = WebGL2RenderingContext.prototype;
  const make = proto["create" + kind], del = proto["delete" + kind];
  if (make) proto["create" + kind] = function () { window.__gl.created[kind] = (window.__gl.created[kind] || 0) + 1; return make.apply(this, arguments); };
  if (del) proto["delete" + kind] = function (o) { if (o) window.__gl.deleted[kind] = (window.__gl.deleted[kind] || 0) + 1; return del.apply(this, arguments); };
}
const draw = WebGL2RenderingContext.prototype.drawArrays;
WebGL2RenderingContext.prototype.drawArrays = function () { window.__gl.draws++; return draw.apply(this, arguments); };
window.__ls = {};
const keyOf = (t, type, o) => (t === window ? "window" : t === document ? "document" : t && t.constructor ? t.constructor.name : "?") + ":" + type + ":" + (typeof o === "boolean" ? o : !!(o && o.capture));
const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
EventTarget.prototype.addEventListener = function (type, l, o) { const k = keyOf(this, type, o); window.__ls[k] = (window.__ls[k] || 0) + 1; return add.call(this, type, l, o); };
EventTarget.prototype.removeEventListener = function (type, l, o) { const k = keyOf(this, type, o); window.__ls[k] = (window.__ls[k] || 0) - 1; return rem.call(this, type, l, o); };
window.__hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i += 7) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16) + ":" + s.length; };
window.__mean = async (url) => { const b = await createImageBitmap(await (await fetch(url)).blob()); const c = document.createElement("canvas"); c.width = b.width; c.height = b.height; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(b, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3; return s / (d.length / 4); };
`;

const { server, origin, hits } = await serveDirectory(out);
const threeFile = localThree();
let threeRequests = 0;
const browser: Browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

interface Run { page: Page; errors: string[]; close: () => Promise<void> }
async function open(url: string, options: { viewport?: { width: number; height: number }; touch?: boolean; reducedMotion?: boolean; blockThree?: boolean; init?: boolean } = {}): Promise<Run> {
  const context = await browser.newContext({ viewport: options.viewport ?? { width: 800, height: 560 }, hasTouch: !!options.touch, reducedMotion: options.reducedMotion ? "reduce" : "no-preference" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  if (options.init !== false) await page.addInitScript(INIT);
  await page.route(THREE_URL, (route) => {
    threeRequests++;
    if (options.blockThree) return route.abort("failed");
    return threeFile ? route.fulfill({ status: 200, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: readFileSync(threeFile) }) : route.continue();
  });
  await page.goto(url);
  return { page, errors, close: () => context.close() };
}
const ready = (page: Page, sel = "#s", timeout = 30000) => page.waitForSelector(`${sel}[data-ps-state=ready], ${sel}[data-ps-state=paused], ${sel}[data-ps-state=error]`, { timeout });
const state = (page: Page, sel = "#s") => page.getAttribute(sel, "data-ps-state");
const shot = (page: Page, name = "scene") => page.evaluate((n) => (window as any)[n].capture(), name).then((url) => (page.evaluate((u) => (window as any).__hash(u), url as string) as Promise<string>));
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/* ───────────── tests ───────────── */

await test("standalone HTML opens from file:// with no server, renders pixels, no errors", async () => {
  for (const name of ["standalone-hero", "standalone-anim"]) {
    const run = await open(`file://${join(out, `${name}.html`)}`);
    await ready(run.page, "#ps-root");
    expect(await state(run.page, "#ps-root") === "ready", `${name} state`);
    const canvasCount = await run.page.locator("#ps-root canvas").count();
    expect(canvasCount === 1, `${name}: one canvas`);
    const info = await run.page.evaluate(async () => { const c = document.querySelector("#ps-root canvas") as HTMLCanvasElement; return { w: c.width, h: c.height }; });
    expect(info.w > 100 && info.h > 100, `${name}: canvas sized ${info.w}x${info.h}`);
    const png = await run.page.screenshot();
    writeFileSync(join(out, `${name}.png`), png);
    const lit = await run.page.evaluate(() => { const g = document.querySelector("#ps-label")?.textContent ?? ""; return g.length; });
    expect(lit > 5, "interaction hint is shown");
    expect(run.errors.length === 0, `${name}: console errors: ${run.errors.join(" | ")}`);
    await run.close();
  }
});

await test("standalone pause button freezes and resumes the animation", async () => {
  const run = await open(`file://${join(out, "standalone-hero.html")}`);
  await ready(run.page, "#ps-root");
  const grab = () => run.page.evaluate(async () => { const c = document.querySelector("#ps-root canvas") as HTMLCanvasElement; return c.toDataURL ? "" : ""; });
  void grab;
  const frame = async () => (await run.page.screenshot({ clip: { x: 200, y: 100, width: 400, height: 300 } })).toString("base64").length + ":" + (await run.page.screenshot({ clip: { x: 200, y: 100, width: 400, height: 300 } })).toString("base64").slice(2000, 2400);
  const a = await frame(); await sleep(700); const b = await frame();
  expect(a !== b, "animating while playing");
  await run.page.click("#ps-toggle");
  expect((await run.page.textContent("#ps-toggle")) === "Resume animation", "button label flips");
  await sleep(300);
  const c = await frame(); await sleep(700); const d = await frame();
  expect(c === d, "frozen while paused");
  await run.page.click("#ps-toggle");
  await sleep(300);
  const e = await frame(); await sleep(500); const f = await frame();
  expect(e !== f, "animates again after resume");
  await run.close();
});

const siteHtml = page$(`
<nav id="nav">Menu</nav>
<section class="ps-hero" id="hero" style="--ps-min-height: 420px">
  <div id="particle-scene" class="ps-hero__scene"></div>
  <div class="ps-hero__content"><h1 id="title">Particles behind your headline</h1><a id="link" href="#x">A link</a></div>
</section>
<div style="height:2400px">tall page</div>`, `
import { createParticleScene } from "${ENGINE}";
window.scene = await createParticleScene({ container: "#particle-scene", data: "${DATA}", config: "${CONFIG}", lazy: false });
window.ready = true;`, `<style>
* { box-sizing: content-box; } body { margin: 7px; font: 17px Georgia, serif; color: #123456; background: #fafafa; } h1 { font-size: 41px; color: rgb(179, 38, 30); text-transform: uppercase; }
a { color: rgb(1, 2, 3); } nav { padding: 13px; background: rgb(34, 34, 34); color: #fff; }
${"/*SNIPPET*/"}</style>`);
import { cssSnippet } from "../../src/studio3d/export/snippets";
write(out, "site.html", siteHtml.replace("/*SNIPPET*/", cssSnippet(heroPrepared.context)));
write(out, "site-baseline.html", siteHtml.replace("/*SNIPPET*/", "").replace(/<script type="module">[\s\S]*<\/script>/, ""));

await test("website snippet in an existing site: scoped CSS leaves host styles untouched, scene fills the hero", async () => {
  const styles = (page: Page) => page.evaluate(() => {
    const cs = (s: string) => getComputedStyle(document.querySelector(s)!);
    return { h1: [cs("#title").color, cs("#title").fontSize, cs("#title").textTransform], a: cs("#link").color, bodyMargin: cs("body").margin, bodyFont: cs("body").fontFamily, nav: [cs("#nav").padding, cs("#nav").backgroundColor] };
  });
  const base = await open(`${origin}/site-baseline.html`);
  const before = await styles(base.page);
  await base.close();
  const run = await open(`${origin}/site.html`);
  await run.page.waitForFunction(() => (window as any).ready === true, null, { timeout: 30000 });
  expect((await state(run.page, "#particle-scene")) === "ready", "scene ready");
  const after = await styles(run.page);
  expect(JSON.stringify(after) === JSON.stringify(before), `host styles changed: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  const geometry = await run.page.evaluate(() => {
    const hero = document.querySelector("#hero")!.getBoundingClientRect(), canvas = document.querySelector("#particle-scene canvas")!.getBoundingClientRect();
    const content = document.querySelector(".ps-hero__content") as HTMLElement, h1 = document.querySelector("#title")!.getBoundingClientRect();
    const top = document.elementFromPoint(h1.left + 5, h1.top + 5);
    const link = document.querySelector("#link")!.getBoundingClientRect();
    return { hero: [hero.width, hero.height], canvas: [canvas.width, canvas.height, canvas.left - hero.left, canvas.top - hero.top], contentZ: getComputedStyle(content).zIndex, contentPE: getComputedStyle(content).pointerEvents, linkPE: getComputedStyle(document.querySelector("#link")!).pointerEvents, topTag: top?.tagName, linkVisible: link.width > 0, sceneChildCanvas: document.querySelectorAll("#particle-scene > canvas").length };
  });
  expect(Math.abs(geometry.canvas[0]! - geometry.hero[0]!) < 1 && Math.abs(geometry.canvas[1]! - geometry.hero[1]!) < 1, `canvas covers hero: ${JSON.stringify(geometry)}`);
  expect(geometry.canvas[2] === 0 && geometry.canvas[3] === 0, "canvas aligned to hero origin");
  expect(geometry.contentPE === "none" && geometry.linkPE === "auto", `links stay clickable while content passes drags through: ${JSON.stringify(geometry)}`);
  expect(geometry.sceneChildCanvas === 1, "exactly one canvas added");
  await run.page.screenshot({ path: join(out, "site.png") });
  const clickedLink = await run.page.evaluate(() => new Promise<boolean>((done) => { const a = document.querySelector("#link")!; a.addEventListener("click", (e) => { e.preventDefault(); done(true); }); (a as HTMLElement).click(); }));
  expect(clickedLink, "link clickable");
  expect(run.errors.length === 0, `errors: ${run.errors.join(" | ")}`);
  await run.close();
});

/* failure handling */
write(out, "fail/truncated.bin", readFileSync(join(out, "hero/particle-export/particle-data.bin")).subarray(0, 5000));
write(out, "fail/badmagic.bin", "<!doctype html><html><body>404 page served by a misconfigured host</body></html>".padEnd(300, " "));
write(out, "fail/badconfig.json", JSON.stringify({ schema: "nope" }));
const bad = JSON.parse(heroPrepared.configJson); bad.data.count = 123;
write(out, "fail/mismatch.json", JSON.stringify(bad));
write(out, "fail/index.html", page$(`<div id="s" class="ps-box"></div>`, `
import { createParticleScene } from "${ENGINE}";
const q = new URLSearchParams(location.search);
const errors = [];
try {
  window.scene = await createParticleScene({ container: "#s", data: q.get("data"), config: q.get("config") || "${CONFIG}", lazy: false, onError: (e) => errors.push(e.code) });
} catch (e) { errors.push("thrown:" + e.code); }
window.errors = errors; window.done = true;`, SCENE_CSS));
await test("invalid or missing data fails safely with a specific error code and leaves the page working", async () => {
  const cases: [string, string, string][] = [
    ["truncated .bin", `data=/fail/truncated.bin`, "data-invalid"],
    ["HTML error page instead of .bin", `data=/fail/badmagic.bin`, "data-invalid"],
    ["missing .bin (404)", `data=/fail/nope.bin`, "data-load-failed"],
    ["config of another schema", `data=${DATA}&config=/fail/badconfig.json`, "config-invalid"],
    ["config/data from different exports", `data=${DATA}&config=/fail/mismatch.json`, "data-invalid"],
    ["missing config (404)", `data=${DATA}&config=/fail/nope.json`, "config-invalid"],
  ];
  for (const [label, query, code] of cases) {
    const run = await open(`${origin}/fail/index.html?${query}`);
    await run.page.waitForFunction(() => (window as any).done === true, null, { timeout: 30000 });
    const errors: string[] = await run.page.evaluate(() => (window as any).errors);
    expect(errors.some((e) => e.endsWith(code)), `${label}: expected ${code}, got ${JSON.stringify(errors)}`);
    expect((await state(run.page)) === "error", `${label}: container data-ps-state=error`);
    expect((await run.page.locator("#s canvas").count()) === 0, `${label}: no canvas left behind`);
    expect(!run.errors.some((e) => e.startsWith("pageerror")), `${label}: no uncaught exception: ${run.errors.join("|")}`);
    await run.close();
  }
  const run = await open(`${origin}/fail/index.html?data=${A_DATA}&config=${A_CONFIG}`);
  await run.page.waitForFunction(() => (window as any).done === true, null, { timeout: 30000 });
  const errors: string[] = await run.page.evaluate(() => (window as any).errors);
  expect(errors.some((e) => e.endsWith("unsupported-engine")), `hero engine + animated export: ${JSON.stringify(errors)}`);
  await run.close();
});

await test("CDN failure: standalone shows a message with Try again, engine page reports three-load-failed", async () => {
  const run = await open(`file://${join(out, "standalone-hero.html")}`, { blockThree: true });
  await run.page.waitForSelector(".ps-particle__message", { timeout: 20000 });
  const text = await run.page.textContent(".ps-particle__message");
  expect(/Three\.js could not be loaded/.test(text ?? ""), `message: ${text}`);
  expect((await run.page.locator(".ps-retry").count()) === 1, "Try again button");
  await run.close();
  const engineRun = await open(`${origin}/fail/index.html?data=${DATA}`, { blockThree: true });
  await engineRun.page.waitForFunction(() => (window as any).done === true, null, { timeout: 20000 });
  const errors: string[] = await engineRun.page.evaluate(() => (window as any).errors);
  expect(errors.some((e) => e.endsWith("three-load-failed")), JSON.stringify(errors));
  await engineRun.close();
});

/* controls, resize, animation */
write(out, "controls.html", page$(`<div style="height:420px"><div id="s" class="ps-box" style="width:640px;height:400px"></div></div><div style="height:2200px">below</div>`, `
import { createParticleScene } from "${ENGINE}";
const q = new URLSearchParams(location.search);
const cfg = await (await fetch("${CONFIG}")).json();
Object.assign(cfg.interaction, JSON.parse(q.get("ix") || "{}"));
if (q.get("still")) cfg.animation.enabled = false;
window.scene = await createParticleScene({ container: "#s", data: "${DATA}", config: cfg, lazy: false, pixelRatio: 1, respectReducedMotion: false, autoplay: q.get("still") ? false : undefined });
window.ready = true;`, SCENE_CSS));

await test("mouse: drag orbits, wheel scrolls the page unless Ctrl/Cmd is held (or zoom is 'always')", async () => {
  const run = await open(`${origin}/controls.html?still=1`);
  await run.page.waitForFunction(() => (window as any).ready === true);
  const h0 = await shot(run.page);
  await run.page.mouse.move(300, 200); await run.page.mouse.down(); await run.page.mouse.move(420, 230, { steps: 8 }); await run.page.mouse.up();
  await sleep(150);
  const h1 = await shot(run.page);
  expect(h0 !== h1, "dragging changed the view");
  await run.page.mouse.move(300, 200);
  await run.page.mouse.wheel(0, 400);
  await sleep(300);
  const scrolled = await run.page.evaluate(() => window.scrollY);
  expect(scrolled > 100, `plain wheel scrolled the page (scrollY=${scrolled})`);
  expect((await shot(run.page)) === h1, "plain wheel did not zoom the scene");
  await run.page.evaluate(() => window.scrollTo(0, 0));
  await run.page.mouse.move(300, 200);
  await run.page.keyboard.down("Control"); await run.page.mouse.wheel(0, -500); await run.page.keyboard.up("Control");
  await sleep(300);
  const h2 = await shot(run.page);
  expect(h2 !== h1, "Ctrl+wheel zoomed the scene");
  expect(await run.page.evaluate(() => window.scrollY) === 0, "Ctrl+wheel did not scroll the page");
  await run.close();
  const always = await open(`${origin}/controls.html?still=1&ix=${encodeURIComponent(JSON.stringify({ zoom: "always" }))}`);
  await always.page.waitForFunction(() => (window as any).ready === true);
  const a0 = await shot(always.page);
  await always.page.mouse.move(300, 200); await always.page.mouse.wheel(0, -500); await sleep(300);
  expect((await shot(always.page)) !== a0 && (await always.page.evaluate(() => window.scrollY)) === 0, "zoom:'always' zooms and captures the wheel");
  await always.close();
});

await test("touch: horizontal drag orbits, vertical swipe scrolls the page and never counts as a tap", async () => {
  const run = await open(`${origin}/controls.html?still=1`, { touch: true });
  await run.page.waitForFunction(() => (window as any).ready === true);
  const cdp = await run.page.context().newCDPSession(run.page);
  const touch = async (type: string, x: number, y: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  const touchStyle = await run.page.evaluate(() => getComputedStyle(document.querySelector("#s canvas")!).touchAction);
  expect(touchStyle === "pan-y", `touch-action is pan-y, got ${touchStyle}`);
  const h0 = await shot(run.page);
  await touch("touchStart", 250, 200);
  for (let i = 1; i <= 10; i++) { await touch("touchMove", 250 + i * 14, 200 + i); await sleep(16); }
  await touch("touchEnd", 0, 0);
  await sleep(200);
  const h1 = await shot(run.page);
  expect(h0 !== h1, "horizontal touch drag orbited");
  await touch("touchStart", 300, 380);
  for (let i = 1; i <= 12; i++) { await touch("touchMove", 300 + i, 380 - i * 22); await sleep(16); }
  await touch("touchEnd", 0, 0);
  await sleep(500);
  const scrollY = await run.page.evaluate(() => window.scrollY);
  expect(scrollY > 60, `vertical swipe scrolled the page (scrollY=${scrollY})`);
  await run.close();
});

await test("resize: the drawing buffer follows the container and the device pixel ratio cap", async () => {
  const run = await open(`${origin}/controls.html?still=1`);
  await run.page.waitForFunction(() => (window as any).ready === true);
  const size = () => run.page.evaluate(() => { const i = (window as any).scene.info; const c = (window as any).scene.canvas; return { w: i.width, h: i.height, cw: c.clientWidth, ch: c.clientHeight }; });
  const a = await size();
  expect(a.w === 640 && a.h === 400, `initial ${JSON.stringify(a)}`);
  await run.page.evaluate(() => { const s = document.querySelector("#s") as HTMLElement; s.style.width = "320px"; s.style.height = "200px"; });
  await run.page.waitForFunction(() => (window as any).scene.info.width === 320, null, { timeout: 5000 });
  const b = await size();
  expect(b.w === 320 && b.h === 200 && b.cw === 320, `after container resize ${JSON.stringify(b)}`);
  await run.page.evaluate(() => (window as any).scene.updateConfig({ render: { pixelRatio: 1.5 } }));
  await run.close();
  const hi = await browser.newContext({ viewport: { width: 800, height: 560 }, deviceScaleFactor: 3 });
  const hp = await hi.newPage(); await hp.addInitScript(INIT);
  await hp.route(THREE_URL, (r) => threeFile ? r.fulfill({ status: 200, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: readFileSync(threeFile) }) : r.continue());
  write(out, "hidpi.html", page$(`<div id="s" class="ps-box" style="width:300px;height:200px"></div><div id="t" class="ps-box" style="width:300px;height:200px"></div>`, `
import { createParticleScene } from "${ENGINE}";
window.a = await createParticleScene({ container: "#s", data: "${DATA}", config: "${CONFIG}", lazy: false, pixelRatio: 3 });
window.b = await createParticleScene({ container: "#t", data: "${DATA}", config: "${CONFIG}", lazy: false, pixelRatio: 1.25 });
window.ready = true;`, SCENE_CSS));
  await hp.goto(`${origin}/hidpi.html`); await hp.waitForFunction(() => (window as any).ready === true);
  const dims = await hp.evaluate(() => ({ dpr: devicePixelRatio, a: [(window as any).a.info.width, (window as any).a.info.pixelRatio], b: [(window as any).b.info.width, (window as any).b.info.pixelRatio] }));
  expect(dims.dpr === 3 && dims.a[0] === 900 && dims.b[0] === 375 && dims.b[1] === 1.25, `high-DPI with configurable cap ${JSON.stringify(dims)}`);
  await hi.close();
});

await test("animation: play/pause/resume, updateConfig, setInteraction", async () => {
  const run = await open(`${origin}/controls.html`);
  await run.page.waitForFunction(() => (window as any).ready === true);
  await ready(run.page);
  expect(await state(run.page) === "ready", "playing");
  const f = async () => shot(run.page);
  const a = await f(); await sleep(600); const b = await f();
  expect(a !== b, "auto-rotating while playing");
  await run.page.evaluate(() => (window as any).scene.pause());
  expect(await state(run.page) === "paused" && !(await run.page.evaluate(() => (window as any).scene.isPlaying)), "paused state");
  await sleep(200); const c = await f(); await sleep(600); const d = await f();
  expect(c === d, "frozen while paused");
  const draws0 = await run.page.evaluate(() => (window as any).__gl.draws); await sleep(500);
  expect((await run.page.evaluate(() => (window as any).__gl.draws)) === draws0, "no frames drawn while paused and idle");
  await run.page.evaluate(() => (window as any).scene.updateConfig({ scene: { look: { background: "#300000", glow: 0 } }, render: { adaptive: false } }));
  await sleep(150);
  const e = await f();
  expect(e !== d, "updateConfig re-rendered the paused scene");
  await run.page.evaluate(() => (window as any).scene.play()); await sleep(500);
  const g = await f(); await sleep(500); const h = await f();
  expect(g !== h, "play() resumes");
  await run.page.evaluate(() => (window as any).scene.pause());
  await run.page.evaluate(() => (window as any).scene.setInteraction(false));
  await sleep(100);
  const pe = await run.page.evaluate(() => getComputedStyle((window as any).scene.canvas).pointerEvents);
  expect(pe === "none", `setInteraction(false) -> pointer-events:${pe}`);
  await run.page.evaluate(() => (window as any).scene.setInteraction({ enabled: true, orbit: false }));
  const before = await f();
  await run.page.mouse.move(300, 200); await run.page.mouse.down(); await run.page.mouse.move(420, 230, { steps: 6 }); await run.page.mouse.up(); await sleep(150);
  expect((await f()) === before, "orbit:false: dragging no longer orbits");
  await run.page.evaluate(() => (window as any).scene.setInteraction({ orbit: true }));
  await run.page.mouse.move(300, 200); await run.page.mouse.down(); await run.page.mouse.move(420, 230, { steps: 6 }); await run.page.mouse.up(); await sleep(150);
  expect((await f()) !== before, "orbit:true restored");
  expect(!run.errors.length, run.errors.join("|"));
  await run.close();
});

write(out, "anim.html", page$(`<div id="s" class="ps-box"></div>`, `
import { createParticleScene } from "${A_ENGINE}";
window.scene = await createParticleScene({ container: "#s", data: "${A_DATA}", config: "${A_CONFIG}", lazy: false, pixelRatio: 1, respectReducedMotion: false });
window.ready = true;`, SCENE_CSS));
await test("animated mode: simulation advances over time and pointer forces move particles", async () => {
  const run = await open(`${origin}/anim.html`);
  await run.page.waitForFunction(() => (window as any).ready === true);
  const info = await run.page.evaluate(() => (window as any).scene.info);
  expect(info.mode === "animated" && info.simulation === true, JSON.stringify(info));
  const f = () => shot(run.page);
  await run.page.evaluate(() => (window as any).scene.pause());
  const a = await f();
  await run.page.evaluate(() => (window as any).scene.play()); await sleep(900);
  await run.page.evaluate(() => (window as any).scene.pause());
  const b = await f();
  expect(a !== b, "turbulence moved the particles over time");
  await run.page.evaluate(() => (window as any).scene.play());
  await run.page.mouse.move(100, 100); await sleep(250);
  await run.page.evaluate(() => (window as any).scene.pause());
  const away = await f();
  await run.page.evaluate(() => (window as any).scene.play());
  await run.page.mouse.move(320, 200); await run.page.mouse.move(330, 205, { steps: 4 }); await sleep(900);
  await run.page.evaluate(() => (window as any).scene.pause());
  const after = await f();
  expect(away !== after, "pointer repel force changed the particles");
  expect(!run.errors.length, run.errors.join("|"));
  await run.close();
});

/* multiple scenes, cleanup, lazy loading, visibility, budget */
write(out, "multi.html", page$(`<div id="a" class="ps-box"></div><div id="b" class="ps-box"></div><div id="c" class="ps-box"></div>`, `
import { createParticleScene, particleEngineStats } from "${ENGINE}";
const opts = { data: "${DATA}", config: "${CONFIG}", lazy: false, pixelRatio: 1, respectReducedMotion: false };
window.sa = await createParticleScene({ ...opts, container: "#a" });
window.sb = await createParticleScene({ ...opts, container: "#b", config: { ...(await (await fetch("${CONFIG}")).json()), scene: { ...(await (await fetch("${CONFIG}")).json()).scene, look: { ...(await (await fetch("${CONFIG}")).json()).scene.look, background: "#240010" } } } });
window.sc = await createParticleScene({ ...opts, container: "#c" });
window.stats = particleEngineStats; window.ready = true;`, `<style>.ps-box{position:relative;width:300px;height:180px;display:inline-block}</style>`));
await test("multiple scenes: one Three.js download, independent state and lifecycle", async () => {
  threeRequests = 0;
  const run = await open(`${origin}/multi.html`);
  await run.page.waitForFunction(() => (window as any).ready === true, null, { timeout: 30000 });
  expect(threeRequests === 1, `Three.js was requested ${threeRequests} times`);
  const stats = await run.page.evaluate(() => (window as any).stats());
  expect(stats.scenes === 3 && stats.awake === 3, JSON.stringify(stats));
  const grab = (n: string) => run.page.evaluate((k) => (window as any)[k].capture(), n).then((u) => run.page.evaluate((x) => (window as any).__hash(x as string), u as string));
  expect((await grab("sa")) !== (await grab("sb")), "scene b has its own look");
  await run.page.evaluate(() => (window as any).sa.pause());
  const a0 = await grab("sa"); const c0 = await grab("sc"); await sleep(600);
  expect((await grab("sa")) === a0, "paused scene a is frozen");
  expect((await grab("sc")) !== c0, "scene c keeps animating independently");
  await run.page.evaluate(() => (window as any).sb.destroy());
  expect((await run.page.locator("#b canvas").count()) === 0 && (await run.page.locator("#a canvas").count()) === 1, "only scene b's canvas removed");
  await sleep(400);
  const c1 = await grab("sc"); await sleep(400);
  expect((await grab("sc")) !== c1, "scene c unaffected by destroying b");
  expect((await run.page.evaluate(() => (window as any).stats().scenes)) === 2, "registry updated");
  expect(!run.errors.length, run.errors.join("|"));
  await run.close();
});

await test("cleanup: destroy frees every GL object, removes listeners and the canvas, stops drawing", async () => {
  write(out, "cleanup.html", page$(`<div id="s" class="ps-box"></div>`, `
import { createParticleScene, particleEngineStats } from "${A_ENGINE}";
const snap = () => JSON.parse(JSON.stringify(window.__gl));
/* Baseline: what a bare Three.js renderer leaves behind after dispose() (its own placeholder textures), so the engine is judged only on what it adds. */
const THREE = await import("${THREE_URL}");
const b0 = snap();
const bare = new THREE.WebGLRenderer({ canvas: document.createElement("canvas") });
bare.dispose(); bare.forceContextLoss();
window.baseline = snap();
window.baselineLeak = {}; for (const k of Object.keys(window.baseline.created)) window.baselineLeak[k] = (window.baseline.created[k] - (b0.created[k] || 0)) - ((window.baseline.deleted[k] || 0) - (b0.deleted[k] || 0));
window.base = { ls: { ...window.__ls } };
const cycle = async () => {
  const scene = await createParticleScene({ container: "#s", data: "${A_DATA}", config: "${A_CONFIG}", lazy: false, pixelRatio: 1, respectReducedMotion: false });
  const gl = scene.canvas.getContext("webgl2");
  await new Promise((r) => setTimeout(r, 300));
  scene.destroy(); scene.destroy();
  return gl;
};
window.gls = [await cycle(), await cycle(), await cycle()];
window.stats = particleEngineStats(); window.ready = true;`, SCENE_CSS));
  const run = await open(`${origin}/cleanup.html`);
  await run.page.waitForFunction(() => (window as any).ready === true, null, { timeout: 30000 });
  await sleep(300);
  const report = await run.page.evaluate(() => {
    const g = (window as any).__gl, b = (window as any).baseline, bl = (window as any).baselineLeak, base = (window as any).base.ls, now = (window as any).__ls;
    const leaked: Record<string, number> = {};
    for (const k of Object.keys(g.created)) {
      const delta = ((g.created[k] ?? 0) - (b.created[k] ?? 0)) - ((g.deleted[k] ?? 0) - (b.deleted[k] ?? 0));
      const allowed = (bl[k] ?? 0) * 3;
      if (delta > allowed) leaked[k] = delta - allowed;
    }
    const listeners: Record<string, number> = {};
    for (const k of Object.keys(now)) { const delta = (now[k] ?? 0) - (base[k] ?? 0); if (delta !== 0 && /^(HTMLCanvasElement|HTMLDivElement|window|document)/.test(k)) listeners[k] = delta; }
    return { created: g.created, baselineLeak: bl, leaked, listeners, lost: (window as any).gls.map((x: WebGL2RenderingContext) => x.isContextLost()), canvases: document.querySelectorAll("canvas").length, stats: (window as any).stats, draws: g.draws, attr: document.querySelector("#s")!.getAttribute("data-ps-state"), pos: (document.querySelector("#s") as HTMLElement).style.position };
  });
  if (process.env.PS_DEBUG) console.log("cleanup report", JSON.stringify(report));
  expect(Object.keys(report.leaked).length === 0, `GL objects the engine created but never deleted (beyond Three's own per-renderer leftovers ${JSON.stringify(report.baselineLeak)}): ${JSON.stringify(report.leaked)}`);
  expect(report.lost.every(Boolean), `contexts released: ${JSON.stringify(report.lost)}`);
  expect(Object.keys(report.listeners).length === 0, `listeners left behind: ${JSON.stringify(report.listeners)}`);
  expect(report.canvases === 0 && report.stats.scenes === 0, `canvases=${report.canvases} scenes=${report.stats.scenes}`);
  expect(report.attr === "destroyed" || report.attr === null, `state attribute ${report.attr}`);
  const drawsAfter = await run.page.evaluate(() => (window as any).__gl.draws); await sleep(500);
  expect((await run.page.evaluate(() => (window as any).__gl.draws)) === drawsAfter, "no draw calls after destroy");
  await run.close();
});

write(out, "lazy.html", page$(`<div style="height:3000px">spacer</div><div id="s" class="ps-box"></div><div style="height:800px"></div>`, `
import { createParticleScene } from "${ENGINE}";
window.scene = await createParticleScene({ container: "#s", data: "${DATA}", config: "${CONFIG}", pixelRatio: 1, respectReducedMotion: false });
window.created = true;`, SCENE_CSS));
await test("lazy loading: nothing is fetched until the scene nears the viewport", async () => {
  hits.clear(); threeRequests = 0;
  const run = await open(`${origin}/lazy.html`);
  await run.page.waitForFunction(() => (window as any).created === true);
  await sleep(700);
  expect((await state(run.page)) === "idle", `state while offscreen: ${await state(run.page)}`);
  expect(!hits.has(DATA) && !hits.has(CONFIG) && threeRequests === 0, `requests while offscreen: data=${hits.get(DATA)} config=${hits.get(CONFIG)} three=${threeRequests}`);
  await run.page.evaluate(() => window.scrollTo(0, 2500));
  await ready(run.page);
  expect((await state(run.page)) === "ready", "loaded once near the viewport");
  expect(hits.get(DATA) === 1 && hits.get(CONFIG) === 1 && threeRequests === 1, `requests after scroll: data=${hits.get(DATA)} config=${hits.get(CONFIG)} three=${threeRequests}`);
  await run.close();
});

write(out, "visibility.html", page$(`<div id="s" class="ps-box"></div><div style="height:3000px"></div>`, `
import { createParticleScene } from "${ENGINE}";
window.scene = await createParticleScene({ container: "#s", data: "${DATA}", config: "${CONFIG}", lazy: false, pixelRatio: 1, respectReducedMotion: false });
window.ready = true;`, SCENE_CSS));
await test("visibility: rendering stops when scrolled away or the tab is hidden, and resumes", async () => {
  const run = await open(`${origin}/visibility.html`);
  await run.page.waitForFunction(() => (window as any).ready === true);
  const draws = () => run.page.evaluate(() => (window as any).__gl.draws);
  let d0 = await draws(); await sleep(500);
  expect((await draws()) > d0 + 2, "drawing while visible");
  await run.page.evaluate(() => window.scrollTo(0, 2000)); await sleep(500);
  d0 = await draws(); await sleep(600);
  expect((await draws()) === d0, "no draws while scrolled out of view");
  await run.page.evaluate(() => window.scrollTo(0, 0)); await sleep(500);
  d0 = await draws(); await sleep(500);
  expect((await draws()) > d0 + 2, "resumes when scrolled back");
  await run.page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); }); await sleep(300);
  d0 = await draws(); await sleep(500);
  expect((await draws()) === d0, "no draws while the tab is hidden");
  await run.page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); }); await sleep(400);
  d0 = await draws(); await sleep(400);
  expect((await draws()) > d0 + 2, "resumes when the tab is shown again");
  await run.close();
});

write(out, "reduced.html", page$(`<div id="s" class="ps-box"></div>`, `
import { createParticleScene } from "${ENGINE}";
window.scene = await createParticleScene({ container: "#s", data: "${DATA}", config: "${CONFIG}", lazy: false, pixelRatio: 1 });
window.ready = true;`, SCENE_CSS));
await test("prefers-reduced-motion: starts as a still frame; play() and drag still work", async () => {
  const run = await open(`${origin}/reduced.html`, { reducedMotion: true });
  await run.page.waitForFunction(() => (window as any).ready === true);
  expect((await state(run.page)) === "paused", `state ${await state(run.page)}`);
  const a = await shot(run.page); await sleep(700); const b = await shot(run.page);
  expect(a === b, "no motion");
  await run.page.mouse.move(300, 200); await run.page.mouse.down(); await run.page.mouse.move(400, 230, { steps: 5 }); await run.page.mouse.up(); await sleep(150);
  expect((await shot(run.page)) !== b, "drag still orbits");
  await run.page.evaluate(() => (window as any).scene.play()); await sleep(500);
  const c = await shot(run.page); await sleep(500);
  expect(c !== (await shot(run.page)), "explicit play() animates");
  await run.close();
});

const stack = Array.from({ length: 10 }, (_, i) => `<div id="s${i}" class="ps-box" style="width:300px;height:220px"></div>`).join("");
write(out, "budget.html", page$(stack, `
import { createParticleScene, particleEngineStats } from "${ENGINE}";
window.scenes = [];
for (let i = 0; i < 10; i++) window.scenes.push(await createParticleScene({ container: "#s" + i, data: "${DATA}", config: "${CONFIG}", pixelRatio: 1, respectReducedMotion: false, maxActiveContexts: 4, lazy: { rootMargin: "0px" } }));
window.stats = particleEngineStats; window.ready = true;`, `<style>.ps-box{display:block;margin-bottom:20px;position:relative}</style>`));
await test("context budget: more scenes than maxActiveContexts sleep offscreen and wake when scrolled back", async () => {
  const run = await open(`${origin}/budget.html`, { viewport: { width: 800, height: 480 } });
  await run.page.waitForFunction(() => (window as any).ready === true);
  await sleep(800);
  let peak = 0;
  for (let y = 0; y <= 2400; y += 240) {
    await run.page.evaluate((v) => window.scrollTo(0, v), y); await sleep(450);
    const s = await run.page.evaluate(() => (window as any).stats());
    peak = Math.max(peak, s.awake);
  }
  const mid = await run.page.evaluate(() => (window as any).stats());
  expect(peak <= 4, `at most 4 WebGL contexts alive at any time, peak ${peak}`);
  expect(mid.sleeping >= 3, `offscreen scenes sleep: ${JSON.stringify(mid)}`);
  const posters = await run.page.locator(".ps-particle__poster").count();
  expect(posters >= 3, `sleeping scenes show a still poster (${posters})`);
  await run.page.evaluate(() => window.scrollTo(0, 0)); await sleep(1200);
  const states = await run.page.evaluate(() => (window as any).scenes.slice(0, 2).map((s: any) => s.state));
  expect(states.every((s: string) => s === "ready"), `first scenes woke again: ${JSON.stringify(states)}`);
  const mean = await run.page.evaluate(async () => (window as any).__mean((window as any).scenes[0].capture()));
  expect(mean > 5, `woken scene renders real pixels (mean luma ${mean.toFixed(1)})`);
  expect(!run.errors.some((e) => e.startsWith("pageerror")), run.errors.join("|"));
  await run.close();
});

await test("complete project ZIP contents run: index.html served over http renders; file:// explains why it cannot", async () => {
  const prepared = prepareExport(heroSpec.project, heroSpec.capture, defaultSettings(), bundles);
  for (const entry of projectZipEntries(prepared)) write(out, `project/${entry.path}`, entry.data);
  const zip = await buildProjectZip(prepared);
  expect(zip.length > 10000, "zip built");
  const run = await open(`${origin}/project/index.html`);
  await run.page.waitForSelector("#particle-scene[data-ps-state=ready]", { timeout: 30000 });
  expect((await run.page.locator("#particle-scene canvas").count()) === 1, "scene mounted");
  await run.page.screenshot({ path: join(out, "project.png") });
  expect(!run.errors.length, run.errors.join("|"));
  await run.close();
  const example = await open(`${origin}/project/examples/existing-site.html`);
  await example.page.waitForSelector("#second-scene[data-ps-state=ready]", { timeout: 30000 });
  expect((await example.page.locator("canvas").count()) === 2, "example page mounts two scenes");
  const h1 = await example.page.evaluate(() => getComputedStyle(document.querySelector("h1")!).color);
  expect(h1 === "rgb(179, 38, 30)", `host h1 colour intact: ${h1}`);
  await example.close();
  const file = await open(`file://${join(out, "project/index.html")}`, { init: false });
  await sleep(800);
  const note = await file.page.locator(".demo-note").textContent();
  expect(/Serve this folder over http/.test(note ?? ""), `file:// note: ${note}`);
  await file.close();
});

await test("React wrapper: mounts a scene, re-creates on prop change, cleans up on unmount", async () => {
  write(out, "react-src/App.tsx", `import { createRoot } from "react-dom/client"; import { useState } from "react";
import ParticleSceneView from "../project/react/ParticleSceneView";
import { particleEngineStats } from "../project/particle-engine";
function App() { const [on, setOn] = useState(true); const [v, setV] = useState(1); (window as any).toggle = () => setOn((x) => !x); (window as any).bump = () => setV((x) => x + 1);
  return on ? <ParticleSceneView className="ps-box" data={"/project/particle-data.bin?v=" + v} config="/project/particle-config.json" pixelRatio={1} lazy={false} /> : <p id="gone">gone</p>; }
(window as any).stats = particleEngineStats;
createRoot(document.getElementById("root")!).render(<App />);`);
  const result = await build({
    entryPoints: [join(out, "react-src/App.tsx")], bundle: true, format: "esm", platform: "browser", write: false, jsx: "automatic", target: "es2020", logLevel: "silent",
    external: ["https://*"],
    nodePaths: [join(process.cwd(), "node_modules")], absWorkingDir: process.cwd(), define: { "process.env.NODE_ENV": '"production"' },
  });
  write(out, "react.js", result.outputFiles[0]!.text);
  write(out, "react.html", `<!doctype html><meta charset=utf-8><style>.ps-box{position:relative;width:400px;height:240px}</style><div id="root"></div><script type="module" src="/react.js"></script>`);
  const run = await open(`${origin}/react.html`);
  await run.page.waitForSelector(".ps-box canvas", { timeout: 30000 });
  await sleep(400);
  expect((await run.page.evaluate(() => (window as any).stats().scenes)) === 1, "one scene alive");
  await run.page.evaluate(() => { (window as any).__first = document.querySelector(".ps-box canvas"); (window as any).bump(); });
  await run.page.waitForFunction(() => { const c = document.querySelector(".ps-box canvas"); return c && c !== (window as any).__first; }, null, { timeout: 15000 });
  await sleep(300);
  const rebuilt = await run.page.evaluate(() => ({ scenes: (window as any).stats().scenes, canvases: document.querySelectorAll("canvas").length, firstLost: (window as any).__first.getContext("webgl2").isContextLost() }));
  expect(rebuilt.scenes === 1 && rebuilt.canvases === 1 && rebuilt.firstLost, `changing the data prop replaced the scene and released the old one ${JSON.stringify(rebuilt)}`);
  await run.page.evaluate(() => (window as any).toggle());
  await run.page.waitForSelector("#gone");
  await sleep(300);
  const after = await run.page.evaluate(() => ({ scenes: (window as any).stats().scenes, canvases: document.querySelectorAll("canvas").length }));
  expect(after.scenes === 0 && after.canvases === 0, `unmount destroyed the scene ${JSON.stringify(after)}`);
  expect(!run.errors.length, run.errors.join("|"));
  await run.close();
});

await browser.close();
server.close();
writeFileSync(join(out, "report.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser tests passed`);
process.exit(failed.length ? 1 : 0);
