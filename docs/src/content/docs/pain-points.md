---
title: Real-World Pain Points & Recipes
description: How to use capnstruct to eliminate Web Worker structuredClone stalls, wasm-bindgen FFI overhead, and 100k-row virtual table memory spikes.
---

Here are the three most common production bottlenecks where swapping in `capnstruct` removes tens of milliseconds of serialization and garbage-collection overhead.

---

## 1. Eliminating the Web Worker `postMessage` (`structuredClone`) Freeze (~1,200x Faster)

### The Bottleneck
Libraries like `comlink`, `piscina`, and `tinypool` make it easy to call a Web Worker or Node `worker_threads` function. However, when you pass an array of 25,000–100,000 objects via `postMessage(rows)`, the browser's `structuredClone` algorithm deep-clones every object and string on the main thread (~45–90 ms), and clones them again when the Worker returns the updated array.

### The `capnstruct` Pattern
Keep your rows in a `StructArrayView` backed by a `SharedArrayBuffer` (or a transferable `ArrayBuffer`). Both the main thread and the Worker read and mutate the same buffer in place with zero object cloning:

```ts
// schema.ts — shared between Main Thread and Worker
import { defineStruct, u32, f64, str } from 'capnstruct';

export const Telemetry = defineStruct('Telemetry', {
  id: u32,
  lat: f64,
  lon: f64,
  callsign: str,
});
```

```ts
// main.ts
import { Telemetry } from './schema.js';

// Allocate inside a SharedArrayBuffer (or transfer packed.buffer via postMessage)
const sab = new SharedArrayBuffer(2 * 1024 * 1024);
const rows = Telemetry.array(sab, { byteOffset: 0, count: 25_000 });

// Send only the SharedArrayBuffer reference once (0 ms clone cost)
worker.postMessage({ buffer: sab, count: rows.length });

// After the Worker mutates rows in place, read updated values immediately:
console.log(rows.at(0).callsign);
```

```ts
// worker.ts
import { Telemetry } from './schema.js';

self.onmessage = ({ data: { buffer, count } }) => {
  const rows = Telemetry.array(buffer, { byteOffset: 0, count });
  const c = rows.cursor();
  for (let i = 0; i < rows.length; i += 250) {
    const r = rows.at(i, c);
    r.lat += 0.001;
    r.callsign = 'UPD_999'; // Overwrites UTF-8 bytes in place (0 allocations)
  }
  self.postMessage({ done: true });
};
```

- **`structuredClone` round-trip (25,000 rows):** `47.13 ms` (50,000 objects cloned across heaps)
- **`capnstruct` in-place Worker update:** **`0.039 ms` (~1,206x faster, 0 heap clones)**

---

## 2. Replacing `serde-wasm-bindgen` & Manual `DataView` Math in Rust WASM

### The Bottleneck
Passing `Vec<MyStruct>` between JavaScript and Rust WebAssembly via `serde-wasm-bindgen` or JSON serializes every struct field across the FFI boundary. To avoid that tax, developers end up writing brittle manual `Uint32Array` / `Float64Array` pointer math in JS (`shardsU32[i * 8 + 4] = fidBase`) and manually keeping byte offsets in sync with Rust.

### Real Case Study: `doppler-geo` WASM Search Kernel (Before vs. After)

**Before (Manual `Uint32Array` / `Float64Array` index arithmetic):**

```js
// Brittle: manually re-binding after WASM memory growth and computing 4/8-byte offsets by hand
const outBuf = kernel.memory.buffer;
const outHdrU32 = new Uint32Array(outBuf, hdrPtr, 17);
const numHits = outHdrU32[7];
const outHitsPtr = outHdrU32[15];

const hitsF64 = new Float64Array(outBuf, outHitsPtr, numHits * 8);
const hitsU32 = new Uint32Array(outBuf, outHitsPtr, numHits * 16);
for (let i = 0; i < numHits; i++) {
  const f = i * 8, u = i * 16;
  const lat = hitsF64[f], lon = hitsF64[f + 1], start = hitsF64[f + 2], pre = hitsF64[f + 3];
  const setIdx = hitsU32[u + 8], nFlights = hitsU32[u + 9];
  const flights = [];
  for (let k = 0; k < nFlights; k++) flights.push(store.flights[hitsU32[u + 10 + k]]);
  hitsBySet[setIdx].push({ lat, lon, start, pre, flights });
}
```

**After (`capnstruct` zero-copy `#[repr(C)]` views):**

```ts
import { defineStruct, u32, f64, fixedArray } from 'capnstruct';

export const OutHit = defineStruct('OutHit', {
  lat: f64,
  lon: f64,
  start: f64,
  pre: f64,
  set_idx: u32,
  n_flights: u32,
  fids: fixedArray(u32, 6),
});

// Auto-syncs if WebAssembly.Memory grew inside run_search(); zero manual offset math:
const hdr = IOHeader.view(kernel.memory, hdrPtr);
for (const h of OutHit.array(kernel.memory, hdr.out_hits_ptr, hdr.out_hits_count)) {
  const flights = [];
  for (let k = 0; k < h.n_flights; k++) flights.push(store.flights[h.fids[k]]);
  hitsBySet[h.set_idx].push({ lat: h.lat, lon: h.lon, start: h.start, pre: h.pre, flights });
}
```

---

## 3. 100,000-Row Virtual Tables (`@tanstack/virtual`) & WebGL / Deck.gl Layers

### The Bottleneck
Holding 100,000 rows as plain JS objects in browser memory consumes 150–300 MB of V8 heap and triggers major GC pauses. Rendering those points on a WebGL map (`deck.gl` / `maplibre-gl`) or chart (`Chart.js` / `uPlot`) then requires looping over all 100,000 objects again to copy coordinates into `Float32Array` / `Float64Array` buffers.

### The `capnstruct` Pattern
1. **Virtual Table Rendering (0 Heap Objects in RAM):** Keep all 100,000 rows in a single `StructArrayView` (`~2.4 MiB` flat buffer) and only read the 20 visible rows in your `@tanstack/virtual` render loop via `rows.at(virtualRow.index)`.
2. **Columnar WebGL / Arrow Extraction:** Call `rows.column('lat')` and `rows.column('lon')` to extract contiguous `Float64Array` / `Float32Array` typed arrays for WebGL attributes or Apache Arrow (`arrow.makeVector(rows.column('lat'))`).
