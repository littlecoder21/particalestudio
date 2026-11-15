/**
 * Preview-vs-export comparison. `diffPixels` is pure (and unit-tested in Node); `compareImages` adds the browser-only
 * decoding. Used by the Export panel's "Compare with studio" workflow and by tools/export-browser-tests/parity.ts.
 */

export interface PixelDiff {
  width: number;
  height: number;
  /** Mean absolute error over RGB, 0-255. */
  mae: number;
  rmse: number;
  /** Peak signal-to-noise ratio in dB (Infinity when identical). */
  psnr: number;
  /** Largest per-channel difference of any pixel (straight RGBA), 0-255. */
  max: number;
  pctOver4: number;
  pctOver16: number;
  /** Largest difference after premultiplying by alpha: what is actually composited on screen. */
  pmMax: number;
  alphaMax: number;
  meanLumaA: number;
  meanLumaB: number;
  /** RGBA greyscale heat map of the per-pixel worst channel difference, amplified 8×. */
  diff: Uint8ClampedArray;
}

/**
 * The canvas holds premultiplied colour and PNG export un-premultiplies it, which magnifies a 1/255 rounding step to
 * hundreds at near-zero alpha. `pmMax` compares premultiplied values, so it reports real on-screen differences only.
 */
export function diffPixels(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number): PixelDiff {
  const pixels = width * height;
  if (a.length !== pixels * 4 || b.length !== pixels * 4) throw new Error("diffPixels: buffers do not match the stated size.");
  const diff = new Uint8ClampedArray(pixels * 4);
  let sumAbs = 0, sumSq = 0, max = 0, over4 = 0, over16 = 0, pmMax = 0, alphaMax = 0, lumaA = 0, lumaB = 0;
  for (let i = 0; i < pixels; i++) {
    const o = i * 4;
    let worst = 0;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(a[o + c]! - b[o + c]!);
      if (d > worst) worst = d;
      if (c < 3) { sumAbs += d; sumSq += d * d; }
    }
    const aa = a[o + 3]! / 255, ba = b[o + 3]! / 255;
    for (let c = 0; c < 3; c++) { const pm = Math.abs(a[o + c]! * aa - b[o + c]! * ba); if (pm > pmMax) pmMax = pm; }
    alphaMax = Math.max(alphaMax, Math.abs(a[o + 3]! - b[o + 3]!));
    if (worst > max) max = worst;
    if (worst > 4) over4++;
    if (worst > 16) over16++;
    lumaA += (a[o]! + a[o + 1]! + a[o + 2]!) / 3;
    lumaB += (b[o]! + b[o + 1]! + b[o + 2]!) / 3;
    const v = Math.min(255, worst * 8);
    diff[o] = v; diff[o + 1] = v; diff[o + 2] = v; diff[o + 3] = 255;
  }
  const mse = sumSq / (pixels * 3);
  return {
    width, height, mae: sumAbs / (pixels * 3), rmse: Math.sqrt(mse), psnr: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse), max,
    pctOver4: (over4 / pixels) * 100, pctOver16: (over16 / pixels) * 100, pmMax, alphaMax, meanLumaA: lumaA / pixels, meanLumaB: lumaB / pixels, diff,
  };
}

export type ParityLevel = "identical" | "match" | "differs";
export interface ParityVerdict { level: ParityLevel; label: string }

/**
 * "identical": every byte equal. "match": no pixel differs by more than 2/255 on screen (half-float and 8-bit rounding
 * in the compact layouts), which is below what the eye can see. Anything above that is reported as a difference.
 */
export function parityVerdict(d: Pick<PixelDiff, "max" | "pmMax">): ParityVerdict {
  if (d.max === 0) return { level: "identical", label: "Pixel-identical" };
  if (d.pmMax <= 2) return { level: "match", label: "Visually identical (rounding differences only)" };
  return { level: "differs", label: "Differences found" };
}

/* ───────────── browser only ───────────── */

export async function decodeImage(source: Blob | string): Promise<ImageData> {
  const blob = typeof source === "string" ? await (await fetch(source)).blob() : source;
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function imageDataUrl(data: Uint8ClampedArray, width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d")!.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  return canvas.toDataURL("image/png");
}

export async function compareImages(a: Blob | string, b: Blob | string): Promise<PixelDiff & { diffUrl: string }> {
  const [ia, ib] = await Promise.all([decodeImage(a), decodeImage(b)]);
  if (ia.width !== ib.width || ia.height !== ib.height) throw new Error(`Image sizes differ: ${ia.width}×${ia.height} vs ${ib.width}×${ib.height}.`);
  const result = diffPixels(ia.data, ib.data, ia.width, ia.height);
  return { ...result, diffUrl: imageDataUrl(result.diff, ia.width, ia.height) };
}
