# capnstruct

Read and mutate `Uint8Array` and `WebAssembly.Memory` buffers like plain TypeScript objects. No `JSON.parse` step, no per-row object allocations, and no manual `DataView` byte-offset math.

**Live Documentation & Interactive Browser Playground:** [https://capnstruct.teamchong.net](https://capnstruct.teamchong.net)

## Why `capnstruct`?

When you pass thousands of structured records over `fetch`, a WebSocket, `postMessage` to a Web Worker, or into WebAssembly:

1. **`JSON.stringify` / `JSON.parse` is easy to write, but expensive at scale**: Parsing 100,000 rows allocates 100,000 separate JS objects on the heap and eagerly decodes every UTF-8 string—even if your loop only checks two numbers. Updating a single field requires re-serializing the entire payload.
2. **A `Uint8Array` has zero parse cost, but is painful to use by hand**: Reading a binary buffer directly is fast (`dv.getFloat64(base + i * 24 + 8, true)`), but maintaining manual byte offsets is brittle and gives up normal property assignment (`row.callsign = 'NEW'`) and `.push()` / `.pop()`.

`capnstruct` lets you define a schema once and work with a `Uint8Array` or `WebAssembly.Memory` buffer using ordinary JavaScript syntax (**< 5.8 KiB minified + gzipped**):

- **Compiled Property Accessors (No `Proxy`)**: Each `defineStruct()` compiles a view class with prototype getters/setters and pre-allocated V8 property slots so field reads compile down to direct `DataView` loads.
- **Zero-Allocation Flyweight Iteration & Seeking**: `for (const row of view)` reuses a single cursor instance (`cursor._o += stride`) across millions of rows without allocating per-row JS objects, and `cursor.seek(i)` / `cursor.at(i)` repositions the cursor in $O(1)$.
- **Zero-Heap Queryable Tables (`.rangeBy()`, `.subarray()`, `.filterBytes()`, `.concatBytes()`)**: Run $O(\log N)$ binary search (`lowerBound`, `upperBound`, `rangeBy`) directly on a sorted binary column (~5,000x faster than `JSON.parse` + `.filter()`), slice zero-copy sub-tables via `.subarray()`, filter matching binary rows without per-row JS objects via `.filterBytes()`, and bulk-merge binary chunks via `.concatBytes()`.
- **Zero-Indirection Inline Types (`fixedStr`, `fixedBytes`, `f16`, `sentinel`/`nullable`, `scaled`)**: Keep fixed-width ASCII/UTF-8 strings (`fixedStr(N)`), raw byte arrays (`fixedBytes(N)`), IEEE 754 half-floats (`f16`), zero-bit sentinel nulls (`sentinel(i16, -32768)`), and fixed-point numbers (`scaled(i32, 1e6)`) 100% inline inside the `#[repr(C)]` struct with zero tail indirection.
- **In-Place `str` & `slice(T)` Mutation, Tail-Tip Extension & Bulk `memcpy`**: Assigning `row.callsign = 'NEW'` overwrites in-place in `O(1)` when `newBytes <= oldBytes`, extends in-place with `0` dead bytes when at the tail tip, or bump-allocates in the tail arena when longer. Assigning a `StructArrayView` or `TypedArray` into `slice(T)` / `fixedArray(T, N)` performs a single bulk `Uint8Array.set()` `memcpy`.
- **Wire-Safe Pointer Bounds & Amplification Defense**: Clamps `Uint8Array` sub-slice windows so untrusted descriptors cannot bleed into surrounding `ArrayBuffer` memory, validates every `[off, len]` tail pointer against `[structEnd .. bufferEnd]`, and enforces an `8x` traversal budget during `toObject()` / `toObjects()`.
- **WebAssembly (`WasmArena`) & Multi-Target Codegen (Rust `#[repr(C)]`, C11/Zig Header, WebGPU WGSL)**: Automatically re-binds views when `WebAssembly.Memory.grow()` detaches the buffer, and generates `rustc`-verified Rust structs (`toRustReprC`), `clang`-verified C11/Zig headers (`toCHeader`), and WebGPU WGSL shader structs with bitfield unpack helpers (`toWgsl`).
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
// Accessing .bytes (or calling .compact()) on any StructView or StructArrayView
// automatically strips dead tail bytes for clean wire transfer
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

### 6. Zero-Heap Queryable Tables & Inline Fixed-Width Types

```ts
import { defineStruct, u32, i32, i16, f16, fixedStr, sentinel, scaled } from 'capnstruct';

const TrackPoint = defineStruct('TrackPoint', {
  ts: u32,
  icao: fixedStr(6),                      // inline [u8; 6] string (0 tail pointers)
  lat: scaled(i32, 1e6),                  // stores compact i32, reads/writes float degrees
  lon: scaled(i32, 1e6),
  alt: sentinel(i16, -32768),             // -32768 on wire <-> null in JS (0 extra bytes)
   snr: f16,                              // 2-byte IEEE 754 Float16
});

const table = TrackPoint.array(
  TrackPoint.pack([
    { ts: 1000, icao: 'a8b2c3', lat: 37.7749, lon: -122.4194, alt: null, snr: 12.5 },
    { ts: 2000, icao: 'a8b2c3', lat: 37.7801, lon: -122.4102, alt: 3500, snr: 15.0 },
    { ts: 3000, icao: 'ff0011', lat: 51.4700, lon: -0.4543, alt: 1200, snr: 9.25 },
  ]),
);

// O(log N) binary search time-window slice (0 JS objects allocated, zero-copy subarray)
const windowView = table.rangeBy('ts', 1500, 2500);
console.log(windowView.length, windowView.at(0).alt); // 1, 3500

// Zero-heap binary filtering -> tight Uint8Array ready for WebSocket / Worker transfer
const highAltBytes = table.filterBytes((row) => row.alt !== null && row.alt > 2000);
```

### 7. Multi-Target Codegen: Rust `#[repr(C)]`, C11/Zig Header & WebGPU WGSL

Generate matching Rust `#[repr(C)]` structs (`toRustReprC`), C11/C++/Zig headers with `_Static_assert` (`toCHeader`), or WebGPU WGSL shader structs with bitfield unpack helpers (`toWgsl`) via the programmatic API or CLI:

```ts
import { toRustReprC, toCHeader, toWgsl } from 'capnstruct/codegen';
import { SpdSample } from './schema.js';

console.log(toRustReprC([SpdSample]));
console.log(toCHeader([SpdSample]));
console.log(toWgsl([SpdSample]));
```

Or via the CLI (`--rust`, `--c`, `--wgsl` or inferred from `.rs` / `.h` / `.wgsl` extension):

```bash
npx capnstruct ./src/schema.ts -o ./src/schema_generated.rs
npx capnstruct ./src/schema.ts -o ./src/schema_generated.h
npx capnstruct ./src/schema.ts -o ./src/schema_generated.wgsl
```

---

## Benchmarks & Bundle Size

Measured on Node.js (`pnpm run bench` and `pnpm run size`):

| Benchmark Scenario | Baseline (`JSON` / `structuredClone`) | `capnstruct` Zero-Copy | Speedup |
| :--- | :---: | :---: | :---: |
| **Zero-Heap Time-Window Range Query** (100,000 sorted rows: `JSON.parse` + `.filter()` vs `.rangeBy('id', min, max).bytes`) | 14.01 ms | **0.0027 ms** | **~5,115x faster** |
| **Web Worker `postMessage` Round-Trip + Update** (25,000 Telemetry rows: `structuredClone` vs `SharedArrayBuffer` in-place) | 45.67 ms | **0.039 ms** | **~1,157x faster** |
| **Live In-Place `str` Mutation** (25,000 Telemetry rows vs `JSON.parse` + `JSON.stringify` round-trip) | 30.21 ms | **0.039 ms** | **~774x faster** |
| **Sparse Viewport BBox Filter + Lazy UTF-8 Decode** (25,000 Flight Telemetry rows × 13 fields) | 13.29 ms | **0.287 ms** | **~46.3x faster** |
| **100,000 `SpdSample` Numeric Struct Scan** (`for..of` flyweight cursor, 0 heap allocs) | 13.77 ms | **0.536 ms** | **~25.7x faster** |
| **JS &harr; WASM Boundary Scan** (25,000 `QpPoint` structs in `WebAssembly.Memory`: `JSON`/serde FFI vs `WasmArena`) | 5.10 ms | **0.308 ms** | **~16.6x faster** |

| Entrypoint | Minified | Minified + Gzip (`level: 9`) |
| :--- | :---: | :---: |
| **Declarative Schema API (Core Runtime + All Primitives)** | 14.82 KiB | **5.77 KiB** (5,905 B) |
| **Full Runtime (`+ WasmArena`)** | 16.55 KiB | **6.27 KiB** (6,424 B) |
| **Multi-Target Codegen (`capnstruct/codegen`: Rust + C11 + WGSL)** | 7.10 KiB | **2.75 KiB** (2,819 B) |
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
