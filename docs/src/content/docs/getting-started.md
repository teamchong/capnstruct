---
title: Getting Started
description: Install capnstruct, define #[repr(C)] schemas, pack binary buffers, and iterate with zero heap allocations.
---

## Installation

```bash
npm install capnstruct
# or
pnpm add capnstruct
```

`capnstruct` ships native ES modules + TypeScript declarations (&lt; 4.5 KiB minified + gzipped) and runs in Node.js, Cloudflare Workers, Bun, Deno, and browsers.

---

## 1. Define a Schema

Use `defineStruct` (or its alias `struct`) to declare your struct fields. `capnstruct` automatically computes exact C/Rust `#[repr(C)]` alignment, inter-field padding, field offsets, and trailing stride padding:

```ts
import {
  defineStruct,
  u8, u16, u32, u64,
  i8, i16, i32, i64,
  f32, f64, bool,
  fixedArray, str, slice,
} from 'capnstruct';

export const SpdSample = defineStruct('SpdSample', {
  t: u32,   // offset 0, size 4 (4 bytes of padding auto-inserted after t)
  val: f64, // offset 8, size 8 (8-byte aligned)
  id: u32,  // offset 16, size 4 (4 bytes of trailing padding to align stride to 8)
});

console.log(SpdSample.size);            // 24
console.log(SpdSample.align);           // 8
console.log(SpdSample.offsetOf('val')); // 8
```

### Supported Field Descriptors

| Descriptor | Size | Alignment | JS/TS Value Type | C / Rust `#[repr(C)]` Equivalent |
| :--- | :--- | :--- | :--- | :--- |
| `u8` / `i8` / `bool` | `1 B` | `1 B` | `number` / `boolean` | `u8` / `i8` / `bool` |
| `u16` / `i16` | `2 B` | `2 B` | `number` | `u16` / `i16` |
| `u32` / `i32` / `f32` | `4 B` | `4 B` | `number` | `u32` / `i32` / `f32` |
| `u64` / `i64` | `8 B` | `8 B` | `bigint` (accepts `number` on write) | `u64` / `i64` |
| `f64` | `8 B` | `8 B` | `number` | `f64` |
| `fixedArray(el, N)` | `N * el.size` | `el.align` | `TypedArray` (primitives) or `StructArrayView` | `[T; N]` |
| `str` | `8 B` inline | `4 B` | `string` (UTF-8 in tail arena) | `CapnStr { off: u32, len: u32 }` |
| `slice(el)` | `8 B` inline | `4 B` | `TypedArray` / `StructArrayView` | `CapnSlice<T> { off: u32, len: u32 }` |
| Nested `StructDef` | `def.size` | `def.align` | `StructView<F>` | Nested `#[repr(C)]` struct |

---

## 2. Pack & Read Zero-Copy Binary Views

Pack an array of plain JS objects into a tight 8-byte-aligned `Uint8Array` via `SpdSample.pack(rows)` (or `pack(SpdSample, rows)`), and wrap any `Uint8Array`, `ArrayBuffer`, `DataView`, or `WebAssembly.Memory` without copying via `SpdSample.array(bytes)`:

```ts
// Pack plain JS objects into a contiguous Uint8Array
const bytes: Uint8Array = SpdSample.pack([
  { t: 100, val: 42.5, id: 1 },
  { t: 200, val: 99.0, id: 2 },
]);

// Wrap the binary buffer with zero copying
const samples = SpdSample.array(bytes);
console.log(samples.length); // 2

// Random access with normal JS property syntax
const first = samples.at(0);
console.log(first.t, first.val, first.id); // 100, 42.5, 1

// Supports object spread, destructuring, Object.keys, and JSON.stringify
console.log({ ...first });          // { t: 100, val: 42.5, id: 1 }
console.log(JSON.stringify(first)); // '{"t":100,"val":42.5,"id":1}'
```

---

## 3. Zero-Allocation Flyweight Iteration

When iterating over `samples` with `for (const row of samples)`, `capnstruct` reuses a **single flyweight cursor instance** and simply advances its internal byte offset (`cursor._o += stride`) on each step. Across 100,000,000 rows, it allocates **zero V8 heap objects**:

```ts
let sum = 0;
for (const row of samples) {
  sum += row.val;
}

// For zero-allocation random access in tight loops, pass an explicit cursor:
const cursor = samples.cursor();
for (let i = 0; i < samples.length; i++) {
  const row = samples.at(i, cursor);
  sum += row.t;
}
```
