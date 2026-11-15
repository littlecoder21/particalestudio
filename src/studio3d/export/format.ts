/**
 * PSB1: the versioned binary container shared by every export target.
 *
 *   header (32 B) | attribute table (24 B each) | metadata JSON (padded to 4 B) | payload
 *
 * The website export ships the container as `particle-data.bin`; the standalone HTML embeds the very same
 * bytes (base64 or deflate+base64). The studio-side packer and the runtime-side loader both import this file,
 * so the schema cannot drift between targets. Pure TypeScript: no DOM, runs in Node for tests.
 *
 * Header layout (little-endian):
 *    0  u32  magic "PSB1"
 *    4  u16  format version
 *    6  u16  header size in bytes (>= 32; lets future versions add fields)
 *    8  u32  particle count
 *   12  u16  attribute count
 *   14  u16  flags  (bit 0: payload CRC-32 present)
 *   16  u32  metadata byte length (UTF-8 JSON, unpadded)
 *   20  u32  payload byte length
 *   24  u32  payload CRC-32
 *   28  u32  reserved
 *
 * Attribute table entry (24 B):
 *    0 u8 id | 1 u8 dtype | 2 u8 components | 3 u8 flags (bit 0: normalized)
 *    4 u32 byte offset inside the payload (4-byte aligned) | 8 u32 byte length
 *   12 f32 range min | 16 f32 range max | 20 u32 reserved
 *
 * Unsigned normalized types decode as `min + (max - min) * u / maxInt` (range stored per attribute). Signed
 * normalized types always map [-1, 1]. `i8` stores `trunc(x * 127)`, which is exactly the value the renderer
 * uploads for GL_BYTE normals, so Hero exports light identically to the studio preview.
 */

export const PSB_MAGIC = 0x31425350; // bytes "P" "S" "B" "1"
export const PSB_VERSION = 1;
export const PSB_HEADER_BYTES = 32;
export const PSB_ENTRY_BYTES = 24;
export const PSB_MAX_PARTICLES = 16_777_216;
export const PSB_MAX_ATTRIBUTES = 64;
const FLAG_CRC = 1;

export const ATTR = { position: 1, normal: 2, velocity: 3, homeBase: 4, t: 5, size: 6, alpha: 7, phase: 8, weight: 9, layer: 10 } as const;
export type AttrName = keyof typeof ATTR;
export const ATTR_NAMES = Object.keys(ATTR) as AttrName[];
export const ATTR_COMPONENTS: Record<AttrName, 1 | 3> = { position: 3, normal: 3, velocity: 3, homeBase: 3, t: 1, size: 1, alpha: 1, phase: 1, weight: 1, layer: 1 };

export const DTYPE = { f32: 0, f16: 1, u16: 2, i16: 3, u8: 4, i8: 5 } as const;
export type DType = keyof typeof DTYPE;
export const DTYPE_BYTES: Record<DType, number> = { f32: 4, f16: 2, u16: 2, i16: 2, u8: 1, i8: 1 };
const DTYPE_NAMES = Object.keys(DTYPE) as DType[];

export type PsbErrorCode =
  | "too-short" | "bad-magic" | "unsupported-version" | "bad-header" | "bad-count" | "truncated" | "bad-meta"
  | "bad-attribute" | "missing-attribute" | "checksum-mismatch" | "invalid-input";
export class PsbError extends Error {
  constructor(readonly code: PsbErrorCode, message: string) {
    super(message);
    this.name = "PsbError";
  }
}

/* ───────────── small helpers ───────────── */

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const pad4 = (n: number) => (n + 3) & ~3;

let crcTable: Uint32Array | null = null;
export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let b = 0; b < 8; b++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) crc = (crcTable[(crc ^ bytes[i]!) & 255] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const f32Scratch = new Float32Array(1);
const u32Scratch = new Uint32Array(f32Scratch.buffer);

/** float32 -> IEEE 754 binary16 bits, round-to-nearest-even. */
export function toHalf(value: number): number {
  f32Scratch[0] = value;
  const x = u32Scratch[0]!;
  const sign = (x >>> 16) & 0x8000;
  const exp32 = (x >>> 23) & 0xff;
  const mant = x & 0x7fffff;
  if (exp32 === 0xff) return sign | 0x7c00 | (mant ? 0x200 : 0);
  const exp = exp32 - 127 + 15;
  if (exp >= 0x1f) return sign | 0x7c00;
  if (exp <= 0) {
    if (exp < -10) return sign;
    const m = mant | 0x800000, shift = 14 - exp;
    let half = m >>> shift;
    const rest = m & ((1 << shift) - 1), halfway = 1 << (shift - 1);
    if (rest > halfway || (rest === halfway && (half & 1))) half++;
    return sign | half;
  }
  let half = sign | (exp << 10) | (mant >>> 13);
  const rest = mant & 0x1fff;
  if (rest > 0x1000 || (rest === 0x1000 && (half & 1))) half++;
  return half;
}

export function fromHalf(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1, exp = (bits >> 10) & 0x1f, mant = bits & 0x3ff;
  if (exp === 0) return sign * mant * 2 ** -24;
  if (exp === 0x1f) return mant ? NaN : sign * Infinity;
  return sign * (1 + mant / 1024) * 2 ** (exp - 15);
}

/* ───────────── encoding ───────────── */

export interface AttributeInput {
  name: AttrName;
  dtype: DType;
  /** Source values, `count * components` long (Float32Array for float data, Uint8Array for layers). */
  data: ArrayLike<number>;
  /** Unsigned types only: false stores raw integers (layer index), true maps the range to 0..max. */
  normalized?: boolean;
  /** Unsigned normalized types: value range mapped onto the integer range. Defaults to the data's own min/max. */
  range?: [number, number];
}

export interface EncodeReport {
  /** Largest absolute difference between the source value and what the runtime will decode, per attribute. */
  maxError: Partial<Record<AttrName, number>>;
  /** Count of non-finite source values replaced by 0. */
  sanitized: number;
}

export function encodePsb(count: number, inputs: AttributeInput[], meta: Record<string, unknown> = {}): { bytes: Uint8Array; report: EncodeReport } {
  if (!Number.isInteger(count) || count < 1 || count > PSB_MAX_PARTICLES) throw new PsbError("bad-count", `Particle count ${count} is outside 1..${PSB_MAX_PARTICLES}.`);
  if (inputs.length > PSB_MAX_ATTRIBUTES) throw new PsbError("invalid-input", "Too many attributes.");
  const seen = new Set<AttrName>();
  for (const input of inputs) {
    if (seen.has(input.name)) throw new PsbError("invalid-input", `Duplicate attribute ${input.name}.`);
    seen.add(input.name);
    if (input.data.length < count * ATTR_COMPONENTS[input.name]) throw new PsbError("invalid-input", `Attribute ${input.name} has ${input.data.length} values, expected ${count * ATTR_COMPONENTS[input.name]}.`);
  }
  if (!seen.has("position")) throw new PsbError("missing-attribute", "A position attribute is required.");

  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  const tableBytes = inputs.length * PSB_ENTRY_BYTES;
  const payloadStart = PSB_HEADER_BYTES + tableBytes + pad4(metaBytes.length);
  const layout = inputs.map((input) => {
    const byteLength = count * ATTR_COMPONENTS[input.name] * DTYPE_BYTES[input.dtype];
    return { input, byteLength };
  });
  let payloadLength = 0;
  const offsets = layout.map(({ byteLength }) => { const at = payloadLength; payloadLength = pad4(payloadLength + byteLength); return at; });
  const bytes = new Uint8Array(payloadStart + payloadLength);
  const view = new DataView(bytes.buffer);
  const report: EncodeReport = { maxError: {}, sanitized: 0 };

  layout.forEach(({ input, byteLength }, index) => {
    const comps = ATTR_COMPONENTS[input.name], total = count * comps, base = payloadStart + offsets[index]!;
    const src = input.data;
    let min = 0, max = 1, maxErr = 0;
    const unsigned = input.dtype === "u8" || input.dtype === "u16";
    const normalized = unsigned && input.normalized !== false;
    if (normalized) {
      if (input.range) [min, max] = input.range;
      else {
        min = Infinity; max = -Infinity;
        for (let i = 0; i < total; i++) { const v = Number.isFinite(src[i]!) ? src[i]! : 0; if (v < min) min = v; if (v > max) max = v; }
      }
      f32Scratch[0] = min; min = f32Scratch[0]; f32Scratch[0] = max; max = f32Scratch[0];
    }
    const span = max - min, maxInt = input.dtype === "u8" ? 255 : 65535;
    for (let i = 0; i < total; i++) {
      let v = src[i]!;
      if (!Number.isFinite(v)) { v = 0; report.sanitized++; }
      let decoded = v;
      switch (input.dtype) {
        case "f32": view.setFloat32(base + i * 4, v, true); f32Scratch[0] = v; decoded = f32Scratch[0]; break;
        case "f16": { const h = toHalf(v); view.setUint16(base + i * 2, h, true); decoded = fromHalf(h); break; }
        case "i8": { const q = Math.max(-127, Math.min(127, Math.trunc(v * 127))); view.setInt8(base + i, q); decoded = q / 127; break; }
        case "i16": { const q = Math.max(-32767, Math.min(32767, Math.round(v * 32767))); view.setInt16(base + i * 2, q, true); decoded = q / 32767; break; }
        case "u8":
        case "u16": {
          let q: number;
          if (normalized) q = span > 0 ? Math.max(0, Math.min(maxInt, Math.round(((v - min) / span) * maxInt))) : 0;
          else q = Math.max(0, Math.min(maxInt, Math.round(v)));
          if (input.dtype === "u8") view.setUint8(base + i, q); else view.setUint16(base + i * 2, q, true);
          decoded = normalized ? min + (span * q) / maxInt : q;
          break;
        }
      }
      // Compare against the float32 value the studio holds, not the JS double.
      f32Scratch[0] = v;
      const err = Math.abs(decoded - f32Scratch[0]!);
      if (err > maxErr) maxErr = err;
    }
    report.maxError[input.name] = maxErr;
    const entryAt = PSB_HEADER_BYTES + index * PSB_ENTRY_BYTES;
    view.setUint8(entryAt, ATTR[input.name]);
    view.setUint8(entryAt + 1, DTYPE[input.dtype]);
    view.setUint8(entryAt + 2, comps);
    view.setUint8(entryAt + 3, normalized || input.dtype === "i8" || input.dtype === "i16" ? 1 : 0);
    view.setUint32(entryAt + 4, offsets[index]!, true);
    view.setUint32(entryAt + 8, byteLength, true);
    view.setFloat32(entryAt + 12, min, true);
    view.setFloat32(entryAt + 16, max, true);
  });

  bytes.set(metaBytes, PSB_HEADER_BYTES + tableBytes);
  view.setUint32(0, PSB_MAGIC, true);
  view.setUint16(4, PSB_VERSION, true);
  view.setUint16(6, PSB_HEADER_BYTES, true);
  view.setUint32(8, count, true);
  view.setUint16(12, inputs.length, true);
  view.setUint16(14, FLAG_CRC, true);
  view.setUint32(16, metaBytes.length, true);
  view.setUint32(20, payloadLength, true);
  view.setUint32(24, crc32(bytes, payloadStart, payloadStart + payloadLength), true);
  return { bytes, report };
}

/* ───────────── decoding ───────────── */

export interface DecodedAttribute {
  name: AttrName;
  dtype: DType;
  components: number;
  normalized: boolean;
  min: number;
  max: number;
  /** Absolute byte offset inside `DecodedPsb.buffer`. */
  byteOffset: number;
  byteLength: number;
}

export interface DecodedPsb {
  version: number;
  count: number;
  meta: Record<string, unknown>;
  attributes: Partial<Record<AttrName, DecodedAttribute>>;
  buffer: ArrayBuffer;
  /** True when the input had to be copied to obtain 4-byte alignment. */
  copied: boolean;
}

export interface DecodeOptions {
  /** Verify the payload CRC-32 when the file carries one (default true). */
  verifyChecksum?: boolean;
}

export function decodePsb(input: ArrayBuffer | ArrayBufferView, options: DecodeOptions = {}): DecodedPsb {
  let bytes: Uint8Array;
  let copied = false;
  if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else if (ArrayBuffer.isView(input)) bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  else throw new PsbError("invalid-input", "Particle data must be an ArrayBuffer or a typed array.");
  if (bytes.byteLength < PSB_HEADER_BYTES) throw new PsbError("too-short", `Particle data is ${bytes.byteLength} bytes; a header alone needs ${PSB_HEADER_BYTES}.`);
  if (bytes.byteOffset % 4 !== 0 || !(bytes.buffer instanceof ArrayBuffer)) {
    const aligned = new Uint8Array(bytes.byteLength);
    aligned.set(bytes);
    bytes = aligned;
    copied = true;
  }
  const buffer = bytes.buffer as ArrayBuffer;
  const base = bytes.byteOffset;
  const view = new DataView(buffer, base, bytes.byteLength);
  if (view.getUint32(0, true) !== PSB_MAGIC) throw new PsbError("bad-magic", "Not a Particle Studio data file (bad magic number). The file may be truncated, or a web server may have returned an HTML error page instead.");
  const version = view.getUint16(4, true);
  if (version === 0 || version > PSB_VERSION) throw new PsbError("unsupported-version", `Particle data format version ${version} is not supported by this engine (supports up to ${PSB_VERSION}). Re-export the scene with a matching engine.`);
  const headerSize = view.getUint16(6, true);
  if (headerSize < PSB_HEADER_BYTES || headerSize > bytes.byteLength) throw new PsbError("bad-header", `Invalid header size ${headerSize}.`);
  const count = view.getUint32(8, true);
  if (count < 1 || count > PSB_MAX_PARTICLES) throw new PsbError("bad-count", `Invalid particle count ${count}.`);
  const attributeCount = view.getUint16(12, true);
  if (attributeCount > PSB_MAX_ATTRIBUTES) throw new PsbError("bad-header", `Invalid attribute count ${attributeCount}.`);
  const flags = view.getUint16(14, true);
  const metaLength = view.getUint32(16, true);
  const payloadLength = view.getUint32(20, true);
  const crc = view.getUint32(24, true);
  const tableStart = headerSize;
  const metaStart = tableStart + attributeCount * PSB_ENTRY_BYTES;
  const payloadStart = metaStart + pad4(metaLength);
  if (metaStart > bytes.byteLength || metaStart + metaLength > bytes.byteLength) throw new PsbError("truncated", "Particle data ends inside the attribute table or metadata (incomplete download?).");
  if (payloadStart + payloadLength > bytes.byteLength) throw new PsbError("truncated", `Particle data is incomplete: expected ${payloadStart + payloadLength} bytes, received ${bytes.byteLength}.`);

  let meta: Record<string, unknown> = {};
  if (metaLength > 0) {
    try { meta = JSON.parse(new TextDecoder().decode(bytes.subarray(metaStart, metaStart + metaLength))) as Record<string, unknown>; }
    catch { throw new PsbError("bad-meta", "Particle data metadata is not valid JSON."); }
  }
  if (flags & FLAG_CRC && options.verifyChecksum !== false && crc32(bytes, payloadStart, payloadStart + payloadLength) !== crc) {
    throw new PsbError("checksum-mismatch", "Particle data is corrupted (checksum mismatch).");
  }

  const attributes: Partial<Record<AttrName, DecodedAttribute>> = {};
  for (let i = 0; i < attributeCount; i++) {
    const at = tableStart + i * PSB_ENTRY_BYTES;
    const id = view.getUint8(at), dtypeId = view.getUint8(at + 1), comps = view.getUint8(at + 2), attrFlags = view.getUint8(at + 3);
    const offset = view.getUint32(at + 4, true), length = view.getUint32(at + 8, true);
    const name = ATTR_NAMES.find((key) => ATTR[key] === id);
    if (offset % 4 !== 0 || offset + length > payloadLength) throw new PsbError("bad-attribute", `Attribute ${id} lies outside the payload.`);
    if (!name) continue; // unknown attribute from a newer exporter: skip, forward-compatible
    const dtype = DTYPE_NAMES[dtypeId];
    if (!dtype) throw new PsbError("bad-attribute", `Attribute ${name} uses unknown data type ${dtypeId}.`);
    if (comps !== ATTR_COMPONENTS[name]) throw new PsbError("bad-attribute", `Attribute ${name} has ${comps} components, expected ${ATTR_COMPONENTS[name]}.`);
    if (length !== count * comps * DTYPE_BYTES[dtype]) throw new PsbError("bad-attribute", `Attribute ${name} is ${length} bytes, expected ${count * comps * DTYPE_BYTES[dtype]}.`);
    attributes[name] = {
      name, dtype, components: comps, normalized: (attrFlags & 1) === 1,
      min: view.getFloat32(at + 12, true), max: view.getFloat32(at + 16, true),
      byteOffset: base + payloadStart + offset, byteLength: length,
    };
  }
  if (!attributes.position) throw new PsbError("missing-attribute", "Particle data has no position attribute.");
  return { version, count, meta, attributes, buffer, copied };
}

export type RawArray = Float32Array | Uint16Array | Int16Array | Uint8Array | Int8Array;

/**
 * The stored values in their storage type, without copying when possible (little-endian hosts).
 * `i8` data comes back as Int8Array ready for a normalized GL_BYTE attribute; `f16` as raw Uint16 half bits.
 */
export function readRaw(decoded: DecodedPsb, name: AttrName, forceCopy = false): RawArray | null {
  const attr = decoded.attributes[name];
  if (!attr) return null;
  const length = decoded.count * attr.components;
  const view = new DataView(decoded.buffer);
  const copy = forceCopy || !LITTLE_ENDIAN;
  switch (attr.dtype) {
    case "f32": {
      if (!copy) return new Float32Array(decoded.buffer, attr.byteOffset, length);
      const out = new Float32Array(length);
      for (let i = 0; i < length; i++) out[i] = view.getFloat32(attr.byteOffset + i * 4, true);
      return out;
    }
    case "f16":
    case "u16": {
      if (!copy) return new Uint16Array(decoded.buffer, attr.byteOffset, length);
      const out = new Uint16Array(length);
      for (let i = 0; i < length; i++) out[i] = view.getUint16(attr.byteOffset + i * 2, true);
      return out;
    }
    case "i16": {
      if (!copy) return new Int16Array(decoded.buffer, attr.byteOffset, length);
      const out = new Int16Array(length);
      for (let i = 0; i < length; i++) out[i] = view.getInt16(attr.byteOffset + i * 2, true);
      return out;
    }
    case "u8": return new Uint8Array(decoded.buffer, attr.byteOffset, length);
    case "i8": return new Int8Array(decoded.buffer, attr.byteOffset, length);
  }
}

/** Dequantized Float32 values. Zero-copy for stored float32 data on little-endian hosts. */
export function readFloat32(decoded: DecodedPsb, name: AttrName, forceCopy = false): Float32Array | null {
  const attr = decoded.attributes[name];
  const raw = readRaw(decoded, name, forceCopy);
  if (!attr || !raw) return null;
  if (attr.dtype === "f32") return raw as Float32Array;
  const out = new Float32Array(raw.length);
  switch (attr.dtype) {
    case "f16": for (let i = 0; i < raw.length; i++) out[i] = fromHalf(raw[i]!); break;
    case "i8": for (let i = 0; i < raw.length; i++) out[i] = Math.max(-1, raw[i]! / 127); break;
    case "i16": for (let i = 0; i < raw.length; i++) out[i] = Math.max(-1, raw[i]! / 32767); break;
    case "u8":
    case "u16": {
      if (!attr.normalized) { for (let i = 0; i < raw.length; i++) out[i] = raw[i]!; break; }
      const maxInt = attr.dtype === "u8" ? 255 : 65535, span = attr.max - attr.min;
      for (let i = 0; i < raw.length; i++) out[i] = attr.min + (span * raw[i]!) / maxInt;
      break;
    }
  }
  return out;
}

/** Number of bytes a container with the given layout occupies. Exact: matches `encodePsb` output length. */
export function psbByteLength(count: number, layout: { name: AttrName; dtype: DType }[], metaBytes: number): number {
  let payload = 0;
  for (const item of layout) payload = pad4(payload + count * ATTR_COMPONENTS[item.name] * DTYPE_BYTES[item.dtype]);
  return PSB_HEADER_BYTES + layout.length * PSB_ENTRY_BYTES + pad4(metaBytes) + payload;
}
