# capnstruct

Zero-dependency TypeScript/JavaScript library providing **JSON-like ergonomics over zero-copy linear binary buffers** (`Uint8Array` / `WebAssembly.Memory`) and C/Rust `#[repr(C)]` WASM structs.

**Live Documentation & Interactive Browser Playground:** [https://capnstruct.teamchong.net](https://capnstruct.teamchong.net)

## Why `capnstruct`?

Sharing structured data between JavaScript, Web Workers, Cap'n Web zero-copy byte streams, and Rust/C WebAssembly kernels usually forces an unpleasant choice:

1. **JSON (`JSON.stringify` / `JSON.parse`)**: Ergonomic (`row.lat`, `row.callsign`, `{ ...row }`), but allocates millions of short-lived JS objects and eagerly decodes every UTF-8 string even if your filter only touches 2 numeric fields.
2. **Manual `DataView` / `Int32Array` pointer arithmetic**: Zero-copy and fast (`dv.getFloat64(base + i * 24 + 8, true)`), but brittle, untyped, and requires manually synchronizing byte offsets and alignment padding with Rust `#[repr(C)]` structs.

`capnstruct` bridges the gap in **< 4.5 KiB minified + gzipped**:

- **Declarative Schema API**: Define structs once with `defineStruct({ ... })` (`u8`..`u64`, `i8`..`i64`, `f32`, `f64`, `bool`, `fixedArray`, `str`, `slice`) and get automatic C/Rust `#[repr(C)]` alignment, padding, field offsets, and full static TypeScript inference.
- **Compiled V8 Monomorphic Accessors (No `Proxy`)**: Each `defineStruct()` compiles a specialized view class with prototype/own getters & setters and pre-allocated V8 fast-property slots so TurboFan inlines field reads directly into `DataView` loads.
- **Zero-Allocation Flyweight Iteration**: `for (const row of view)` reuses a single flyweight cursor (`cursor._o += stride`) across millions of rows with **zero JS heap allocations**.
- **Mutable Variable-Length `str` & `slice(T)`**: Stores compact `[u32 relOffset, u32 len]` descriptors inline and lazily decodes UTF-8 or nested slices from the tail arena. Assigning `row.callsign = 'NEW'` overwrites in-place in $O(1)$ if it fits, or automatically bump-allocates in the backing tail/arena when longer.
- **Growable `StructArrayView` (`.push()`, `.pop()`, `.compact()`, `.bytes`)**: Mutate and append rows to binary views like normal JS arrays, check fragmentation via `view.compactionRatio`, and strip dead tail bytes via `view.compact()`.
- **Columnar `TypedArray` Projections & Cap'n-Style Schema Evolution**: Extract contiguous `Float64Array`/`Int32Array` columns via `view.column('field')` (zero-copy when stride matches field size) for Apache Arrow / WebGPU / SIMD interop, and safely read/upgrade older binary buffers with newer schemas.
- **`WasmArena` Auto-Rebinding**: Bump-allocate typed struct slices inside a growable `WebAssembly.Memory`; if `memory.grow()` detaches the underlying `ArrayBuffer`, existing `StructView` and `StructArrayView` instances automatically re-bind on access.
- **Rust `#[repr(C)]` Codegen & CLI**: Emit matching Rust `#[repr(C)] #[derive(Copy, Clone)]` structs and `core::mem::{size_of, align_of, offset_of}` compile-time layout assertions directly from your JS/TS schemas.
---

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

// Matches Rust #[repr(C)] struct SpdSample { t: u32, _pad: u32, val: f64, id: u32, _trail: u32 }
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

| Benchmark Scenario | `JSON.parse` / `JSON.stringify` | `capnstruct` Zero-Copy | Speedup |
| :--- | ---: | ---: | ---: |
| **100,000 `SpdSample` Numeric Struct Scan** (`for..of` flyweight cursor, 0 heap allocs) | 13.92 ms | **0.51 ms** | **27.1x faster** |
| **25,000 Flight Telemetry Rows (13 fields)** Sparse BBox Filter + Lazy String Decode | 13.45 ms | **0.28 ms** | **48.8x faster** |
| **25,000 Flight Telemetry Rows** Live In-Place `str` Mutation vs JSON Round-Trip | 30.28 ms | **0.039 ms** | **767.8x faster** |

| Entrypoint | Minified | Minified + Gzip (`level: 9`) | Dependencies |
| :--- | ---: | ---: | :--- |
| **Declarative Schema API (Core Runtime)** | 11.60 KiB | **4.41 KiB** (4,520 B) | `0` |
| **Full Runtime (+ `WasmArena`)** | 13.34 KiB | **4.92 KiB** (5,037 B) | `0` |
| **Rust `#[repr(C)]` Codegen (`capnstruct/codegen`)** | 2.36 KiB | **1.06 KiB** (1,082 B) | `0` |
