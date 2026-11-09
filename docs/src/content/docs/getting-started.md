---
title: Getting Started
description: "Install capnstruct, define #[repr(C)] schemas, pack binary buffers, and iterate with zero heap allocations."
---

## Installation

```bash
npm install capnstruct
```

`capnstruct` ships native ES modules + TypeScript declarations (&lt; 6.7 KiB minified + gzipped, 0 dependencies) and runs in Node.js, Cloudflare Workers, Bun, Deno, and browsers.

## 3-Line Hello World (Two-Call Mental Model)

You only need two calls to start: `struct(...)` to declare a schema, and `.inWasm(...)` / `.shared(...)` / `.from(...)` to allocate or wrap 100,000 live `#[repr(C)]` structs inside `WebAssembly.Memory` or `SharedArrayBuffer` with zero copying:

```ts
import { struct, u32, f32, u16, str, slice, ref } from 'capnstruct';

const Waypoint = struct('Waypoint', { lat: f32, lon: f32 });
const Flight   = struct('Flight', { id: u32, callsign: str, alt: u16, waypoints: slice(Waypoint), nextRelay: ref('Flight') });
const { view: fleet, ptr, len } = Flight.inWasm(wasmMem, workerRows); // 0ms copy: allocates 100k #[repr(C)] rows in WebAssembly.Memory & passes (ptr, len) to WASM!
const hits     = fleet.filter(f => f.alt > minAlt && f.waypoints.at(0).lat > cursorLat); // scans fixed stride, decodes str/slice/ref ONLY on match!
```
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

| Descriptor                                            | Size          | Alignment    | JS/TS Value Type                                 | C / Rust `#[repr(C)]` Equivalent                   |
| :---------------------------------------------------- | :------------ | :----------- | :----------------------------------------------- | :------------------------------------------------- |
| `u8` / `i8`                                           | 1 B           | 1 B          | `number`                                         | `u8` / `i8`                                        |
| `u16` / `i16`                                         | 2 B           | 2 B          | `number`                                         | `u16` / `i16`                                      |
| `f16`                                                 | 2 B           | 2 B          | `number` (`Float16Array` for `.column()`)        | `u16` (IEEE 754 binary16)                          |
| `u32` / `i32` / `f32`                                 | 4 B           | 4 B          | `number`                                         | `u32` / `i32` / `f32`                              |
| `u64` / `i64`                                         | 8 B           | 8 B          | `bigint` (accepts `number` on write)             | `u64` / `i64`                                      |
| `f64`                                                 | 8 B           | 8 B          | `number`                                         | `f64`                                              |
| `fixedStr(N)`                                         | `N` B         | 1 B          | `string` (null-padded UTF-8, 0 tail indirection) | `[u8; N]`                                          |
| `fixedBytes(N)`                                       | `N` B         | 1 B          | `Uint8Array` (zero-copy sub-slice)               | `[u8; N]`                                          |
| `sentinel(prim, nullVal)` / `nullable(prim, nullVal)` | `prim.size`   | `prim.align` | `number` (or `bigint`) `\| null`                 | Same as `prim`                                     |
| `scaled(prim, factor, { null? })`                     | `prim.size`   | `prim.align` | `number` (or `number \| null`)                   | Same as `prim` (stores `Math.round(val * factor)`) |
| `fixedArray(el, N)`                                   | `N * el.size` | `el.align`   | `TypedArray` (primitives) or `StructArrayView`   | `[T; N]`                                           |
| `str`                                                 | 8 B inline    | 4 B          | `string` (UTF-8 in tail arena)                   | `CapnStr { off: u32, len: u32 }`                   |
| `slice(el)` / `slice(() => el)`                       | 8 B inline    | 4 B          | `TypedArray` / `StructArrayView`                 | `CapnSlice<T> { off: u32, len: u32 }`              |
| `ref(Struct)` / `ref(() => Struct)`                   | 8 B inline    | 4 B          | `StructView<F> \| null` (supports circular refs) | `CapnRef<T> { off: u32, present: u32 }`            |
| `StructDef`                                           | `def.size`    | `def.align`  | `StructView<F>` (nested struct)                  | Nested `#[repr(C)]` struct                         |

Use `SpdSample.from(input)` to pack an array of plain JS objects OR wrap any `Uint8Array`, `ArrayBuffer`, `SharedArrayBuffer`, `DataView`, or `WebAssembly.Memory` without copying (or use `SpdSample.shared(rowsOrCount)` for zero-copy Web Worker `SharedArrayBuffer` state):

```ts
// 1. Pack plain JS objects into a live StructArrayView (or call SpdSample.pack(rows) for raw Uint8Array)
const samples = SpdSample.from([
  { t: 100, val: 42.5, id: 1 },
  { t: 200, val: 99.0, id: 2 },
]);

// 2. Send samples.bytes over WebSocket/RPC/Worker and wrap back in O(1) with zero copying
const received = SpdSample.from(samples.bytes);
console.log(received.length); // 2
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

// For zero-allocation random access in tight loops, seek on the flyweight cursor directly:
const cursor = samples.cursor();
for (let i = 0; i < samples.length; i++) {
  sum += cursor.seek(i).t;
}
```
