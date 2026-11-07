---
title: Design & Tradeoffs
description: Why changing data layout in JS/TS beats switching JS engines (Node V8 vs Bun JSC), plus comparisons against JSON, Manual DataView, Apache Arrow, FlatBuffers, and Cap'n Proto.
---

## Why Data Layout Beats Switching JS Engines (Node.js V8 vs. Bun JSC)

When a JavaScript or TypeScript service hits a serialization, IPC, or memory wall, a common impulse is to switch runtimes—from **Node.js (V8)** to **Bun (JavaScriptCore)**—or rewrite hot paths in another language.

Running the exact same benchmark suite on **Node.js v24.15.0 (V8)** and **Bun v1.4.3 (JSC)** reveals why engine-hopping only yields a constant-factor tweak, whereas **changing the data layout** yields order-of-magnitude gains:

| Workload | Node.js (V8) Plain JS / JSON | Bun (JSC) Plain JS / JSON | Engine Switch Gain | `capnstruct` Binary Layout (Node.js) | Data Layout Gain |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **100k Sorted Range Query** | 14.08 ms (**+10.33 MB** heap) | 5.28 ms (**+6.38 MB** heap) | 2.6x | **0.0040 ms** (**+0.00 MB** heap) | **3,520x faster, 0 MB heap** |
| **25k Worker `postMessage` + Mutate** | 45.00 ms (**+14.24 MB** heap) | 34.13 ms (**+5.73 MB** heap) | 1.3x | **0.054 ms** (**+0.00 MB** heap) | **829x faster, 0 MB heap** |
| **25k Sparse BBox Filter (13 fields)** | 12.82 ms (**+8.18 MB** heap) | 6.38 ms (**+5.21 MB** heap) | 2.0x | **0.290 ms** (**+0.00 MB** heap) | **44.2x faster, 0 MB heap** |
| **100k Numeric Struct Scan** | 13.51 ms (**+10.33 MB** heap) | 5.23 ms (**+6.38 MB** heap) | 2.6x | **0.625 ms** (**+0.00 MB** heap) | **21.6x faster, 0 MB heap** |
| **10k Cyclic Graph Clone & Traverse** | 3.25 ms (**+1.76 MB** heap, `JSON` throws) | 2.57 ms (**+0.69 MB** heap, `JSON` throws) | 1.3x | **0.390 ms** (**+0.00 MB** heap) | **8.3x faster, 0 MB heap** |

Both V8 and JavaScriptCore must allocate a boxed heap header, hidden class/Structure ID, and out-of-line property storage for every object returned by `JSON.parse()` or `structuredClone()`. With `capnstruct`, your data stays in a contiguous `#[repr(C)]` `Uint8Array` / `SharedArrayBuffer` / `WebAssembly.Memory` arena, so both V8 and JSC execute direct monomorphic `DataView` loads with **zero heap allocations**.

---

## Design Tradeoffs in JS Binary Formats

Libraries like **Apache Arrow (`apache-arrow`)**, **FlatBuffers**, and **Cap'n Proto** are designed for large-scale cross-language analytics or multi-segment RPC, which leads to different tradeoffs when used in everyday JavaScript and WebAssembly applications:

| Area | Typical Binary Format Tradeoff (`apache-arrow` / FlatBuffers) | How `capnstruct` Approaches It |
| :--- | :--- | :--- |
| **1. Mutability & Querying** | Buffers are generally read-only once built. Updating a field or querying a time window requires unpacking into JS objects or rebuilding a `RecordBatch`. | **In-Place Mutation + Zero-Heap Querying**: Primitives mutate in-place in `O(1)`. Variable-length `str`, `slice`, and `ref` fields overwrite in-place when `newBytes <= oldBytes`, extend in-place at the tail tip, or bump-allocate in the tail arena. `rows.rangeBy()`, `rows.filterBytes()`, and `rows.concatBytes()` query and slice binary tables with 0 per-row JS objects. |
| **2. Circular References (`ref`)** | Tree/table-only schemas or complex offset-table builders that require manual node index management for graphs. | **Native Cyclic Graph Packing & Traversal**: `ref(() => Node)` and `slice(() => Node)` pack circular JS object graphs (`a.next = b; b.next = a`) automatically, traverse cycles in `O(1)` with zero allocations, and reconstruct circular JS references in `.toObject()`. |
| **3. Row Access Overhead** | Row wrappers that rely on JS `Proxy` traps or chunked dictionary lookups can make row-by-row iteration slower than `JSON.parse`. | **Compiled Monomorphic View Class (No `Proxy`)**: `defineStruct()` compiles a class with prototype getters/setters and pre-warmed V8 in-object property slots, plus a reusable flyweight cursor (`for (const row of rows)` and `cursor.seek(i)`). |
| **4. Developer Ergonomics** | Often requires dedicated builder APIs (`Utf8Builder`, `Float64Vector`, `RecordBatchWriter`) instead of standard TypeScript objects. | **Plain JS Object Syntax + Inline Types**: Define `{ id: u32, icao: fixedStr(6), lat: scaled(i32, 1e6), alt: sentinel(i16, -32768), next: ref(() => Node) }`, read/write `row.icao`, spread `{ ...row }`, `Object.keys(row)`, and `JSON.stringify(row)` with static TypeScript inference. |
| **5. Wire Safety & Bundle Footprint** | Full IPC readers, builders, and schema runtimes often weigh 100-150+ KiB minified+gzipped. | **~6.5 KiB Core Runtime + Wire Bounds Defense**: Clamps `Uint8Array` sub-slice windows, validates every `[off, len]` tail pointer against `[structEnd .. bufferEnd]`, and enforces an `8x` amplification budget in `toObject()` / `toObjects()` while preserving valid cycles. |
---

## Wire Layout: `#[repr(C)]` + Relative Tail Arena

Full Apache Arrow IPC and Cap'n Proto wire formats include features that many JS + Rust WASM projects don't need:

- **Apache Arrow IPC** includes FlatBuffers schema headers, 64-byte aligned validity bitmaps, offset buffers, and dictionary batches. In Rust/C WASM, reading a struct requires an Arrow reader rather than casting a pointer.
- **Cap'n Proto Wire** uses 64-bit multi-segment pointers and separate data/pointer sections to support pointer-table schema evolution.
- **`capnstruct` (`#[repr(C)]` + Relative Tail Arena)** uses standard C/Rust `#[repr(C)]` struct layout with 8-byte `[u32 relOffset, u32 len]` relative pointers into a contiguous tail arena:
  - In Rust/C WASM: zero dependencies—`core::slice::from_raw_parts(ptr as *const MyStruct, len)`.
  - In JS/TS: direct `DataView` load per field read (`dv.getFloat64(this._o + 8, true)`).
  - For Arrow / DuckDB / WebGPU interop: `rows.column('lat')` extracts a `Float64Array` / `Int32Array` column in O(1) when `stride === field.size` (or a contiguous `TypedArray` copy when strided).

---

## When to Use `capnstruct` vs. Plain JS Objects

`capnstruct` is not meant to replace a 3-field local UI state object `{ isOpen: true }`. V8's escape analysis keeps small, short-lived local objects in CPU registers with zero heap overhead.

Where each fits best:

| Workload | Best Choice | Why |
| :--- | :--- | :--- |
| **3-field local function/UI state** (`{ x, y }`) | **Native JS Object** | V8 scalar replacement keeps fields in CPU registers with 0 heap allocation. |
| **Network / RPC / WebSocket binary payloads** | **`capnstruct`** | 0 ms parse step; read fields directly from the incoming `Uint8Array` ~30x–49x faster than `JSON.parse`. |
| **Web Workers (`postMessage` / `SharedArrayBuffer`)** | **`capnstruct`** | Transfer or share the `ArrayBuffer` in O(1) with zero `structuredClone` serialization overhead. |
| **Rust / C / Zig WebAssembly (`WebAssembly.Memory`)** | **`capnstruct`** | Both JS and WASM read/write the exact same `#[repr(C)]` bytes in linear memory with `WasmArena` auto-rebinding. |
| **Large tables & telemetry streams (10k–10M rows)** | **`capnstruct`** | Zero V8 heap objects per row; eliminates GC pauses and tail-latency spikes; lazy UTF-8 string decoding. |
| **In-place updates on wire buffers** | **`capnstruct`** | Mutate numeric fields, strings, and slices in place (~767x faster than `JSON.parse` + mutate + `JSON.stringify`). |
