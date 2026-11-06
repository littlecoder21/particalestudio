import type { ParticleSettings } from "./particleEngine";
import type { SvgSamplePoint } from "./svgSource";
import { getGeneratorPoint } from "./generators";

export interface CodeExportFiles {
  html: string;
  css: string;
  javascript: string;
  standaloneHtml: string;
}

export function generateCodeExport(
  settings: ParticleSettings,
  svgPoints: readonly SvgSamplePoint[] = [],
  svgSequencePoints: readonly (readonly SvgSamplePoint[])[] = [],
  designerPoints: readonly SvgSamplePoint[] = [],
): CodeExportFiles {
  const config = JSON.stringify({
    count: settings.count,
    emitter: settings.emitter,
    generator: settings.generator,
    effects: settings.effects,
    motion: settings.motion,
    shape: settings.shape,
    color: settings.color,
    accent: settings.accent,
    palette: settings.palette,
    size: settings.size,
    speed: settings.speed,
    spread: settings.spread,
    gravity: settings.gravity,
    physicsEnabled: settings.physicsEnabled,
    drag: settings.drag,
    turbulence: settings.turbulence,
    vortex: settings.vortex,
    bounce: settings.bounce,
    boundsMode: settings.boundsMode,
    populationMode: settings.populationMode,
    populationRate: settings.populationRate,
    svgMorphEnabled: settings.svgMorphEnabled,
    svgMorphType: settings.svgMorphType,
    svgMorphDuration: settings.svgMorphDuration,
    svgMorphInitialDelay: settings.svgMorphInitialDelay,
    svgMorphHoldDuration: settings.svgMorphHoldDuration,
    svgMorphEasing: settings.svgMorphEasing,
    svgMorphTurbulence: settings.svgMorphTurbulence,
    svgMorphLoop: settings.svgMorphLoop,
    svgMorphPingPong: settings.svgMorphPingPong,
    preserveSvgColors: settings.preserveSvgColors,
    interaction: settings.interaction,
    interactionRadius: settings.interactionRadius,
    interactionStrength: settings.interactionStrength,
    interactive: settings.interactive,
    playing: settings.playing,
    glow: settings.glow,
    opacity: settings.opacity,
    trails: settings.trails,
    showGrid: settings.showGrid,
    backgroundMode: settings.backgroundMode,
    backgroundColor: settings.backgroundColor,
    backgroundAccent: settings.backgroundAccent,
    ambientLight: settings.ambientLight,
    lightColor: settings.lightColor,
    customShapePath: settings.customShapePath,
    svgPoints: settings.emitter === "Designer" ? designerPoints : settings.emitter === "SVG" ? svgPoints : [],
    svgSequencePoints: settings.emitter === "SVG" ? svgSequencePoints : [],
  }, null, 2).replace(/</g, "\\u003c");

  const cssBackground = settings.backgroundMode === "Transparent" ? "transparent" : settings.backgroundColor;
  const css = `* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: ${cssBackground}; }
canvas { display: block; width: 100%; height: 100%; touch-action: none; }
`;

  const javascript = `const CONFIG = ${config};
const getGeneratorPoint = ${getGeneratorPoint.toString()};
const canvas = document.querySelector("canvas");
const context = canvas.getContext("2d", { alpha: CONFIG.backgroundMode === "Transparent" });
if (!context) throw new Error("Canvas 2D is unavailable.");

const particles = [];
const pointer = { x: 0, y: 0, active: false };
const spriteCache = new Map();
const paletteCache = new Map();
const maxSprites = 384;
const rainbowPalette = Array.from({ length: 32 }, (_, index) => "hsl(" + Math.round(index / 32 * 360) + ",100%,68%)");
const customPath = CONFIG.shape === "Custom" ? new Path2D(CONFIG.customShapePath) : null;
const goldenAngle = Math.PI * (3 - Math.sqrt(5));
let width = 1, height = 1, dpr = 1, previous = 0, animationId = 0, morphElapsed = 0, populationAccumulator = 0;
let morphStage = "initial", morphStep = 0, morphCurrentForm = 0, morphDirection = 1;
let backgroundCanvas = document.createElement("canvas");
let backgroundContext = backgroundCanvas.getContext("2d");
if (!backgroundContext) throw new Error("Could not create the background canvas.");
const random = (min, max) => min + Math.random() * (max - min);

function resize() {
  const bounds = canvas.getBoundingClientRect();
  width = Math.max(bounds.width, 1);
  height = Math.max(bounds.height, 1);
  dpr = Math.min(devicePixelRatio || 1, width < 500 || CONFIG.count > 800 ? 1 : 1.5);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  backgroundCanvas.width = canvas.width;
  backgroundCanvas.height = canvas.height;
  backgroundContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackground();
  spriteCache.clear();
  if (CONFIG.motion === "Off") arrangeInitialForm();
}

function drawBackground() {
  const bg = backgroundContext;
  if (!bg) return;
  bg.clearRect(0, 0, width, height);
  if (CONFIG.backgroundMode !== "Transparent") {
    if (CONFIG.backgroundMode === "Gradient") {
      const gradient = bg.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, CONFIG.backgroundColor);
      gradient.addColorStop(1, CONFIG.backgroundAccent);
      bg.fillStyle = gradient;
    } else {
      bg.fillStyle = CONFIG.backgroundColor;
    }
    bg.fillRect(0, 0, width, height);
  }
  if (CONFIG.ambientLight > 0) {
    const value = Number.parseInt(CONFIG.lightColor.slice(1), 16);
    const red = value >> 16 & 255, green = value >> 8 & 255, blue = value & 255;
    const light = bg.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * .62);
    light.addColorStop(0, "rgba(" + red + "," + green + "," + blue + "," + Math.min(CONFIG.ambientLight / 100, 1) * .22 + ")");
    light.addColorStop(1, "rgba(" + red + "," + green + "," + blue + ",0)");
    bg.fillStyle = light;
    bg.fillRect(0, 0, width, height);
  }
  if (CONFIG.showGrid) {
    bg.globalAlpha = .12;
    bg.strokeStyle = "#b9a2ff";
    bg.lineWidth = 1;
    for (let x = 0; x <= width; x += 40) {
      bg.beginPath(); bg.moveTo(x, 0); bg.lineTo(x, height); bg.stroke();
    }
    for (let y = 0; y <= height; y += 40) {
      bg.beginPath(); bg.moveTo(0, y); bg.lineTo(width, y); bg.stroke();
    }
    bg.globalAlpha = 1;
  }
}

function drawNetwork() {
  const generator = CONFIG.generator;
  if (!["Connected Nodes", "Neural Network", "Constellation", "Branching Structures", "Dynamic Web", "Proximity Web"].includes(generator)) return;
  context.beginPath();
  for (let index = 0; index < particles.length; index++) {
    const particle = particles[index];
    if (generator === "Branching Structures") {
      if (index > 0) {
        const parent = particles[Math.floor((index - 1) / 2)];
        context.moveTo(particle.x, particle.y); context.lineTo(parent.x, parent.y);
      }
    } else if (generator === "Neural Network") {
      const layerSize = Math.max(2, Math.ceil(Math.sqrt(particles.length)));
      for (const offset of [layerSize, layerSize + 1]) {
        if (index >= offset) {
          const previous = particles[index - offset];
          context.moveTo(particle.x, particle.y); context.lineTo(previous.x, previous.y);
        }
      }
    } else if (generator === "Connected Nodes" || generator === "Proximity Web") {
      const columns = Math.max(2, Math.ceil(Math.sqrt(particles.length * width / height)));
      if (index % columns < columns - 1 && index + 1 < particles.length) {
        const right = particles[index + 1];
        context.moveTo(particle.x, particle.y); context.lineTo(right.x, right.y);
      }
      if (index + columns < particles.length) {
        const below = particles[index + columns];
        context.moveTo(particle.x, particle.y); context.lineTo(below.x, below.y);
      }
    } else {
      for (const offset of [1, 7]) {
        if (index + offset < particles.length) {
          const neighbor = particles[index + offset];
          context.moveTo(particle.x, particle.y); context.lineTo(neighbor.x, neighbor.y);
        }
      }
    }
  }
  context.globalAlpha = .18;
  context.strokeStyle = CONFIG.color;
  context.lineWidth = .8;
  context.stroke();
  context.globalAlpha = 1;
}

function drawConnections() {
  if (!CONFIG.effects.includes("Connections") || particles.length < 2) return;
  const cellSize = 72, buckets = new Map();
  for (let index = 0; index < particles.length; index++) {
    const particle = particles[index], key = Math.floor(particle.x / cellSize) + ":" + Math.floor(particle.y / cellSize);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(index);
    else buckets.set(key, [index]);
  }
  context.beginPath();
  let links = 0;
  const maximumLinks = Math.min(particles.length * 2, 2400);
  for (let index = 0; index < particles.length && links < maximumLinks; index++) {
    const particle = particles[index], cellX = Math.floor(particle.x / cellSize), cellY = Math.floor(particle.y / cellSize);
    let particleLinks = 0;
    for (let offsetY = -1; offsetY <= 1 && particleLinks < 3; offsetY++) {
      for (let offsetX = -1; offsetX <= 1 && particleLinks < 3; offsetX++) {
        const bucket = buckets.get((cellX + offsetX) + ":" + (cellY + offsetY));
        if (!bucket) continue;
        for (const otherIndex of bucket) {
          if (otherIndex <= index) continue;
          const other = particles[otherIndex];
          if (Math.hypot(other.x - particle.x, other.y - particle.y) > cellSize) continue;
          context.moveTo(particle.x, particle.y); context.lineTo(other.x, other.y);
          particleLinks++; links++;
          if (particleLinks >= 3 || links >= maximumLinks) break;
        }
      }
    }
  }
  context.globalAlpha = .14;
  context.strokeStyle = CONFIG.color;
  context.lineWidth = .7;
  context.stroke();
  context.globalAlpha = 1;
}

function getPalette(sourceColor, colorIndex = 0) {
  const colors = sourceColor ? [sourceColor, CONFIG.accent] : CONFIG.palette;
  const start = colors[colorIndex % colors.length] || CONFIG.color;
  const key = start + ":" + colorIndex + ":" + colors.join(",");
  const cached = paletteCache.get(key);
  if (cached) return cached;
  const palette = Array.from({ length: 16 }, (_, index) => {
    const position = ((colorIndex + index / 15 * (colors.length - 1)) % colors.length + colors.length) % colors.length;
    const first = Number.parseInt(colors[Math.floor(position)].slice(1), 16);
    const second = Number.parseInt(colors[(Math.floor(position) + 1) % colors.length].slice(1), 16);
    const amount = position % 1;
    const channel = shift => {
      const a = first >> shift & 255, b = second >> shift & 255;
      return Math.min(255, Math.round((a + (b - a) * amount) / 16) * 16);
    };
    return "rgb(" + channel(16) + "," + channel(8) + "," + channel(0) + ")";
  });
  paletteCache.set(key, palette);
  return palette;
}

function setSourcePosition(particle, index) {
  const centerX = width / 2, centerY = height / 2, spread = CONFIG.spread / 100;
  const angle = index * goldenAngle;
  const radius = Math.sqrt((index + .5) / CONFIG.count) * spread * Math.min(width, height) * .5;
  particle.vx = 0;
  particle.vy = 0;
  particle.age = particle.life * .5;
  particle.morphAlpha = 1;
  particle.sourceColor = null;
  particle.palette = getPalette(CONFIG.color, index);
  particle.colorIndex = index % Math.max(CONFIG.palette.length, 1);
  if (CONFIG.generator !== "Source Shape") {
    const generated = getGeneratorPoint(CONFIG.generator, index, particles.length, width, height, CONFIG.spread);
    particle.x = generated.x;
    particle.y = generated.y;
    particle.depth = generated.depth;
  } else if (CONFIG.emitter === "Point") {
    particle.depth = 1;
    particle.x = centerX; particle.y = centerY;
  } else if (CONFIG.emitter === "Ring") {
    particle.depth = 1;
    const ringRadius = spread * Math.min(width, height) * .5;
    particle.x = centerX + Math.cos(angle) * ringRadius;
    particle.y = centerY + Math.sin(angle) * ringRadius;
  } else if (CONFIG.emitter === "Line") {
    particle.depth = 1;
    particle.x = centerX + (index / Math.max(CONFIG.count - 1, 1) * 2 - 1) * spread * width * .5;
    particle.y = centerY;
  } else if (CONFIG.emitter === "Fountain") {
    particle.depth = 1;
    particle.x = centerX + (index / Math.max(CONFIG.count - 1, 1) * 2 - 1) * spread * width * .15;
    particle.y = centerY + height * .18;
  } else if ((CONFIG.emitter === "SVG" || CONFIG.emitter === "Designer") && CONFIG.svgPoints.length > 0) {
    particle.depth = 1;
    const point = CONFIG.svgPoints[Math.floor(index * CONFIG.svgPoints.length / CONFIG.count)];
    const scale = Math.min(width, height) * .72;
    particle.x = centerX + point.x * scale;
    particle.y = centerY + point.y * scale;
    particle.sourceColor = CONFIG.preserveSvgColors ? point.color : null;
    particle.palette = getPalette(CONFIG.preserveSvgColors ? point.color : null, index);
  } else {
    particle.depth = 1;
    particle.x = centerX + Math.cos(angle) * radius;
    particle.y = centerY + Math.sin(angle) * radius;
  }
}

function makeParticle(index = Math.floor(Math.random() * Math.max(CONFIG.count, 1))) {
  const angle = random(0, Math.PI * 2);
  const speed = CONFIG.motion === "Off" ? 0 : CONFIG.speed * random(.35, 1.4);
  const spread = CONFIG.spread / 100;
  const radius = Math.sqrt(Math.random()) * spread * Math.min(width, height) * .5;
  const particle = {
    x: width / 2 + Math.cos(angle) * radius,
    y: height / 2 + Math.sin(angle) * radius,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    age: CONFIG.motion === "Off" ? 0 : random(0, 4),
    life: random(2.2, 6),
    phase: random(0, Math.PI * 2),
    size: random(.55, 1.45),
    sourceColor: null,
    palette: getPalette(CONFIG.color, index),
    colorIndex: index % Math.max(CONFIG.palette.length, 1),
    morphAlpha: 1,
    depth: 1,
  };
  if (CONFIG.generator !== "Source Shape") {
    const generated = getGeneratorPoint(CONFIG.generator, index, CONFIG.count, width, height, CONFIG.spread);
    particle.x = generated.x;
    particle.y = generated.y;
    particle.depth = generated.depth;
  } else if (CONFIG.emitter === "Point") {
    particle.x = width / 2; particle.y = height / 2;
  } else if (CONFIG.emitter === "Ring") {
    const ringRadius = spread * Math.min(width, height) * .5;
    particle.x = width / 2 + Math.cos(angle) * ringRadius;
    particle.y = height / 2 + Math.sin(angle) * ringRadius;
  } else if (CONFIG.emitter === "Line") {
    particle.x = width / 2 + random(-spread, spread) * width * .5;
    particle.vx = random(-1, 1) * speed * .35;
    particle.vy = random(-1, 1) * speed * .35;
  } else if (CONFIG.emitter === "Fountain") {
    particle.x = width / 2 + random(-spread, spread) * width * .15;
    particle.y = height / 2 + height * .18;
    particle.vx = random(-1, 1) * speed * .45;
    particle.vy = -Math.abs(random(.5, 1.5) * speed);
  } else if ((CONFIG.emitter === "SVG" || CONFIG.emitter === "Designer") && CONFIG.svgPoints.length > 0) {
    const point = CONFIG.svgPoints[Math.floor(Math.random() * CONFIG.svgPoints.length)];
    const scale = Math.min(width, height) * .72;
    particle.x = width / 2 + point.x * scale;
    particle.y = height / 2 + point.y * scale;
    particle.vx = Math.cos(angle) * speed * .2;
    particle.vy = Math.sin(angle) * speed * .2;
    particle.sourceColor = CONFIG.preserveSvgColors ? point.color : null;
    particle.palette = getPalette(CONFIG.preserveSvgColors ? point.color : null, index);
  }
  return particle;
}

function arrangeInitialForm() {
  for (let index = 0; index < particles.length; index++) setSourcePosition(particles[index], index);
}

function drawShape(target, x, y, size) {
  target.beginPath();
  if (CONFIG.shape === "Square") {
    target.rect(x - size / 2, y - size / 2, size, size);
  } else if (CONFIG.shape === "Diamond") {
    target.moveTo(x, y - size); target.lineTo(x + size, y); target.lineTo(x, y + size); target.lineTo(x - size, y); target.closePath();
  } else if (CONFIG.shape === "Star" || CONFIG.shape === "Sparkle") {
    const points = CONFIG.shape === "Star" ? 5 : 4;
    for (let index = 0; index < points * 2; index++) {
      const radius = index % 2 === 0 ? size : size * (CONFIG.shape === "Star" ? .42 : .17);
      const angle = -Math.PI / 2 + index * Math.PI / points;
      if (index === 0) target.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
      else target.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    }
    target.closePath();
  } else if (CONFIG.shape === "Triangle" || CONFIG.shape === "Pentagon" || CONFIG.shape === "Hexagon" || CONFIG.shape === "Polygon") {
    const sides = CONFIG.shape === "Triangle" ? 3 : CONFIG.shape === "Pentagon" ? 5 : CONFIG.shape === "Hexagon" ? 6 : 8;
    for (let index = 0; index < sides; index++) {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / sides;
      if (index === 0) target.moveTo(x + Math.cos(angle) * size, y + Math.sin(angle) * size);
      else target.lineTo(x + Math.cos(angle) * size, y + Math.sin(angle) * size);
    }
    target.closePath();
  } else if (CONFIG.shape === "Heart") {
    target.moveTo(x, y + size);
    target.bezierCurveTo(x - size * 1.6, y - size * .1, x - size * .8, y - size * 1.5, x, y - size * .55);
    target.bezierCurveTo(x + size * .8, y - size * 1.5, x + size * 1.6, y - size * .1, x, y + size);
    target.closePath();
  } else if (CONFIG.shape === "Cross") {
    target.moveTo(x - size * .32, y - size); target.lineTo(x + size * .32, y - size);
    target.lineTo(x + size * .32, y - size * .32); target.lineTo(x + size, y - size * .32);
    target.lineTo(x + size, y + size * .32); target.lineTo(x + size * .32, y + size * .32);
    target.lineTo(x + size * .32, y + size); target.lineTo(x - size * .32, y + size);
    target.lineTo(x - size * .32, y + size * .32); target.lineTo(x - size, y + size * .32);
    target.lineTo(x - size, y - size * .32); target.lineTo(x - size * .32, y - size * .32);
    target.closePath();
  } else if (CONFIG.shape === "Custom" && customPath) {
    target.save();
    target.translate(x - size, y - size);
    target.scale(size * 2 / 100, size * 2 / 100);
    target.fill(customPath);
    target.restore();
    return;
  } else if (CONFIG.shape === "Ring") {
    target.arc(x, y, size, 0, Math.PI * 2);
    target.strokeStyle = target.fillStyle;
    target.lineWidth = Math.max(1, size * .35);
    target.stroke();
    return;
  } else {
    target.arc(x, y, size, 0, Math.PI * 2);
  }
  target.fill();
}

function getSprite(color, size) {
  const key = color + ":" + size;
  let sprite = spriteCache.get(key);
  if (sprite) return sprite;
  if (spriteCache.size >= maxSprites) spriteCache.delete(spriteCache.keys().next().value);
  const padding = Math.ceil(CONFIG.glow * 1.5) + 2;
  const shapeExtent = CONFIG.shape === "Heart" ? size * 1.6 : size;
  const dimension = Math.ceil((shapeExtent + padding) * 2);
  sprite = document.createElement("canvas");
  sprite.width = dimension;
  sprite.height = dimension;
  const spriteContext = sprite.getContext("2d");
  if (!spriteContext) return null;
  spriteContext.fillStyle = color;
  spriteContext.shadowColor = color;
  spriteContext.shadowBlur = CONFIG.glow;
  drawShape(spriteContext, dimension / 2, dimension / 2, size);
  spriteCache.set(key, sprite);
  return sprite;
}

function drawParticle(particle, motionEnabled) {
  const progress = motionEnabled ? particle.age / particle.life : .5;
  const fade = Math.max(0, Math.min(progress * 7, (1 - progress) * 2.5, 1)) * particle.morphAlpha;
  const pulse = CONFIG.effects.includes("Pulse") ? .72 + (Math.sin(previous * .003 + particle.phase) + 1) * .2 : 1;
  const size = Math.max(.5, Math.round(CONFIG.size * particle.size * particle.depth * pulse * (.7 + Math.sin(progress * Math.PI) * .3) * 2) / 2);
  const color = CONFIG.effects.includes("Color Cycle")
    ? rainbowPalette[Math.floor((previous * .008 + particle.phase * 5 + progress * 10) % rainbowPalette.length + rainbowPalette.length) % rainbowPalette.length]
    : CONFIG.preserveSvgColors && particle.sourceColor
      ? sourceColorAtAge(particle.sourceColor, CONFIG.accent, progress)
      : particle.palette[Math.round(Math.max(0, Math.min(1, progress)) * 15)];
  const sprite = getSprite(color, size);
  const twinkle = CONFIG.effects.includes("Twinkle") ? .4 + (Math.sin(previous * .004 + particle.phase * 2) + 1) * .3 : 1;
  const trails = CONFIG.trails || CONFIG.effects.includes("Long Exposure");
  context.globalAlpha = fade * twinkle * CONFIG.opacity * (trails ? .85 : 1);
  if (sprite) {
    context.drawImage(sprite, particle.x - sprite.width / 2, particle.y - sprite.height / 2);
  } else {
    context.fillStyle = color;
    drawShape(context, particle.x, particle.y, size);
  }
  if (CONFIG.effects.includes("Sparkles") && particle.phase % 3 < .8 && Math.sin(previous * .006 + particle.phase * 4) > .65) {
    const sparkleSize = Math.max(2, size * .7);
    context.globalAlpha = twinkle * CONFIG.opacity * .8;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(particle.x, particle.y - sparkleSize);
    context.lineTo(particle.x + sparkleSize * .22, particle.y - sparkleSize * .22);
    context.lineTo(particle.x + sparkleSize, particle.y);
    context.lineTo(particle.x + sparkleSize * .22, particle.y + sparkleSize * .22);
    context.lineTo(particle.x, particle.y + sparkleSize);
    context.lineTo(particle.x - sparkleSize * .22, particle.y + sparkleSize * .22);
    context.lineTo(particle.x - sparkleSize, particle.y);
    context.lineTo(particle.x - sparkleSize * .22, particle.y - sparkleSize * .22);
    context.closePath();
    context.fill();
  }
}

function updateParticle(particle, delta, time) {
  particle.age += delta;
  if (particle.age >= particle.life ||
      (CONFIG.boundsMode !== "Escape" && (particle.x < -40 || particle.x > width + 40 || particle.y < -40 || particle.y > height + 40))) {
    return false;
  }
  const step = delta * 60;
  if (CONFIG.physicsEnabled) {
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
  if (CONFIG.interactive && pointer.active && CONFIG.interaction !== "Off") {
    const dx = pointer.x - particle.x, dy = pointer.y - particle.y;
    const distance = Math.max(Math.hypot(dx, dy), 1), reach = CONFIG.interactionRadius;
    if (distance < reach) {
      const force = (1 - distance / reach) * CONFIG.interactionStrength * step;
      if (CONFIG.interaction === "Repel") {
        particle.vx -= dx / distance * force; particle.vy -= dy / distance * force;
      } else if (CONFIG.interaction === "Attract") {
        particle.vx += dx / distance * force; particle.vy += dy / distance * force;
      } else {
        particle.vx += -dy / distance * force; particle.vy += dx / distance * force;
      }
    }
  }
  particle.x += particle.vx * step;
  particle.y += particle.vy * step;
  if (CONFIG.boundsMode === "Bounce") {
    if (particle.x < 0 || particle.x > width) {
      particle.x = Math.max(0, Math.min(width, particle.x));
      particle.vx = -particle.vx * CONFIG.bounce;
    }
    if (particle.y < 0 || particle.y > height) {
      particle.y = Math.max(0, Math.min(height, particle.y));
      particle.vy = -particle.vy * CONFIG.bounce;
    }
  } else if (CONFIG.boundsMode === "Wrap") {
    if (particle.x < 0) particle.x = width;
    else if (particle.x > width) particle.x = 0;
    if (particle.y < 0) particle.y = height;
    else if (particle.y > height) particle.y = 0;
  } else if (CONFIG.boundsMode === "Contain") {
    if (particle.x < 0 || particle.x > width) particle.vx = 0;
    if (particle.y < 0 || particle.y > height) particle.vy = 0;
    particle.x = Math.max(0, Math.min(width, particle.x));
    particle.y = Math.max(0, Math.min(height, particle.y));
  }
  return true;
}

function easeMorph(progress) {
  if (CONFIG.svgMorphEasing === "Ease In Out") return progress * progress * (3 - 2 * progress);
  if (CONFIG.svgMorphEasing === "Ease Out") return 1 - (1 - progress) * (1 - progress);
  return progress;
}

function morphColor(start, end, progress) {
  const first = Number.parseInt(start.slice(1), 16), second = Number.parseInt(end.slice(1), 16);
  const mix = shift => Math.round((first >> shift & 255) + ((second >> shift & 255) - (first >> shift & 255)) * progress);
  return "#" + [mix(16), mix(8), mix(0)].map(channel => channel.toString(16).padStart(2, "0")).join("");
}

function sourceColorAtAge(start, end, progress) {
  const first = Number.parseInt(start.slice(1), 16), second = Number.parseInt(end.slice(1), 16);
  const amount = Math.round(Math.max(0, Math.min(1, progress)) * 15) / 15;
  const mix = shift => Math.round((first >> shift & 255) + ((second >> shift & 255) - (first >> shift & 255)) * amount);
  return "rgb(" + mix(16) + "," + mix(8) + "," + mix(0) + ")";
}

function frame(time) {
  const delta = Math.min((time - (previous || time)) / 1000, .04);
  previous = time;
  if (CONFIG.playing && CONFIG.populationMode !== "Steady") {
    populationAccumulator += delta * CONFIG.populationRate;
    const change = Math.floor(populationAccumulator);
    populationAccumulator -= change;
    if (CONFIG.populationMode === "Grow") {
      for (let amount = 0; amount < change && particles.length < CONFIG.count; amount++) {
        particles.push(makeParticle(particles.length));
      }
    } else if (change > 0) {
      particles.splice(Math.max(0, particles.length - change), Math.min(change, particles.length));
    }
  }
  const morphForms = [CONFIG.svgPoints, ...CONFIG.svgSequencePoints];
  const canMorph = CONFIG.playing && CONFIG.svgMorphEnabled && CONFIG.emitter === "SVG" &&
    CONFIG.svgPoints.length > 0 && CONFIG.svgSequencePoints.length > 0;
  if (!canMorph) {
    morphStage = "initial"; morphElapsed = 0; morphStep = 0; morphCurrentForm = 0; morphDirection = 1;
  } else if (morphStage === "initial") {
    morphElapsed += delta;
    if (morphElapsed >= CONFIG.svgMorphInitialDelay) {
      morphElapsed = 0; morphStage = "transition";
    }
  } else if (morphStage === "transition") {
    morphElapsed += delta;
    if (morphElapsed >= CONFIG.svgMorphDuration) {
      morphElapsed = 0;
      const targetStep = morphStep + morphDirection;
      morphCurrentForm = targetStep < 0
        ? morphForms.length - 1
        : targetStep >= morphForms.length ? 0 : targetStep;
      morphStage = "hold";
    }
  } else if (morphStage === "hold") {
    morphElapsed += delta;
    if (morphElapsed >= CONFIG.svgMorphHoldDuration) {
      morphElapsed = 0;
      if (morphDirection === 1 && morphCurrentForm >= morphForms.length - 1) {
        if (CONFIG.svgMorphPingPong) morphDirection = -1;
        else if (CONFIG.svgMorphLoop) {
          morphStep = morphCurrentForm;
        } else morphStage = "done";
      } else if (morphDirection === -1 && morphCurrentForm <= 0) {
        morphDirection = 1;
      }
      if (morphStage !== "done") {
        morphStep = morphCurrentForm;
        morphStage = "transition";
      }
    }
  }
  const morphing = canMorph && morphStage === "transition";
  const rawMorphProgress = morphing ? Math.min(morphElapsed / CONFIG.svgMorphDuration, 1) : 0;
  const morphProgress = easeMorph(rawMorphProgress);
  const currentMorphForm = morphStage === "hold" || morphStage === "done"
    ? morphCurrentForm
    : morphStage === "initial" ? 0 : -1;
  if (CONFIG.trails || CONFIG.effects.includes("Long Exposure")) {
    context.fillStyle = CONFIG.backgroundMode === "Transparent" ? "rgba(0,0,0,.16)" : "rgba(9,11,18,.16)";
    context.fillRect(0, 0, width, height);
  } else if (CONFIG.backgroundMode === "Transparent") {
    context.clearRect(0, 0, width, height);
    if (CONFIG.ambientLight > 0 || CONFIG.showGrid) context.drawImage(backgroundCanvas, 0, 0, width, height);
  } else {
    context.drawImage(backgroundCanvas, 0, 0, width, height);
  }
  context.globalCompositeOperation = "lighter";
  drawNetwork();
  drawConnections();
  const motionEnabled = CONFIG.motion !== "Off";
  if (CONFIG.generator !== "Source Shape" ||
      (CONFIG.emitter !== "SVG" || CONFIG.svgPoints.length > 0) &&
      (CONFIG.emitter !== "Designer" || CONFIG.svgPoints.length > 0)) {
    for (let index = particles.length - 1; index >= 0; index--) {
      const particle = particles[index];
      if (morphing) {
        const sourcePoints = morphForms[morphStep];
        const nextStep = morphStep + morphDirection;
        const targetStep = nextStep < 0 ? 0 : nextStep >= morphForms.length ? 0 : nextStep;
        const targetPoints = morphForms[targetStep];
        const source = sourcePoints[Math.floor(index * sourcePoints.length / CONFIG.count)];
        const target = targetPoints[Math.floor(index * targetPoints.length / CONFIG.count)];
        const scale = Math.min(width, height) * .72;
        const turbulence = CONFIG.svgMorphTurbulence / 100 * Math.sin(Math.PI * rawMorphProgress);
        const scatter = CONFIG.svgMorphType === "Scatter" ? turbulence * Math.min(width, height) * .35 : 0;
        const directTurbulence = CONFIG.svgMorphType === "Direct" ? turbulence * 24 : 0;
        particle.x = width / 2 + (source.x + (target.x - source.x) * morphProgress) * scale +
          Math.cos(particle.phase) * scatter + Math.sin(time * .006 + particle.phase) * directTurbulence;
        particle.y = height / 2 + (source.y + (target.y - source.y) * morphProgress) * scale +
          Math.sin(particle.phase) * scatter + Math.cos(time * .005 + particle.phase * 1.7) * directTurbulence;
        particle.morphAlpha = CONFIG.svgMorphType === "Dissolve" ? Math.abs(2 * rawMorphProgress - 1) : 1;
        particle.sourceColor = CONFIG.preserveSvgColors ? morphColor(source.color, target.color, morphProgress) : null;
        particle.vx = 0; particle.vy = 0;
      } else if (canMorph && currentMorphForm >= 0) {
        const points = morphForms[currentMorphForm];
        const point = points[Math.floor(index * points.length / CONFIG.count)];
        const scale = Math.min(width, height) * .72;
        particle.x = width / 2 + point.x * scale;
        particle.y = height / 2 + point.y * scale;
        particle.morphAlpha = 1;
        particle.sourceColor = CONFIG.preserveSvgColors ? point.color : null;
        particle.vx = 0; particle.vy = 0;
      } else if (CONFIG.playing && motionEnabled && !updateParticle(particle, delta, time)) {
        if (CONFIG.populationMode === "Shrink") {
          particle.age = 0;
          particle.life = random(2.2, 6);
        } else {
          particles[index] = makeParticle(index);
        }
      }
      drawParticle(particle, motionEnabled);
    }
  }
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  animationId = requestAnimationFrame(frame);
}

function updatePointer(event) {
  const bounds = canvas.getBoundingClientRect();
  pointer.x = event.clientX - bounds.left;
  pointer.y = event.clientY - bounds.top;
  pointer.active = true;
}

resize();
if (CONFIG.populationMode !== "Grow") {
  for (let index = 0; index < CONFIG.count; index++) particles.push(makeParticle(index));
}
if (CONFIG.motion === "Off") arrangeInitialForm();
canvas.addEventListener("pointermove", updatePointer, { passive: true });
canvas.addEventListener("pointerdown", updatePointer, { passive: true });
canvas.addEventListener("pointerleave", () => { pointer.active = false; });
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvas);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(animationId);
  } else {
    previous = 0;
    animationId = requestAnimationFrame(frame);
  }
});
animationId = requestAnimationFrame(frame);
`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Particle creation</title><link rel="stylesheet" href="style.css"></head>
<body><canvas aria-label="Interactive particle animation"></canvas><script src="particles.js" defer></script></body></html>
`;
  const standaloneHtml = html.replace(
    '<link rel="stylesheet" href="style.css">',
    `<style>\n${css}</style>`,
  ).replace(
    '<script src="particles.js" defer></script>',
    `<script>\n${javascript}</script>`,
  );

  return { html, css, javascript, standaloneHtml };
}
