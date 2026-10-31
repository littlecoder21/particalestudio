import type { SvgSamplePoint } from "./svgSource";
import { getGeneratorPoint, type GeneratorType } from "./generators";
import type { ParticleEffect } from "./effects";

export type Emitter = "Point" | "Circle" | "Ring" | "Line" | "Fountain" | "SVG";
export type Motion = "Off" | "Float" | "Orbit" | "Flow" | "Burst";
export type ParticleShape =
  | "Circle" | "Square" | "Diamond" | "Star" | "Triangle" | "Pentagon"
  | "Hexagon" | "Polygon" | "Heart" | "Sparkle" | "Ring" | "Cross" | "Custom";
export type Interaction = "Repel" | "Attract" | "Swirl" | "Off";
export type BackgroundMode = "Solid" | "Gradient" | "Transparent";
export type BoundsMode = "Bounce" | "Wrap" | "Contain" | "Escape";
export type PopulationMode = "Steady" | "Grow" | "Shrink";
export type SvgMorphEasing = "Linear" | "Ease In Out" | "Ease Out";
export type SvgMorphType = "Direct" | "Dissolve" | "Scatter";

export interface ParticleSettings {
  count: number;
  emitter: Emitter;
  generator: GeneratorType;
  effects: ParticleEffect[];
  motion: Motion;
  shape: ParticleShape;
  interaction: Interaction;
  color: string;
  accent: string;
  palette: string[];
  size: number;
  speed: number;
  spread: number;
  gravity: number;
  physicsEnabled: boolean;
  drag: number;
  turbulence: number;
  vortex: number;
  bounce: number;
  boundsMode: BoundsMode;
  populationMode: PopulationMode;
  populationRate: number;
  svgMorphEnabled: boolean;
  svgMorphType: SvgMorphType;
  svgMorphDuration: number;
  svgMorphInitialDelay: number;
  svgMorphHoldDuration: number;
  svgMorphEasing: SvgMorphEasing;
  svgMorphTurbulence: number;
  svgMorphLoop: boolean;
  svgMorphPingPong: boolean;
  preserveSvgColors: boolean;
  interactionRadius: number;
  interactionStrength: number;
  opacity: number;
  glow: number;
  customShapePath: string;
  backgroundMode: BackgroundMode;
  backgroundColor: string;
  backgroundAccent: string;
  ambientLight: number;
  lightColor: string;
  showGrid: boolean;
  trails: boolean;
  interactive: boolean;
  playing: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  phase: number;
  sourceColor: string | null;
  depth: number;
  colorIndex: number;
  morphAlpha: number;
}

interface Pointer {
  x: number;
  y: number;
  active: boolean;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function colorAtAge(palette: readonly string[], colorIndex: number, progress: number): string {
  const colors = palette.length > 0 ? palette : ["#78d8ff", "#bd8cff"];
  const position = ((colorIndex + progress * (colors.length - 1)) % colors.length + colors.length) % colors.length;
  const firstColor = colors[Math.floor(position)];
  const secondColor = colors[(Math.floor(position) + 1) % colors.length];
  const amount = Math.round((position % 1) * 15) / 15;
  const first = Number.parseInt(firstColor.slice(1), 16);
  const second = Number.parseInt(secondColor.slice(1), 16);
  const mix = (shift: number) => {
    const a = (first >> shift) & 255;
    const b = (second >> shift) & 255;
    return Math.round(a + (b - a) * amount);
  };
  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
}

function quantizeSpriteColor(color: string): string {
  if (color.startsWith("hsl(")) return color;
  const channels = color.match(/\d+/g);
  if (!channels || channels.length !== 3) return color;
  const rounded = channels.map((channel) => Math.min(255, Math.round(Number(channel) / 16) * 16));
  return `rgb(${rounded[0]}, ${rounded[1]}, ${rounded[2]})`;
}

function hexToRgb(color: string): [number, number, number] {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function drawShape(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  shape: ParticleShape,
  customShapePath: string,
): void {
  context.beginPath();
  switch (shape) {
    case "Square":
      context.rect(x - size / 2, y - size / 2, size, size);
      break;
    case "Diamond":
      context.moveTo(x, y - size);
      context.lineTo(x + size, y);
      context.lineTo(x, y + size);
      context.lineTo(x - size, y);
      context.closePath();
      break;
    case "Star":
      for (let point = 0; point < 10; point += 1) {
        const radius = point % 2 === 0 ? size : size * 0.42;
        const angle = -Math.PI / 2 + (point * Math.PI) / 5;
        const shapeX = x + Math.cos(angle) * radius;
        const shapeY = y + Math.sin(angle) * radius;
        if (point === 0) context.moveTo(shapeX, shapeY);
        else context.lineTo(shapeX, shapeY);
      }
      context.closePath();
      break;
    case "Triangle":
    case "Pentagon":
    case "Hexagon":
    case "Polygon": {
      const sides = shape === "Triangle" ? 3 : shape === "Pentagon" ? 5 : shape === "Hexagon" ? 6 : 8;
      for (let point = 0; point < sides; point += 1) {
        const angle = -Math.PI / 2 + (point * Math.PI * 2) / sides;
        const shapeX = x + Math.cos(angle) * size;
        const shapeY = y + Math.sin(angle) * size;
        if (point === 0) context.moveTo(shapeX, shapeY);
        else context.lineTo(shapeX, shapeY);
      }
      context.closePath();
      break;
    }
    case "Heart":
      context.moveTo(x, y + size);
      context.bezierCurveTo(x - size * 1.6, y - size * 0.1, x - size * 0.8, y - size * 1.5, x, y - size * 0.55);
      context.bezierCurveTo(x + size * 0.8, y - size * 1.5, x + size * 1.6, y - size * 0.1, x, y + size);
      context.closePath();
      break;
    case "Sparkle":
      for (let point = 0; point < 8; point += 1) {
        const radius = point % 2 === 0 ? size : size * 0.17;
        const angle = -Math.PI / 2 + (point * Math.PI) / 4;
        const shapeX = x + Math.cos(angle) * radius;
        const shapeY = y + Math.sin(angle) * radius;
        if (point === 0) context.moveTo(shapeX, shapeY);
        else context.lineTo(shapeX, shapeY);
      }
      context.closePath();
      break;
    case "Cross":
      context.moveTo(x - size * 0.32, y - size);
      context.lineTo(x + size * 0.32, y - size);
      context.lineTo(x + size * 0.32, y - size * 0.32);
      context.lineTo(x + size, y - size * 0.32);
      context.lineTo(x + size, y + size * 0.32);
      context.lineTo(x + size * 0.32, y + size * 0.32);
      context.lineTo(x + size * 0.32, y + size);
      context.lineTo(x - size * 0.32, y + size);
      context.lineTo(x - size * 0.32, y + size * 0.32);
      context.lineTo(x - size, y + size * 0.32);
      context.lineTo(x - size, y - size * 0.32);
      context.lineTo(x - size * 0.32, y - size * 0.32);
      context.closePath();
      break;
    case "Ring":
      context.arc(x, y, size, 0, Math.PI * 2);
      context.strokeStyle = context.fillStyle;
      context.lineWidth = Math.max(1, size * 0.35);
      context.stroke();
      return;
    case "Custom":
      context.save();
      context.translate(x - size, y - size);
      context.scale((size * 2) / 100, (size * 2) / 100);
      context.fill(new Path2D(customShapePath));
      context.restore();
      return;
    default:
      context.arc(x, y, size, 0, Math.PI * 2);
  }
  context.fill();
}

export function startParticleEngine(
  canvas: HTMLCanvasElement,
  getSettings: () => ParticleSettings,
  onFrame: (fps: number, particleCount: number) => void,
  getSvgPoints: () => readonly SvgSamplePoint[] = () => [],
  getSvgSequencePoints: () => readonly (readonly SvgSamplePoint[])[] = () => [],
): () => void {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("This browser does not support Canvas 2D rendering.");

  const particles: Particle[] = [];
  const pointer: Pointer = { x: 0, y: 0, active: false };
  let width = 1;
  let height = 1;
  let previousTime = 0;
  let fpsTime = 0;
  let fpsFrames = 0;
  let animationId = 0;
  let lastCount = -1;
  let spriteStyle = "";
  let lastEmitter: Emitter | null = null;
  let lastGenerator: GeneratorType | null = null;
  let lastMotion: Motion | null = null;
  let lastPopulationMode: PopulationMode | null = null;
  let lastSvgPoints: readonly SvgSamplePoint[] = [];
  let lastSvgSequencePoints: readonly (readonly SvgSamplePoint[])[] = [];
  let populationAccumulator = 0;
  let morphElapsed = 0;
  let morphStage: "initial" | "transition" | "hold" | "done" = "initial";
  let morphStep = 0;
  let morphCurrentForm = 0;
  let morphDirection: 1 | -1 = 1;
  let lastMorphSignature = "";
  const spriteCache = new Map<string, HTMLCanvasElement>();
  const maximumCachedSprites = 384;
  const rainbowPalette = Array.from({ length: 32 }, (_, index) =>
    `hsl(${Math.round((index / 32) * 360)}, 100%, 68%)`,
  );

  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, bounds.width < 500 ? 1 : 1.5);
    width = Math.max(bounds.width, 1);
    height = Math.max(bounds.height, 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const spawn = (
    particle: Particle,
    settings: ParticleSettings,
    svgPoints: readonly SvgSamplePoint[],
    index = Math.floor(Math.random() * Math.max(settings.count, 1)),
  ) => {
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const spread = settings.spread / 100;
    const angle = randomBetween(0, Math.PI * 2);
    const radius = Math.sqrt(Math.random()) * spread * Math.min(width, height) * 0.5;
    const speed = settings.motion === "Off" ? 0 : settings.speed * randomBetween(0.35, 1.4);
    let x = centerX;
    let y = centerY;
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;
    let sourceColor: string | null = null;

    if (settings.generator !== "Source Shape") {
      const generated = getGeneratorPoint(settings.generator, index, settings.count, width, height, settings.spread);
      x = generated.x;
      y = generated.y;
      particle.depth = generated.depth;
    } else {
      particle.depth = 1;
    }

    if (settings.generator !== "Source Shape") {
      vx = Math.cos(angle) * speed;
      vy = Math.sin(angle) * speed;
    } else switch (settings.emitter) {
      case "SVG": {
        const point = svgPoints[Math.floor(Math.random() * svgPoints.length)];
        if (point) {
          const scale = Math.min(width, height) * 0.72;
          x += point.x * scale;
          y += point.y * scale;
          vx = Math.cos(angle) * speed * 0.2;
          vy = Math.sin(angle) * speed * 0.2;
          sourceColor = settings.preserveSvgColors ? point.color : null;
        }
        break;
      }
      case "Circle":
        x += Math.cos(angle) * radius;
        y += Math.sin(angle) * radius;
        break;
      case "Ring":
        x += Math.cos(angle) * spread * Math.min(width, height) * 0.5;
        y += Math.sin(angle) * spread * Math.min(width, height) * 0.5;
        break;
      case "Line":
        x += randomBetween(-spread, spread) * width * 0.5;
        vx = randomBetween(-1, 1) * speed * 0.35;
        vy = randomBetween(-1, 1) * speed * 0.35;
        break;
      case "Fountain":
        x += randomBetween(-spread, spread) * width * 0.15;
        y += height * 0.18;
        vx = randomBetween(-1, 1) * speed * 0.45;
        vy = -Math.abs(randomBetween(0.5, 1.5) * speed);
        break;
    }

    particle.x = x;
    particle.y = y;
    particle.vx = vx;
    particle.vy = vy;
    particle.age = 0;
    particle.life = randomBetween(2.2, 6);
    particle.size = randomBetween(0.55, 1.45);
    particle.phase = randomBetween(0, Math.PI * 2);
    particle.sourceColor = sourceColor;
    particle.colorIndex = index % Math.max(settings.palette.length, 1);
    particle.morphAlpha = 1;
  };

  const morphColor = (start: string, end: string, progress: number) => {
    const first = Number.parseInt(start.slice(1), 16);
    const second = Number.parseInt(end.slice(1), 16);
    const mix = (shift: number) => Math.round(
      ((first >> shift) & 255) + (((second >> shift) & 255) - ((first >> shift) & 255)) * progress,
    );
    return `#${[mix(16), mix(8), mix(0)].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  };

  const easeMorph = (progress: number, easing: SvgMorphEasing) => {
    if (easing === "Ease In Out") return progress * progress * (3 - 2 * progress);
    if (easing === "Ease Out") return 1 - (1 - progress) * (1 - progress);
    return progress;
  };

  const arrangeInitialForm = (settings: ParticleSettings, svgPoints: readonly SvgSamplePoint[]) => {
    const scale = Math.min(width, height) * 0.72;
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      spawn(particle, settings, svgPoints, index);
      particle.vx = 0;
      particle.vy = 0;
      particle.age = particle.life * 0.5;
      if (settings.generator !== "Source Shape") {
        const generated = getGeneratorPoint(settings.generator, index, particles.length, width, height, settings.spread);
        particle.x = generated.x;
        particle.y = generated.y;
        particle.depth = generated.depth;
      } else if (settings.emitter === "SVG" && svgPoints.length > 0) {
        const point = svgPoints[Math.floor((index * svgPoints.length) / particles.length)];
        particle.x = width * 0.5 + point.x * scale;
        particle.y = height * 0.5 + point.y * scale;
        particle.sourceColor = settings.preserveSvgColors ? point.color : null;
      }
    }
  };

  const syncCount = (
    settings: ParticleSettings,
    svgPoints: readonly SvgSamplePoint[],
    svgSequencePoints: readonly (readonly SvgSamplePoint[])[],
  ) => {
    const count = Math.min(settings.count, 1800);
    const countChanged = count !== lastCount;
    const shouldRespawn = settings.emitter !== lastEmitter || settings.generator !== lastGenerator || svgPoints !== lastSvgPoints;
    const resetToInitial = settings.motion === "Off" && lastMotion !== "Off";
    const populationChanged = settings.populationMode !== lastPopulationMode;
    const initializeShrink = settings.populationMode === "Shrink" &&
      (lastPopulationMode === null || (countChanged && !populationChanged));
    const targetChanged = svgSequencePoints !== lastSvgSequencePoints;
    const morphSignature = [
      settings.svgMorphEnabled, settings.svgMorphType, settings.svgMorphDuration,
      settings.svgMorphInitialDelay, settings.svgMorphHoldDuration, settings.svgMorphEasing,
      settings.svgMorphTurbulence, settings.svgMorphLoop, settings.svgMorphPingPong,
    ].join(":");
    const morphSettingsChanged = morphSignature !== lastMorphSignature;
    if (targetChanged || morphSettingsChanged) {
      morphElapsed = 0;
      morphStage = "initial";
      morphStep = 0;
      morphCurrentForm = 0;
      morphDirection = 1;
    }
    lastMorphSignature = morphSignature;
    lastSvgSequencePoints = svgSequencePoints;
    if (!countChanged && !shouldRespawn && !resetToInitial && !populationChanged) return;
    lastCount = count;
    lastEmitter = settings.emitter;
    lastGenerator = settings.generator;
    lastMotion = settings.motion;
    lastPopulationMode = settings.populationMode;
    lastSvgPoints = svgPoints;
    if (populationChanged && settings.populationMode === "Grow") particles.length = 0;
    if (settings.populationMode === "Steady" || settings.populationMode === "Shrink") {
      while (particles.length > count) particles.pop();
    }
    while (
      particles.length < count &&
      (settings.populationMode === "Steady" || initializeShrink)
    ) {
      const particle: Particle = { x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, size: 1, phase: 0, sourceColor: null, depth: 1, colorIndex: 0, morphAlpha: 1 };
      spawn(particle, settings, svgPoints, particles.length);
      particles.push(particle);
    }
    if (settings.populationMode === "Grow" && particles.length > count) particles.length = count;
    if (settings.motion === "Off") {
      arrangeInitialForm(settings, svgPoints);
    } else if (shouldRespawn) {
      for (const particle of particles) spawn(particle, settings, svgPoints);
    }
  };

  const drawParticle = (particle: Particle, settings: ParticleSettings, alpha: number, time: number) => {
    const progress = settings.motion === "Off" ? 0.5 : particle.age / particle.life;
    const fade = Math.min(progress * 7, (1 - progress) * 2.5, 1) * particle.morphAlpha;
    const twinkle = settings.effects.includes("Twinkle")
      ? 0.4 + (Math.sin(time * 0.004 + particle.phase * 2) + 1) * 0.3
      : 1;
    const cycle = settings.effects.includes("Color Cycle")
      ? rainbowPalette[Math.floor((time * 0.008 + particle.phase * 5 + progress * 10) % rainbowPalette.length + rainbowPalette.length) % rainbowPalette.length]
      : null;
    const color = cycle ?? (settings.preserveSvgColors && particle.sourceColor
      ? colorAtAge([particle.sourceColor, settings.accent], 0, progress)
      : colorAtAge(settings.palette, particle.colorIndex, progress));
    const spriteColor = quantizeSpriteColor(color);
    const pulse = settings.effects.includes("Pulse")
      ? 0.72 + (Math.sin(time * 0.003 + particle.phase) + 1) * 0.2
      : 1;
    const size = settings.size * particle.size * particle.depth * pulse * (0.7 + Math.sin(progress * Math.PI) * 0.3);
    const roundedSize = Math.max(0.5, Math.round(size * 2) / 2);
    const style = `${settings.shape}:${settings.customShapePath}:${settings.glow}:${settings.size}:${settings.color}:${settings.accent}`;
    if (style !== spriteStyle) {
      spriteStyle = style;
      spriteCache.clear();
    }

    const key = `${spriteColor}:${roundedSize}`;
    let sprite = spriteCache.get(key);
    if (!sprite) {
      if (spriteCache.size >= maximumCachedSprites) {
        const oldestSprite = spriteCache.keys().next().value;
        if (oldestSprite !== undefined) spriteCache.delete(oldestSprite);
      }
      const padding = Math.ceil(settings.glow * 1.5) + 2;
      const shapeExtent = settings.shape === "Heart" ? roundedSize * 1.6 : roundedSize;
      const dimension = Math.ceil((shapeExtent + padding) * 2);
      sprite = document.createElement("canvas");
      sprite.width = dimension;
      sprite.height = dimension;
      const spriteContext = sprite.getContext("2d");
      if (!spriteContext) throw new Error("Could not create a particle render sprite.");
      spriteContext.fillStyle = spriteColor;
      spriteContext.shadowColor = spriteColor;
      spriteContext.shadowBlur = settings.glow;
      drawShape(spriteContext, dimension / 2, dimension / 2, roundedSize, settings.shape, settings.customShapePath);
      spriteCache.set(key, sprite);
    }

    context.globalAlpha = Math.max(0, fade * twinkle * settings.opacity * alpha);
    context.drawImage(sprite, particle.x - sprite.width / 2, particle.y - sprite.height / 2);

    if (settings.effects.includes("Sparkles") && particle.phase % 3 < 0.8 && Math.sin(time * 0.006 + particle.phase * 4) > 0.65) {
      const sparkleSize = Math.max(2, size * 0.7);
      context.globalAlpha = Math.max(0, twinkle * settings.opacity * 0.8);
      context.fillStyle = cycle ?? spriteColor;
      context.beginPath();
      context.moveTo(particle.x, particle.y - sparkleSize);
      context.lineTo(particle.x + sparkleSize * 0.22, particle.y - sparkleSize * 0.22);
      context.lineTo(particle.x + sparkleSize, particle.y);
      context.lineTo(particle.x + sparkleSize * 0.22, particle.y + sparkleSize * 0.22);
      context.lineTo(particle.x, particle.y + sparkleSize);
      context.lineTo(particle.x - sparkleSize * 0.22, particle.y + sparkleSize * 0.22);
      context.lineTo(particle.x - sparkleSize, particle.y);
      context.lineTo(particle.x - sparkleSize * 0.22, particle.y - sparkleSize * 0.22);
      context.closePath();
      context.fill();
    }
  };

  const drawConnections = (settings: ParticleSettings) => {
    if (!settings.effects.includes("Connections") || particles.length < 2) return;
    const cellSize = 72;
    const buckets = new Map<string, number[]>();
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      const key = `${Math.floor(particle.x / cellSize)}:${Math.floor(particle.y / cellSize)}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(index);
      else buckets.set(key, [index]);
    }

    context.beginPath();
    let links = 0;
    const maximumLinks = Math.min(particles.length * 2, 2400);
    for (let index = 0; index < particles.length && links < maximumLinks; index += 1) {
      const particle = particles[index];
      const cellX = Math.floor(particle.x / cellSize);
      const cellY = Math.floor(particle.y / cellSize);
      let particleLinks = 0;
      for (let offsetY = -1; offsetY <= 1 && particleLinks < 3; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1 && particleLinks < 3; offsetX += 1) {
          const bucket = buckets.get(`${cellX + offsetX}:${cellY + offsetY}`);
          if (!bucket) continue;
          for (const otherIndex of bucket) {
            if (otherIndex <= index) continue;
            const other = particles[otherIndex];
            if (Math.hypot(other.x - particle.x, other.y - particle.y) > cellSize) continue;
            context.moveTo(particle.x, particle.y);
            context.lineTo(other.x, other.y);
            particleLinks += 1;
            links += 1;
            if (particleLinks >= 3 || links >= maximumLinks) break;
          }
        }
      }
    }
    context.globalAlpha = 0.14;
    context.strokeStyle = settings.color;
    context.lineWidth = 0.7;
    context.stroke();
    context.globalAlpha = 1;
  };

  const drawNetwork = (settings: ParticleSettings) => {
    const generator = settings.generator;
    if (!["Connected Nodes", "Neural Network", "Constellation", "Branching Structures", "Dynamic Web", "Proximity Web"].includes(generator)) {
      return;
    }

    context.beginPath();
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (generator === "Branching Structures") {
        if (index > 0) {
          const parent = particles[Math.floor((index - 1) / 2)];
          context.moveTo(particle.x, particle.y);
          context.lineTo(parent.x, parent.y);
        }
      } else if (generator === "Neural Network") {
        const layerSize = Math.max(2, Math.ceil(Math.sqrt(particles.length)));
        for (const offset of [layerSize, layerSize + 1]) {
          if (index >= offset) {
            const previous = particles[index - offset];
            context.moveTo(particle.x, particle.y);
            context.lineTo(previous.x, previous.y);
          }
        }
      } else if (generator === "Connected Nodes" || generator === "Proximity Web") {
        const columns = Math.max(2, Math.ceil(Math.sqrt(particles.length * width / height)));
        if (index % columns < columns - 1 && index + 1 < particles.length) {
          const right = particles[index + 1];
          context.moveTo(particle.x, particle.y);
          context.lineTo(right.x, right.y);
        }
        if (index + columns < particles.length) {
          const below = particles[index + columns];
          context.moveTo(particle.x, particle.y);
          context.lineTo(below.x, below.y);
        }
      } else {
        for (const offset of [1, 7]) {
          if (index + offset < particles.length) {
            const neighbor = particles[index + offset];
            context.moveTo(particle.x, particle.y);
            context.lineTo(neighbor.x, neighbor.y);
          }
        }
      }
    }
    context.globalAlpha = 0.18;
    context.strokeStyle = settings.color;
    context.lineWidth = 0.8;
    context.stroke();
    context.globalAlpha = 1;
  };

  const animate = (time: number) => {
    const settings = getSettings();
    const svgPoints = getSvgPoints();
    const svgSequencePoints = getSvgSequencePoints();
    syncCount(settings, svgPoints, svgSequencePoints);
    const delta = Math.min((time - (previousTime || time)) / 1000, 0.04);
    previousTime = time;

    if (settings.playing) {
      const step = delta * 60;
      if (settings.populationMode !== "Steady") {
        populationAccumulator += delta * settings.populationRate;
        const populationChange = Math.floor(populationAccumulator);
        populationAccumulator -= populationChange;
        if (settings.populationMode === "Grow") {
          for (let amount = 0; amount < populationChange && particles.length < settings.count; amount += 1) {
            const particle: Particle = { x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, size: 1, phase: 0, sourceColor: null, depth: 1, colorIndex: 0, morphAlpha: 1 };
            spawn(particle, settings, svgPoints, particles.length);
            particles.push(particle);
          }
        } else {
          particles.splice(Math.max(0, particles.length - populationChange), populationChange);
        }
      } else {
        populationAccumulator = 0;
      }

      const morphForms = [svgPoints, ...svgSequencePoints];
      const canMorph = settings.svgMorphEnabled &&
        settings.emitter === "SVG" &&
        svgPoints.length > 0 &&
        svgSequencePoints.length > 0;
      if (!canMorph) {
        morphStage = "initial";
        morphElapsed = 0;
        morphStep = 0;
        morphCurrentForm = 0;
        morphDirection = 1;
      } else if (morphStage === "initial") {
        morphElapsed += delta;
        if (morphElapsed >= settings.svgMorphInitialDelay) {
          morphElapsed = 0;
          morphStage = "transition";
        }
      } else if (morphStage === "transition") {
        morphElapsed += delta;
        if (morphElapsed >= settings.svgMorphDuration) {
          morphElapsed = 0;
          const targetStep = morphStep + morphDirection;
          morphCurrentForm = targetStep < 0
            ? morphForms.length - 1
            : targetStep >= morphForms.length ? 0 : targetStep;
          morphStage = "hold";
        }
      } else if (morphStage === "hold") {
        morphElapsed += delta;
        if (morphElapsed >= settings.svgMorphHoldDuration) {
          morphElapsed = 0;
          if (morphDirection === 1 && morphCurrentForm >= morphForms.length - 1) {
            if (settings.svgMorphPingPong) {
              morphDirection = -1;
            } else if (settings.svgMorphLoop) {
              morphStep = morphCurrentForm;
            } else {
              morphStage = "done";
            }
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
      const rawMorphProgress = morphing ? Math.min(morphElapsed / settings.svgMorphDuration, 1) : 0;
      const morphProgress = easeMorph(rawMorphProgress, settings.svgMorphEasing);
      const currentMorphForm = morphStage === "hold" || morphStage === "done"
        ? morphCurrentForm
        : morphStage === "initial" ? 0 : -1;

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        const motionEnabled = settings.motion !== "Off";
        if (motionEnabled && !morphing) {
          particle.age += delta;
          if (particle.age >= particle.life) {
            if (settings.populationMode === "Shrink") {
              particle.age = 0;
              particle.life = randomBetween(2.2, 6);
            } else {
              spawn(particle, settings, svgPoints, index);
              continue;
            }
          }
        }

        if (morphing) {
          const sourcePoints = morphForms[morphStep];
          const nextStep = morphStep + morphDirection;
          const targetStep = nextStep < 0 ? 0 : nextStep >= morphForms.length ? 0 : nextStep;
          const targetPoints = morphForms[targetStep];
          const sourcePoint = sourcePoints[Math.floor((index * sourcePoints.length) / settings.count)];
          const targetPoint = targetPoints[Math.floor((index * targetPoints.length) / settings.count)];
          const scale = Math.min(width, height) * 0.72;
          const scatter = settings.svgMorphTurbulence / 100 * Math.sin(Math.PI * rawMorphProgress);
          const scatterDistance = settings.svgMorphType === "Scatter" ? scatter * Math.min(width, height) * 0.35 : 0;
          const directTurbulence = settings.svgMorphType === "Direct" ? scatter * 24 : 0;
          particle.x = width * 0.5 + (sourcePoint.x + (targetPoint.x - sourcePoint.x) * morphProgress) * scale +
            Math.cos(particle.phase) * scatterDistance + Math.sin(time * 0.006 + particle.phase) * directTurbulence;
          particle.y = height * 0.5 + (sourcePoint.y + (targetPoint.y - sourcePoint.y) * morphProgress) * scale +
            Math.sin(particle.phase) * scatterDistance + Math.cos(time * 0.005 + particle.phase * 1.7) * directTurbulence;
          particle.morphAlpha = settings.svgMorphType === "Dissolve"
            ? Math.abs(2 * rawMorphProgress - 1)
            : 1;
          particle.sourceColor = settings.preserveSvgColors
            ? morphColor(sourcePoint.color, targetPoint.color, morphProgress)
            : null;
          particle.vx = 0;
          particle.vy = 0;
          continue;
        }
        if (canMorph && currentMorphForm >= 0) {
          const formPoints = morphForms[currentMorphForm];
          const point = formPoints[Math.floor((index * formPoints.length) / settings.count)];
          const scale = Math.min(width, height) * 0.72;
          particle.x = width * 0.5 + point.x * scale;
          particle.y = height * 0.5 + point.y * scale;
          particle.morphAlpha = 1;
          particle.sourceColor = settings.preserveSvgColors ? point.color : null;
          particle.vx = 0;
          particle.vy = 0;
          continue;
        }
        particle.morphAlpha = 1;

        if (motionEnabled && settings.physicsEnabled) {
          particle.vx *= settings.drag;
          particle.vy *= settings.drag;
          particle.vy += settings.gravity * 0.012 * step;
          particle.vx += Math.sin(particle.y * 0.018 + particle.phase + time * 0.001) * settings.turbulence * 0.035 * step;
          particle.vy += Math.cos(particle.x * 0.015 + particle.phase + time * 0.0007) * settings.turbulence * 0.025 * step;
          const dx = particle.x - width * 0.5;
          const dy = particle.y - height * 0.5;
          particle.vx += -dy * settings.vortex * 0.000025 * step;
          particle.vy += dx * settings.vortex * 0.000025 * step;
        }

        if (settings.motion === "Orbit") {
          const dx = particle.x - width * 0.5;
          const dy = particle.y - height * 0.5;
          particle.vx += -dy * 0.0007 * settings.speed * step;
          particle.vy += dx * 0.0007 * settings.speed * step;
        } else if (settings.motion === "Flow") {
          particle.vx += Math.sin(particle.y * 0.012 + particle.phase + time * 0.0003) * 0.025 * step;
          particle.vy += Math.cos(particle.x * 0.012 + particle.phase + time * 0.0002) * 0.02 * step;
        } else if (settings.motion === "Float") {
          particle.vx += Math.sin(time * 0.0005 + particle.phase) * 0.012 * step;
          particle.vy += Math.cos(time * 0.0004 + particle.phase) * 0.012 * step;
        } else if (settings.motion === "Burst") {
          particle.vx *= 1 + 0.0005 * step;
          particle.vy *= 1 + 0.0005 * step;
        }

        if (motionEnabled && settings.effects.includes("Magnetic Field") && pointer.active) {
          const dx = pointer.x - particle.x;
          const dy = pointer.y - particle.y;
          const distance = Math.max(Math.hypot(dx, dy), 1);
          if (distance < settings.interactionRadius * 1.5) {
            const force = (1 - distance / (settings.interactionRadius * 1.5)) * settings.interactionStrength * step * 0.75;
            particle.vx += (-dy / distance) * force;
            particle.vy += (dx / distance) * force;
          }
        }

        if (motionEnabled && settings.interactive && pointer.active && settings.interaction !== "Off") {
          const dx = pointer.x - particle.x;
          const dy = pointer.y - particle.y;
          const distance = Math.max(Math.hypot(dx, dy), 1);
          const reach = settings.interactionRadius;
          if (distance < reach) {
            const force = (1 - distance / reach) * settings.interactionStrength * step;
            if (settings.interaction === "Repel") {
              particle.vx -= (dx / distance) * force;
              particle.vy -= (dy / distance) * force;
            } else if (settings.interaction === "Attract") {
              particle.vx += (dx / distance) * force;
              particle.vy += (dy / distance) * force;
            } else {
              particle.vx += (-dy / distance) * force;
              particle.vy += (dx / distance) * force;
            }
          }
        }

        if (motionEnabled) {
          particle.x += particle.vx * step;
          particle.y += particle.vy * step;
        }
        if (settings.boundsMode === "Bounce") {
          if (particle.x < 0 || particle.x > width) {
            particle.x = Math.max(0, Math.min(width, particle.x));
            particle.vx = -particle.vx * settings.bounce;
          }
          if (particle.y < 0 || particle.y > height) {
            particle.y = Math.max(0, Math.min(height, particle.y));
            particle.vy = -particle.vy * settings.bounce;
          }
        } else if (settings.boundsMode === "Wrap") {
          if (particle.x < 0) particle.x = width;
          else if (particle.x > width) particle.x = 0;
          if (particle.y < 0) particle.y = height;
          else if (particle.y > height) particle.y = 0;
        } else if (settings.boundsMode === "Contain") {
          if (particle.x < 0 || particle.x > width) particle.vx = 0;
          if (particle.y < 0 || particle.y > height) particle.vy = 0;
          particle.x = Math.max(0, Math.min(width, particle.x));
          particle.y = Math.max(0, Math.min(height, particle.y));
        }
      }
    }

    context.globalAlpha = 1;
    context.shadowBlur = 0;
    context.globalCompositeOperation = "source-over";
    const showTrails = settings.trails || settings.effects.includes("Long Exposure");
    if (showTrails) {
      context.fillStyle = settings.backgroundMode === "Transparent"
        ? "rgba(0, 0, 0, 0.16)"
        : "rgba(9, 11, 18, 0.16)";
      context.fillRect(0, 0, width, height);
    } else if (settings.backgroundMode === "Transparent") {
      context.clearRect(0, 0, width, height);
    } else if (settings.backgroundMode === "Gradient") {
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, settings.backgroundColor);
      gradient.addColorStop(1, settings.backgroundAccent);
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    } else {
      context.fillStyle = settings.backgroundColor;
      context.fillRect(0, 0, width, height);
    }

    if (settings.ambientLight > 0) {
      const intensity = Math.min(settings.ambientLight / 100, 1);
      const [red, green, blue] = hexToRgb(settings.lightColor);
      const light = context.createRadialGradient(width * 0.5, height * 0.5, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.62);
      light.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${intensity * 0.22})`);
      light.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
      context.fillStyle = light;
      context.fillRect(0, 0, width, height);
    }

    if (settings.showGrid) {
      context.globalAlpha = 0.12;
      context.strokeStyle = "#b9a2ff";
      context.lineWidth = 1;
      for (let x = 0; x <= width; x += 40) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
      for (let y = 0; y <= height; y += 40) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }
      context.globalAlpha = 1;
    }
    context.globalCompositeOperation = "lighter";
    drawNetwork(settings);
    drawConnections(settings);
    if (settings.generator !== "Source Shape" || settings.emitter !== "SVG" || svgPoints.length > 0) {
      for (const particle of particles) drawParticle(particle, settings, showTrails ? 0.85 : 1, time);
    }
    context.globalCompositeOperation = "source-over";

    fpsFrames += 1;
    if (time - fpsTime >= 500) {
      onFrame(Math.round((fpsFrames * 1000) / Math.max(time - fpsTime, 1)), particles.length);
      fpsFrames = 0;
      fpsTime = time;
    }
    animationId = window.requestAnimationFrame(animate);
  };

  const updatePointer = (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect();
    pointer.x = event.clientX - bounds.left;
    pointer.y = event.clientY - bounds.top;
    pointer.active = true;
  };
  const stopPointer = () => {
    pointer.active = false;
  };

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  canvas.addEventListener("pointermove", updatePointer);
  canvas.addEventListener("pointerdown", updatePointer);
  canvas.addEventListener("pointerleave", stopPointer);
  resize();
  animationId = window.requestAnimationFrame(animate);

  return () => {
    window.cancelAnimationFrame(animationId);
    observer.disconnect();
    canvas.removeEventListener("pointermove", updatePointer);
    canvas.removeEventListener("pointerdown", updatePointer);
    canvas.removeEventListener("pointerleave", stopPointer);
  };
}
