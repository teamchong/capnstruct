---
title: Use Cases & Production Recipes
description: Copy-pasteable recipes for Web Worker SharedArrayBuffers, Rust/C WebAssembly shared memory, binary protocol headers, and 100k-row virtual tables.
---

Practical patterns for replacing `JSON.parse`, `structuredClone`, `serde-wasm-bindgen`, and manual `DataView` offset arithmetic with zero-copy `capnstruct` views.

---

## 1. Eliminating the Web Worker `postMessage` (`structuredClone`) Freeze (~1,200x Faster)

<div class="cs-pain-vs-solve">
  <div class="cs-pain-box"><strong>The Bottleneck:</strong> Passing 25,000–100,000 objects via <code>postMessage(rows)</code> triggers <code>structuredClone</code>, freezing the main thread for ~45–90 ms while deep-cloning 50,000 objects across heaps.</div>
  <div class="cs-solve-box"><strong>The capnstruct Fix:</strong> Keep rows in a <code>StructArrayView</code> backed by a <code>SharedArrayBuffer</code> (or transferable <code>ArrayBuffer</code>). Both threads read and mutate the same buffer in place in ~0.04 ms (0 clones).</div>
</div>

```ts
// schema.ts - shared between Main Thread and Worker
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

// Allocate a 25,000-row table directly inside a SharedArrayBuffer
const rows = Telemetry.shared(25_000);

// Send only the SharedArrayBuffer reference once (0 ms clone cost)
worker.postMessage({ buffer: rows.buffer, count: rows.length });

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
    const r = c.seek(i);
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

<div class="cs-pain-vs-solve">
  <div class="cs-pain-box"><strong>The Bottleneck:</strong> Passing <code>Vec&lt;MyStruct&gt;</code> via <code>serde-wasm-bindgen</code> or JSON copies every field across the FFI boundary, forcing developers to write brittle <code>Uint32Array[i * 8 + 4]</code> pointer math in JS.</div>
  <div class="cs-solve-box"><strong>The capnstruct Fix:</strong> Wrap <code>WebAssembly.Memory</code> in a zero-copy <code>#[repr(C)]</code> view. Both JS and Rust/Go WASM read the exact same bytes in linear memory, and views auto-rebind when <code>memory.grow()</code> runs.</div>
</div>

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

// Allocate or wrap directly in WebAssembly.Memory; auto-syncs if memory.grow() runs:
const { view: hits, ptr: hitsPtr, len: hitsLen } = OutHit.inWasm(kernel.exports, 256);
kernel.exports.run_search(samplesPtr, samplesLen, hitsPtr, hitsLen);
for (const h of hits) {
  for (let k = 0; k < h.n_flights; k++) flights.push(store.flights[h.fids[k]]);
  hitsBySet[h.set_idx].push({ lat: h.lat, lon: h.lon, start: h.start, pre: h.pre, flights });
}
```

---

## 3. 100,000-Row Virtual Tables (`@tanstack/virtual`) & WebGL / Deck.gl Layers

<div class="cs-pain-vs-solve">
  <div class="cs-pain-box"><strong>The Bottleneck:</strong> Holding 100,000 rows as plain JS objects consumes 150–300 MB of V8 heap, triggers GC pauses, and requires looping over all 100k objects to copy coordinates into <code>Float64Array</code> buffers.</div>
  <div class="cs-solve-box"><strong>The capnstruct Fix:</strong> Keep all 100,000 rows in a 2.4 MiB flat buffer (0 JS heap objects). Read only the 20 visible rows in <code>@tanstack/virtual</code>, binary-search time windows via <code>rangeBy()</code> in O(log N), or extract <code>Float64Array</code> columns via <code>.column('lat')</code>.</div>
</div>

```ts
import { defineStruct, u32, f32, str } from 'capnstruct';

const FlightRow = defineStruct('FlightRow', {
  ts: u32,
  lat: f32,
  lon: f32,
  callsign: str,
});

const rows = FlightRow.array(wireBytes); // 0 JS objects allocated

// 1. @tanstack/virtual: read only visible rows on demand
const visibleRow = rows.at(virtualItem.index);

// 2. O(log N) binary search time window + zero-heap filter
const bboxBytes = rows
  .rangeBy('ts', 1700000000, 1700000600)
  .filterBytes((r) => r.lat > 37.0 && r.lat < 38.0);

// 3. Contiguous Float32Array column for WebGL / Deck.gl / Apache Arrow
const lats: Float32Array = rows.column('lat');
```

---

## 4. Packing & Traversing Circular Object Graphs (`ref(self)` & `slice(self)`)

<div class="cs-pain-vs-solve">
  <div class="cs-pain-box"><strong>The Bottleneck:</strong> <code>JSON.stringify(graph)</code> crashes immediately with <code>TypeError: Converting circular structure to JSON</code>, and V8's <code>structuredClone(graph)</code> overflows the C++ call stack on deep linked chains (~1,000+ hops).</div>
  <div class="cs-solve-box"><strong>The capnstruct Fix:</strong> Pass a <code>(self) =&gt; ({ ... })</code> callback to <code>defineStruct</code> and use <code>Struct.item({...})</code> for 100% TypeScript type inference. <code>pack()</code> serializes cyclic graphs in O(1) stack depth, traverses cycles in O(1) with 0 allocations, and restores circular references in <code>.toObject()</code>.</div>
</div>

```ts
import { defineStruct, u32, f64, str, ref, slice } from 'capnstruct';

const SceneNode = defineStruct('SceneNode', (self) => ({
  id: u32,
  weight: f64,
  name: str,
  parent: ref(self),
  nextSibling: ref(self),
  children: slice(self),
}));

// Build a cyclic scene graph (parent <-> child and sibling ring) with 100% inferred TypeScript types
const root = SceneNode.item({ id: 1, weight: 1.0, name: 'root', parent: null, nextSibling: null, children: [] });
const childA = SceneNode.item({ id: 2, weight: 0.5, name: 'mesh_a', parent: root, nextSibling: null, children: [] });
const childB = SceneNode.item({ id: 3, weight: 0.8, name: 'mesh_b', parent: root, nextSibling: childA, children: [root] });
childA.nextSibling = childB;
root.children = [childA, childB];

// 1. Pack cyclic graph into a wire-ready Uint8Array (JSON.stringify throws TypeError here!)
const bytes: Uint8Array = SceneNode.pack([root, childA, childB]);

// 2. Zero-allocation O(1) cyclic traversal directly over the binary buffer
const nodes = SceneNode.array(bytes);
const vRoot = nodes.at(0);
console.log(vRoot.children.at(0).nextSibling?.parent?.name); // 'root'

// 3. Mutate pointer links in place in O(1) without copying struct bytes
vRoot.nextSibling = vRoot; // self-loop in place
console.log(vRoot.nextSibling?.id); // 1

// 4. Reconstruct circular JS object graph when needed
const restored = vRoot.toObject();
console.log(restored === restored.nextSibling); // true
```
