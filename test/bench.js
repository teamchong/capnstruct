import { performance } from 'node:perf_hooks';
import {
  WasmArena,
  defineStruct,
  f32,
  f64,
  i32,
  pack,
  ref,
  slice,
  str,
  u16,
  u32,
  u64,
} from '../dist/index.js';

const runtimeName =
  typeof Bun !== 'undefined'
    ? `Bun v${Bun.version} (JavaScriptCore)`
    : `Node.js ${process.version} (V8 ${process.versions.v8})`;

function forceGc() {
  if (typeof Bun !== 'undefined' && typeof Bun.gc === 'function') Bun.gc(true);
  else if (typeof globalThis.gc === 'function') globalThis.gc();
}

function measureHeapDeltaMB(fn) {
  globalThis.__held = null;
  forceGc();
  const before = process.memoryUsage().heapUsed;
  globalThis.__held = fn();
  if (typeof Bun !== 'undefined' && typeof Bun.gc === 'function') Bun.gc(true);
  const after = process.memoryUsage().heapUsed;
  const deltaMB = Math.max(0, (after - before) / (1024 * 1024));
  globalThis.__held = null;
  return deltaMB;
}

function bench(name, iterations, fn, heapFn) {
  // Warmup
  for (let i = 0; i < Math.min(5, iterations); i++) fn();
  const heapMB = heapFn ? measureHeapDeltaMB(heapFn) : null;
  forceGc();
  const start = performance.now();
  let checksum = 0;
  for (let i = 0; i < iterations; i++) {
    checksum += Number(fn()) || 0;
  }
  const elapsedMs = performance.now() - start;
  const perIterMs = elapsedMs / iterations;
  return { name, elapsedMs, perIterMs, heapMB, checksum };
}

console.log(`=== capnstruct Zero-Copy & Heap Layout Benchmark [${runtimeName}] ===\n`);
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

const b1Json = bench(
  'JSON.parse + iterate',
  20,
  () => {
    const arr = JSON.parse(textDecoder.decode(jsonSamplesBytes));
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      const r = arr[i];
      sum += r.x + r.y + r.val;
    }
    return sum;
  },
  () => JSON.parse(textDecoder.decode(jsonSamplesBytes)),
);

const b1CapnForOf = bench(
  'capnstruct for..of (0 allocs)',
  20,
  () => {
    let sum = 0;
    for (const r of capnSamplesView) {
      sum += r.x + r.y + r.val;
    }
    return sum;
  },
  () => SpdSample.array(capnSamplesBytes),
);

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
  const heapStr = b.heapMB !== null ? ` | Heap Delta: +${b.heapMB.toFixed(2)} MB` : '';
  console.log(
    `   - ${b.name.padEnd(32)}: ${b.perIterMs.toFixed(3)} ms/iter (${speedup}x vs JSON.parse)${heapStr}`,
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

const b2Json = bench(
  'JSON.parse + bbox filter',
  20,
  () => {
    const rows = JSON.parse(textDecoder.decode(jsonTelemetryBytes));
    let matchedChars = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.lat > 41.95 && r.lon > -117.05) {
        matchedChars += r.callsign.length;
      }
    }
    return matchedChars;
  },
  () => JSON.parse(textDecoder.decode(jsonTelemetryBytes)),
);

const b2Capn = bench(
  'capnstruct zero-copy filter',
  20,
  () => {
    const rows = TelemetryRow.array(capnTelemetryBytes);
    let matchedChars = 0;
    for (const r of rows) {
      if (r.lat > 41.95 && r.lon > -117.05) {
        matchedChars += r.callsign.length;
      }
    }
    return matchedChars;
  },
  () => TelemetryRow.array(capnTelemetryBytes),
);

for (const b of [b2Json, b2Capn]) {
  const speedup = (b2Json.perIterMs / b.perIterMs).toFixed(1);
  const heapStr = b.heapMB !== null ? ` | Heap Delta: +${b.heapMB.toFixed(2)} MB` : '';
  console.log(
    `   - ${b.name.padEnd(32)}: ${b.perIterMs.toFixed(3)} ms/iter (${speedup}x vs JSON.parse)${heapStr}`,
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

const b4CloneMut = bench(
  'structuredClone (Worker postMessage RT)',
  15,
  () => {
    const workerCopy = structuredClone(rawTelemetry);
    for (let i = 0; i < workerCopy.length; i += 250) {
      workerCopy[i].callsign = 'UPD_999';
    }
    const mainCopy = structuredClone(workerCopy);
    return mainCopy[0].callsign.length;
  },
  () => structuredClone(rawTelemetry),
);

const b4JsonMut = bench(
  'JSON.parse + mutate + JSON.stringify',
  20,
  () => {
    const rows = JSON.parse(textDecoder.decode(jsonTelemetryBytes));
    for (let i = 0; i < rows.length; i += 250) {
      rows[i].callsign = 'UPD_999';
    }
    return new TextEncoder().encode(JSON.stringify(rows)).byteLength;
  },
  () => JSON.parse(textDecoder.decode(jsonTelemetryBytes)),
);

const mutBuf = capnTelemetryBytes.slice();
const mutView = TelemetryRow.array(mutBuf);
const b4CapnMut = bench(
  'capnstruct SharedArrayBuffer in-place',
  20,
  () => {
    const c = mutView.cursor();
    for (let i = 0; i < mutView.length; i += 250) {
      c.seek(i).callsign = 'UPD_999';
    }
    return mutView.bytes.byteLength;
  },
  () => TelemetryRow.array(mutBuf),
);

for (const b of [b4CloneMut, b4JsonMut, b4CapnMut]) {
  const speedup = (b4CloneMut.perIterMs / b.perIterMs).toFixed(1);
  const heapStr = b.heapMB !== null ? ` | Heap Delta: +${b.heapMB.toFixed(2)} MB` : '';
  console.log(
    `   - ${b.name.padEnd(38)}: ${b.perIterMs.toFixed(3)} ms/iter (${speedup}x vs structuredClone)${heapStr}`,
  );
}

// ---------------------------------------------------------------------------
// 5. Zero-Heap Queryable Table: Binary Search Range Slicing (.rangeBy)
// ---------------------------------------------------------------------------
console.log(
  `\n5) Zero-Heap Time-Window Range Query (${N_SAMPLES.toLocaleString()} sorted SpdSample rows, 1% window):`,
);

const b5JsonFilter = bench(
  'JSON.parse + .filter() + JSON.stringify',
  20,
  () => {
    const rows = JSON.parse(textDecoder.decode(jsonSamplesBytes));
    const win = rows.filter((r) => r.id >= 50_000 && r.id <= 50_999);
    return new TextEncoder().encode(JSON.stringify(win)).byteLength;
  },
  () => {
    const rows = JSON.parse(textDecoder.decode(jsonSamplesBytes));
    return [rows, rows.filter((r) => r.id >= 50_000 && r.id <= 50_999)];
  },
);

const b5CapnRange = bench(
  'capnstruct .rangeBy("id", min, max).bytes',
  20,
  () => {
    return capnSamplesView.rangeBy('id', 50_000, 50_999).bytes.byteLength;
  },
  () => capnSamplesView.rangeBy('id', 50_000, 50_999).bytes,
);

for (const b of [b5JsonFilter, b5CapnRange]) {
  const speedup = (b5JsonFilter.perIterMs / b.perIterMs).toFixed(1);
  const heapStr = b.heapMB !== null ? ` | Heap Delta: +${b.heapMB.toFixed(2)} MB` : '';
  console.log(
    `   - ${b.name.padEnd(42)}: ${b.perIterMs.toFixed(4)} ms/iter (${speedup}x vs JSON.parse + .filter)${heapStr}`,
  );
}

// ---------------------------------------------------------------------------
// 6. Cyclic Graph Traversal & Clone (10,000 Doubly-Linked Ring Nodes)
// ---------------------------------------------------------------------------
const N_RING = 10_000;
const RING_CLUSTER = 50; // 200 cyclic rings of 50 nodes (V8 structuredClone overflows C++ call stack above ~1,000 hop depth; capnstruct packs any depth in O(1) stack)
const RingNode = defineStruct('RingNode', {
  id: u32,
  weight: f64,
  next: ref(() => RingNode),
  prev: ref(() => RingNode),
});

const jsRing = Array.from({ length: N_RING }, (_, i) => ({
  id: i,
  weight: i * 1.25,
  next: null,
  prev: null,
}));
for (let i = 0; i < N_RING; i++) {
  const base = Math.floor(i / RING_CLUSTER) * RING_CLUSTER;
  const off = i % RING_CLUSTER;
  jsRing[i].next = jsRing[base + ((off + 1) % RING_CLUSTER)];
  jsRing[i].prev = jsRing[base + ((off + RING_CLUSTER - 1) % RING_CLUSTER)];
}

const capnRingBytes = RingNode.pack(jsRing);

console.log(
  `\n6) Cyclic Graph Clone & Traversal (${N_RING.toLocaleString()} Doubly-Linked Ring Nodes — JSON.stringify throws TypeError!):`,
);

const b6CloneRing = bench(
  'structuredClone(cyclicRing) + traverse',
  20,
  () => {
    const cloned = structuredClone(jsRing);
    let sum = 0;
    for (let c = 0; c < N_RING; c += RING_CLUSTER) {
      let cur = cloned[c];
      for (let j = 0; j < RING_CLUSTER; j++) {
        sum += cur.weight;
        cur = cur.next;
      }
    }
    return sum;
  },
  () => structuredClone(jsRing),
);

const b6CapnRing = bench(
  'capnstruct ref(() => RingNode) zero-copy',
  20,
  () => {
    const view = RingNode.array(capnRingBytes);
    let sum = 0;
    for (let c = 0; c < N_RING; c += RING_CLUSTER) {
      let cur = view.cursor(c);
      for (let j = 0; j < RING_CLUSTER; j++) {
        sum += cur.weight;
        cur = cur.next;
      }
    }
    return sum;
  },
  () => RingNode.array(capnRingBytes),
);

for (const b of [b6CloneRing, b6CapnRing]) {
  const speedup = (b6CloneRing.perIterMs / b.perIterMs).toFixed(1);
  const heapStr = b.heapMB !== null ? ` | Heap Delta: +${b.heapMB.toFixed(2)} MB` : '';
  console.log(
    `   - ${b.name.padEnd(42)}: ${b.perIterMs.toFixed(3)} ms/iter (${speedup}x vs structuredClone)${heapStr}`,
  );
}
