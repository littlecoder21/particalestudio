import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { build } from "esbuild";
import { buildEngineBundles } from "./tools/engineBundles";

const studio3dExportRuntime = {
  name: "studio3d-export-runtime",
  resolveId(source: string) {
    return source === "virtual:studio3d-export-runtime" ? "\0studio3d-export-runtime" : null;
  },
  async load(id: string) {
    if (id !== "\0studio3d-export-runtime") return null;
    const result = await build({
      entryPoints: ["src/studio3d/exportRuntime.js"],
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2020",
      minify: true,
      write: false,
    });
    return `export default ${JSON.stringify(result.outputFiles[0].text)};`;
  },
};

/**
 * The shared particle engine for the Website / Standalone / Project exports, bundled once per build by the same
 * function the tests call (tools/engineBundles.ts), so the app ships exactly the bytes the tests exercise.
 * Restart `vite` after editing src/studio3d/engine/*.js.
 */
const studio3dEngineBundles = {
  name: "studio3d-engine-bundles",
  resolveId(source: string) {
    return source === "virtual:studio3d-engine-bundles" ? "\0studio3d-engine-bundles" : null;
  },
  async load(id: string) {
    if (id !== "\0studio3d-engine-bundles") return null;
    return `export default ${JSON.stringify(await buildEngineBundles())};`;
  },
};

export default defineConfig({
  plugins: [studio3dExportRuntime, studio3dEngineBundles, react()],
});
