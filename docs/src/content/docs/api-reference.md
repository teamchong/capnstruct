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
- `typedef def.$view` / `InferView<typeof def>`: Inferred read-only `StructView<F>` type (`view()`, `viewEnvelope()`, `produce()`, `array().at(i)`).
- `typedef def.$mutView` / `InferMutView<typeof def>`: Inferred mutable `MutStructView<F>` type (`mutView()`, `create()`, `mutArray().at(i)`, `alloc().at(i)`, `shared().at(i)`).
- `typedef def.$draft` / `InferDraft<typeof def>`: Inferred mutable draft type (`StructDraft<F>`) inside `produce(view, (draft) => ...)`.
- `typedef def.$header` / `InferHeader<typeof def>`: Inferred header-only `StructHeaderView<F>` type exposing only inline fixed-offset fields (omitting tail-allocated `str`, `slice`, and `ref` fields).
- `typedef def.$plain` / `InferPlain<typeof def>`: Inferred plain JS object type (`toObject()`).
- `typedef def.$input` / `InferInput<typeof def>`: Inferred input object type (`pack()`, `create()`, `push()`).
- `def.item(init)`: Identity helper that types a plain JS object with `InferInput<typeof def>` for cyclic graph setup (`nodeA.next = nodeB`) before `pack()` / `create()`.
- `def.array(source, optionsOrOffset?, count?)`: Wraps a `Uint8Array` / `ArrayBuffer` / `SharedArrayBuffer` / `DataView` / `WebAssembly.Memory` / `WasmArena` as a read-only `StructArrayView<F>` with zero copying.
- `def.mutArray(source, optionsOrOffset?, count?)`: Wraps a binary buffer as a mutable `MutStructArrayView<F>` for explicit in-place mutations (`set`, `push`, `pop`, `setColumn`, `compact`).
- `def.alloc(rowsOrCount)`: Allocates a mutable `MutStructArrayView<F>` backed by a fresh `ArrayBuffer` (`count` zero-initialized rows, or packs an array of objects).
- `def.shared(rowsOrCount)`: Allocates or packs a mutable `MutStructArrayView<F>` backed by a `SharedArrayBuffer` (with `ArrayBuffer` fallback) for zero-copy Worker `worker.postMessage(rows.buffer)` state sharing.
- `def.inWasm(wasmMemoryOrExports, rowsOrCount)`: Allocates or packs a mutable `MutStructArrayView<F>` directly inside WebAssembly memory (via `WasmArena`, `WebAssembly.Instance` / exports with `capn_alloc` or `alloc`, or raw `WebAssembly.Memory`) and returns `{ view, ptr, len, byteLength }` ready to pass straight into `wasm.exports.run_kernel(ptr, len)`.
- `def.create(init?)`: Allocates a single mutable `MutStructView<F>` backed by a fresh buffer (`create(init).bytes` and `view.bytes` share the exact same single-row binary format as `pack([init])`).
- `def.from(rows)`: Packs an array of JS objects, struct views, or positional tuples into a new mutable `MutStructArrayView<F>` in one step.
- `def.pack(rows)` / `pack(def, rows)`: Packs an array of plain JS objects, struct views, or positional tuples into a single 8-byte-aligned `Uint8Array`.
- `def.concatBytes(chunks)` / `concatBytes(def, chunks)`: Concatenates multiple `StructArrayView<F>` or `Uint8Array` chunks into a single packed `Uint8Array` via bulk `memcpy` when fixed-size.
- `def.view(source, optionsOrOffset?)` / `structView(def, source, ...)`: Wraps a single struct in `source` as a read-only `StructView<F>` without copying (`source` can be `Uint8Array`, `ArrayBuffer`, `DataView`, `WebAssembly.Memory`, or `WasmArena`).
- `def.mutView(source, optionsOrOffset?)` / `mutStructView(def, source, ...)`: Wraps a single struct in `source` as a mutable `MutStructView<F>` for explicit in-place mutations.
- `def.viewHeader(source, optionsOrOffset?)`: Wraps a partial binary buffer containing at least `def.byteSize` bytes (e.g. `await file.slice(0, def.byteSize).arrayBuffer()`) in a read-only type-safe `StructHeaderView<F>` exposing only inline fixed-offset fields (`toObject()` also safely omits tail fields).
- `def.packEnvelope(row)` / `def.viewEnvelope(source)`: Wraps and unwraps a single root struct in a self-describing `CS01` schema-evolution envelope (header + FNV-1a type table + payload) for forward- and backward-compatible decoding across schema versions.
- `produce(base, recipe)` / `produce(recipe)`: Immer-style immutable updates over any `StructView<F>` or `StructArrayView<F>` (including `CS01` envelopes and schema-evolved views). Returns a new read-only view without mutating `base`; returns `base` directly in `O(1)` when `base.readonly` is true and no fields changed; uses an inline fixed-size fast path (`O(dirty fields)`) when only fixed-size fields change, and automatically repacks preserving cyclic/diamond `ref` graphs on variable-length or structural edits. Supports curried `const updater = produce((d: typeof MySchema.$draft) => { ... })`.

- `f16`: 2-byte IEEE 754 half-precision float (`Float16Array` column support).
- `fixedStr(N)`: Inline fixed-length null-padded UTF-8 string `[u8; N]` (`align: 1, size: N`) with 0 tail indirection.
- `fixedBytes(N)`: Inline fixed-length byte array `[u8; N]` (`align: 1, size: N`) read as a zero-copy `Uint8Array`.
- `sentinel(prim, nullValue)` / `nullable(prim, nullValue)`: Maps an inline sentinel value (e.g. `-32768` for `i16` or `NaN` for `f32`) to `null` in JS with 0 extra wire bytes. Codegen emits `FIELD_NULL` constants and `field_opt(&self) -> Option<T>` helpers.
- `optStr` / `nullable(str)`: Zero-overhead optional UTF-8 string (`CapnOptStr`, 8 bytes `[u32 off, u32 len]` where `{0, 0}` = `null`, `{1, 0}` = `""`, `{off, len}` = non-empty).
- `scaled(prim, factor, { null? })`: Fixed-point scaled primitive (stores `Math.round(val * factor)` in `prim`, reads `raw / factor` as `number`).
- `ref(target)` / `ref(self)` / `ref(() => target)`: 8-byte relative-offset nullable/circular struct reference (`[u32 relOffset, u32 present]`). Supports self-referential (`ref(self)`) and mutually recursive (`ref(() => OtherStruct)`) schemas, cycle-safe packing (`pack()`), `O(1)` zero-copy view traversal and pointer relinking (`row.next = otherRow`), and cycle-preserving `.toObject()` / `.toObjects()`.
- `slice(element)` / `slice(self)` / `slice(() => Element)`: 8-byte relative-offset variable-length slice (`[u32 relOffset, u32 length]`). Supports `slice(self)` or a lazy thunk `() => StructDef | UnionDef` for recursive tree/graph child lists. `slice(Union)` and `fixedArray(Union, N)` return a lazy zero-copy `UnionArrayView` (with `at(i)`, `tagAt(i)`, `set(i, val)`, `subarray`/`slice`, `map`/`forEach`/`find`/`some`/`every`, `toObjects()`, and `[Symbol.iterator]`).
- `defineUnion(name, variants | ((self) => variants))` / `union(...)`: Tagged-union schema matching Rust `#[repr(u8)]` (unit-only, 1 byte, align 1) and `#[repr(C, u8)]` (1-byte discriminant + aligned payload union at `align_up(1, maxAlign)`). Supports `null` unit variants, primitives, structs, nested unions, `str`, `optStr`, `slice`, `ref`, and recursive `self` definitions. In JS, values read/write as `{ tag: 'Variant' }` (unit) or `{ tag: 'Variant', value }` (payload); invalid wire tags throw `RangeError`. Pure-JS UTF-8 fallback runs automatically in runtimes without global `TextDecoder`/`TextEncoder` (e.g. QuickJS).
- `view.readonly`: `true` on read-only views (`view()`, `viewEnvelope()`, `array()`, `produce()`, `viewHeader()`), `false` on explicit mutable views (`mutView()`, `mutArray()`, `create()`, `alloc()`, `shared()`, `inWasm()`, `from()`). Attempting to mutate a read-only view throws a `TypeError` at runtime and is rejected by TypeScript at compile time.
- `view.seek(index)` / `view.at(index)`: Repositions a flyweight cursor to row `index` in `O(1)` (supports negative indices from the end).
- `mutView.set(field, value)` / `mutView.set(partialObject)` / `mutView.set(tuple)`: Updates one or more fields in place on a `MutStructView<F>`.
- `view.toObject()` / `view.toJSON()`: Materializes a plain JS object.
- `view.toDebugObject()` / `rows.toDebugObject()`: Returns `{ schema, stride, rowCount, usedByteLength, deadByteLength, compactionRatio, data }` for structured debugging.
- `view.usedByteLength` / `view.deadByteLength` / `view.compactionRatio`: Active + dead bytes, reclaimable dead tail bytes, and ratio (`0..1`) of dead tail bytes to total used bytes.
- `mutView.compact()`: Strips dead tail bytes and rebinds the mutable view to a tight `Uint8Array`.
- `view.bytes`: Returns a wire-ready `Uint8Array` (on read-only views, never mutates `this`; on dirty mutable views, compacts in place).
- `rows.length` / `rows.stride` / `rows.byteLength` / `rows.byteOffset` / `rows.buffer`
- `rows.at(index, cursor?)`: Returns a `StructView<F>` for `index` (uses a 256-slot ring pool or the provided `cursor`).
- `rows.cursor(index?)`: Returns a reusable flyweight `StructView<F>` cursor (reposition via `cursor.seek(i)` or `cursor.at(i)`).
- `for (const row of rows)` / `rows.values({ flyweight?: boolean })`: By default (`flyweight: true`), `[Symbol.iterator]` reuses a single flyweight cursor (`0` allocations). When collecting `StructView` instances into an array or `Set` (`[...rows.values({ flyweight: false })]`), pass `{ flyweight: false }` or use `rows.map(...)` / `rows.toObjects()`.
- `rows.map(fn)` / `rows.forEach(fn)` / `rows.find(fn)` / `rows.some(fn)` / `rows.every(fn)`: Array-like iteration and projection helpers (`rows.map(fn)` passes a distinct `StructView<F>` per element; `rows.forEach(fn)` reuses a flyweight cursor with `0` allocations).
- `rows.subarray(begin?, end?)` / `rows.slice(begin?, end?)`: Returns a zero-copy `StructArrayView<F>` slice over `[begin, end)` in `O(1)` without copying bytes.
- `rows.lowerBound(field, value)` / `rows.upperBound(field, value)`: `O(log N)` binary search directly on a sorted primitive column (`0` allocations).
- `rows.rangeBy(field, min, max)`: Returns a zero-copy `StructArrayView<F>` slice over `min <= row[field] <= max` in `O(log N)`.
- `mutRows.push(...items)`: Appends rows in-place on a `MutStructArrayView<F>`, automatically growing capacity as needed.
- `mutRows.pop()`: Removes and returns the last row as a plain JS object (or `undefined` when empty).
- `rows.column(field)`: Extracts a `TypedArray` for a primitive field (zero-copy when `stride === field.size`).
- `mutRows.setColumn(field, values)`: Bulk-writes a primitive column from any `ArrayLike` on a `MutStructArrayView<F>`.
- `rows.usedByteLength` / `rows.deadByteLength` / `rows.compactionRatio`: Active + dead bytes, reclaimable dead tail bytes, and ratio (`0..1`) of dead tail bytes to total used bytes.
- `mutRows.compact()`: Strips dead tail bytes and rebinds the mutable view to a tight `Uint8Array`.
- `rows.bytes`: Returns a wire-ready `Uint8Array`.
- `toRustReprC(schemas, options?)` / `toGoStruct(schemas, options?)` (from `capnstruct/codegen`): Generates `rustc`-verified Rust `#[repr(C)]` structs, `#[repr(C, u8)]`/`#[repr(u8)]` enums, zero-unsafe `*Reader<'a>` / `CapnSliceReader` / `CapnError` / `CapnTable` decoders (`parse_envelope`, `reader`, `read_slice`), and `CapnBuilder` (`with_capacity`/`into_bytes`/`build_vec`/`build_envelope_vec`/`build_ref_opt`/`str_dedup`/`opt_str`/`opt_str_dedup`/`pack_slice`) with `{ builder: true }`, `{ unsafeSlice: false }` for `#![forbid(unsafe_code)]`, `{ wasmExports: false | 'cfg(...)' }`, and `{ allow: [...] }`, or `go build` / `tinygo build`-verified Go zero-copy structs and tagged unions (`CapnBytes`, `CapnView[T]`, `CapnSliceView[T]`, `CapnStr`, `CapnOptStr`, `CapnSlice[T]`, `CapnRef[T]`, `CapnBuilder`).
- `installDevtoolsFormatter()`: Auto-registered in browsers on `globalThis.devtoolsFormatters` (alongside `[Symbol.for('nodejs.util.inspect.custom')]()` in Node.js / Bun / Vitest) so `StructView` and `StructArrayView` format cleanly in `console.log()` and browser DevTools with zero eager row allocation.

