---
title: API Reference & Wire Format
description: Complete API reference, binary wire layout specification, and Node.js / V8 benchmark results for capnstruct.
---

## Binary Wire Format Specification

Every `capnstruct` buffer is a standard C/Rust `#[repr(C)]` flat array followed by an optional variable-length tail arena:

```text
+-------------------------------------------------------------------+
| Fixed #[repr(C)] Struct Table (N * def.size bytes, 8B-aligned)    |
|   Row 0: [primitive fields ... | CapnStr (u32 relOff, u32 len)]   |
|   Row 1: [primitive fields ... | CapnSlice (u32 relOff, u32 len)] |
+-------------------------------------------------------------------+
| Tail Arena (UTF-8 strings & nested slice elements)                |
|   offset = structBaseOffset + relOff                              |
+-------------------------------------------------------------------+
```

1. **Alignment & Padding**: Each field is aligned to `field.align` (`offset = (offset + align - 1) & ~(align - 1)`). The struct's total `size` (`stride`) is rounded up to `max(field.align)`.
### Relative Tail Descriptors (`str`, `slice(T)`, and `ref(T)`)
Stored inline as 8 bytes (`[u32 relOffset, u32 length]` for `str`/`slice`, or `[u32 relOffset, u32 present]` for `ref`, little-endian). When `len > 0` (or `present !== 0`), the payload lives at `structBaseOffset + relOffset`. When row 0 contains a variable-length field (`def._fv >= 0`), `pack()` places row 0's first variable data at the start of the tail arena (`tailStart`), allowing `StructDef.array(bytes)` to recover `rowCount = Math.floor(tailStart / def.size)` in $O(1)$ without a separate framing header.

### Wire-Safe Pointer Bounds & Amplification Defense
`Uint8Array` sub-views are clamped to `[byteOffset .. byteOffset + byteLength]` so untrusted descriptors cannot bleed into surrounding `ArrayBuffer` memory. Every `[relOffset, length]` descriptor is checked against `[structEnd .. bufferEnd]` (`RangeError('Out of bounds')`), and `toObject()` / `toObjects()` enforce an `8x` traversal budget (min 64 KiB) against pointer-aliasing amplification attacks while preserving circular object graphs via `_rSeen`.

## Core API Reference

### `defineStruct(name?, fields)` / `struct(name?, fields)`

Compiles a `StructDef<F>` with a specialized monomorphic V8 `StructView` class.

- `def.size` / `def.stride`: Struct byte size including trailing alignment padding.
- `def.align`: Struct byte alignment (`1`, `2`, `4`, or `8`).
- `def.fields`: Map of field names to `{ name, desc, offset, size, align }`.
- `typeof def.$view` / `InferView<typeof def>`: Inferred `StructView<F>` type.
- `typeof def.$plain` / `InferPlain<typeof def>`: Inferred plain JS object type (`toObject()`).
- `typeof def.$input` / `InferInput<typeof def>`: Inferred input object type (`pack()`, `create()`, `push()`).
- `def.offsetOf(field)`: Returns the byte offset of `field`.
- `def.create(init?)`: Allocates a single `StructView<F>` backed by a fresh buffer.
- `def.alloc(count)`: Allocates a `StructArrayView<F>` for `count` rows (pass `0` for an empty growable array).
- `def.pack(rows)` / `pack(def, rows)`: Packs an array of plain JS objects into an 8-byte-aligned `Uint8Array`.
- `def.concatBytes(chunks)` / `concatBytes(def, chunks)`: Concatenates multiple `StructArrayView<F>` or `Uint8Array` chunks into a single packed `Uint8Array` via bulk `memcpy` when fixed-size.
- `def.view(source, optionsOrOffset?)`: Wraps a single struct in `source` without copying.
- `def.array(source, optionsOrOffset?, count?)`: Wraps a sequence of structs in `source` without copying.

### Inline Fixed-Length & Zero-Overhead Primitives

- `f16`: 2-byte IEEE 754 half-precision float (`Float16Array` column support).
- `fixedStr(N)`: Inline fixed-length null-padded UTF-8 string `[u8; N]` (`align: 1, size: N`) with 0 tail indirection.
- `fixedBytes(N)`: Inline fixed-length byte array `[u8; N]` (`align: 1, size: N`) read as a zero-copy `Uint8Array`.
- `sentinel(prim, nullValue)` / `nullable(prim, nullValue)`: Maps an inline sentinel value (e.g. `-32768` for `i16` or `NaN` for `f32`) to `null` in JS with 0 extra wire bytes.
- **`scaled(prim, factor, { null? })`**: Fixed-point scaled primitive (stores `Math.round(val * factor)` in `prim`, reads `raw / factor` as `number`).
- **`ref(target)` / `ref(() => target)`**: 8-byte relative-offset nullable/circular struct reference (`[u32 relOffset, u32 present]`). Supports self-referential and mutually recursive schemas, cycle-safe packing (`pack()`), $O(1)$ zero-copy view traversal and pointer relinking (`row.next = otherRow`), and cycle-preserving `.toObject()` / `.toObjects()`.
- **`slice(element)` / `slice(() => element)`**: 8-byte relative-offset variable-length slice (`[u32 relOffset, u32 length]`). Accepts a lazy thunk `() => StructDef` for recursive tree/graph child lists.

- `<field>`: Getter and setter for every field in `F` (primitives, nested structs, `fixedArray`, `fixedStr`, `fixedBytes`, `str`, and `slice`).
- `view.seek(index)` / `view.at(index)`: Repositions a flyweight cursor to row `index` in $O(1)$ (supports negative indices from the end).
- `view.set(field, value)` / `view.set(partialObject)` / `view.setAll(partialObject)`: Updates one or more fields in place.
- `view.toObject()` / `view.toJSON()`: Materializes a plain JS object `{ ... }`.
- `view.compactionRatio`: Ratio (`0..1`) of dead tail bytes to total used bytes.
- `view.compact()`: Strips dead tail bytes and rebinds the `StructView` in-place to a tight `Uint8Array`.
- `view.bytes`: Underlying `Uint8Array` slice (auto-compacts if dirty or containing dead tail bytes).

### `StructArrayView<F>`

- `rows.length` / `rows.stride` / `rows.byteLength` / `rows.byteOffset` / `rows.buffer`
- `rows.at(index, cursor?)`: Returns a `StructView<F>` for `index` (uses a 256-slot ring pool or the provided `cursor`).
- `rows.cursor(index?)`: Returns a reusable flyweight `StructView<F>` cursor (reposition via `cursor.seek(i)` or `cursor.at(i)`).
- `for (const row of rows)`: Zero-allocation flyweight iterator.
- `rows.subarray(begin?, end?)`: Returns a zero-copy `StructArrayView<F>` slice over `[begin, end)` in $O(1)$ without copying bytes.
- `rows.lowerBound(field, value)` / `rows.upperBound(field, value)`: $O(\log N)$ binary search directly on a sorted primitive column (0 allocations).
- `rows.rangeBy(field, min, max)`: Returns a zero-copy `StructArrayView<F>` slice over `min <= row[field] <= max` in $O(\log N)$.
- `rows.filterBytes(predicate)`: Filters rows with a reusable flyweight cursor (0 per-row JS objects) and copies matching binary rows into a tight `Uint8Array`.
- `rows.push(...items)`: Appends rows in-place, automatically growing capacity as needed.
- `rows.pop()`: Removes and returns the last row as a plain JS object.
- `rows.column(field)`: Extracts a `TypedArray` for primitive `field` (zero-copy when `stride === field.size`).
- `rows.setColumn(field, values)`: Bulk-writes a primitive column from any `ArrayLike`.
- `rows.compactionRatio`: Ratio (`0..1`) of dead tail bytes to total used bytes.
- `rows.compact()`: Strips dead tail bytes and rebinds the view to a tight `Uint8Array`.
- `rows.bytes`: Returns a wire-ready `Uint8Array` (automatically calling `.compact()` if dirty).
- `toRustReprC(schemas, options?)` / `toGoStruct(schemas, options?)` (`from 'capnstruct/codegen'`): Generates `rustc`-verified Rust `#[repr(C)]` structs or `go tool compile`-verified Go zero-copy structs (with `CapnStr`, `CapnSlice`, `CapnRef`, and compile-time size/alignment/offset assertions).
---

## Data Layout > Switching JS Engines (Benchmarks & Bundle Size)

Measured via `pnpm run bench` on **Node.js v24.15.0 (V8 13.6)** and **Bun v1.4.3 (JavaScriptCore)**, plus `pnpm run size`:

| Workload | Node.js (V8) Baseline (`ms` / Heap) | Bun (JSC) Baseline (`ms` / Heap) | `capnstruct` Zero-Copy (`ms` / Heap) | Speedup vs. Node / Bun |
| :--- | :--- | :--- | :--- | :--- |
| **Zero-Heap Time-Window Range Query** (`100,000` sorted rows: `JSON.parse` + `.filter()` vs `.rangeBy('id', min, max).bytes`) | 14.08 ms / **+10.33 MB** | 5.28 ms / **+6.38 MB** | **0.0040 ms** / **+0.00 MB** | **~3,520x / ~1,320x faster (0 MB heap)** |
| **Web Worker `postMessage` Round-Trip + Update** (`25,000` `Telemetry` rows: `structuredClone` vs `SharedArrayBuffer` in-place) | 45.00 ms / **+14.24 MB** | 34.13 ms / **+5.73 MB** | **0.054 ms** (Bun: 0.027 ms) / **+0.00 MB** | **~829x–1,275x faster (0 MB heap)** |
| **Sparse Viewport BBox Filter + Lazy UTF-8 Decode** (`25,000` `Flight` Telemetry rows × 13 fields, ~0.4% hit rate) | 12.82 ms / **+8.18 MB** | 6.38 ms / **+5.21 MB** | **0.290 ms** (Bun: 0.269 ms) / **+0.00 MB** | **~44.2x / ~23.7x faster (0 MB heap)** |
| **`100,000` `SpdSample` Numeric Struct Scan** (`for..of` flyweight cursor, 0 heap allocs) | 13.51 ms / **+10.33 MB** | 5.23 ms / **+6.38 MB** | **0.625 ms** (Bun: 0.530 ms) / **+0.00 MB** | **~21.6x / ~9.9x faster (0 MB heap)** |
| **JS &harr; WASM Boundary Scan** (`25,000` `QpPoint` structs in `WebAssembly.Memory`: `JSON`/`serde` FFI vs `WasmArena`) | 5.02 ms / **+4.23 MB** | 2.09 ms / **+2.59 MB** | **0.338 ms** / **+0.00 MB** | **~14.9x / ~5.4x faster (0 MB heap)** |
| **Cyclic Graph Clone & Traversal** (`10,000` doubly-linked `RingNode`s — `JSON.stringify` throws `TypeError`!) | 3.25 ms (`structuredClone`) / **+1.76 MB** | 2.57 ms (`structuredClone`) / **+0.69 MB** | **0.390 ms** (Bun: 0.343 ms) / **+0.00 MB** | **~8.3x faster (0 MB heap, $O(1)$ stack)** |

| Entrypoint | Minified | Minified + Gzip (`level: 9`) |
| :--- | :--- | :--- |
| **Declarative Schema API (Core Runtime + All Primitives + `ref`)** | 16.79 KiB | **6.51 KiB** (6,665 B) |
| **Full Runtime (+ `WasmArena`)** | 18.53 KiB | **7.02 KiB** (7,186 B) |
| **Rust `#[repr(C)]` & Go Codegen (`capnstruct/codegen`)** | 5.85 KiB | **1.97 KiB** (2,013 B) |
