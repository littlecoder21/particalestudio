import { SHADER_PRESETS } from "./presets";
import { ShaderRenderer } from "./renderer";

const THUMB_W = 240;
const THUMB_H = 150;
const THUMB_TIME = 7;

/**
 * Bakes a real thumbnail for every preset with one shared off-screen WebGL
 * context, one preset at a time, so the preset grid shows the actual shaders
 * without 50 live canvases. Cards subscribe individually and update as soon
 * as their own image is ready.
 */
class ThumbStore {
  private readonly urls = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private queue: string[] = [];
  private renderer: ShaderRenderer | null = null;
  private timer = 0;
  private started = false;
  private paused = false;

  readonly get = (name: string): string | undefined => this.urls.get(name);

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  start(): void {
    if (this.started) return;
    this.started = true;
    this.queue = SHADER_PRESETS.map((preset) => preset.name);
    this.schedule(400);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused && this.started && this.queue.length > 0 && this.timer === 0) this.schedule(120);
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
    const name = this.queue.shift();
    if (name === undefined) {
      this.finish();
      return;
    }
    const preset = SHADER_PRESETS.find((item) => item.name === name);
    if (preset) this.bake(preset.name, preset.project);
    if (this.queue.length > 0) this.schedule(70);
    else this.finish();
  };

  private bake(name: string, project: (typeof SHADER_PRESETS)[number]["project"]): void {
    if (!this.renderer) {
      const canvas = document.createElement("canvas");
      canvas.width = THUMB_W;
      canvas.height = THUMB_H;
      this.renderer = new ShaderRenderer(canvas, {
        onError: (message) => {
          if (message) console.warn(`Thumbnail shader "${name}" failed:`, message);
        },
      });
      if (!this.renderer.supported) {
        this.queue = [];
        return;
      }
    }
    const renderer = this.renderer;
    renderer.setSize(THUMB_W, THUMB_H);
    renderer.setProject({ ...project, playing: false });
    renderer.renderStill(THUMB_TIME);
    try {
      this.urls.set(name, renderer.canvas.toDataURL("image/jpeg", 0.82));
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
