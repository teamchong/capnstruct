---
title: Design & Tradeoffs
description: Why changing data layout in JS/TS beats switching to Bun (JSC) or Rust (WASM JSON), plus comparisons against JSON, Manual DataView, Apache Arrow, FlatBuffers, and Cap'n Proto.
---

## Why Data Layout Beats Switching to Bun or Rust (Node.js V8 vs. Bun JSC vs. Rust `-O3`)

When a JavaScript or TypeScript service hits a serialization, IPC, or memory wall, the two most common impulses are to **switch JS runtimes**—from **Node.js (V8)** to **Bun (JavaScriptCore)**—or **rewrite hot paths in Rust (`wasm32`)**.

### 1. The Architectural Reason: Pointer Soup & JSON Parsing vs. Contiguous `#[repr(C)]` Arena

- **Switching JS engines (Node.js V8 &rarr; Bun JSC)** only changes the constant factor of your allocator and parser (**~1.3x–2.6x**), because **both V8 and JavaScriptCore are forced to construct the exact same scattered heap graph** whenever you call `JSON.parse()` or `structuredClone()`.
- **Rewriting hot paths in Rust (`rustc -O3`) without changing the wire format** still spends **3.73–4.16 ms** scanning raw ASCII JSON text byte-by-byte (or **23.0 ms** if JS has to `JSON.stringify` + UTF-8 copy across the JS&harr;WASM FFI boundary).
- **Restructuring into a contiguous `capnstruct` `#[repr(C)]` layout** drops execution to **0.17–0.31 ms in standard JavaScript** (**12x–45x faster than Rust JSON parsing!**)—and when you *combine* Rust `-O3` with `capnstruct`'s `toRustReprC()` zero-copy layout, Rust executes in **0.015–0.073 ms** (**194x–714x faster** with **0 B copied**).

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

### 2. Visual Scaling Proof Across Dataset Size (`N = 100 → 100,000`) & Filter Selectivity (`0.5% → 100%`)

To prove this is **not a cherry-picked benchmark**, the curve below sweeps across **4 orders of magnitude of dataset scale** (`N = 100` to `N = 100,000`), comparing **Node.js v24 (V8)**, **Bun v1.4 (JSC)**, **Rust 1.96 (`rustc -O3` WASM JSON Parse)**, an **already-parsed in-memory JS object array** baseline (dashed grey line), and **`capnstruct` `#[repr(C)]` Binary Layout** (solid green line):

<svg viewBox="0 0 860 260" style="width:100%;height:auto;background:var(--sl-color-bg-nav);border:1px solid var(--sl-color-hairline);border-radius:0.6rem;padding:0.5rem;margin:0.75rem 0;" role="img" aria-label="Scaling curve comparing Node.js V8, Bun JSC, Rust WASM JSON, in-memory JS array, and capnstruct from N=100 to N=100,000">
  <line x1="70" y1="25" x2="820" y2="25" stroke="currentColor" stroke-opacity="0.12" />
  <line x1="70" y1="75" x2="820" y2="75" stroke="currentColor" stroke-opacity="0.12" />
  <line x1="70" y1="125" x2="820" y2="125" stroke="currentColor" stroke-opacity="0.12" />
  <line x1="70" y1="175" x2="820" y2="175" stroke="currentColor" stroke-opacity="0.12" />
  <line x1="70" y1="220" x2="820" y2="220" stroke="currentColor" stroke-opacity="0.28" />
  <line x1="70" y1="104" x2="820" y2="104" stroke="#ef4444" stroke-width="1" stroke-dasharray="5,4" stroke-opacity="0.75" />
  <text x="815" y="98" text-anchor="end" font-size="11" fill="#ef4444" font-weight="600">16.6 ms – 60 FPS Frame Budget Ceiling (Stutter Above)</text>
  <text x="62" y="29" text-anchor="end" font-size="11" fill="currentColor" opacity="0.7">28 ms</text>
  <text x="62" y="79" text-anchor="end" font-size="11" fill="currentColor" opacity="0.7">21 ms</text>
  <text x="62" y="129" text-anchor="end" font-size="11" fill="currentColor" opacity="0.7">14 ms</text>
  <text x="62" y="179" text-anchor="end" font-size="11" fill="currentColor" opacity="0.7">7 ms</text>
  <text x="62" y="224" text-anchor="end" font-size="11" fill="currentColor" opacity="0.7">0 ms</text>
  <text x="90" y="242" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">N=100</text>
  <text x="205" y="242" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">1,000</text>
  <text x="320" y="242" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">5,000</text>
  <text x="435" y="242" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">10,000</text>
  <text x="550" y="242" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">25,000</text>
  <text x="665" y="242" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">50,000</text>
  <text x="785" y="242" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.8">100,000</text>
  <polygon points="90,219.8 205,219.8 320,218.8 435,217.7 550,213.5 665,207.0 785,194.0 785,218.9 665,219.2 550,219.6 435,219.9 320,219.9 205,220 90,220" fill="#10b981" fill-opacity="0.09" />
  <polyline fill="none" stroke="#ef4444" stroke-width="3" points="90,219.7 205,218.2 320,211.1 435,202.0 550,173.8 665,123.5 785,25.1" />
  <text x="772" y="38" text-anchor="end" font-size="11" font-weight="700" fill="#ef4444">Node.js V8: 27.8 ms (+10.3 MB heap)</text>
  <polyline fill="none" stroke="#f59e0b" stroke-width="3" points="90,219.7 205,219.0 320,215.7 435,211.0 550,197.0 665,173.3 785,123.0" />
  <text x="772" y="116" text-anchor="end" font-size="11" font-weight="700" fill="#f59e0b">Bun JSC: 13.9 ms (2x faster, +6.9 MB heap)</text>
  <polyline fill="none" stroke="#a855f7" stroke-width="2.6" points="90,219.8 205,219.8 320,218.8 435,217.7 550,213.5 665,207.0 785,194.0" />
  <text x="772" y="187" text-anchor="end" font-size="11" font-weight="700" fill="#a855f7">Rust -O3 JSON: 3.73 ms (23.0 ms w/ JS FFI)</text>
  <polyline fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-dasharray="3,3" points="90,219.9 205,219.9 320,219.9 435,219.9 550,219.7 665,219.5 785,219.1" />
  <polyline fill="none" stroke="#10b981" stroke-width="3.5" points="90,219.9 205,219.9 320,219.9 435,219.9 550,219.6 665,219.2 785,218.9" />
  <text x="772" y="213" text-anchor="end" font-size="11.5" font-weight="800" fill="#10b981">capnstruct #[repr(C)]: 0.17 ms JS / 0.073 ms Rust (51x–135x faster than Rust JSON!)</text>
  <text x="95" y="198" font-size="10" fill="currentColor" opacity="0.65">At N=100, all meet (~0.02ms)</text>
</svg>

### 3. Benchmark Summary Table (Node.js V8 vs. Bun JSC vs. Rust `-O3` vs. `capnstruct`)

Running the exact same benchmark suite (`pnpm run bench`) on **Node.js v24.15.0 (V8)**, **Bun v1.4.3 (JSC)**, and **Rust 1.96 (`rustc -C opt-level=3 --target wasm32-unknown-unknown`)**:

| Workload | Node.js (V8) JSON / Clone | Bun (JSC) JSON / Clone | Rust `-O3` WASM JSON / FFI | `capnstruct` Zero-Copy (JS / Rust `#[repr(C)]`) | Data Layout Gain |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **100k Numeric Struct Scan** | 14.18 ms (**+10.30 MB** heap) | 5.50 ms (**+6.87 MB** heap) | 3.73 ms (in-WASM) / 23.0 ms (FFI) | **0.309 ms JS** (Bun: 0.170 ms) / **0.073 ms Rust** (**0 MB**) | **45.9x faster JS / 194x Rust** |
| **25k Sparse BBox Filter (13 fields)** | 12.96 ms (**+8.17 MB** heap) | 6.77 ms (**+5.21 MB** heap) | 4.16 ms (in-WASM JSON scan) | **0.290 ms JS** / **0.018 ms Rust** (**0 MB**) | **35.3x faster JS / 714x Rust** |
| **25k JS &harr; Rust WASM Boundary Scan** | 5.08 ms (**+3.70 MB** heap) | 2.12 ms (**+1.72 MB** heap) | 5.08 ms (`JSON`/`serde` FFI) | **0.306 ms JS** / **0.015 ms Rust** (`WasmArena`, **0 MB**) | **16.6x faster JS / 339x Rust** |
| **25k Worker `postMessage` + Mutate** | 45.98 ms (**+14.24 MB** heap) | 35.54 ms (**+5.73 MB** heap) | — | **0.046 ms JS** (Bun: 0.025 ms) / **0 MB** | **~1,000x–1,420x faster, 0 MB** |
| **100k Sorted Range Query** | 13.79 ms (**+10.33 MB** heap) | 5.68 ms (**+6.88 MB** heap) | — | **0.0051 ms JS** (**+0.00 MB** heap) | **~2,729x faster, 0 MB heap** |
| **10k Cyclic Graph Clone & Traverse** | 3.27 ms (**+1.76 MB**, `JSON` throws) | 2.59 ms (**+0.69 MB**, `JSON` throws) | Throws on cyclic JSON! | **0.296 ms JS** / **0.011 ms Rust `CapnRef<T>`** (**0 MB**) | **8.7x faster JS / 297x Rust** |

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
