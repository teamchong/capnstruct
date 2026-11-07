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
2. **Relative Tail Descriptors (`str` and `slice(T)`)**: Stored inline as 8 bytes `[u32 relOffset, u32 length]` (little-endian). When `length === 0`, `relOffset` is `0`. When `length > 0`, the payload starts at `structBaseOffset + relOffset`.
3. **Zero-Header Row Count Recovery**: For fixed-size structs, `rowCount = byteLength / def.size`. For variable-length structs packed via `pack()`, the first variable-length descriptor in row 0 points to the start of the tail arena (`tailStart`), allowing `StructDef.array(bytes)` to recover `rowCount = Math.floor(tailStart / def.size)` in `O(1)` without a separate framing header.
4. **Wire-Safety Bounds & Amplification Defense**: `Uint8Array` sub-views are clamped to `[byteOffset .. byteOffset + byteLength]` so untrusted descriptors cannot bleed into surrounding `ArrayBuffer` memory. Every `[relOffset, length]` descriptor is checked against `[structEnd .. bufferEnd]` (`RangeError('Out of bounds')`), and `toObject()` / `toObjects()` enforce an `8x` traversal budget (min 64 KiB) against cyclic or aliased pointer amplification attacks.
---

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
- `scaled(prim, factor, { null? })`: Fixed-point scaled primitive (stores `Math.round(val * factor)` in `prim`, reads `raw / factor` as `number`).

### `StructView<F>`

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

---

## Node.js / V8 Benchmarks & Bundle Size

Measured via `pnpm run bench` and `pnpm run size`:

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
