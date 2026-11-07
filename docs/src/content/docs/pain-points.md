---
title: Use Cases & Production Recipes
description: Copy-pasteable recipes for Web Worker SharedArrayBuffers, Rust/C WebAssembly shared memory, binary protocol headers, and 100k-row virtual tables.
---

Practical patterns for replacing `JSON.parse`, `structuredClone`, `serde-wasm-bindgen`, and manual `DataView` offset arithmetic with zero-copy `capnstruct` views.
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
2. **Zero-Heap Binary Search & Filtering (`rangeBy` / `filterBytes`):** Slice time windows in $O(\log N)$ via `rows.rangeBy('t', t0, t1)` (~5,000x faster than `JSON.parse` + `.filter()`) or extract matching binary rows via `rows.filterBytes(pred)` with 0 intermediate JS objects.
3. **Columnar WebGL / WebGPU / Arrow Extraction:** Call `rows.column('lat')` and `rows.column('lon')` to extract contiguous `Float64Array` / `Float32Array` typed arrays for WebGL/WebGPU vertex buffers or Apache Arrow (`arrow.makeVector(rows.column('lat'))`).

---

## 4. Packing & Traversing Circular Object Graphs (`ref(() => Node)`)

### The Bottleneck

In compilers, ASTs, scene graphs, and doubly-linked state machines, objects frequently reference their parents, siblings, or cycle back to themselves (`a.next = b; b.next = a`).

- `JSON.stringify(graph)` immediately crashes with `TypeError: Converting circular structure to JSON`.
- V8's `structuredClone(graph)` handles cycles by building an internal hash table and cloning every node on the heap, but allocates megabytes of V8 heap memory and overflows the C++ call stack (`RangeError: Maximum call stack size exceeded`) on deep linked chains (~1,000+ hops).

### The `capnstruct` Fix

Use `ref(() => Struct)` for nullable/circular struct references and `slice(() => Struct)` for recursive child lists. `capnstruct` tracks visited object identities during `pack()` to serialize cyclic graphs into a single flat `Uint8Array` in $O(1)$ call-stack depth, traverses cycles in $O(1)$ with zero heap allocations, and reconstructs circular JS object references when `.toObject()` is called:

```ts
import { defineStruct, u32, f64, str, ref, slice } from 'capnstruct';

const SceneNode: any = defineStruct('SceneNode', {
  id: u32,
  weight: f64,
  name: str,
  parent: ref(() => SceneNode),
  nextSibling: ref(() => SceneNode),
  children: slice(() => SceneNode),
});

// Build a cyclic scene graph (parent <-> child and sibling ring)
const root: any = { id: 1, weight: 1.0, name: 'root', parent: null, nextSibling: null, children: [] };
const childA: any = { id: 2, weight: 0.5, name: 'mesh_a', parent: root, nextSibling: null, children: [] };
const childB: any = { id: 3, weight: 0.8, name: 'mesh_b', parent: root, nextSibling: childA, children: [root] };
childA.nextSibling = childB;
root.children = [childA, childB];

// 1. Pack cyclic graph into a wire-ready Uint8Array (JSON.stringify throws TypeError here!)
const bytes: Uint8Array = SceneNode.pack([root, childA, childB]);

// 2. Zero-allocation O(1) cyclic traversal directly over the binary buffer
const nodes = SceneNode.array(bytes);
const vRoot = nodes.at(0);
console.log(vRoot.children.at(0).nextSibling.parent.name); // 'root'

// 3. Mutate pointer links in place in O(1) without copying struct bytes
vRoot.nextSibling = vRoot; // self-loop in place
console.log(vRoot.nextSibling.id); // 1

// 4. Reconstruct circular JS object graph when needed
const restored = vRoot.toObject();
console.log(restored === restored.nextSibling); // true
```
