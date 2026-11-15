import { generateCodeExport, type CodeExportFiles } from "../codeExport";
import type { ParticleSettings } from "../particleEngine";
import type { SvgSamplePoint } from "../svgSource";
import { createStudio2DRuntime } from "./runtime";
import type { Studio2DSettings } from "./types";

/** True when any Studio 2D feature is switched on (otherwise the original export is returned untouched). */
export function usesStudio2D(studio: Studio2DSettings | undefined): studio is Studio2DSettings {
  if (!studio) return false;
  const { shapeLock, light, fx, backdrop } = studio;
  return shapeLock.enabled || light.enabled || fx.rings.enabled || fx.dust.enabled || fx.glints > 0 || fx.bloom > 0 ||
    fx.shockwave || fx.colorMode !== "Palette" || backdrop.kind !== "None" || backdrop.vignette > 0 || backdrop.grain > 0;
}

/** Extra runtime code added to the exported JavaScript (shape-lock bookkeeping and forces). */
const EXPORT_HELPERS = `
const s2dQuantCache = new Map();
function s2dQuant(hex) {
  let value = s2dQuantCache.get(hex);
  if (value === undefined) {
    const n = Number.parseInt(hex.slice(1), 16), q = c => Math.min(255, Math.round(c / 16) * 16);
    value = "rgb(" + q(n >> 16 & 255) + "," + q(n >> 8 & 255) + "," + q(n & 255) + ")";
    s2dQuantCache.set(hex, value);
  }
  return value;
}
let s2dHomeCount = 0;
function s2dHomes(placeFrom) {
  if (!CONFIG.studio.shapeLock.enabled) return;
  for (let index = 0; index < particles.length; index++) {
    const particle = particles[index], home = { life: 1 };
    setSourcePosition(home, index);
    particle.targetX = home.x; particle.targetY = home.y; particle.depth = home.depth; particle.sourceColor = home.sourceColor;
    if (index >= placeFrom) { particle.x = home.x; particle.y = home.y; particle.vx = 0; particle.vy = 0; }
  }
  S2D.finalizeHomes(particles);
  s2dHomeCount = particles.length;
}
function s2dUpdate(particle, delta, time) {
  const step = delta * 60, motionOn = CONFIG.motion !== "Off", vx0 = particle.vx, vy0 = particle.vy;
  if (motionOn && CONFIG.physicsEnabled) {
    particle.vx *= CONFIG.drag;
    particle.vy *= CONFIG.drag;
    particle.vy += CONFIG.gravity * .012 * step;
    particle.vx += Math.sin(particle.y * .018 + particle.phase + time * .001) * CONFIG.turbulence * .035 * step;
    particle.vy += Math.cos(particle.x * .015 + particle.phase + time * .0007) * CONFIG.turbulence * .025 * step;
    const dx = particle.x - width / 2, dy = particle.y - height / 2;
    particle.vx += -dy * CONFIG.vortex * .000025 * step;
    particle.vy += dx * CONFIG.vortex * .000025 * step;
  }
  if (CONFIG.motion === "Orbit") {
    const dx = particle.x - width / 2, dy = particle.y - height / 2;
    particle.vx += -dy * .0007 * CONFIG.speed * step;
    particle.vy += dx * .0007 * CONFIG.speed * step;
  } else if (CONFIG.motion === "Flow") {
    particle.vx += Math.sin(particle.y * .012 + particle.phase + time * .0003) * .025 * step;
    particle.vy += Math.cos(particle.x * .012 + particle.phase + time * .0002) * .02 * step;
  } else if (CONFIG.motion === "Float") {
    particle.vx += Math.sin(time * .0005 + particle.phase) * .012 * step;
    particle.vy += Math.cos(time * .0004 + particle.phase) * .012 * step;
  } else if (CONFIG.motion === "Burst") {
    particle.vx *= 1 + .0005 * step;
    particle.vy *= 1 + .0005 * step;
  } else if (CONFIG.motion !== "Off") {
    const acceleration = motionAcceleration(CONFIG.motion, CONFIG.motionStyles, particle.x, particle.y, time, particle.phase, particle.seed, CONFIG.speed, width, height);
    particle.vx += acceleration.x * acceleration.force * step;
    particle.vy += acceleration.y * acceleration.force * step;
  }
  if (CONFIG.effects.includes("Magnetic Field") && pointer.active) {
    const dx = pointer.x - particle.x, dy = pointer.y - particle.y;
    const distance = Math.max(Math.hypot(dx, dy), 1), reach = CONFIG.interactionRadius * 1.5;
    if (distance < reach) {
      const force = (1 - distance / reach) * CONFIG.interactionStrength * step * .75;
      particle.vx += -dy / distance * force;
      particle.vy += dx / distance * force;
    }
  }
  const external = S2D.externalScale();
  particle.vx = vx0 + (particle.vx - vx0) * external;
  particle.vy = vy0 + (particle.vy - vy0) * external;
  if (CONFIG.interactive && pointer.active && CONFIG.interaction !== "Off") {
    const dx = pointer.x - particle.x, dy = pointer.y - particle.y;
    const distance = Math.max(Math.hypot(dx, dy), 1), reach = CONFIG.interactionRadius;
    if (distance < reach) {
      const force = (1 - distance / reach) * CONFIG.interactionStrength * step;
      const response = touchForce(CONFIG.interaction, CONFIG.touchBehaviors, dx, dy, distance, time, particle.phase, particle.seed);
      particle.vx += response.x * force * response.scale; particle.vy += response.y * force * response.scale;
    }
  }
  if (S2D.shockActive()) S2D.applyShocks(particle);
  S2D.lockStep(particle, delta);
}
`;

function swap(source: string, find: string, replacement: string): string {
  if (!source.includes(find)) throw new Error(`export anchor not found: ${find.slice(0, 60)}`);
  return source.replace(find, () => replacement);
}

/**
 * Same files as `generateCodeExport`, plus Shape-Locked Motion, lights, FX and backdrops when
 * they are in use. The runtime embedded in the file is the very same code that drives the live
 * preview (`createStudio2DRuntime`). If the base exporter ever changes so that a hook point is
 * missing, this falls back to the plain export instead of producing broken code.
 */
export function generateStudioExport(
  settings: ParticleSettings,
  svgPoints: readonly SvgSamplePoint[] = [],
  svgSequencePoints: readonly (readonly SvgSamplePoint[])[] = [],
  designerPoints: readonly SvgSamplePoint[] = [],
): CodeExportFiles {
  const base = generateCodeExport(settings, svgPoints, svgSequencePoints, designerPoints);
  const studio = settings.studio;
  if (!usesStudio2D(studio)) return base;
  try {
    let js = base.javascript;
    const studioJson = JSON.stringify(studio).replace(/</g, "\\u003c");
    const trails = `(CONFIG.trails || CONFIG.effects.includes("Long Exposure"))`;
    js = swap(js, "const getGeneratorPoint = ",
      `CONFIG.studio = ${studioJson};\nconst S2D = (${createStudio2DRuntime.toString()})();\n${EXPORT_HELPERS}const getGeneratorPoint = `);
    js = swap(js, "const maxSprites = 384;", "const maxSprites = 1536;");
    // per-particle fields
    js = swap(js, "    depth: 1,\n  };\n  if (CONFIG.generator !== \"Source Shape\") {",
      "    depth: 1,\n    ...S2D.blank(),\n  };\n  S2D.initParticle(particle, index);\n  if (CONFIG.generator !== \"Source Shape\") {");
    // home positions (initial layout and resize)
    js = swap(js, "  spriteCache.clear();\n  if (CONFIG.motion === \"Off\") arrangeInitialForm();\n}",
      "  spriteCache.clear();\n  if (CONFIG.motion === \"Off\") arrangeInitialForm();\n  s2dHomes(Infinity);\n}");
    js = swap(js, "if (CONFIG.motion === \"Off\") arrangeInitialForm();\ncanvas.addEventListener(\"pointermove\"",
      "if (CONFIG.motion === \"Off\") arrangeInitialForm();\ns2dHomes(0);\ncanvas.addEventListener(\"pointermove\"");
    // per-frame setup
    js = swap(js, "  previous = time;\n  if (CONFIG.playing && CONFIG.populationMode !== \"Steady\") {",
      "  previous = time;\n  if (S2D.begin(CONFIG.studio, width, height, delta, CONFIG.playing, CONFIG.palette) && S2D.lockEnabled()) S2D.refresh(particles);\n" +
      "  S2D.setPointer(pointer.x, pointer.y, pointer.active);\n" +
      "  if (S2D.lockEnabled() && s2dHomeCount !== particles.length) s2dHomes(Math.min(s2dHomeCount, particles.length));\n" +
      "  if (CONFIG.playing && CONFIG.populationMode !== \"Steady\") {");
    // backdrop, haze, dust and back rings
    js = swap(js, "  context.globalCompositeOperation = \"lighter\";\n  drawNetwork();",
      `  S2D.drawBackdrop(context, ${trails});\n  S2D.drawHaze(context);\n  S2D.drawDust(context);\n  S2D.drawRings(context, false);\n  context.globalCompositeOperation = "lighter";\n  drawNetwork();`);
    // shape-locked update instead of free motion
    js = swap(js, "} else if (CONFIG.playing && motionEnabled && !updateParticle(particle, delta, time)) {",
      "} else if (S2D.lockEnabled() ? (CONFIG.playing && s2dUpdate(particle, delta, time), false) : CONFIG.playing && motionEnabled && !updateParticle(particle, delta, time)) {");
    // drawing: stable colour/fade while locked, gradient mapping, light, energy, glints
    js = swap(js, "const progress = motionEnabled ? particle.age / particle.life : .5;",
      "const progress = motionEnabled && !S2D.lockEnabled() ? particle.age / particle.life : .5;");
    js = swap(js, "const fade = Math.max(0, Math.min(progress * 7, (1 - progress) * 2.5, 1)) * particle.morphAlpha;",
      "const fade = S2D.lockEnabled() ? particle.morphAlpha : Math.max(0, Math.min(progress * 7, (1 - progress) * 2.5, 1)) * particle.morphAlpha;");
    js = swap(js, "pulse * (.7 + Math.sin(progress * Math.PI) * .3) * 2) / 2);",
      "pulse * (1 + .5 * (particle.energy || 0)) * (.7 + Math.sin(progress * Math.PI) * .3) * 2) / 2);");
    js = swap(js, "    : CONFIG.preserveSvgColors && particle.sourceColor\n      ? sourceColorAtAge(particle.sourceColor, CONFIG.accent, progress)",
      "    : S2D.gradientActive() ? S2D.gradientColor(particle.x, particle.y)\n    : CONFIG.preserveSvgColors && particle.sourceColor\n      ? (S2D.lockEnabled() ? s2dQuant(particle.sourceColor) : sourceColorAtAge(particle.sourceColor, CONFIG.accent, progress))");
    js = swap(js, "context.globalAlpha = fade * twinkle * CONFIG.opacity * (trails ? .85 : 1);",
      "context.globalAlpha = Math.max(0, Math.min(1, fade * twinkle * CONFIG.opacity * (trails ? .85 : 1) * (S2D.lightActive() ? S2D.lightFactor(particle) : 1) * (1 + .5 * (particle.energy || 0))));");
    js = swap(js, "  if (CONFIG.effects.includes(\"Sparkles\") && particle.phase % 3 < .8",
      "  if (S2D.lightActive() && particle.lit > .55) S2D.glint(particle.x, particle.y, particle.lit, size, particle.seed);\n" +
      "  else if (CONFIG.studio.fx.glints > 0 && particle.seed > .84 && Math.sin(previous * .0021 + particle.phase * 3) > .94) S2D.glint(particle.x, particle.y, .95, size, particle.seed);\n" +
      "  if (CONFIG.effects.includes(\"Sparkles\") && particle.phase % 3 < .8");
    // front rings, glints, shockwaves and post effects
    js = swap(js, "  context.globalAlpha = 1;\n  context.globalCompositeOperation = \"source-over\";\n  animationId = requestAnimationFrame(frame);",
      `  context.globalAlpha = 1;\n  context.globalCompositeOperation = "source-over";\n  S2D.drawGlints(context);\n  S2D.drawRings(context, true);\n  S2D.drawShocks(context);\n  S2D.post(context, canvas, ${trails});\n  context.globalAlpha = 1;\n  animationId = requestAnimationFrame(frame);`);
    // pointer: tap shockwave and touch release
    js = swap(js, "canvas.addEventListener(\"pointerdown\", updatePointer, { passive: true });",
      "canvas.addEventListener(\"pointerdown\", event => { updatePointer(event); S2D.addShock(pointer.x, pointer.y); }, { passive: true });");
    js = swap(js, "canvas.addEventListener(\"pointerleave\", () => { pointer.active = false; });",
      "canvas.addEventListener(\"pointerleave\", () => { pointer.active = false; });\ncanvas.addEventListener(\"pointerup\", event => { if (event.pointerType !== \"mouse\") pointer.active = false; });");

    const standaloneHtml = base.standaloneHtml.replace(base.javascript, () => js);
    return { ...base, javascript: js, standaloneHtml };
  } catch (error) {
    console.error("Could not add Studio 2D effects to the exported code; exporting the standard runtime.", error);
    return base;
  }
}
