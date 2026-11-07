---
title: Why capnstruct?
description: Design tradeoffs between JSON, manual DataView, Apache Arrow, Cap'n Proto, and capnstruct.
---

## Design Tradeoffs in JS Binary Formats

Libraries like **Apache Arrow (`apache-arrow`)**, **FlatBuffers**, and **Cap'n Proto** are designed for large-scale cross-language analytics or multi-segment RPC, which leads to different tradeoffs when used in everyday JavaScript and WebAssembly applications:

| Area | Typical Binary Format Tradeoff (`apache-arrow` / FlatBuffers) | How `capnstruct` Approaches It |
| :--- | :--- | :--- |
| **1. Mutability** | Buffers are generally read-only once built. Updating a field (`row.name = 'new'`) or appending a row (`rows.push(item)`) requires rebuilding the `RecordBatch` or buffer. | **In-Place + Smart Tail Mutation**: Primitives mutate in-place in `O(1)`. Variable-length `str` and `slice` fields overwrite in-place when `newBytes <= oldBytes`, extend in-place with `0` dead bytes at the tail tip, or bump-allocate in the tail arena. `rows.push()`, `rows.pop()`, and `view.compact()` work directly on the view. |
| **2. Row Access Overhead** | Row wrappers that rely on JS `Proxy` traps or chunked dictionary lookups can make row-by-row iteration slower than `JSON.parse`. | **Compiled Monomorphic View Class (No `Proxy`)**: `defineStruct()` compiles a class with prototype getters/setters and pre-warmed V8 in-object property slots, plus a reusable flyweight cursor (`for (const row of rows)`). |
| **3. Developer Ergonomics** | Often requires dedicated builder APIs (`Utf8Builder`, `Float64Vector`, `RecordBatchWriter`) instead of standard TypeScript objects. | **Plain JS Object Syntax**: Define `{ id: u32, name: str }`, read/write `row.name`, spread `{ ...row }`, `Object.keys(row)`, and `JSON.stringify(row)` with static TypeScript inference. |
| **4. Wire Safety & Bundle Footprint** | Full IPC readers, builders, and schema runtimes often weigh 100-150+ KiB minified+gzipped. | **&lt; 4.8 KiB Core Runtime + Wire Bounds Defense**: Clamps `Uint8Array` sub-slice windows, validates every `[off, len]` tail pointer against `[structEnd .. bufferEnd]`, and enforces an `8x` amplification budget in `toObject()` / `toObjects()`. |

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
