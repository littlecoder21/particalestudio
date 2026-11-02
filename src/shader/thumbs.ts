import { LIBRARY_ITEMS, cssSwatch, thumbProject } from "./library";
import { MASK_LOOKS } from "./looks";
import { maskPixelsSync } from "./mask";
import { SHADER_PRESETS } from "./presets";
import { ShaderRenderer } from "./renderer";
import type { ShaderProject } from "./types";

const THUMB_W = 240;
const THUMB_H = 150;
const THUMB_TIME = 7;

export const presetThumbKey = (name: string): string => name;
export const lookThumbKey = (name: string): string => `look:${name}`;
export const libraryThumbKey = (id: string): string => `lib:${id}`;

interface Job {
  key: string;
  project: () => ShaderProject;
}

/**
 * Bakes a real thumbnail for every preset, mask look and library element with
 * one shared off-screen WebGL context, one at a time, so the grids show the
 * actual shaders without dozens of live canvases. Cards subscribe and update as
 * soon as their own image is ready. Library elements are queued on demand (when
 * the Elements panel opens) and jump the queue.
 */
class ThumbStore {
  private readonly urls = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private readonly known = new Set<string>();
  private queue: Job[] = [];
  private renderer: ShaderRenderer | null = null;
  private timer = 0;
  private started = false;
  private paused = false;

  readonly get = (key: string): string | undefined => this.urls.get(key);

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Presets and mask looks. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const jobs: Job[] = [
      ...SHADER_PRESETS.map((preset) => ({ key: presetThumbKey(preset.name), project: () => preset.project })),
      ...MASK_LOOKS.map((look) => ({ key: lookThumbKey(look.name), project: () => look.project })),
    ];
    this.add(jobs, false);
    this.schedule(400);
  }

  /** Library elements that need a real shader render (gradients and solids use CSS). */
  startLibrary(): void {
    const jobs: Job[] = LIBRARY_ITEMS.filter((it) => cssSwatch(it) === null).map((it) => ({
      key: libraryThumbKey(it.id),
      project: () => thumbProject(it),
    }));
    this.add(jobs, true);
    if (this.timer === 0) this.schedule(60);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused && this.queue.length > 0 && this.timer === 0) this.schedule(120);
  }

  private add(jobs: Job[], front: boolean): void {
    const fresh = jobs.filter((job) => !this.known.has(job.key));
    fresh.forEach((job) => this.known.add(job.key));
    this.queue = front ? [...fresh, ...this.queue] : [...this.queue, ...fresh];
  }

  private schedule(delay: number): void {
    this.timer = window.setTimeout(this.step, delay);
  }

  private readonly step = (): void => {
    this.timer = 0;
    if (this.paused || document.hidden) {
      if (this.queue.length > 0) this.schedule(500);
      return;
    }
    const job = this.queue.shift();
    if (!job) {
      this.finish();
      return;
    }
    this.bake(job);
    if (this.queue.length > 0) this.schedule(60);
    else this.finish();
  };

  private bake(job: Job): void {
    if (!this.renderer) {
      const canvas = document.createElement("canvas");
      canvas.width = THUMB_W;
      canvas.height = THUMB_H;
      this.renderer = new ShaderRenderer(canvas, {
        onError: (message) => {
          if (message) console.warn(`Thumbnail shader "${job.key}" failed:`, message);
        },
      });
      if (!this.renderer.supported) {
        this.queue = [];
        return;
      }
    }
    const renderer = this.renderer;
    const project = job.project();
    renderer.setSize(THUMB_W, THUMB_H);
    renderer.setMask(maskPixelsSync(project.mask));
    renderer.setProject({ ...project, playing: false });
    renderer.renderStill(THUMB_TIME);
    try {
      this.urls.set(job.key, renderer.canvas.toDataURL("image/jpeg", 0.82));
      this.listeners.forEach((listener) => listener());
    } catch {
      /* tainted or lost context — the card keeps its colour fallback */
    }
  }

  private finish(): void {
    this.renderer?.dispose(true);
    this.renderer = null;
  }
}

export const thumbStore = new ThumbStore();
