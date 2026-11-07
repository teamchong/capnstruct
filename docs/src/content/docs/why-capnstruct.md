---
title: Design & Tradeoffs
description: Why changing data layout in JS/TS beats switching to Bun (JSC) or Rust (WASM JSON), plus comparisons against JSON, Manual DataView, Apache Arrow, FlatBuffers, and Cap'n Proto.
---

## Why Data Layout Beats Switching to Bun or Rust (Node.js V8 vs. Bun JSC vs. Rust `-O3`)

When a JavaScript or TypeScript service hits a serialization, IPC, or memory wall, the two most common impulses are to **switch JS runtimes** (from **Node.js (V8)** to **Bun (JavaScriptCore)**) or **rewrite hot paths in Rust (`wasm32`)**.

### 1. The Architectural Reason: Pointer Soup & JSON Parsing vs. Contiguous `#[repr(C)]` Arena

- **Switching JS engines (Node.js V8 &rarr; Bun JSC)** only changes the constant factor of your allocator and parser (**~1.3x–2.6x**), because **both V8 and JavaScriptCore are forced to construct the exact same scattered heap graph** whenever you call `JSON.parse()` or `structuredClone()`.
- **Rewriting hot paths in Rust (`rustc -O3`) without changing the wire format** still spends **3.73–4.16 ms** scanning raw ASCII JSON text byte-by-byte (or **23.0 ms** if JS has to `JSON.stringify` + UTF-8 copy across the JS&harr;WASM FFI boundary).
- **Restructuring into a contiguous `capnstruct` `#[repr(C)]` layout** drops execution to **0.17-0.31 ms in standard JavaScript** (**12x-45x faster than Rust JSON parsing!**), and when you *combine* Rust `-O3` with `capnstruct`'s `toRustReprC()` zero-copy layout, Rust executes in **0.015-0.073 ms** (**194x-714x faster** with **0 B copied**).

```text
✘ Plain JS Objects in V8 (Node.js) / JSC (Bun) & JSON Wire Format in Rust:
  [Array Backing Store] -> 8B ptr -> [Boxed JSObject Header + HiddenClass/StructureID (24-48B)] -> 8B ptr -> [UTF-8/UTF-16 String Heap Box]
  • V8 & JSC: Every row = 1..4 separate heap allocations + pointer indirection (+5 MB to +14 MB GC pressure per call)
  • Rust (-O3 JSON): CPU still has to scan 5.27 MiB of ASCII JSON text byte-by-byte (3.73 ms in-WASM, 23.0 ms across JS<->WASM FFI)
  • Circular references (a.next = b; b.next = a) = JSON.stringify / serde_json crashes with TypeError; deep graphs overflow structuredClone C++ stack

✔ capnstruct Contiguous #[repr(C)] Layout (Same V8, Bun JSC, or Rust WASM Engine):
  [Row 0: 24B inline #[repr(C)] struct | Row 1: 24B inline | ... | Tail Arena: UTF-8 & slice bytes via [u32 relOffset, u32 len]]
  • 0 per-row JS heap objects allocated (0.00 MB GC pressure) & 0 FFI serialization copies between JS and Rust WebAssembly.Memory
  • 1 reusable flyweight cursor (`cursor._o += stride`) or Rust `core::slice::from_raw_parts` reads sequentially through CPU L1 cache lines
  • Strings & slices are only decoded on the rows that match your filter; circular `ref(() => Node)` pointers traverse in O(1)
```

### 2. Full Benchmark & Bundle Size Suite (Node.js V8 vs. Bun JSC vs. Rust `-O3` vs. Go / TinyGo WASM)

Running the same benchmark suite (`pnpm run bench`) on **Node.js v24.15.0 (V8)**, **Bun v1.4.3 (JSC)**, **Rust 1.96 (`rustc -O3 wasm32`)**, **Go 1.27 (`GOOS=wasip1 GOARCH=wasm`)**, and **TinyGo 0.43 (`-target=wasi -opt=2`)**, plus `pnpm run size`:

| Workload                               | Node.js (V8) JSON / Clone             | Bun (JSC) JSON / Clone                | Rust `-O3` WASM JSON / FFI        | `capnstruct` Zero-Copy (JS / Go·TinyGo WASM / Rust `#[repr(C)]`)                                     | Data Layout Gain                              |
| :------------------------------------- | :------------------------------------ | :------------------------------------ | :-------------------------------- | :--------------------------------------------------------------------------------------------------- | :-------------------------------------------- |
| **100k Numeric Struct Scan**           | 14.14 ms (**+10.30 MB** heap)         | 5.65 ms (**+6.87 MB** heap)           | 3.68 ms (in-WASM) / 23.7 ms (FFI) | **0.31 ms JS** (Bun: 0.16 ms) / **0.084 ms TinyGo** / **0.107 ms Go** / **0.071 ms Rust** (**0 MB**) | **45x faster JS / 168x TinyGo / 198x Rust**   |
| **25k Sparse BBox Filter (13 fields)** | 13.24 ms (**+8.17 MB** heap)          | 7.36 ms (**+5.21 MB** heap)           | 4.16 ms (in-WASM JSON scan)       | **0.39 ms JS** / **0.031 ms Go WASM** / **0.034 ms TinyGo** / **0.020 ms Rust** (**0 MB**)           | **34x faster JS / 428x Go WASM / 651x Rust**  |
| **25k JS &harr; WASM Boundary Scan**   | 5.48 ms (**+3.70 MB** heap)           | 2.10 ms (**+1.72 MB** heap)           | 5.48 ms (`JSON`/`serde` FFI)      | **0.34 ms JS** / **0.036 ms Rust** (`WasmArena`, **0 MB**)                                           | **16x faster JS / 153x Rust**                 |
| **25k Worker `postMessage` + Mutate**  | 45.94 ms (**+14.24 MB** heap)         | 35.50 ms (**+5.73 MB** heap)          | -                                 | **0.046 ms JS** (Bun: 0.028 ms) / **0.00 MB**                                                        | **~1,000x-1,270x faster, 0 MB heap**          |
| **100k Sorted Range Query**            | 14.06 ms (**+10.33 MB** heap)         | 5.88 ms (**+6.88 MB** heap)           | -                                 | **0.0058 ms JS** (**0.00 MB** heap)                                                                  | **~2,408x faster, 0 MB heap**                 |
| **10k Cyclic Graph Clone & Traverse**  | 3.23 ms (**+1.76 MB**, `JSON` throws) | 2.63 ms (**+0.69 MB**, `JSON` throws) | Throws on cyclic JSON!            | **0.30 ms JS** / **0.019 ms Go WASM** / **0.034 ms TinyGo** / **0.016 ms Rust** (**0 MB**)           | **8.7x faster JS / 173x Go WASM / 190x Rust** |

| Entrypoint                                                                                 | Minified  | Minified + Gzip (`level: 9`)              |
| :----------------------------------------------------------------------------------------- | :-------- | :---------------------------------------- |
| **Core (`capnstruct`)** -- `defineStruct`, `StructArrayView`, `ref`, `slice`, `WasmArena`  | 18.53 KiB | **7.02 KiB** (**6.51 KiB** schema core)   |
| **Codegen (`capnstruct/codegen`)** -- Rust `#[repr(C)]` + Go / TinyGo WASM generator       | 7.44 KiB  | **2.53 KiB** (2,595 B)                    |

---

## Design Tradeoffs vs. Apache Arrow, FlatBuffers & Cap'n Proto

Libraries like **Apache Arrow** (`apache-arrow`), **FlatBuffers**, and **Cap'n Proto** are designed for cross-language analytics or multi-segment RPC, which leads to different tradeoffs in everyday JavaScript and WebAssembly applications:

| Area                             | Typical Binary Format Tradeoff (`apache-arrow` / FlatBuffers / Cap'n Proto)                                            | How `capnstruct` Approaches It                                                                                                                                                                                                                                                                      |
| :------------------------------- | :--------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Mutability & Querying**     | Buffers are read-only once built. Updating a field or querying a time window requires unpacking into JS objects or rebuilding a `RecordBatch`. | **In-Place Mutation + Zero-Heap Querying**: Primitives mutate in-place in `O(1)`. Variable-length `str`, `slice`, and `ref` fields overwrite in-place when `newBytes <= oldBytes`, extend at the tail tip, or bump-allocate in the tail arena. `rows.rangeBy()`, `rows.filterBytes()`, and `rows.concatBytes()` query and slice binary tables with 0 per-row JS objects. |
| **2. Circular References (`ref`)** | Tree/table-only schemas or manual node index management for graphs.                                                  | **Native Cyclic Graph Packing & Traversal**: `ref(self)` and `slice(self)` pack circular JS object graphs (`a.next = b; b.next = a`) automatically, traverse cycles in `O(1)` with zero allocations, and reconstruct circular JS references in `.toObject()`.                                      |
| **3. Row Access & Wire Headers** | Arrow IPC includes FlatBuffers schema headers, validity bitmaps, and dictionary batches; Cap'n Proto uses 64-bit multi-segment pointers. | **Zero-Header `#[repr(C)]` + Monomorphic View Class**: Fixed-only structs have 0 header bytes and 0 pointers (`core::slice::from_raw_parts` in Rust WASM); variable fields use 8-byte `[u32 relOffset, u32 len]` relative pointers.                                                                 |
| **4. Developer Ergonomics**      | Dedicated builder APIs (`Utf8Builder`, `Float64Vector`, `RecordBatchWriter`) instead of standard TypeScript objects.   | **Plain JS Object Syntax + Inline Types**: Define `{ id: u32, icao: fixedStr(6), lat: scaled(i32, 1e6), alt: sentinel(i16, -32768), next: ref(self) }`, read/write `row.icao`, spread `{ ...row }`, and `JSON.stringify(row)` with 100% inferred TypeScript types.                                  |
| **5. Wire Safety & Bundle Footprint** | Full IPC readers, builders, and schema runtimes often weigh 100-150+ KiB minified+gzipped.                        | **~6.5 KiB Core + Wire Bounds Defense**: Clamps `Uint8Array` sub-slice windows, validates every `[off, len]` tail pointer against `[structEnd .. bufferEnd]`, and enforces an `8x` amplification budget in `toObject()` / `toObjects()` while preserving valid cycles.                              |

---

## When to Use `capnstruct` vs. Plain JS Objects

`capnstruct` is not meant to replace a 3-field local UI state object `{ isOpen: true }`. V8's escape analysis keeps small, short-lived local objects in CPU registers with zero heap overhead.

Where each fits best:

| Workload                                              | Best Choice          | Why                                                                                                               |
| :---------------------------------------------------- | :------------------- | :---------------------------------------------------------------------------------------------------------------- |
| **3-field local function/UI state** (`{ x, y }`)      | **Native JS Object** | V8 scalar replacement keeps fields in CPU registers with 0 heap allocation.                                       |
| **Network / RPC / WebSocket binary payloads**         | **`capnstruct`**     | 0 ms parse step; read fields directly from the incoming `Uint8Array` ~30x–49x faster than `JSON.parse`.           |
| **Web Workers (`postMessage` / `SharedArrayBuffer`)** | **`capnstruct`**     | Transfer or share the `ArrayBuffer` in O(1) with zero `structuredClone` serialization overhead.                   |
| **Rust / C / Zig WebAssembly (`WebAssembly.Memory`)** | **`capnstruct`**     | Both JS and WASM read/write the exact same `#[repr(C)]` bytes in linear memory with `WasmArena` auto-rebinding.   |
| **Large tables & telemetry streams (10k–10M rows)**   | **`capnstruct`**     | Zero V8 heap objects per row; eliminates GC pauses and tail-latency spikes; lazy UTF-8 string decoding.           |
| **In-place updates on wire buffers**                  | **`capnstruct`**     | Mutate numeric fields, strings, and slices in place (~767x faster than `JSON.parse` + mutate + `JSON.stringify`). |
