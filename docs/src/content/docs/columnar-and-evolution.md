---
title: Columnar Arrow/SIMD & Schema Evolution
description: Zero-copy TypedArray column projections for Apache Arrow, WebGPU, and SIMD, plus Cap'n-style wire stride schema evolution.
---

## 1. Columnar `TypedArray` Projections (`.column()` & `.setColumn()`)

In Apache Arrow, DuckDB-Wasm, Polars, WebGPU, and Chart.js, a non-null primitive column is simply a contiguous `Float64Array`, `Float32Array`, `Int32Array`, or `Uint32Array`.

Every `StructArrayView` provides `.column(fieldName)` and `.setColumn(fieldName, values)` with full static TypeScript return-type inference (`f64` &rarr; `Float64Array`, `u32` &rarr; `Uint32Array`, `i64` &rarr; `BigInt64Array`, etc.):

```ts
import { defineStruct, u32, f64, bool } from 'capnstruct';

// Case 1: Single-field struct (stride === field.size)
// -> Returns a ZERO-COPY TypedArray sharing the exact same ArrayBuffer!
const Sample64 = defineStruct('Sample64', { val: f64 });
const samples = Sample64.alloc(4);
samples.setColumn('val', [10.5, 20.5, 30.5, 40.5]);

const zeroCopyCol: Float64Array = samples.column('val');
console.log(zeroCopyCol.buffer === samples.buffer); // true (O(1) zero-copy!)

// Case 2: Multi-field struct (stride > field.size)
// -> Extracts a contiguous TypedArray column across all rows in a tight C-stride loop
const Point = defineStruct('Point', {
  id: u32,
  active: bool,
  lat: f64,
  lon: f64,
});

const points = Point.alloc(3);
points.setColumn('id', [1, 2, 3]);
points.setColumn('lat', [37.7749, 35.6762, 51.5074]);
points.setColumn('lon', [-122.4194, 139.6503, -0.1278]);

// Hand directly to Apache Arrow (arrow.makeVector(lats)), WebGPU buffer, or SIMD:
const lats: Float64Array = points.column('lat');
console.log(Array.from(lats)); // [37.7749, 35.6762, 51.5074]
```

---

## 2. Cap'n-Style Schema Evolution (Forward & Backward Wire Stride Compatibility)

In distributed systems, edge Workers, and persistent storage, schemas evolve over time. Unlike rigid C structs—where adding a new field at the end of a struct breaks every existing binary payload—`capnstruct` supports **Cap'n-style wire stride compatibility** with zero per-row header overhead:

1. **Newer Schema Reading Older Binary Buffers**: Pass the older schema (or `{ stride: OldSchema.size }`) to `NewSchema.view(bytes, OldSchema)` or `NewSchema.array(bytes, OldSchema)`.
   - Fields present in the older wire stride are read directly from binary memory at zero cost.
   - Newly added trailing fields beyond `wireStride` automatically return safe default values (`0`, `0n`, `false`, `""`, or empty `TypedArray` / `StructArrayView`) without reading out of bounds!
2. **Automatic Upgrade on Mutation**: If you assign to a newly added field on a view backed by an older, narrower wire stride, `capnstruct` automatically upgrades the view/array to the full `NewSchema.size` stride in place!
3. **Older Schema Reading Newer Binary Buffers**: Pass `NewSchema` (or `{ stride: NewSchema.size }`) to `OldSchema.array(bytes, NewSchema)` so the older code steps through rows using the newer wire stride while reading the fields it knows about.

```ts
import { defineStruct, u32, f64, str, slice, pack } from 'capnstruct';

// Version 1 of the schema (16 bytes: x, y)
const PointV1 = defineStruct('PointV1', {
  x: f64,
  y: f64,
});

// Version 2 adds z, label, and flags at the end (40 bytes)
const PointV2 = defineStruct('PointV2', {
  x: f64,
  y: f64,
  z: f64,
  label: str,
  flags: slice(u32),
});

// Existing V1 wire payload from storage or an older client
const v1Bytes = pack(PointV1, [
  { x: 1.5, y: 2.5 },
  { x: 3.5, y: 4.5 },
]);

// Read V1 bytes using PointV2 schema by passing PointV1 (or { stride: PointV1.size })
const v2View = PointV2.array(v1Bytes, PointV1);

console.log(v2View.at(0).toObject());
// { x: 1.5, y: 2.5, z: 0, label: '', flags: [] }

// Mutating a newly added V2 field automatically upgrades the view to full V2 stride!
v2View.at(0).z = 99.5;
v2View.at(0).label = 'upgraded-in-place';
console.log(v2View.stride); // 40 (PointV2.size)
```
