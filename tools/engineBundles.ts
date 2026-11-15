import { build } from "esbuild";

/**
 * Builds the browser bundles that the exporter embeds in its output. Used by vite.config.ts (virtual modules) and by
 * the tests, so what ships in the app and what the tests exercise are the same bytes.
 *
 *   engineStatic      ES module, Hero exports. No particle simulation code.
 *   engineSim         ES module, Animated and Full Quality exports.
 *   standaloneStatic  engine + page bootstrap, for the standalone HTML (the exporter prepends the embedded payload).
 *   standaloneSim     same, with the simulation.
 */
export interface EngineBundles { engineStatic: string; engineSim: string; standaloneStatic: string; standaloneSim: string }

async function bundle(entry: string, simulation: boolean, label: string): Promise<string> {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    minify: true,
    write: false,
    legalComments: "none",
    define: { __PS_SIMULATION__: String(simulation) },
    banner: { js: `/* Particle Studio engine · ${label} */` },
  });
  return result.outputFiles[0]!.text;
}

export async function buildEngineBundles(): Promise<EngineBundles> {
  const engine = "src/studio3d/engine/particleEngine.js";
  const boot = "src/studio3d/engine/standaloneBoot.js";
  const [engineStatic, engineSim, standaloneStatic, standaloneSim] = await Promise.all([
    bundle(engine, false, "hero build"), bundle(engine, true, "simulation build"),
    bundle(boot, false, "standalone, hero build"), bundle(boot, true, "standalone, simulation build"),
  ]);
  return { engineStatic, engineSim, standaloneStatic, standaloneSim };
}
