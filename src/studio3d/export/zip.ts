import { crc32 } from "./format";
import { compressionSupported, deflateRaw } from "./compress";

export interface ZipEntry { path: string; data: Uint8Array | string }
export interface ZipOptions {
  /** Deflate entries when it makes them smaller (default true; falls back to stored where unsupported). */
  compress?: boolean;
  /** Fixed timestamp, for reproducible archives and tests. */
  date?: Date;
}

const encoder = new TextEncoder();

/** Builds a ZIP archive (PKZIP 2.0, UTF-8 names). Entries are deflated only when that is smaller than storing them. */
export async function buildZip(entries: ZipEntry[], options: ZipOptions = {}): Promise<Uint8Array> {
  const now = options.date ?? new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const canCompress = options.compress !== false && compressionSupported();
  const chunks: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const raw = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
    const crc = crc32(raw);
    let body = raw, method = 0;
    if (canCompress && raw.length > 64) {
      const packed = await deflateRaw(raw);
      if (packed.length < raw.length) { body = packed; method = 8; }
    }
    const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, method, true);
    lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true); lv.setUint32(22, raw.length, true); lv.setUint16(26, name.length, true); local.set(name, 30);
    const head = new Uint8Array(46 + name.length), hv = new DataView(head.buffer);
    hv.setUint32(0, 0x02014b50, true); hv.setUint16(4, 20, true); hv.setUint16(6, 20, true); hv.setUint16(8, 0x0800, true); hv.setUint16(10, method, true);
    hv.setUint16(12, dosTime, true); hv.setUint16(14, dosDate, true); hv.setUint32(16, crc, true);
    hv.setUint32(20, body.length, true); hv.setUint32(24, raw.length, true); hv.setUint16(28, name.length, true);
    hv.setUint32(42, offset, true); head.set(name, 46);
    chunks.push(local, body); central.push(head);
    offset += local.length + body.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of all) { out.set(part, at); at += part.length; }
  return out;
}
