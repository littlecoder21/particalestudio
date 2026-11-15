/**
 * Drives the real Studio in a browser: opens the Export tab, changes settings, downloads all three formats, then OPENS the
 * downloaded files to prove they run. Run:  npm run test:export:ui
 * The Studio is bundled with esbuild (same virtual modules as vite.config.ts), Three.js comes from THREE_MODULE / node_modules / the CDN.
 */
import { chromium, type Page } from "playwright";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildEngineBundles } from "../engineBundles";
import { localThree, resetDir, serveDirectory, THREE_URL, write } from "./lib";

const out = join(process.env.PS_OUT ?? "/tmp/ps-browser", "ui");
resetDir(out);
const results: { name: string; ok: boolean; detail?: string }[] = [];
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push({ name, ok: true }); console.log(`PASS  ${name}`); }
  catch (error) { const detail = error instanceof Error ? error.message : String(error); results.push({ name, ok: false, detail }); console.log(`FAIL  ${name}\n      ${detail.split("\n").join("\n      ")}`); }
}
function expect(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/* 1. Bundle the Studio exactly as vite would wire it. */
const runtime = (await build({ entryPoints: ["src/studio3d/exportRuntime.js"], bundle: true, format: "iife", platform: "browser", target: "es2020", minify: true, write: false })).outputFiles[0]!.text;
const engines = await buildEngineBundles();
await build({
  entryPoints: ["tools/export-browser-tests/ui-entry.tsx"], outdir: join(out, "app"), bundle: true, splitting: true, format: "esm", platform: "browser", target: "es2020",
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent", sourcemap: false, minify: false,
  plugins: [{
    name: "virtual", setup(b) {
      b.onResolve({ filter: /^virtual:studio3d-export-runtime$/ }, () => ({ path: "export-runtime", namespace: "virt" }));
      b.onResolve({ filter: /^virtual:studio3d-engine-bundles$/ }, () => ({ path: "engine-bundles", namespace: "virt" }));
      b.onLoad({ filter: /.*/, namespace: "virt" }, (args) => ({ contents: `export default ${JSON.stringify(args.path === "export-runtime" ? runtime : engines)};`, loader: "js" }));
    },
  }],
});
write(out, "app/index.html", `<!doctype html><meta charset=utf-8><link rel="stylesheet" href="ui-entry.css"><div id="root"></div><script type="module" src="ui-entry.js"></script>`);

const { server, origin } = await serveDirectory(out);
const three = localThree();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await context.route(THREE_URL, (route) => three ? route.fulfill({ status: 200, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: readFileSync(three) }) : route.continue());
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
await page.goto(`${origin}/app/index.html`);

const text = (selector: string) => page.locator(selector).allTextContents().then((t) => t.join("\n"));
const download = async (click: () => Promise<void>, name: string) => {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), click()]);
  const path = join(out, "downloads", name);
  mkdirSync(join(out, "downloads"), { recursive: true });
  await dl.saveAs(path);
  return { path, suggested: dl.suggestedFilename() };
};
const unzip = (zip: string, dir: string) => {
  execFileSync("python3", ["-I", "-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); bad=z.testzip(); assert bad is None, bad; z.extractall(sys.argv[2])", zip, dir]);
  return dir;
};
const readyScene = async (target: Page, selector: string) => { await target.waitForSelector(`${selector}[data-ps-state=ready], ${selector}[data-ps-state=paused], ${selector}[data-ps-state=error]`, { timeout: 45000 }); return target.getAttribute(selector, "data-ps-state"); };

await test("Studio starts and the Export tab shows the three formats", async () => {
  await page.waitForSelector(".s3-tabs", { timeout: 30000 });
  await sleep(2500); // let the formation generate
  await page.locator(".s3-tabs button", { hasText: /^Export$/ }).click();
  await page.waitForSelector(".s3-fmt", { timeout: 30000 });
  const titles = await page.locator(".s3-fmt-card b").allTextContents();
  expect(JSON.stringify(titles) === JSON.stringify(["Website integration", "Standalone HTML", "Complete project ZIP"]), `formats: ${titles}`);
  await page.screenshot({ path: join(out, "export-tab.png") });
});

await test("exact sizes are measured and follow the chosen format and mode", async () => {
  await page.waitForFunction(() => document.querySelector(".s3-method")?.textContent === "measured", null, { timeout: 60000 });
  let stats = await text(".s3-stats");
  expect(/Raw particle data/.test(stats) && /particle-engine\.js/.test(stats) && /Over the wire \(gzip\)/.test(stats), `website sizes:\n${stats}`);
  expect(/Three\.js is loaded from/.test(await text(".s3-hint")), "CDN dependency is listed separately");
  await page.locator(".s3-fmt-card", { hasText: "Standalone HTML" }).click();
  stats = await text(".s3-stats");
  expect(/Downloaded \.html file/.test(stats) && /Encoded in the file/.test(stats), `standalone sizes:\n${stats}`);
  await page.locator(".s3-fmt-card", { hasText: "Complete project ZIP" }).click();
  expect(/Downloaded \.zip/.test(await text(".s3-stats")), "project sizes");
  await page.locator(".s3-fmt-card", { hasText: "Website integration" }).click();
  // Mode changes the real data size.
  const perParticle = async (mode: string) => {
    await page.locator(".s3-seg button", { hasText: new RegExp(`^${mode}$`) }).click();
    await page.waitForFunction(() => document.querySelector(".s3-method")?.textContent === "measured", null, { timeout: 60000 });
    await sleep(400);
    await page.waitForFunction(() => document.querySelector(".s3-method")?.textContent === "measured", null, { timeout: 60000 });
    const match = (await text(".s3-stats")).match(/Per particle(\d+) B/);
    return match ? Number(match[1]) : NaN;
  };
  const hero = await perParticle("Hero"), full = await perParticle("Full quality");
  expect(full === 69 && hero < 40, `bytes per particle: hero ${hero}, full ${full}`);
  await page.locator(".s3-seg button", { hasText: /^Auto$/ }).click();
});

let websiteDir = "", standalonePath = "", projectDir = "";
await test("Website package downloads as a valid ZIP with the documented files", async () => {
  const { path, suggested } = await download(() => page.locator(".s3-btn", { hasText: "Download website package" }).click(), "website.zip");
  expect(/-website-export\.zip$/.test(suggested), `file name ${suggested}`);
  websiteDir = unzip(path, join(out, "extracted/website"));
  for (const f of ["particle-export/particle-engine.js", "particle-export/particle-data.bin", "particle-export/particle-config.json", "particle-export/README.md", "snippet.html", "snippet.css"]) expect(existsSync(join(websiteDir, f)), `missing ${f}`);
  expect(/class="ps-hero/.test(readFileSync(join(websiteDir, "snippet.html"), "utf8")), "snippet.html has the scoped markup");
  expect((await page.locator("textarea[aria-label='HTML snippet']").inputValue()).includes("particle-engine.js"), "snippet shown in the panel");
});

await test("the downloaded website package runs when served", async () => {
  write(out, "extracted/website/index.html", `<!doctype html><meta charset=utf-8><style>${readFileSync(join(websiteDir, "snippet.css"), "utf8")}</style><body style="margin:0">
${readFileSync(join(websiteDir, "snippet.html"), "utf8")}`);
  const hostPage = await context.newPage();
  const problems: string[] = [];
  hostPage.on("pageerror", (e) => problems.push(e.message));
  await hostPage.goto(`${origin}/extracted/website/index.html`);
  const state = await readyScene(hostPage, "[data-ps-engine]");
  expect(state === "ready" || state === "paused", `state ${state}; page errors: ${problems.join(" | ")}`);
  expect((await hostPage.locator("canvas").count()) === 1, "one canvas");
  await hostPage.screenshot({ path: join(out, "website-run.png") });
  await hostPage.close();
});

await test("Standalone HTML downloads and opens from disk", async () => {
  await page.locator(".s3-fmt-card", { hasText: "Standalone HTML" }).click();
  const { path, suggested } = await download(() => page.locator(".s3-btn.on", { hasText: /^Download .*\.html$/ }).click(), "standalone.html");
  expect(/\.html$/.test(suggested), suggested);
  standalonePath = path;
  const filePage = await context.newPage();
  await filePage.goto(`file://${standalonePath}`);
  const state = await readyScene(filePage, "#ps-root");
  expect(state === "ready", `file:// state ${state}`);
  await filePage.screenshot({ path: join(out, "standalone-run.png") });
  await filePage.close();
});

await test("Complete project ZIP downloads, contains every promised file and runs when served", async () => {
  await page.locator(".s3-fmt-card", { hasText: "Complete project ZIP" }).click();
  const { path } = await download(() => page.locator(".s3-btn", { hasText: "Download project (.zip)" }).click(), "project.zip");
  projectDir = unzip(path, join(out, "extracted/project"));
  for (const f of ["index.html", "style.css", "particle-engine.js", "particle-data.bin", "particle-config.json", "README.md", "particle-engine.d.ts", "react/ParticleSceneView.tsx", "examples/existing-site.html", "docs/CONFIGURATION.md", "project.particle3d.json"]) expect(existsSync(join(projectDir, f)), `missing ${f}`);
  const projectPage = await context.newPage();
  await projectPage.goto(`${origin}/extracted/project/index.html`);
  expect((await readyScene(projectPage, "#particle-scene")) === "ready", "project index.html renders");
  await projectPage.close();
});

await test("Preview here runs the standalone export inside the panel", async () => {
  await page.locator(".s3-fmt-card", { hasText: "Standalone HTML" }).click();
  await page.locator(".s3-btn", { hasText: "Preview here" }).click();
  await page.waitForSelector(".s3-preview iframe", { timeout: 30000 });
  const frame = page.frames().find((f) => f !== page.mainFrame() && f.parentFrame() === page.mainFrame());
  expect(frame, "preview frame found");
  await frame.waitForSelector("#ps-root[data-ps-state=ready]", { timeout: 45000 });
  await page.locator(".s3-btn", { hasText: "Close preview" }).click();
  expect((await page.locator(".s3-preview").count()) === 0, "preview closes");
});

await test("Compare export with studio: same instant, same size, measured difference", async () => {
  const modes: string[] = [];
  for (const mode of ["Hero", "Full quality"]) {
    await page.locator(".s3-seg button", { hasText: new RegExp(`^${mode}$`) }).first().click();
    await page.locator(".s3-btn", { hasText: "Compare export with studio" }).click();
    await page.waitForSelector(".s3-verdict, .s3-compare + .s3-warn, .s3-warn", { timeout: 120000 });
    await page.waitForFunction(() => !!document.querySelector(".s3-verdict") || /did not respond|could not|Canvas 2D/.test(document.body.textContent ?? ""), null, { timeout: 120000 });
    const verdict = (await page.locator(".s3-verdict").first().textContent().catch(() => null)) ?? "";
    const report = await text(".s3-compare .s3-stats");
    expect(verdict && !/Differences found/.test(verdict), `${mode}: verdict "${verdict}"\n${report}\n${await text(".s3-warn")}`);
    modes.push(`${mode}: ${verdict} | ${report.replace(/\n/g, " ")}`);
    await page.locator(".s3-compare").scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(out, `compare-${mode.replace(/\W/g, "")}.png`) });
  }
  console.log("      " + modes.join("\n      "));
});

await test("the classic exporter is still there and still works", async () => {
  expect(/Classic code export/.test(await text(".s3-section h3")), "classic section present");
  await page.waitForFunction(() => (document.querySelector("textarea[aria-label='Generated 3D scene code']") as HTMLTextAreaElement | null)?.value.includes("<!doctype html"), null, { timeout: 30000 });
  const { path } = await download(() => page.locator(".s3-btn", { hasText: "Download full project ZIP" }).click(), "classic.zip");
  expect(unzip(path, join(out, "extracted/classic")) && existsSync(join(out, "extracted/classic/scene.js")), "classic ZIP unchanged (scene.js present)");
});

await test("no uncaught errors in the Studio during the whole run", async () => {
  expect(errors.length === 0, errors.join("\n"));
});

await browser.close();
server.close();
writeFileSync(join(out, "report.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} UI tests passed`);
process.exit(failed.length ? 1 : 0);
