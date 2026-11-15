/** Runs inside the browser page: renders a frame with the Studio's own GLRenderer, and compares two PNG frames. */
import { GLRenderer } from "../../src/studio3d/renderer";
import { OrbitCamera } from "../../src/studio3d/camera";
import { decodePsb, readFloat32, readRaw } from "../../src/studio3d/export/format";
import { QUALITY } from "../../src/studio3d/types";
import { compareImages } from "../../src/studio3d/export/parity";

async function studioFrame(project: any, psb: Uint8Array, width: number, height: number, time: number, radius: number): Promise<string> {
  const d = decodePsb(psb);
  const n = d.count;
  const canvas = document.createElement("canvas");
  const renderer = new GLRenderer(canvas);
  renderer.resize(width, height, 1);
  const camera = new OrbitCamera();
  camera.apply(project.camera);
  renderer.render({
    n, pos: readFloat32(d, "position")!, vel: readFloat32(d, "velocity")!, nrm: readFloat32(d, "normal")!, t: readFloat32(d, "t")!, size: readFloat32(d, "size")!,
    alpha: readFloat32(d, "alpha")!, phase: readFloat32(d, "phase")!, layer: readRaw(d, "layer") as Uint8Array, attrVersion: 1, time, camera,
    look: project.look, layers: project.layers.map((l: any) => ({ palette: l.palette, sizeMul: l.sizeMul, opacityMul: l.opacityMul })), beams: project.beams,
    bloomLevel: QUALITY[project.quality as keyof typeof QUALITY].bloom, focus: camera.distance, range: Math.max(0.5, radius),
  } as any, false);
  const url = canvas.toDataURL("image/png"); // same task as the draw, so the buffer is still valid
  renderer.dispose();
  return url;
}

async function exportFrame(baseUrl: string, width: number, height: number): Promise<string> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;`;
  document.body.appendChild(host);
  const { createParticleScene } = await import(/* @vite-ignore */ `${baseUrl}/particle-export/particle-engine.js`);
  const scene = await createParticleScene({ container: host, data: `${baseUrl}/particle-export/particle-data.bin`, config: `${baseUrl}/particle-export/particle-config.json`, lazy: false, autoplay: false, pixelRatio: 1, respectReducedMotion: false });
  const url = scene.capture();
  scene.destroy();
  host.remove();
  return url;
}

async function diff(aUrl: string, bUrl: string) {
  // The same comparison the Export panel's "Compare with studio" button runs.
  const r = await compareImages(aUrl, bUrl);
  const { diff: _heat, meanLumaA, meanLumaB, ...rest } = r;
  return { ...rest, meanLumaStudio: meanLumaA, meanLumaExport: meanLumaB };
}

(window as any).PS = { studioFrame, exportFrame, diff };
