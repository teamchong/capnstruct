# capnstruct

Zero-copy `#[repr(C)]` binary structs, cyclic object graphs (`ref`), and queryable tables for TypeScript, WebAssembly, Web Workers, and WebGPU. Read and mutate **single binary structs, protocol headers, cyclic AST/graph nodes, `WebAssembly.Memory` arenas, `SharedArrayBuffer` state, and binary tables** in-place with no `JSON.parse` step, no per-row object allocations, and no manual `DataView` byte-offset math.

**Live Documentation & Interactive Browser Playground:** [https://capnstruct.teamchong.net](https://capnstruct.teamchong.net)

## Why `capnstruct`? (Data Layout > Switching JS Engines)

1. **Changing Data Layout Beats Switching JS Engines (Node V8 vs. Bun JSC)**: Switching from Node.js (V8) to Bun (JavaScriptCore) speeds up `JSON.parse` + `.filter()` by **~2.6x**, but still allocates **+6–14 MB of JS heap objects** per call and triggers garbage collection. Switching data layout to `capnstruct` on standard Node.js gives **15x–3,500x speedups** with **0.00 MB of JS heap allocation**.
2. **Circular References & Recursive Schemas (`ref(() => Node)`, `slice(() => Node)`)**: `JSON.stringify` crashes with `TypeError` on circular graphs (`a.next = b; b.next = a`), and V8's `structuredClone` overflows the C++ call stack on deep graphs. `capnstruct` packs cyclic graphs into a flat `Uint8Array` in $O(1)$ stack space, traverses cycles in $O(1)$ with zero allocations, and reconstructs circular JS references via `.toObject()`.
3. **Compiled Property Accessors (No `Proxy`)**: Each `defineStruct()` compiles a view class with prototype getters/setters and pre-allocated V8 property slots so field reads compile down to direct `DataView` loads (**~6.5 KiB minified + gzipped**).
4. **Zero-Allocation Flyweight Iteration & Seeking**: `for (const row of view)` reuses a single cursor instance (`cursor._o += stride`) across millions of rows without allocating per-row JS objects, and `cursor.seek(i)` / `cursor.at(i)` repositions the cursor in $O(1)$.
5. **Zero-Heap Queryable Tables (`.rangeBy()`, `.subarray()`, `.filterBytes()`, `.concatBytes()`)**: Run $O(\log N)$ binary search (`lowerBound`, `upperBound`, `rangeBy`) directly on a sorted binary column (~3,500x faster than `JSON.parse` + `.filter()`), slice zero-copy sub-tables via `.subarray()`, filter matching binary rows without per-row JS objects via `.filterBytes()`, and bulk-merge binary chunks via `.concatBytes()`.
6. **Zero-Indirection Inline Types (`fixedStr`, `fixedBytes`, `f16`, `sentinel`/`nullable`, `scaled`)**: Keep fixed-width ASCII/UTF-8 strings (`fixedStr(N)`), raw byte arrays (`fixedBytes(N)`), IEEE 754 half-floats (`f16`), zero-bit sentinel nulls (`sentinel(i16, -32768)`), and fixed-point numbers (`scaled(i32, 1e6)`) 100% inline inside the `#[repr(C)]` struct with zero tail indirection.
7. **In-Place `str` & `slice(T)` Mutation, Tail-Tip Extension & Bulk `memcpy`**: Assigning `row.callsign = 'NEW'` overwrites in-place in $O(1)$ when `newBytes <= oldBytes`, extends in-place with `0` dead bytes when at the tail tip, or bump-allocates in the tail arena when longer. Assigning a `StructArrayView` or `TypedArray` into `slice(T)` / `fixedArray(T, N)` performs a single bulk `Uint8Array.set()` `memcpy`.
8. **Wire-Safe Pointer Bounds & Amplification Defense**: Clamps `Uint8Array` sub-slice windows so untrusted descriptors cannot bleed into surrounding `ArrayBuffer` memory, validates every `[off, len]` tail pointer against `[structEnd .. bufferEnd]`, and enforces an `8x` traversal budget during `toObject()` / `toObjects()`.
9. **WebAssembly (`WasmArena`) & Rust `#[repr(C)]` Codegen**: Automatically re-binds views when `WebAssembly.Memory.grow()` detaches the buffer, and generates `rustc`-verified Rust `#[repr(C)]` structs (`toRustReprC`) with compile-time `size_of` / `align_of` / `offset_of!` assertions.

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
### 7. Circular References, Self-Referential & Recursive Schemas (`ref` & `slice`)

`JSON.stringify` throws `TypeError: Converting circular structure to JSON` on cyclic references, and `structuredClone` allocates thousands of heap clones (and overflows the C++ stack on deep chains). `ref(() => Struct)` stores an 8-byte relative-offset pointer (`[u32 relOffset, u32 present]`) that packs cyclic JS object graphs without infinite recursion, traverses cycles in $O(1)$ with zero allocations, and reconstructs circular references in `.toObject()` / `.toObjects()`:

```ts
import { defineStruct, u32, str, ref, slice } from 'capnstruct';

const GraphNode: any = defineStruct('GraphNode', {
  id: u32,
  label: str,
  next: ref(() => GraphNode),
  children: slice(() => GraphNode),
});

// Build a circular JS graph: n1 <-> n2 (and n1.children includes n2)
const n1: any = { id: 1, label: 'alpha', next: null, children: [] };
const n2: any = { id: 2, label: 'beta', next: n1, children: [] };
n1.next = n2;
n1.children = [n2];

// Packs the cyclic graph into a single flat Uint8Array without infinite recursion
const bytes = GraphNode.pack([n1, n2]);
const view = GraphNode.array(bytes);

// Zero-allocation O(1) cyclic traversal across arbitrary depth
console.log(view.at(0).next.next.id); // 1

// Cycle-preserving materialization back to circular JS objects
const restored = view.at(0).toObject();
console.log(restored.next.next === restored); // true
```

### 8. Rust `#[repr(C)]` Codegen

Generate matching Rust `#[repr(C)]` structs (`CapnStr`, `CapnSlice<T>`, `CapnRef<T>`) with compile-time layout assertions via the programmatic API or CLI:

```ts
import { toRustReprC } from 'capnstruct/codegen';
import { SpdSample } from './schema.js';

console.log(toRustReprC([SpdSample]));
```

Or via the CLI:

```bash
npx capnstruct ./src/schema.ts -o ./src/schema_generated.rs
```

---
## Data Layout > Switching JS Engines (Architecture & Scaling Proof)

Switching from **Node.js (V8)** to **Bun (JavaScriptCore)** only yields a **~1.3x–2.7x** constant-factor tweak because **both engines are forced to construct the exact same scattered pointer-soup heap graph** whenever you call `JSON.parse()` or `structuredClone()`:

```text
❌ Plain JS Objects in V8 (Node.js) AND JavaScriptCore (Bun):
[Array Backing Store] -> 8B ptr -> [Boxed JSObject Header + HiddenClass/StructureID (24-48B)] -> 8B ptr -> [UTF-8/UTF-16 String Heap Box]
   • Every row = 1..4 separate heap allocations + pointer indirection (CPU L1/L2 cache misses)
   • 25,000–100,000 rows = +5 MB to +14 MB of garbage-collected heap pressure per call (GC frame drops)
   • Circular references (a.next = b; b.next = a) = JSON.stringify crashes with TypeError; deep graphs overflow structuredClone C++ stack

✅ capnstruct Contiguous #[repr(C)] Layout (Same V8 or JSC Engine):
[Row 0: 24B inline #[repr(C)] struct | Row 1: 24B inline | ... | Tail Arena: UTF-8 & slice bytes via [u32 relOffset, u32 len]]
   • 0 per-row JS heap objects allocated (0.00 MB GC pressure)
   • 1 reusable flyweight cursor (`cursor._o += stride`) reads sequentially through CPU L1 cache lines
   • Strings & slices are only decoded on the rows that match your filter; circular `ref(() => Node)` pointers traverse in O(1)
```

Measured on Apple Silicon (`pnpm run bench` on **Node.js v24.15.0 (V8 13.6)** and **Bun v1.4.3 (JavaScriptCore)**, plus `pnpm run size`; see [capnstruct.teamchong.net](https://capnstruct.teamchong.net) for interactive 60 FPS visual proof, scaling curves from `N = 100` to `100,000`, and filter selectivity sweeps from `0.5%` to `100%`):

| Workload | Node.js (V8) Baseline (`ms` / Heap) | Bun (JSC) Baseline (`ms` / Heap) | `capnstruct` Zero-Copy (`ms` / Heap) | Speedup vs. Node / Bun |
| :--- | :--- | :--- | :--- | :--- |
| **Zero-Heap Time-Window Range Query** (`100,000` sorted rows, `JSON.parse` + `.filter()` vs `.rangeBy('id', min, max).bytes`) | 14.08 ms / **+10.33 MB** | 5.28 ms / **+6.38 MB** | **0.0040 ms** / **+0.00 MB** | **~3,520x / ~1,320x faster (0 MB heap)** |
| **Web Worker `postMessage` Round-Trip + Update** (`25,000` `Telemetry` rows: `structuredClone` vs `SharedArrayBuffer` in-place) | 45.00 ms / **+14.24 MB** | 34.13 ms / **+5.73 MB** | **0.054 ms** (Bun: 0.027 ms) / **+0.00 MB** | **~829x–1,275x faster (0 MB heap)** |
| **Sparse Viewport BBox Filter + Lazy UTF-8 Decode** (`25,000` `Flight` Telemetry rows × 13 fields, ~0.4% hit rate) | 12.82 ms / **+8.18 MB** | 6.38 ms / **+5.21 MB** | **0.290 ms** (Bun: 0.269 ms) / **+0.00 MB** | **~44.2x / ~23.7x faster (0 MB heap)** |
| **`100,000` `SpdSample` Numeric Struct Scan** (5.27 MiB JSON vs 2.29 MiB `capnstruct`, `for..of` flyweight cursor) | 13.51 ms / **+10.33 MB** | 5.23 ms / **+6.38 MB** | **0.625 ms** (Bun: 0.530 ms) / **+0.00 MB** | **~21.6x / ~9.9x faster (0 MB heap)** |
| **JS &harr; WASM Boundary Scan** (`25,000` `QpPoint` structs in `WebAssembly.Memory`: `JSON`/`serde` FFI vs `WasmArena`) | 5.02 ms / **+4.23 MB** | 2.09 ms / **+2.59 MB** | **0.338 ms** / **+0.00 MB** | **~14.9x / ~5.4x faster (0 MB heap)** |
| **Cyclic Graph Clone & Traversal** (`10,000` doubly-linked `RingNode`s — `JSON.stringify` throws `TypeError`!) | 3.25 ms (`structuredClone`) / **+1.76 MB** | 2.57 ms (`structuredClone`) / **+0.69 MB** | **0.390 ms** (Bun: 0.343 ms) / **+0.00 MB** | **~8.3x faster (0 MB heap, $O(1)$ stack)** |

| Entrypoint | Minified | Minified + Gzip (`level: 9`) |
| :--- | :--- | :--- |
| **Declarative Schema API (Core Runtime + All Primitives + `ref`)** | 16.79 KiB | **6.51 KiB** (6,665 B) |
| **Full Runtime (+ `WasmArena`)** | 18.53 KiB | **7.02 KiB** (7,186 B) |
| **Rust `#[repr(C)]` Codegen (`capnstruct/codegen`)** | 4.00 KiB | **1.52 KiB** (1,553 B) |
## When to Use `capnstruct` vs. Plain JS Objects

`capnstruct` is not meant to replace small local UI state objects (`{ isOpen: true }`), where V8 escape analysis keeps fields in registers.

| Workload | Best Fit | Reason |
| :--- | :--- | :--- |
| **Small local state (`{ x, y }`)** | **Plain JS Object** | V8 scalar replacement keeps fields in CPU registers with zero heap overhead. |
| **Network / WebSocket / RPC payloads** | **`capnstruct`** | 0 ms parse step; read fields directly from the incoming `Uint8Array` and decode strings lazily. |
| **Web Workers (`postMessage` / `SharedArrayBuffer`)** | **`capnstruct`** | Transfer or share the underlying `ArrayBuffer` in O(1) without `structuredClone` serialization. |
| **Rust / C / Zig WebAssembly (`WebAssembly.Memory`)** | **`capnstruct`** | JS and WASM read and write the same `#[repr(C)]` bytes in linear memory with `WasmArena` auto-rebinding. |
| **Large tables & telemetry streams (10k–10M rows)** | **`capnstruct`** | No per-row JS heap objects; avoids GC pauses and supports in-place mutation + `.column()` extraction. |
