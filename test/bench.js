import { performance } from 'node:perf_hooks';
import {
  WasmArena,
  defineStruct,
  f32,
  f64,
  i32,
  pack,
  slice,
  str,
  u16,
  u32,
  u64,
} from '../dist/index.js';

function bench(name, iterations, fn) {
  // Warmup
  for (let i = 0; i < Math.min(5, iterations); i++) fn();
  const start = performance.now();
  let checksum = 0;
  for (let i = 0; i < iterations; i++) {
    checksum += Number(fn()) || 0;
  }
  const elapsedMs = performance.now() - start;
  const perIterMs = elapsedMs / iterations;
  return { name, elapsedMs, perIterMs, checksum };
}

console.log('=== capnstruct Zero-Copy Benchmark ===\n');

// ---------------------------------------------------------------------------
// 1. Numeric WASM Struct Scan (100,000 SpdSample rows = 2.4 MB)
// ---------------------------------------------------------------------------
const N_SAMPLES = 100_000;
const SpdSample = defineStruct('SpdSample', {
  x: f64,
  y: f64,
  val: f32,
  id: u32,
});

const rawSamples = Array.from({ length: N_SAMPLES }, (_, i) => ({
  x: (i * 0.0013) % 360 - 180,
  y: (i * 0.0007) % 180 - 90,
  val: (i % 1000) * 0.25,
  id: i,
}));

const jsonSamplesText = JSON.stringify(rawSamples);
const jsonSamplesBytes = new TextEncoder().encode(jsonSamplesText);
const capnSamplesBytes = SpdSample.pack(rawSamples);
const capnSamplesView = SpdSample.array(capnSamplesBytes);
const rawDv = new DataView(
  capnSamplesBytes.buffer,
  capnSamplesBytes.byteOffset,
  capnSamplesBytes.byteLength,
);
const textDecoder = new TextDecoder();

console.log(
  `1) Numeric WASM Struct Scan (${N_SAMPLES.toLocaleString()} SpdSample rows | JSON ${(jsonSamplesBytes.byteLength / 1024 / 1024).toFixed(2)} MiB vs capnstruct ${(capnSamplesBytes.byteLength / 1024 / 1024).toFixed(2)} MiB):`,
);

const b1Json = bench('JSON.parse + iterate', 20, () => {
  const arr = JSON.parse(textDecoder.decode(jsonSamplesBytes));
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i];
    sum += r.x + r.y + r.val;
  }
  return sum;
});

const b1CapnForOf = bench('capnstruct for..of (0 allocs)', 20, () => {
  let sum = 0;
  for (const r of capnSamplesView) {
    sum += r.x + r.y + r.val;
  }
  return sum;
});

const b1CapnCursor = bench('capnstruct view.at(i, cursor)', 20, () => {
  const c = capnSamplesView.cursor();
  let sum = 0;
  for (let i = 0; i < N_SAMPLES; i++) {
    capnSamplesView.at(i, c);
    sum += c.x + c.y + c.val;
  }
  return sum;
});

const b1ManualDv = bench('Manual DataView offsets', 20, () => {
  let sum = 0;
  const stride = 24;
  for (let i = 0; i < N_SAMPLES; i++) {
    const o = i * stride;
    sum +=
      rawDv.getFloat64(o, true) +
      rawDv.getFloat64(o + 8, true) +
      rawDv.getFloat32(o + 16, true);
  }
  return sum;
});

for (const b of [b1Json, b1CapnForOf, b1CapnCursor, b1ManualDv]) {
  const speedup = (b1Json.perIterMs / b.perIterMs).toFixed(1);
  console.log(
    `   - ${b.name.padEnd(32)}: ${b.perIterMs.toFixed(3)} ms/iter (${speedup}x vs JSON.parse)`,
  );
}

// ---------------------------------------------------------------------------
// 2. Sparse Field Read + Lazy String Decode (25,000 Telemetry Rows, 12 fields)
// ---------------------------------------------------------------------------
const N_TELEMETRY = 25_000;
const TelemetryRow = defineStruct('TelemetryRow', {
  timestamp: u64,
  flightId: u32,
  squawk: u16,
  flags: u16,
  lat: f64,
  lon: f64,
  altBaro: i32,
  altGeom: i32,
  groundSpeed: f32,
  track: f32,
  callsign: str,
  route: str,
  waypoints: slice(f32),
});

const rawTelemetry = Array.from({ length: N_TELEMETRY }, (_, i) => ({
  timestamp: 1700000000000n + BigInt(i * 100),
  flightId: 100000 + i,
  squawk: 1200 + (i % 77),
  flags: i & 15,
  lat: 37.0 + (i % 500) * 0.01,
  lon: -122.0 + (i % 500) * 0.01,
  altBaro: 32000 + (i % 40) * 250,
  altGeom: 32150 + (i % 40) * 250,
  groundSpeed: 450.5,
  track: (i * 3.7) % 360,
  callsign: `UAL${1000 + (i % 9000)}`,
  route: 'KSFO-KORD-KJFK-EGLL-EDDF',
  waypoints: [37.6188, -122.375, 41.9742, -87.9073],
}));

const jsonTelemetryBytes = new TextEncoder().encode(
  JSON.stringify(rawTelemetry, (_, v) => (typeof v === 'bigint' ? Number(v) : v)),
);
const capnTelemetryBytes = pack(TelemetryRow, rawTelemetry);

console.log(
  `\n2) Sparse BBox Filter + Lazy String Decode (${N_TELEMETRY.toLocaleString()} rows × 13 fields, ~0.4% hit rate):`,
);

const b2Json = bench('JSON.parse + bbox filter', 20, () => {
  const rows = JSON.parse(textDecoder.decode(jsonTelemetryBytes));
  let matchedChars = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.lat > 41.95 && r.lon > -117.05) {
      matchedChars += r.callsign.length;
    }
  }
  return matchedChars;
});

const b2Capn = bench('capnstruct zero-copy filter', 20, () => {
  const rows = TelemetryRow.array(capnTelemetryBytes);
  let matchedChars = 0;
  for (const r of rows) {
    if (r.lat > 41.95 && r.lon > -117.05) {
      matchedChars += r.callsign.length;
    }
  }
  return matchedChars;
});

for (const b of [b2Json, b2Capn]) {
  const speedup = (b2Json.perIterMs / b.perIterMs).toFixed(1);
  console.log(
    `   - ${b.name.padEnd(32)}: ${b.perIterMs.toFixed(3)} ms/iter (${speedup}x vs JSON.parse)`,
  );
}

// ---------------------------------------------------------------------------
// 3. WASM Arena In-Place Write vs JSON Serialization (25,000 QpPoint rows)
// ---------------------------------------------------------------------------
const N_QP = 25_000;
const QpPoint = defineStruct('QpPoint', {
  x: f32,
  y: f32,
  origIdx: u32,
});
const rawQp = Array.from({ length: N_QP }, (_, i) => ({
  x: i * 0.5,
  y: i * -0.25,
  origIdx: i,
}));
const arena = new WasmArena(new WebAssembly.Memory({ initial: 16 }), 64);
const arenaView = arena.alloc(QpPoint, N_QP);
for (let i = 0; i < N_QP; i++) arenaView.set(i, rawQp[i]);

console.log(
  `\n3) JS <-> WASM Boundary Round-Trip (${N_QP.toLocaleString()} QpPoint structs in WebAssembly.Memory):`,
);

const b3Serde = bench('JSON/serde FFI (stringify + parse + sum)', 20, () => {
  const bytes = new TextEncoder().encode(JSON.stringify(rawQp));
  const decoded = JSON.parse(textDecoder.decode(bytes));
  let sum = 0;
  for (let i = 0; i < decoded.length; i++) sum += decoded[i].x + decoded[i].y;
  return sum;
});

const b3Arena = bench('WasmArena #[repr(C)] zero-copy scan', 20, () => {
  let sum = 0;
  for (const p of arenaView) sum += p.x + p.y;
  return sum;
});

for (const b of [b3Serde, b3Arena]) {
  const speedup = (b3Serde.perIterMs / b.perIterMs).toFixed(1);
  console.log(
    `   - ${b.name.padEnd(38)}: ${b.perIterMs.toFixed(3)} ms/iter (${speedup}x vs JSON/serde FFI)`,
  );
}

// ---------------------------------------------------------------------------
// 4. Web Worker Round-Trip (structuredClone) & Live In-Place String Mutation
// ---------------------------------------------------------------------------
console.log(
  `\n4) Web Worker Round-Trip & Live In-Place Mutation (${N_TELEMETRY.toLocaleString()} Telemetry rows):`,
);

const b4CloneMut = bench('structuredClone (Worker postMessage RT)', 15, () => {
  const workerCopy = structuredClone(rawTelemetry);
  for (let i = 0; i < workerCopy.length; i += 250) {
    workerCopy[i].callsign = 'UPD_999';
  }
  const mainCopy = structuredClone(workerCopy);
  return mainCopy[0].callsign.length;
});

const b4JsonMut = bench('JSON.parse + mutate + JSON.stringify', 20, () => {
  const rows = JSON.parse(textDecoder.decode(jsonTelemetryBytes));
  for (let i = 0; i < rows.length; i += 250) {
    rows[i].callsign = 'UPD_999';
  }
  return new TextEncoder().encode(JSON.stringify(rows)).byteLength;
});

const mutBuf = capnTelemetryBytes.slice();
const mutView = TelemetryRow.array(mutBuf);
const b4CapnMut = bench('capnstruct SharedArrayBuffer in-place', 20, () => {
  const c = mutView.cursor();
  for (let i = 0; i < mutView.length; i += 250) {
    mutView.at(i, c);
    c.callsign = 'UPD_999';
  }
  return mutView.bytes.byteLength;
});

for (const b of [b4CloneMut, b4JsonMut, b4CapnMut]) {
  const speedup = (b4CloneMut.perIterMs / b.perIterMs).toFixed(1);
  console.log(
    `   - ${b.name.padEnd(38)}: ${b.perIterMs.toFixed(3)} ms/iter (${speedup}x vs structuredClone)`,
  );
}
