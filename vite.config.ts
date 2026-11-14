import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { build } from "esbuild";

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

export default defineConfig({
  plugins: [studio3dExportRuntime, react()],
});
