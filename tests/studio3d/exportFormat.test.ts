import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTR, DTYPE_BYTES, PSB_HEADER_BYTES, PSB_MAGIC, PSB_VERSION, PsbError, crc32, decodePsb, encodePsb, fromHalf, psbByteLength, readFloat32, readRaw, toHalf,
  type AttributeInput, type PsbErrorCode,
} from "../../src/studio3d/export/format";

function sampleInputs(count: number): { inputs: AttributeInput[]; pos: Float32Array; nrm: Float32Array; alpha: Float32Array; layer: Uint8Array; size: Float32Array; vel: Float32Array } {
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), vel = new Float32Array(count * 3);
  const alpha = new Float32Array(count), size = new Float32Array(count), t = new Float32Array(count), layer = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const a = i * 0.37;
    pos.set([Math.sin(a) * 1.7, Math.cos(a * 1.3) * 0.9, Math.sin(a * 0.7) * 2.3], i * 3);
    const nx = Math.sin(a * 1.1), ny = Math.cos(a * 0.9), nz = Math.sin(a * 0.3), l = Math.hypot(nx, ny, nz);
    nrm.set([nx / l, ny / l, nz / l], i * 3);
    vel.set([Math.sin(a) * 3, Math.cos(a) * 2.5, Math.sin(a * 2) * 0.01], i * 3);
    alpha[i] = 0.2 + 0.8 * ((i * 7919) % 1000) / 1000;
    size[i] = 0.4 + 1.6 * ((i * 104729) % 997) / 997;
    t[i] = ((i * 31) % 1000) / 1000;
    layer[i] = i % 4;
  }
  const inputs: AttributeInput[] = [
    { name: "position", dtype: "f32", data: pos },
    { name: "normal", dtype: "i8", data: nrm },
    { name: "velocity", dtype: "f16", data: vel },
    { name: "t", dtype: "u16", normalized: true, data: t },
    { name: "size", dtype: "f16", data: size },
    { name: "alpha", dtype: "u8", normalized: true, data: alpha },
    { name: "layer", dtype: "u8", normalized: false, data: layer },
  ];
  return { inputs, pos, nrm, alpha, layer, size, vel };
}

const expectCode = (fn: () => unknown, code: PsbErrorCode) => assert.throws(fn, (error) => error instanceof PsbError && error.code === code, `expected PsbError ${code}`);

test("half-float conversion matches IEEE binary16 reference values", () => {
  assert.equal(toHalf(1), 0x3c00);
  assert.equal(toHalf(-2), 0xc000);
  assert.equal(toHalf(65504), 0x7bff);
  assert.equal(toHalf(65520), 0x7c00, "overflow rounds to infinity");
  assert.equal(toHalf(2 ** -24), 0x0001, "smallest subnormal");
  assert.equal(toHalf(2 ** -26), 0x0000, "underflow to zero");
  assert.equal(toHalf(0.1), 0x2e66);
  assert.equal(fromHalf(0x3c00), 1);
  assert.equal(fromHalf(0xc000), -2);
  assert.equal(fromHalf(0x7c00), Infinity);
  assert.ok(Number.isNaN(fromHalf(toHalf(NaN))));
  for (let v = 0.001; v < 60000; v *= 1.37) assert.ok(Math.abs(fromHalf(toHalf(v)) - v) <= v * 2 ** -10, `relative error for ${v}`);
});

test("container header, alignment and checksum are well formed", () => {
  const count = 101;
  const { inputs } = sampleInputs(count);
  const { bytes } = encodePsb(count, inputs, { hello: "world" });
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), PSB_MAGIC);
  assert.equal(view.getUint16(4, true), PSB_VERSION);
  assert.equal(view.getUint16(6, true), PSB_HEADER_BYTES);
  assert.equal(view.getUint32(8, true), count);
  assert.equal(view.getUint16(12, true), inputs.length);
  const decoded = decodePsb(bytes);
  assert.equal(decoded.count, count);
  assert.deepEqual(decoded.meta, { hello: "world" });
  for (const attr of Object.values(decoded.attributes)) {
    assert.equal(attr!.byteOffset % 4, 0, `${attr!.name} is 4-byte aligned`);
    assert.equal(attr!.byteLength, count * attr!.components * DTYPE_BYTES[attr!.dtype]);
  }
  assert.equal(bytes.length, psbByteLength(count, inputs.map((i) => ({ name: i.name, dtype: i.dtype })), new TextEncoder().encode(JSON.stringify({ hello: "world" })).length));
  const payloadStart = PSB_HEADER_BYTES + inputs.length * 24 + ((new TextEncoder().encode('{"hello":"world"}').length + 3) & ~3);
  assert.equal(view.getUint32(24, true), crc32(bytes, payloadStart, payloadStart + view.getUint32(20, true)));
});

test("every storage type round-trips within its documented precision", () => {
  const count = 977;
  const { inputs, pos, nrm, alpha, layer, size, vel } = sampleInputs(count);
  const { bytes, report } = encodePsb(count, inputs);
  const decoded = decodePsb(bytes);

  const position = readFloat32(decoded, "position")!;
  assert.equal(position.buffer, decoded.buffer, "float32 positions are a zero-copy view");
  for (let i = 0; i < pos.length; i++) assert.equal(position[i], pos[i], "positions are bit-exact");
  assert.equal(report.maxError.position, 0);

  const rawNormal = readRaw(decoded, "normal") as Int8Array;
  assert.ok(rawNormal instanceof Int8Array);
  for (let i = 0; i < nrm.length; i++) assert.equal(rawNormal[i], Math.trunc(nrm[i]! * 127) | 0, "int8 normals equal what the renderer uploads");
  const normal = readFloat32(decoded, "normal")!;
  for (let i = 0; i < nrm.length; i++) assert.ok(Math.abs(normal[i]! - nrm[i]!) <= 1 / 127 + 1e-6);

  const a = readFloat32(decoded, "alpha")!;
  let aMin = Infinity, aMax = -Infinity;
  for (const v of alpha) { aMin = Math.min(aMin, v); aMax = Math.max(aMax, v); }
  for (let i = 0; i < count; i++) assert.ok(Math.abs(a[i]! - alpha[i]!) <= (aMax - aMin) / 255 / 2 + 1e-6);

  const s = readFloat32(decoded, "size")!;
  for (let i = 0; i < count; i++) assert.ok(Math.abs(s[i]! - size[i]!) <= size[i]! * 2 ** -10);
  const v = readFloat32(decoded, "velocity")!;
  for (let i = 0; i < vel.length; i++) assert.ok(Math.abs(v[i]! - vel[i]!) <= Math.abs(vel[i]!) * 2 ** -10 + 2 ** -24);

  const l = readRaw(decoded, "layer") as Uint8Array;
  for (let i = 0; i < count; i++) assert.equal(l[i], layer[i]);
  assert.ok((report.maxError.alpha ?? 1) <= (aMax - aMin) / 255 / 2 + 1e-6);
});

test("forced copy path (big-endian fallback) decodes identically to the zero-copy path", () => {
  const { inputs } = sampleInputs(64);
  const decoded = decodePsb(encodePsb(64, inputs).bytes);
  for (const name of ["position", "normal", "velocity", "t", "size", "alpha", "layer"] as const) {
    const fast = readFloat32(decoded, name)!, slow = readFloat32(decoded, name, true)!;
    assert.equal(fast.length, slow.length);
    for (let i = 0; i < fast.length; i++) assert.equal(slow[i], fast[i], `${name}[${i}]`);
  }
});

test("an unaligned byte view is copied once and still decodes", () => {
  const { inputs } = sampleInputs(33);
  const { bytes } = encodePsb(33, inputs);
  const holder = new Uint8Array(bytes.length + 3);
  holder.set(bytes, 3);
  const decoded = decodePsb(holder.subarray(3));
  assert.equal(decoded.copied, true);
  assert.equal(decoded.count, 33);
  assert.equal(readFloat32(decoded, "position")![5], (inputs[0]!.data as Float32Array)[5]);
  assert.equal(decodePsb(bytes).copied, false);
});

test("invalid, truncated and future-version data is rejected with a specific error", () => {
  const { inputs } = sampleInputs(40);
  const { bytes } = encodePsb(40, inputs);
  const clone = () => new Uint8Array(bytes);

  expectCode(() => decodePsb(new Uint8Array(10)), "too-short");
  const badMagic = clone(); badMagic[0] = 0x3c; // looks like "<html" served by a 404 page
  expectCode(() => decodePsb(badMagic), "bad-magic");
  const future = clone(); new DataView(future.buffer).setUint16(4, PSB_VERSION + 1, true);
  expectCode(() => decodePsb(future), "unsupported-version");
  const zeroVersion = clone(); new DataView(zeroVersion.buffer).setUint16(4, 0, true);
  expectCode(() => decodePsb(zeroVersion), "unsupported-version");
  expectCode(() => decodePsb(bytes.subarray(0, bytes.length - 8)), "truncated");
  expectCode(() => decodePsb(bytes.subarray(0, PSB_HEADER_BYTES + 10)), "truncated");
  const zeroCount = clone(); new DataView(zeroCount.buffer).setUint32(8, 0, true);
  expectCode(() => decodePsb(zeroCount), "bad-count");
  const corrupt = clone(); corrupt[corrupt.length - 5] ^= 0xff;
  expectCode(() => decodePsb(corrupt), "checksum-mismatch");
  assert.doesNotThrow(() => decodePsb(corrupt, { verifyChecksum: false }), "checksum verification can be disabled");

  const badLength = clone(); new DataView(badLength.buffer).setUint32(PSB_HEADER_BYTES + 8, 12, true);
  expectCode(() => decodePsb(badLength), "bad-attribute");
  const outside = clone(); new DataView(outside.buffer).setUint32(PSB_HEADER_BYTES + 4, 0x7ffffff0, true);
  expectCode(() => decodePsb(outside), "bad-attribute");
  const badType = clone(); badType[PSB_HEADER_BYTES + 1] = 99;
  expectCode(() => decodePsb(badType), "bad-attribute");

  const badMeta = encodePsb(4, [{ name: "position", dtype: "f32", data: new Float32Array(12) }], { a: 1 }).bytes;
  const metaAt = PSB_HEADER_BYTES + 24;
  badMeta[metaAt] = 0x7b; badMeta[metaAt + 1] = 0x7b; // "{{" is not JSON
  expectCode(() => decodePsb(badMeta), "bad-meta");

  expectCode(() => decodePsb("nope" as unknown as ArrayBuffer), "invalid-input");
  expectCode(() => encodePsb(0, inputs), "bad-count");
  expectCode(() => encodePsb(40, [{ name: "normal", dtype: "i8", data: new Float32Array(120) }]), "missing-attribute");
  expectCode(() => encodePsb(40, [{ name: "position", dtype: "f32", data: new Float32Array(10) }]), "invalid-input");
});

test("a file without a position attribute is rejected, unknown attributes from newer exporters are skipped", () => {
  const { inputs } = sampleInputs(20);
  const { bytes } = encodePsb(20, inputs);
  const unknown = new Uint8Array(bytes);
  unknown[PSB_HEADER_BYTES + 24 * 1] = 200; // second attribute (normal) gets an id this engine does not know
  const decoded = decodePsb(unknown);
  assert.equal(decoded.attributes.normal, undefined);
  assert.ok(decoded.attributes.position);
  const noPosition = new Uint8Array(bytes);
  noPosition[PSB_HEADER_BYTES] = 201;
  expectCode(() => decodePsb(noPosition), "missing-attribute");
  assert.equal(ATTR.position, 1);
});

test("non-finite source values are sanitized and counted instead of poisoning the buffer", () => {
  const pos = new Float32Array([1, 2, 3, NaN, Infinity, -Infinity]);
  const { bytes, report } = encodePsb(2, [{ name: "position", dtype: "f32", data: pos }]);
  assert.equal(report.sanitized, 3);
  const out = readFloat32(decodePsb(bytes), "position")!;
  assert.deepEqual(Array.from(out), [1, 2, 3, 0, 0, 0]);
});
