import test from "node:test";
import assert from "node:assert/strict";
import { availableEffects } from "../../src/effects.ts";
import { generateCodeExport } from "../../src/codeExport.ts";
import { generateStudioExport } from "../../src/studio2d/exportStudio.ts";
import type { ParticleSettings } from "../../src/particleEngine.ts";
import { defaultStudio2D } from "../../src/studio2d/types.ts";
import {
  LOCK_STYLE_NAMES,
  MOTION_STYLES,
  motionAcceleration,
  TOUCH_BEHAVIORS,
  touchForce,
} from "../../src/studio2d/catalogs.ts";

test("2D studios expose the requested number of selectable styles", () => {
  assert.equal(MOTION_STYLES.length, 20);
  assert.equal(LOCK_STYLE_NAMES.length, 50);
  assert.equal(availableEffects.length, 50);
  assert.equal(TOUCH_BEHAVIORS.length, 50);
  assert.equal(new Set(LOCK_STYLE_NAMES).size, 50);
  assert.equal(new Set(TOUCH_BEHAVIORS).size, 50);
  assert.equal(new Set(availableEffects.map((effect) => effect.id)).size, 50);
});

test("additional motion and touch catalog entries produce bounded finite force profiles", () => {
  const motions = MOTION_STYLES.slice(4).map((style) =>
    motionAcceleration(style, MOTION_STYLES, 320, 240, 1500, 0.7, 0.32, 1.4, 800, 600),
  );
  const touches = TOUCH_BEHAVIORS.map((behavior) =>
    touchForce(behavior, TOUCH_BEHAVIORS, 12, -9, 15, 1500, 0.7, 0.32),
  );
  for (const profile of [...motions, ...touches]) {
    assert.ok(Number.isFinite(profile.x));
    assert.ok(Number.isFinite(profile.y));
  }
  assert.ok(new Set(motions.map(({ x, y }) => `${x.toFixed(5)}:${y.toFixed(5)}`)).size > 10);
  assert.ok(new Set(touches.map(({ x, y, scale }) => `${x.toFixed(5)}:${y.toFixed(5)}:${scale}`)).size > 30);
});

test("standalone exports parse with the new motion, touch, effects and volume finish settings", () => {
  const settings: ParticleSettings = {
    count: 100, emitter: "Circle", generator: "Source Shape", effects: ["Halo"],
    motion: "Galaxy", shape: "Circle", interaction: "Swarm", color: "#78d8ff", accent: "#bd8cff",
    palette: ["#78d8ff", "#bd8cff"], size: 2, speed: 1, spread: 78, gravity: 0,
    physicsEnabled: true, drag: 0.986, turbulence: 0.35, vortex: 0.18, bounce: 0.45,
    boundsMode: "Bounce", populationMode: "Steady", populationRate: 36,
    svgMorphEnabled: false, svgMorphType: "Direct", svgMorphDuration: 3, svgMorphInitialDelay: 1.5,
    svgMorphHoldDuration: 1, svgMorphEasing: "Ease In Out", svgMorphTurbulence: 0,
    svgMorphLoop: true, svgMorphPingPong: false, preserveSvgColors: true,
    interactionRadius: 150, interactionStrength: 0.38, opacity: 0.9, glow: 12,
    customShapePath: "M50 0 L61 36 L100 50 L61 64 L50 100 L39 64 L0 50 L39 36 Z",
    backgroundMode: "Solid", backgroundColor: "#090b12", backgroundAccent: "#1d1635",
    ambientLight: 20, lightColor: "#8871ff", showGrid: false, trails: false,
    interactive: true, playing: true, volumeLook: true,
    studio: { ...defaultStudio2D(), shapeLock: { ...defaultStudio2D().shapeLock, enabled: true } },
  };
  const plain = generateCodeExport(settings);
  const studio = generateStudioExport(settings);
  assert.match(plain.javascript, /"volumeLook": true/);
  assert.match(plain.javascript, /motionAcceleration/);
  assert.match(studio.javascript, /const S2D =/);
  assert.match(studio.javascript, /touchForce/);
  assert.doesNotThrow(() => new Function(plain.javascript));
  assert.doesNotThrow(() => new Function(studio.javascript));
});
