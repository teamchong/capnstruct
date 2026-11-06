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
3. **Zero-Header Row Count Recovery**: For fixed-size structs, `rowCount = byteLength / def.size`. For variable-length structs packed via `pack()`, the first variable-length descriptor in row 0 points to the start of the tail arena (`tailStart`), allowing `StructDef.array(bytes)` to recover `rowCount = Math.floor(tailStart / def.size)` in O(1) without a separate framing header.

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
- `def.view(source, optionsOrOffset?)`: Wraps a single struct in `source` without copying.
- `def.array(source, optionsOrOffset?, count?)`: Wraps a sequence of structs in `source` without copying.
### `StructView<F>`

- `<field>`: Getter and setter for every field in `F` (primitives, nested structs, `fixedArray`, `str`, and `slice`).
- `view.set(field, value)` / `view.set(partialObject)` / `view.setAll(partialObject)`: Updates one or more fields in place.
- `view.toObject()` / `view.toJSON()`: Materializes a plain JS object `{ ... }`.
- `view.bytes`: Underlying `Uint8Array` slice (auto-compacts if dirty).

### `StructArrayView<F>`

- `rows.length` / `rows.stride` / `rows.byteLength` / `rows.byteOffset` / `rows.buffer`
- `rows.at(index, cursor?)`: Returns a `StructView<F>` for `index` (uses a 256-slot ring pool or the provided `cursor`).
- `rows.cursor(index?)`: Returns a reusable flyweight `StructView<F>`.
- `for (const row of rows)`: Zero-allocation flyweight iterator.
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

| Benchmark Scenario | `JSON.parse` / `JSON.stringify` | `capnstruct` Zero-Copy | Speedup |
| :--- | :---: | :---: | :---: |
| **100,000 `SpdSample` Numeric Struct Scan** (`for..of` flyweight cursor, 0 heap allocs) | 13.92 ms | **0.51 ms** | **27.1x faster** |
| **25,000 Flight Telemetry Rows (13 fields)** Sparse BBox Filter + Lazy String Decode | 13.45 ms | **0.28 ms** | **48.8x faster** |
| **25,000 Flight Telemetry Rows** Live In-Place `str` Mutation vs JSON Round-Trip | 30.28 ms | **0.039 ms** | **767.8x faster** |

| Entrypoint | Minified | Minified + Gzip (`level: 9`) |
| :--- | :---: | :---: |
| **Declarative Schema API (Core Runtime)** | 11.60 KiB | **4.41 KiB** (4,520 B) |
| **Full Runtime (+ `WasmArena`)** | 13.34 KiB | **4.92 KiB** (5,037 B) |
| **Rust `#[repr(C)]` Codegen (`capnstruct/codegen`)** | 2.36 KiB | **1.06 KiB** (1,082 B) |
