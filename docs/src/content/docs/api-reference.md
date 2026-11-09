---
title: API Reference & Wire Format
description: Complete binary wire layout specification and TypeScript / WebAssembly API reference for capnstruct.
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

- `def.size` / `def.byteSize` / `def.stride`: Fixed struct header byte size including trailing alignment padding (useful for `file.slice(0, def.byteSize)` partial header reads).
- `def.align`: Struct byte alignment (`1`, `2`, `4`, or `8`).
- `def.fields`: Map of field names to `{ name, desc, offset, size, align }`.
- `typeof def.$view` / `InferView<typeof def>`: Inferred `StructView<F>` type.
- `typeof def.$header` / `StructHeaderView<F>`: Inferred header-only `StructView` type exposing only inline fixed-offset fields (omitting tail-allocated `str`, `slice`, and `ref` fields).
- `typeof def.$plain` / `InferPlain<typeof def>`: Inferred plain JS object type (`toObject()`).
- `typeof def.$input` / `InferInput<typeof def>`: Inferred input object type (`pack()`, `create()`, `push()`).
- `def.item(init)`: Identity helper that types a plain JS object literal as `Partial<StructInput<F>>` (for building cyclic JS object graphs with full static type inference).
- `def.offsetOf(field)`: Returns the byte offset of `field`.
- `def.from(sourceOrRows)`: Universal 1-step constructor: packs an array/iterable of plain JS objects into a `StructArrayView<F>`, wraps a `Uint8Array` / `ArrayBuffer` / `SharedArrayBuffer` / `DataView` / `WebAssembly.Memory` / `WasmArena` with zero copying, or allocates `count` zero-initialized rows when passed a `number`.
- `def.shared(rowsOrCount)`: Allocates or packs a `StructArrayView<F>` backed by a `SharedArrayBuffer` (with `ArrayBuffer` fallback) for zero-copy Web Worker `worker.postMessage(rows.buffer)` state sharing.
- `def.inWasm(wasmMemoryOrExports, rowsOrCount)`: Allocates or packs a `StructArrayView<F>` directly inside `WebAssembly.Memory` (via `WasmArena`, `WebAssembly.Instance` / `exports` with `capn_alloc` or `alloc`, or raw `WebAssembly.Memory`) and returns `{ view, ptr, len, byteLength }` ready to pass straight into `wasm.exports.run_kernel(ptr, len)`.
- `def.create(init?)`: Allocates a single `StructView<F>` backed by a fresh buffer (`create(init).bytes` and `view(bytes)` share the exact same zero-gap layout).
- `def.alloc(count)`: Allocates a `StructArrayView<F>` for `count` rows (pass `0` for an empty growable array).
- `def.pack(rows)` / `pack(def, rows)`: Packs an array of plain JS objects into an 8-byte-aligned `Uint8Array`.
- `def.concatBytes(chunks)` / `concatBytes(def, chunks)`: Concatenates multiple `StructArrayView<F>` or `Uint8Array` chunks into a single packed `Uint8Array` via bulk `memcpy` when fixed-size.
- `def.view(source, optionsOrOffset?)`: Wraps a single struct in `source` without copying (`source` can be `Uint8Array`, `ArrayBuffer`, `DataView`, `WebAssembly.Memory`, or `WasmArena`).
- `def.viewHeader(source, optionsOrOffset?)`: Wraps a partial binary buffer containing at least `def.byteSize` bytes (e.g. `await file.slice(0, def.byteSize).arrayBuffer()`) in a type-safe `StructHeaderView<F>` exposing only inline fixed-offset fields (`.toObject()` also safely omits tail fields).
- `def.array(source, optionsOrOffset?, count?)`: Wraps a sequence of structs in `source` without copying (auto-infers `length` even when row 0 has empty `str`/`slice` fields).
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
- `view.toDebugObject()` / `rows.toDebugObject()`: Returns `{ schema, stride, rowCount, usedByteLength, deadByteLength, compactionRatio, data }` for structured debugging.
- `view.usedByteLength` / `view.deadByteLength` / `view.compactionRatio`: Active + dead bytes, reclaimable dead tail bytes, and ratio (`0..1`) of dead tail bytes to total used bytes.
- `view.bytes`: Underlying `Uint8Array` slice (auto-compacts if dirty or containing dead tail bytes).

### `StructArrayView<F>`

- `rows.length` / `rows.stride` / `rows.byteLength` / `rows.byteOffset` / `rows.buffer`
- `rows.at(index, cursor?)`: Returns a `StructView<F>` for `index` (uses a 256-slot ring pool or the provided `cursor`).
- `rows.cursor(index?)`: Returns a reusable flyweight `StructView<F>` cursor (reposition via `cursor.seek(i)` or `cursor.at(i)`).
- `for (const row of rows)` / `rows.values({ flyweight?: boolean })`: By default (`flyweight: true`), `[Symbol.iterator]` reuses a single flyweight cursor (`0` allocations). When collecting `StructView` instances into an array or `Set` (`[...rows.values({ flyweight: false })]`), pass `{ flyweight: false }` or use `rows.map(...)` / `rows.toObjects()`.
- `rows.map(fn)` / `rows.forEach(fn)` / `rows.find(fn)` / `rows.some(fn)` / `rows.every(fn)`: Array-like iteration and projection helpers (`rows.map(fn)` passes a distinct `StructView<F>` per element; `rows.forEach(fn)` reuses a flyweight cursor with `0` allocations).
- `rows.subarray(begin?, end?)` / `rows.slice(begin?, end?)`: Returns a zero-copy `StructArrayView<F>` slice over `[begin, end)` in `O(1)` without copying bytes.
- `rows.lowerBound(field, value)` / `rows.upperBound(field, value)`: `O(log N)` binary search directly on a sorted primitive column (`0` allocations).
- `rows.rangeBy(field, min, max)`: Returns a zero-copy `StructArrayView<F>` slice over `min <= row[field] <= max` in `O(log N)`.
- `rows.filter(predicate)` / `rows.filterBytes(predicate)`: Filters rows with a reusable flyweight cursor (`0` per-row JS objects) and returns a new `StructArrayView<F>` (`filter`) or tight `Uint8Array` (`filterBytes`).
- `rows.push(...items)`: Appends rows in-place, automatically growing capacity as needed.
- `rows.pop()`: Removes and returns the last row as a plain JS object.
- `rows.column(field)`: Extracts a `TypedArray` for primitive `field` (zero-copy when `stride === field.size`).
- `rows.setColumn(field, values)`: Bulk-writes a primitive column from any `ArrayLike`.
- `rows.usedByteLength` / `rows.deadByteLength` / `rows.compactionRatio`: Active + dead bytes, reclaimable dead tail bytes, and ratio (`0..1`) of dead tail bytes to total used bytes.
- `rows.compact()`: Strips dead tail bytes and rebinds the view to a tight `Uint8Array`.
- `rows.bytes`: Returns a wire-ready `Uint8Array` (automatically calling `.compact()` if dirty).
- `toRustReprC(schemas, options?)` / `toGoStruct(schemas, options?)` (`from 'capnstruct/codegen'`): Generates `rustc`-verified Rust `#[repr(C)]` structs or `go build` / `tinygo build`-verified Go zero-copy structs (with `CapnBytes`, `CapnView[T]`, `CapnSliceView[T]`, `CapnStr`, `CapnSlice[T]`, `CapnRef[T]`, zero-alloc `CapnBuilder` + `StrDedup` + `CapnBuild[T]` + `CapnBuildSlice[T]` + `CapnPack[T]`, `//go:wasmexport capn_alloc` & `capn_reset` when `{ wasm: true }` / `--go-wasm`, and compile-time size/alignment/offset assertions).
- `installDevtoolsFormatter()`: Auto-registered in browsers on `globalThis.devtoolsFormatters` (alongside `[Symbol.for('nodejs.util.inspect.custom')]()` in Node.js / Bun / Vitest) so `StructView` and `StructArrayView` format cleanly in `console.log()` and browser DevTools with zero eager row allocation.

