# capnstruct

Read and mutate `Uint8Array` and `WebAssembly.Memory` buffers like plain TypeScript objects. No `JSON.parse` step, no per-row object allocations, and no manual `DataView` byte-offset math.

**Live Documentation & Interactive Browser Playground:** [https://capnstruct.teamchong.net](https://capnstruct.teamchong.net)

## Why `capnstruct`?

When you pass thousands of structured records over `fetch`, a WebSocket, `postMessage` to a Web Worker, or into WebAssembly:

1. **`JSON.stringify` / `JSON.parse` is easy to write, but expensive at scale**: Parsing 100,000 rows allocates 100,000 separate JS objects on the heap and eagerly decodes every UTF-8 string—even if your loop only checks two numbers. Updating a single field requires re-serializing the entire payload.
2. **A `Uint8Array` has zero parse cost, but is painful to use by hand**: Reading a binary buffer directly is fast (`dv.getFloat64(base + i * 24 + 8, true)`), but maintaining manual byte offsets is brittle and gives up normal property assignment (`row.callsign = 'NEW'`) and `.push()` / `.pop()`.

`capnstruct` lets you define a schema once and work with a `Uint8Array` or `WebAssembly.Memory` buffer using ordinary JavaScript syntax (**< 4.5 KiB minified + gzipped**):

- **Compiled Property Accessors (No `Proxy`)**: Each `defineStruct()` compiles a view class with prototype getters/setters and pre-allocated V8 property slots so field reads compile down to direct `DataView` loads.
- **Zero-Allocation Flyweight Iteration**: `for (const row of view)` reuses a single cursor instance (`cursor._o += stride`) across millions of rows without allocating per-row JS objects.
- **In-Place `str` & `slice(T)` Mutation**: Stores 8-byte `[u32 relOffset, u32 len]` descriptors inline and decodes UTF-8 strings or nested slices on demand. Assigning `row.callsign = 'NEW'` overwrites in-place in O(1) when `newBytes <= oldBytes`, or appends to the tail arena when longer.
- **Growable `StructArrayView` (`.push()`, `.pop()`, `.compact()`, `.bytes`)**: Append and remove rows on binary views, inspect tail fragmentation via `view.compactionRatio`, and strip dead tail bytes via `view.compact()`.
- **Columnar `TypedArray` Projections & Schema Evolution**: Extract contiguous `Float64Array`/`Int32Array` columns via `view.column('field')` (zero-copy when stride equals field size) for Apache Arrow / WebGPU / SIMD interop, and read or upgrade older binary buffers with newer schemas.
- **WebAssembly (`WasmArena`) & Rust `#[repr(C)]` Codegen**: Uses standard C/Rust `#[repr(C)]` alignment, automatically re-binds views when `WebAssembly.Memory.grow()` detaches the buffer, and generates `rustc`-verified Rust structs via `capnstruct/codegen` or the `capnstruct` CLI.

## Quick Start

### 1. Define a Schema & Read/Write Zero-Copy Structs

```ts
import {
  defineStruct,
  u32,
  i32,
  f32,
  f64,
  bool,
  fixedArray,
  str,
  slice,
  pack,
} from 'capnstruct';

// Matches Rust #[repr(C)] struct SpdSample { t: u32, _pad0: [u8; 4], val: f64, id: u32, _pad1: [u8; 4] }
export const SpdSample = defineStruct('SpdSample', {
  t: u32,     // offset 0, size 4
  val: f64,   // offset 8, size 8 (auto-aligned to 8 bytes)
  id: u32,    // offset 16, size 4
});
// SpdSample.size === 24, SpdSample.align === 8

// Pack plain JS objects into a contiguous 8-byte-aligned Uint8Array
const bytes = pack(SpdSample, [
  { t: 100, val: 42.5, id: 1 },
  { t: 200, val: 99.0, id: 2 },
]);

// Wrap any Uint8Array / ArrayBuffer / WebAssembly.Memory without copying
const samples = SpdSample.array(bytes);

// Random access with JSON-like ergonomics
const first = samples.at(0);
console.log(first.t, first.val, first.id); // 100, 42.5, 1
console.log({ ...first });                 // { t: 100, val: 42.5, id: 1 }
console.log(JSON.stringify(first));        // '{"t":100,"val":42.5,"id":1}'

// Zero-allocation flyweight iteration over millions of rows
let sum = 0;
for (const row of samples) {
  sum += row.val;
}
```

### 2. Variable-Length Strings (`str`) & Nested Slices (`slice`)

Variable-length fields use an 8-byte inline relative descriptor (`[u32 relOffsetFromStructBase, u32 length]`) pointing into the buffer's tail arena. Numeric filters never touch or decode string bytes until `row.callsign` is read:

```ts
import { defineStruct, u32, f32, str, slice, pack } from 'capnstruct';

const Waypoint = defineStruct('Waypoint', {
  lat: f32,
  lon: f32,
});

const FlightRow = defineStruct('FlightRow', {
  id: u32,
  lat: f32,
  lon: f32,
  callsign: str,
  waypoints: slice(Waypoint),
});

const packet = pack(FlightRow, [
  {
    id: 101,
    lat: 37.6188,
    lon: -122.375,
    callsign: 'SFO_101',
    waypoints: [
      { lat: 37.6188, lon: -122.375 },
      { lat: 35.6762, lon: 139.6503 },
    ],
  },
]);

// Recover the StructArrayView directly from the packed Uint8Array (O(1) row count recovery)
const flights = FlightRow.array(packet);

for (const flight of flights) {
  // Fast numeric check; `callsign` UTF-8 bytes are only decoded on match
  if (flight.lat > 37.0 && flight.lon < -122.0) {
    console.log(flight.callsign, flight.waypoints.at(1).lat);
  }
}
```

### 3. `WasmArena` & `WebAssembly.Memory` Auto-Rebinding

```ts
import { WasmArena, defineStruct, u32, f32 } from 'capnstruct';

const QpPoint = defineStruct('QpPoint', {
  x: f32,
  y: f32,
  origIdx: u32,
});

const wasmMemory = new WebAssembly.Memory({ initial: 1 }); // 64 KiB
const arena = new WasmArena(wasmMemory, 64);

const points = arena.alloc(QpPoint, 1000);
points.at(0).set({ x: 1.5, y: -2.5, origIdx: 7 });

// Even if WASM or the arena grows WebAssembly.Memory (detaching the old ArrayBuffer),
// existing `points` and `StructView` instances automatically re-bind to the new buffer!
arena.ensureCapacity(512 * 1024);
console.log(points.at(0).x); // 1.5
```

### 4. Live Mutation (`str` / `slice`), Growable `StructArrayView` & Compaction

```ts
import { defineStruct, u32, f64, str, slice } from 'capnstruct';

const Metric = defineStruct('Metric', {
  ts: u32,
  val: f64,
  tag: str,
   buckets: slice(u32),
});

// Start with an empty or packed StructArrayView and push/pop like a normal JS array
const metrics = Metric.alloc(0);
metrics.push(
  { ts: 100, val: 1.25, tag: 'cpu', buckets: [10, 20] },
  { ts: 200, val: 2.5, tag: 'mem', buckets: [30, 40, 50] },
);

// Shorter or equal-length string/slice updates overwrite in-place (0 allocations)
metrics.at(0).tag = 'gpu';

// Longer strings/slices automatically bump-allocate in the tail arena
metrics.at(0).tag = 'cluster-node-01-gpu-telemetry';

// Accessing `.bytes` (or calling `.compact()`) strips dead tail bytes for clean wire transfer
const wireBytes = metrics.bytes;
```

### 5. Columnar `TypedArray` Projections & Cap'n-Style Schema Evolution

```ts
import { defineStruct, u32, f64, str, pack } from 'capnstruct';

// Columnar projection for Apache Arrow / DuckDB / WebGPU / SIMD interop
const PointV1 = defineStruct('PointV1', { x: f64, y: f64 });
const PointV2 = defineStruct('PointV2', { x: f64, y: f64, z: f64, label: str });

const v1Bytes = pack(PointV1, [
  { x: 1.5, y: 2.5 },
  { x: 3.5, y: 4.5 },
]);

// Read older V1 binary buffer through newer V2 schema (fields beyond V1 stride default to 0 / "")
const v2View = PointV2.array(v1Bytes, PointV1);
console.log(v2View.at(0).toObject()); // { x: 1.5, y: 2.5, z: 0, label: "" }

// Extract a contiguous Float64Array column across all rows (or bulk-update via .setColumn())
const xColumn: Float64Array = v2View.column('x');
v2View.setColumn('z', [10.0, 20.0]); // Auto-upgrades buffer to V2 stride on mutation
```

### 6. Rust `#[repr(C)]` Code Generation

Generate matching Rust `#[repr(C)]` structs (`CapnStr`, `CapnSlice<T>`, padding fields, and compile-time `offset_of!` / `size_of` / `align_of` assertions) via the programmatic API or CLI:

```ts
import { toRustReprC } from 'capnstruct/codegen';
import { SpdSample } from './schema.js';

console.log(toRustReprC([SpdSample]));
```

Or via the CLI:

```bash
npx capnstruct ./src/schema.ts -o ./src/schema_generated.rs
```

Generated Rust output:

```rust
#[repr(C)]
#[derive(Copy, Clone, Debug)]
pub struct SpdSample {
    pub t: u32,
    pub _pad0: [u8; 4],
    pub val: f64,
    pub id: u32,
    pub _pad1: [u8; 4],
}

const _: () = {
    assert!(core::mem::size_of::<SpdSample>() == 24);
    assert!(core::mem::align_of::<SpdSample>() == 8);
    assert!(core::mem::offset_of!(SpdSample, t) == 0);
    assert!(core::mem::offset_of!(SpdSample, val) == 8);
    assert!(core::mem::offset_of!(SpdSample, id) == 16);
};
```

---

## Benchmarks & Bundle Size

Measured on Node.js (`pnpm run bench` and `pnpm run size`):

| Benchmark Scenario | Baseline (`JSON` / `structuredClone`) | `capnstruct` Zero-Copy | Speedup |
| :--- | ---: | ---: | ---: |
| **Web Worker `postMessage` Round-Trip + Update** (25,000 Telemetry rows: `structuredClone` vs `SharedArrayBuffer` in-place) | 47.13 ms | **0.039 ms** | **1,206x faster** |
| **Live In-Place `str` Mutation** (25,000 Telemetry rows vs `JSON.parse` + `JSON.stringify` round-trip) | 30.61 ms | **0.039 ms** | **784x faster** |
| **Sparse Viewport BBox Filter + Lazy UTF-8 Decode** (25,000 Flight Telemetry rows × 13 fields) | 13.71 ms | **0.289 ms** | **47.4x faster** |
| **100,000 `SpdSample` Numeric Struct Scan** (`for..of` flyweight cursor, 0 heap allocs) | 13.99 ms | **0.508 ms** | **27.5x faster** |
| **JS &harr; WASM Boundary Scan** (25,000 `QpPoint` structs in `WebAssembly.Memory`: `JSON`/serde FFI vs `WasmArena`) | 5.38 ms | **0.345 ms** | **15.6x faster** |

| Entrypoint | Minified | Minified + Gzip (`level: 9`) |
| :--- | :---: | :---: |
| **Declarative Schema API (Core Runtime)** | 11.81 KiB | **4.46 KiB** (4,568 B) |
| **Full Runtime (+ `WasmArena`)** | 13.55 KiB | **4.97 KiB** (5,086 B) |
| **Rust `#[repr(C)]` Codegen (`capnstruct/codegen`)** | 2.36 KiB | **1.06 KiB** (1,082 B) |

---

## When to Use `capnstruct` vs. Plain JS Objects

`capnstruct` is not meant to replace small local UI state objects (`{ isOpen: true }`), where V8 escape analysis keeps fields in registers.

| Workload | Best Fit | Reason |
| :--- | :--- | :--- |
| **Small local state (`{ x, y }`)** | **Plain JS Object** | V8 scalar replacement keeps fields in CPU registers with zero heap overhead. |
| **Network / WebSocket / RPC payloads** | **`capnstruct`** | 0 ms parse step; read fields directly from the incoming `Uint8Array` and decode strings lazily. |
| **Web Workers (`postMessage` / `SharedArrayBuffer`)** | **`capnstruct`** | Transfer or share the underlying `ArrayBuffer` in O(1) without `structuredClone` serialization. |
| **Rust / C / Zig WebAssembly (`WebAssembly.Memory`)** | **`capnstruct`** | JS and WASM read and write the same `#[repr(C)]` bytes in linear memory with `WasmArena` auto-rebinding. |
| **Large tables & telemetry streams (10k–10M rows)** | **`capnstruct`** | No per-row JS heap objects; avoids GC pauses and supports in-place mutation + `.column()` extraction. |
