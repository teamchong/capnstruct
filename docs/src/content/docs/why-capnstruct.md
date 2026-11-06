---
title: Why capnstruct?
description: How capnstruct solves the ergonomics, mutability, and bundle-size problems that held back binary data in JavaScript.
---

## Why Previous Attempts at Binary Data in JS Struggled

Other ecosystems tried to replace JSON in JavaScript—most notably **Apache Arrow (`apache-arrow`)**, **FlatBuffers**, and **Cap'n Proto**—yet almost every JS codebase still defaults to `JSON.parse()` and plain objects. Why?

| Bottleneck | What `apache-arrow` / FlatBuffers Did | How `capnstruct` Solves It |
| :--- | :--- | :--- |
| **1. Strict Immutability** | Buffers are read-only. You cannot do `row.score += 1`, `row.name = 'new'`, or `rows.push(item)`. Updating 1 field requires rebuilding the entire `RecordBatch` or FlatBuffer builder from scratch. | **Live In-Place + Tail Mutation**: Primitives mutate in-place in $O(1)$. Variable-length `str` and `slice` fields overwrite in-place when `newBytes <= oldBytes` or bump-allocate in the tail arena. `rows.push()`, `rows.pop()`, and `rows.compact()` work like normal arrays. |
| **2. Slow JS Accessors** | `apache-arrow` wraps rows in JS `Proxy` traps and chunked dictionary lookups, making row iteration **slower than `JSON.parse`**. | **Compiled V8 Monomorphic Class (No `Proxy`)**: `defineStruct()` compiles a dedicated class with prototype getters/setters and 24 pre-warmed V8 in-object property slots, plus a single flyweight cursor (`for (const row of rows)`), running **~27x–49x faster than `JSON.parse`**. |
| **3. Alien Builder APIs** | Forces developers to learn `Utf8Builder`, `Float64Vector`, `RecordBatchWriter`, or multi-segment far pointers instead of standard TypeScript objects. | **Invisible Binary Layer**: Write `{ id: u32, name: str }`, read `row.name`, spread `{ ...row }`, `Object.keys(row)`, and `JSON.stringify(row)`. Full static TypeScript inference out of the box. |
| **4. 150+ KiB Runtime Weight** | `apache-arrow` ships ~150+ KiB minified+gzipped of IPC readers, builders, and visitor classes—too heavy for Cloudflare Workers, edge functions, or UI components. | **&lt; 4.5 KiB Core Runtime (`0` dependencies)**: Small enough to inline anywhere on the edge, in Web Workers, or in the browser. |

---

## Why We Don't Need Full Apache Arrow IPC or Cap'n Proto Multi-Segment Pointers

Both Apache Arrow IPC and Cap'n Proto wire formats carry heavy complexity for features JavaScript and Rust WASM kernels rarely want:

- **Apache Arrow IPC** requires FlatBuffers schema headers, 64-byte aligned validity bitmaps, offset buffers, and dictionary batches. In Rust/C WASM, you cannot cast `&[u8]` to `&[MyStruct]`—both sides must link a heavy Arrow runtime.
- **Cap'n Proto Wire** uses 64-bit multi-segment far pointers, pointer tables, and separate data/pointer sections, requiring bit-unpacking on every field read.
- **`capnstruct` (`#[repr(C)]` + Relative Tail Arena)** uses exact C/Rust `#[repr(C)]` struct layout with 8-byte `[u32 relOffset, u32 len]` relative pointers into a contiguous tail arena:
  - In Rust/C WASM: zero dependencies—just `core::slice::from_raw_parts(ptr as *const MyStruct, len)`.
  - In JS/TS: single `DataView` instruction per field read (`dv.getFloat64(this._o + 8, true)`).
  - For Arrow / DuckDB / WebGPU interop: `rows.column('lat')` extracts a raw `Float64Array` / `Int32Array` column in $O(1)$ when `stride === field.size` (or a contiguous `TypedArray` copy when strided).

---

## Where `capnstruct` Wins vs. Where Native JS Objects Win

`capnstruct` is not meant to replace a 3-field local React UI state variable `{ isOpen: true }`. V8's escape analysis keeps tiny, short-lived local objects in CPU registers.

Use this rule of thumb:

| Workload | Best Choice | Why |
| :--- | :--- | :--- |
| **3-field local function/UI state** (`{ x, y }`) | **Native JS Object** | V8 scalar replacement keeps fields in CPU registers with 0 heap allocation. |
| **Network / RPC / WebSocket binary payloads** | **`capnstruct`** | 0 ms parse step; read fields directly from the incoming `Uint8Array` ~30x–49x faster than `JSON.parse`. |
| **Web Workers (`postMessage` / `SharedArrayBuffer`)** | **`capnstruct`** | Transfer or share the `ArrayBuffer` in $O(1)$ with zero `structuredClone` serialization overhead. |
| **Rust / C / Zig WebAssembly (`WebAssembly.Memory`)** | **`capnstruct`** | Both JS and WASM read/write the exact same `#[repr(C)]` bytes in linear memory with `WasmArena` auto-rebinding. |
| **Large tables & telemetry streams (10k–10M rows)** | **`capnstruct`** | Zero V8 heap objects per row; eliminates GC pauses and tail-latency spikes; lazy UTF-8 string decoding. |
| **In-place updates on wire buffers** | **`capnstruct`** | Mutate numeric fields, strings, and slices in place (~767x faster than `JSON.parse` + mutate + `JSON.stringify`). |
