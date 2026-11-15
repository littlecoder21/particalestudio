/** TypeScript declarations shipped next to particle-engine.js (single source: this string becomes particle-engine.d.ts). */
export const ENGINE_DTS = `/** Type declarations for particle-engine.js (Particle Studio export engine). */

export const ENGINE_VERSION: string;

export type ParticleEngineErrorCode =
  | "no-dom" | "container-not-found" | "three-load-failed" | "webgl-unsupported" | "data-load-failed" | "data-invalid"
  | "config-invalid" | "unsupported-engine" | "not-ready" | "engine-error";

export class ParticleEngineError extends Error {
  readonly code: ParticleEngineErrorCode;
  readonly cause?: unknown;
}

export type SceneState = "idle" | "loading" | "ready" | "paused" | "sleeping" | "error" | "destroyed";

export interface ParticleSceneOptions {
  /** CSS selector or element. The engine appends one <canvas> to it. */
  container: string | HTMLElement;
  /** particle-data.bin: a URL, or the bytes themselves. */
  data: string | URL | ArrayBuffer | ArrayBufferView | Promise<ArrayBuffer | ArrayBufferView>;
  /** particle-config.json: a URL, or the parsed object. */
  config: string | URL | object | Promise<object>;
  /** Load and start only when the container is near the viewport (default true). With false, the promise waits for the first frame and rejects on any error. */
  lazy?: boolean | { rootMargin?: string };
  /** false starts paused, showing one still frame (default true). */
  autoplay?: boolean;
  /** Start paused for users who prefer reduced motion (default true). */
  respectReducedMotion?: boolean;
  /** false turns all pointer handling off. */
  interaction?: boolean;
  /** Upper bound for devicePixelRatio. Overrides the exported value. */
  pixelRatio?: number;
  /** Composite over the page instead of the exported background colour. */
  transparent?: boolean;
  /** Offscreen scenes beyond this many sleep to release their WebGL context (default 8). */
  maxActiveContexts?: number;
  /** Share an already-imported Three.js namespace. */
  three?: object;
  /** Use another Three.js module URL (the default is jsDelivr three@0.170.0). */
  threeUrl?: string;
  /** Accessible label for the canvas. */
  label?: string;
  preserveDrawingBuffer?: boolean;
  errorUI?: "none" | "message";
  onError?: (error: ParticleEngineError) => void;
  onReady?: (scene: ParticleScene) => void;
}

export interface ParticleSceneInfo {
  version: string; state: SceneState; mode: "hero" | "animated" | "full" | null; count: number; simulation: boolean;
  hdr: boolean; width: number; height: number; pixelRatio: number; resolutionScale: number; playing: boolean;
}

export interface InteractionPatch {
  enabled?: boolean;
  orbit?: boolean;
  zoom?: "off" | "modifier" | "always";
  touch?: "scroll" | "capture";
  tool?: string;
  radius?: number;
  strength?: number;
  clickAction?: "burst" | "none";
}

export interface ParticleSceneConfigPatch {
  scene?: { look?: Record<string, unknown>; layers?: unknown[]; beams?: unknown[]; camera?: Record<string, unknown> };
  render?: { pixelRatio?: number; adaptive?: boolean; bloomLevel?: 0 | 1 | 2 };
  animation?: { enabled?: boolean };
  interaction?: InteractionPatch;
  simulation?: Record<string, unknown>;
}

export interface ParticleScene {
  /** Resolves with the scene after the first frame; rejects if loading fails. */
  readonly ready: Promise<ParticleScene>;
  readonly state: SceneState;
  readonly isPlaying: boolean;
  /** The canvas currently showing the scene (replaced while a scene sleeps and wakes). */
  readonly canvas: HTMLCanvasElement | null;
  readonly info: ParticleSceneInfo;
  play(): void;
  pause(): void;
  resize(): void;
  requestDraw(): void;
  setInteraction(patch: boolean | InteractionPatch): void;
  updateConfig(patch: ParticleSceneConfigPatch): void;
  /** Renders one frame and returns it as a PNG data URL. */
  capture(): string;
  /** Stops rendering and releases the canvas, GPU buffers, textures, render targets and every listener. */
  destroy(): void;
}

export function createParticleScene(options: ParticleSceneOptions): Promise<ParticleScene>;
export function particleEngineStats(): { engine: string; simulation: boolean; scenes: number; awake: number; sleeping: number; maxActiveContexts: number };
`;
