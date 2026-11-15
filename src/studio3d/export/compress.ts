/**
 * Compression helpers built on the platform streams (CompressionStream is in every evergreen browser and in Node 18+),
 * so no library is shipped. Output is what ZIP method 8 and the standalone embed expect: raw deflate.
 */
const asBlobPart = (bytes: Uint8Array) => bytes as unknown as BlobPart;

export const compressionSupported = () => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

async function pipe(bytes: Uint8Array, stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> }): Promise<Uint8Array> {
  const source = new Blob([asBlobPart(bytes)]).stream() as unknown as ReadableStream<Uint8Array>;
  return new Uint8Array(await new Response(source.pipeThrough(stream as never)).arrayBuffer());
}

export const deflateRaw = (bytes: Uint8Array) => pipe(bytes, new CompressionStream("deflate-raw") as never);
export const inflateRaw = (bytes: Uint8Array) => pipe(bytes, new DecompressionStream("deflate-raw") as never);
/** Size the file would have over a gzip-enabled web server. Computed, not guessed. */
export const gzipLength = async (bytes: Uint8Array) => (await pipe(bytes, new CompressionStream("gzip") as never)).length;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let start = 0; start < bytes.length; start += chunk) binary += String.fromCharCode(...bytes.subarray(start, Math.min(bytes.length, start + chunk)));
  return btoa(binary);
}

/** Exact length of the base64 text for `byteLength` bytes. */
export const base64Length = (byteLength: number) => Math.ceil(byteLength / 3) * 4;

export type EmbedEncoding = "b64" | "b64z";
export interface Embedded { encoding: EmbedEncoding; text: string; rawBytes: number; storedBytes: number }

/**
 * Encodes particle data for embedding in HTML. "auto" deflates only when it saves at least 8 %, because float data
 * often barely compresses and the plain form decodes everywhere.
 */
export async function embedBytes(bytes: Uint8Array, preference: "auto" | "base64" | "deflate"): Promise<Embedded> {
  if (preference !== "base64" && compressionSupported()) {
    const packed = await deflateRaw(bytes);
    if (preference === "deflate" || packed.length < bytes.length * 0.92) return { encoding: "b64z", text: bytesToBase64(packed), rawBytes: bytes.length, storedBytes: packed.length };
  }
  return { encoding: "b64", text: bytesToBase64(bytes), rawBytes: bytes.length, storedBytes: bytes.length };
}
