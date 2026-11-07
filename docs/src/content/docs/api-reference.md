---
title: API Reference & Wire Format
description: Complete API reference, binary wire layout specification, and Node.js / V8 benchmark results for capnstruct.
---

## Binary Wire Format Specification

Every `capnstruct` buffer is a standard C/Rust `#[repr(C)]` flat array followed by an optional variable-length tail arena:

```text
+-------------------------------------------------------------------+
| Fixed #[repr(C)] Struct Table (N * def.size bytes, 8B-aligned)    |
|   Row 0: [primitive fields ... | CapnStr   (u32 relOff, u32 len)] |
|   Row 1: [primitive fields ... | CapnSlice (u32 relOff, u32 len)] |
+-------------------------------------------------------------------+
| Tail Arena (UTF-8 strings & nested slice elements)                |
|   offset = structBaseOffset + relOff                              |
+-------------------------------------------------------------------+
```

1. **Alignment & Padding**: Each field is aligned to `field.align` (`offset = (offset + align - 1) & ~(align - 1)`). The struct's total `size` (`stride`) is rounded up to `max(field.align)`.
### Relative Tail Descriptors (`str`, `slice(T)`, and `ref(T)`)
Stored inline as 8 bytes (`[u32 relOffset, u32 length]` for `str`/`slice`, or `[u32 relOffset, u32 present]` for `ref`, little-endian). When `len > 0` (or `present !== 0`), the payload lives at `structBaseOffset + relOffset`. When row 0 contains a variable-length field (`def._fv >= 0`), `pack()` places row 0's first variable data at the start of the tail arena (`tailStart`), allowing `StructDef.array(bytes)` to recover `rowCount = Math.floor(tailStart / def.size)` in `O(1)` without a separate framing header.

### Wire-Safe Pointer Bounds & Amplification Defense
`Uint8Array` sub-views are clamped to `[byteOffset .. byteOffset + byteLength]` so untrusted descriptors cannot bleed into surrounding `ArrayBuffer` memory. Every `[relOffset, length]` descriptor is checked against `[structEnd .. bufferEnd]` (`RangeError('Out of bounds')`), and `toObject()` / `toObjects()` enforce an `8x` traversal budget (min 64 KiB) against pointer-aliasing amplification attacks while preserving circular object graphs via `_rSeen`.

## Core API Reference

### `defineStruct(name?, fields | ((self) => fields))` / `struct(name?, fields | ((self) => fields))`

Compiles a `StructDef<F>` with a specialized monomorphic V8 `StructView` class. Pass a `(self) => ({ ... })` callback when defining self-referential fields (`ref(self)`, `slice(self)`) for 100% TypeScript type inference.

- `def.size` / `def.stride`: Struct byte size including trailing alignment padding.
- `def.align`: Struct byte alignment (`1`, `2`, `4`, or `8`).
- `def.fields`: Map of field names to `{ name, desc, offset, size, align }`.
- `typeof def.$view` / `InferView<typeof def>`: Inferred `StructView<F>` type.
- `typeof def.$plain` / `InferPlain<typeof def>`: Inferred plain JS object type (`toObject()`).
- `typeof def.$input` / `InferInput<typeof def>`: Inferred input object type (`pack()`, `create()`, `push()`).
- `def.item(init)`: Identity helper that types a plain JS object literal as `Partial<StructInput<F>>` (for building cyclic JS object graphs with full static type inference).
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
- **`ref(target)` / `ref(self)` / `ref(() => target)`**: 8-byte relative-offset nullable/circular struct reference (`[u32 relOffset, u32 present]`). Supports self-referential (`ref(self)`) and mutually recursive (`ref(() => OtherStruct)`) schemas, cycle-safe packing (`pack()`), `O(1)` zero-copy view traversal and pointer relinking (`row.next = otherRow`), and cycle-preserving `.toObject()` / `.toObjects()`.
- **`slice(element)` / `slice(self)` / `slice(() => element)`**: 8-byte relative-offset variable-length slice (`[u32 relOffset, u32 length]`). Supports `slice(self)` or a lazy thunk `() => StructDef` for recursive tree/graph child lists.

- `<field>`: Getter and setter for every field in `F` (primitives, nested structs, `fixedArray`, `fixedStr`, `fixedBytes`, `str`, `ref`, and `slice`).
- `view.seek(index)` / `view.at(index)`: Repositions a flyweight cursor to row `index` in `O(1)` (supports negative indices from the end).
- `view.set(field, value)` / `view.set(partialObject)` / `view.setAll(partialObject)`: Updates one or more fields in place.
- `view.toObject()` / `view.toJSON()`: Materializes a plain JS object `{ ... }`.
- `view.usedByteLength` / `view.deadByteLength` / `view.compactionRatio`: Active + dead bytes, reclaimable dead tail bytes, and ratio (`0..1`) of dead tail bytes to total used bytes.
- `view.compact()`: Strips dead tail bytes and rebinds the `StructView` in-place to a tight `Uint8Array`.
- `view.bytes`: Underlying `Uint8Array` slice (auto-compacts if dirty or containing dead tail bytes).

### `StructArrayView<F>`

- `rows.length` / `rows.stride` / `rows.byteLength` / `rows.byteOffset` / `rows.buffer`
- `rows.at(index, cursor?)`: Returns a `StructView<F>` for `index` (uses a 256-slot ring pool or the provided `cursor`).
- `rows.cursor(index?)`: Returns a reusable flyweight `StructView<F>` cursor (reposition via `cursor.seek(i)` or `cursor.at(i)`).
- `for (const row of rows)`: Zero-allocation flyweight iterator.
- `rows.subarray(begin?, end?)`: Returns a zero-copy `StructArrayView<F>` slice over `[begin, end)` in `O(1)` without copying bytes.
- `rows.lowerBound(field, value)` / `rows.upperBound(field, value)`: `O(log N)` binary search directly on a sorted primitive column (0 allocations).
- `rows.rangeBy(field, min, max)`: Returns a zero-copy `StructArrayView<F>` slice over `min <= row[field] <= max` in `O(log N)`.
- `rows.filterBytes(predicate)`: Filters rows with a reusable flyweight cursor (0 per-row JS objects) and copies matching binary rows into a tight `Uint8Array`.
- `rows.push(...items)`: Appends rows in-place, automatically growing capacity as needed.
- `rows.pop()`: Removes and returns the last row as a plain JS object.
- `rows.column(field)`: Extracts a `TypedArray` for primitive `field` (zero-copy when `stride === field.size`).
- `rows.setColumn(field, values)`: Bulk-writes a primitive column from any `ArrayLike`.
- `rows.usedByteLength` / `rows.deadByteLength` / `rows.compactionRatio`: Active + dead bytes, reclaimable dead tail bytes, and ratio (`0..1`) of dead tail bytes to total used bytes.
- `rows.compact()`: Strips dead tail bytes and rebinds the view to a tight `Uint8Array`.
- `rows.bytes`: Returns a wire-ready `Uint8Array` (automatically calling `.compact()` if dirty).
- `toRustReprC(schemas, options?)` / `toGoStruct(schemas, options?)` (`from 'capnstruct/codegen'`): Generates `rustc`-verified Rust `#[repr(C)]` structs or `go build` / `tinygo build`-verified Go zero-copy structs (with `CapnBytes`, `CapnView[T]`, `CapnSliceView[T]`, `CapnStr`, `CapnSlice[T]`, `CapnRef[T]`, `//go:wasmexport capn_alloc` & `capn_reset` when `{ wasm: true }` / `--go-wasm`, and compile-time size/alignment/offset assertions).

---

## Data Layout > Switching to Bun, Rust, or Go/TinyGo (Benchmarks & Bundle Size)

Measured via `pnpm run bench` on **Node.js v24.15.0 (V8 13.6)**, **Bun v1.4.3 (JavaScriptCore)**, **Rust 1.96 (`rustc -O3 wasm32`)**, **Go 1.27 (`GOOS=wasip1 GOARCH=wasm`)**, and **TinyGo 0.43 (`-target=wasi -opt=2`)**, plus `pnpm run size`:

| Workload                                                                                                                           | Node.js (V8) Baseline (`ms` / Heap)        | Bun (JSC) Baseline (`ms` / Heap)           | Rust `-O3` WASM JSON / FFI        | `capnstruct` Zero-Copy (JS / Go·TinyGo WASM / Rust `#[repr(C)]`)                                     | Speedup (Layout vs. Engine/Lang)              |
| :--------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------- | :----------------------------------------- | :-------------------------------- | :--------------------------------------------------------------------------------------------------- | :-------------------------------------------- |
| **`100,000` `SpdSample` Numeric Struct Scan** (`5.27 MiB` JSON vs `2.29 MiB` `capnstruct`)                                         | 14.14 ms / **+10.30 MB**                   | 5.65 ms / **+6.87 MB**                     | 3.68 ms (in-WASM) / 23.7 ms (FFI) | **0.31 ms JS** (Bun: 0.16 ms) / **0.084 ms TinyGo** / **0.107 ms Go** / **0.071 ms Rust** (**0 MB**) | **45x faster JS / 168x TinyGo / 198x Rust**   |
| **Sparse Viewport BBox Filter + Lazy UTF-8 Decode** (`25,000` `Flight` Telemetry rows × 13 fields, ~0.4% hit rate)                 | 13.24 ms / **+8.17 MB**                    | 7.36 ms / **+5.21 MB**                     | 4.16 ms (in-WASM JSON scan)       | **0.39 ms JS** / **0.031 ms Go WASM** / **0.034 ms TinyGo** / **0.020 ms Rust** (**0 MB**)           | **34x faster JS / 428x Go WASM / 651x Rust**  |
| **JS &harr; WASM Boundary Scan** (`25,000` `QpPoint` structs in `WebAssembly.Memory`: `JSON`/`serde` FFI vs `WasmArena`)           | 5.48 ms / **+3.70 MB**                     | 2.10 ms / **+1.72 MB**                     | 5.48 ms (FFI)                     | **0.34 ms JS** / **0.036 ms Rust** (**0 MB**)                                                        | **16x faster JS / 153x Rust**                 |
| **Web Worker `postMessage` Round-Trip + Update** (`25,000` `Telemetry` rows: `structuredClone` vs `SharedArrayBuffer` in-place)    | 45.94 ms / **+14.24 MB**                   | 35.50 ms / **+5.73 MB**                    | -                                 | **0.046 ms JS** (Bun: 0.028 ms) / **0.00 MB**                                                        | **~1,000x-1,270x faster (0 MB)**              |
| **Zero-Heap Time-Window Range Query** (`100,000` sorted rows: `JSON.parse` + `.filter()` vs `.rangeBy('id', min, max).bytes`)      | 14.06 ms / **+10.33 MB**                   | 5.88 ms / **+6.88 MB**                     | -                                 | **0.0058 ms JS** (**0.00 MB** heap)                                                                  | **~2,408x faster (0 MB heap)**                |
| **Cyclic Graph Clone & Traversal** (`10,000` doubly-linked `RingNode`s: `JSON.stringify` / `serde_json` / `encoding/json` throw!)  | 3.23 ms (`structuredClone`) / **+1.76 MB** | 2.63 ms (`structuredClone`) / **+0.69 MB** | Throws on cyclic JSON!            | **0.30 ms JS** / **0.019 ms Go WASM** / **0.034 ms TinyGo** / **0.016 ms Rust** (**0 MB**)           | **8.7x faster JS / 173x Go WASM / 190x Rust** |

| Entrypoint                                                              | Minified  | Minified + Gzip (`level: 9`) |
| :---------------------------------------------------------------------- | :-------- | :--------------------------- |
| **Declarative Schema API (Core Runtime + All Primitives + `ref`)**      | 16.79 KiB | **6.51 KiB** (6,666 B)       |
| **Full Runtime (+ `WasmArena`)**                                        | 18.53 KiB | **7.02 KiB** (7,186 B)       |
| **Rust `#[repr(C)]` & Go / TinyGo WASM Codegen (`capnstruct/codegen`)** | 7.44 KiB  | **2.53 KiB** (2,595 B)       |
