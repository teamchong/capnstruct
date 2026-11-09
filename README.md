# <img src="docs/public/icon.svg" width="32" height="32" align="top" alt="capnstruct icon" /> capnstruct

**Zero-Copy `#[repr(C)]` Structs for Web Workers, `SharedArrayBuffer` & WebAssembly** — the missing shared-memory struct layer between TypeScript, Web Workers, and Rust/Go WASM.

[![npm version](https://img.shields.io/npm/v/capnstruct?color=cb3837&style=flat-square)](https://www.npmjs.com/package/capnstruct)
[![Live Playground & Docs](https://img.shields.io/badge/Live_Playground-capnstruct.teamchong.net-3b82f6?style=flat-square)](https://capnstruct.teamchong.net)
[![Core Bundle](https://img.shields.io/badge/Core_Gzip-6.62_KiB-10b981?style=flat-square)](https://capnstruct.teamchong.net/wasm-and-rust/)
[![Targets](https://img.shields.io/badge/Targets-TS_%7C_Rust_%23%5Brepr(C)%5D_%7C_Go_%26_TinyGo_WASM-f59e0b?style=flat-square)](https://capnstruct.teamchong.net/wasm-and-rust/)

**[Live Interactive Playground &rarr; capnstruct.teamchong.net](https://capnstruct.teamchong.net)** &middot; **[MP4 Video (`docs/public/demo.mp4`)](docs/public/demo.mp4)**

[![Live Side-by-Side Comparison: Worker postMessage (structuredClone) vs Rust -O3 WASM (serde-wasm-bindgen FFI) vs capnstruct #[repr(C)] (Shared / WasmArena)](docs/public/demo.gif)](https://capnstruct.teamchong.net)

```bash
npm install capnstruct
```

```ts
import { struct, u32, f32, u16, str, slice, ref } from 'capnstruct';
const Waypoint = struct('Waypoint', { lat: f32, lon: f32 });
const Flight   = struct('Flight', { id: u32, callsign: str, alt: u16, waypoints: slice(Waypoint), nextRelay: ref('Flight') });
const { view: fleet, ptr, len } = Flight.inWasm(wasmMem, workerRows); // 0ms copy: allocates 100k #[repr(C)] rows in WebAssembly.Memory & passes (ptr, len) to Rust/Go WASM!
```

---

## The Problem: The Worker & WASM Serialization Wall

Every team that moves heavy work off the main thread into a **Web Worker** or **Rust / Go / C WebAssembly** hits the same wall:

1. You write a fast Rust WASM kernel or Worker simulation (**0.1&ndash;3 ms**).
2. Then you lose **10&ndash;50 ms per frame** copying data across the boundary:
   - **`wasm-bindgen` / `serde-wasm-bindgen`**: Copies and UTF-8 decodes every string, array, and struct across WASM linear memory (**23 ms FFI overhead** for a **3.7 ms** Rust scan).
   - **`worker.postMessage(data)`**: `structuredClone` deep-walks every object and nested array, freezing both threads, triggering V8 GC pauses, and throwing on cyclic graphs (`JSON.stringify`).
   - **Raw `SharedArrayBuffer` / `Float32Array` / `DataView`**: Zero-copy, but as soon as your data has strings, variable-length arrays (`slice(Waypoint)`), or graph pointers (`ref('Flight')`), you are stuck maintaining brittle `DataView.getFloat64(ptr + 16, true)` byte-offset math by hand.
   - **FlatBuffers / Cap'n Proto / Arrow**: Require external C++ schema compilers (`flatc`), don't map 1:1 to native `#[repr(C)]` structs in `WebAssembly.Memory`, and are **immutable** (updating 1 string or array forces a full buffer rebuild).

---

## When to Use `capnstruct` (The 3 Target Use Cases)

| Target Niche | What You Currently Do (Painful) | What `capnstruct` Gives You |
| :--- | :--- | :--- |
| **1. Rust / Go / TinyGo WASM in Browsers & Workers** *(WebGL/WebGPU, Physics, Audio DSP, Spatial/Geo Engines)* | Either serialize JSON across WASM FFI (`serde-wasm-bindgen`), or hand-write `DataView` offsets in JS that silently break whenever a Rust struct changes. | Define schema once in TS + auto-generate `#[repr(C)]` Rust / Go structs (`toRustReprC()` / `toGoStruct()`). `Schema.inWasm(wasmExports, rows)` writes directly into `WebAssembly.Memory` and returns `{ view, ptr, len }` with **0 FFI copies** and **0 `wasm-bindgen` overhead**. |
| **2. Zero-Copy Web Worker &harr; Main Thread State** *(Canvas / 60&ndash;120 FPS UIs, Multiplayer / Realtime Sim)* | `postMessage` cloning arrays of objects every frame (GC stutter), or flattening everything into unreadable `Float32Array` index math (`buf[i * 12 + 4]`). | `Schema.shared(rowsOrCount)` allocates structs inside a `SharedArrayBuffer`. The Worker (or WASM inside the Worker) mutates structs, strings, variable-length slices, and cyclic pointers **in place**; the UI thread reads them on `requestAnimationFrame` with **0 ms copy and 0 GC**. |
| **3. Binary Streaming & Local Compute Archives** *(OPFS, IndexedDB, HTTP Range Shards, WebSockets, SQLite Blobs)* | Fetching JSON/Protobuf and parsing thousands of objects on page load, eagerly decoding UTF-8 strings even on rows that get filtered out. | `Schema.from(bytes)` wraps fetched `.bin` shards, `DecompressionStream` chunks, or WebSocket frames in **`O(1)`** — scanning numeric fields at C-stride speed (`O(log N)` `.rangeBy()`) and decoding strings/slices **only on rows that match your query**. |

### When *Not* to Use `capnstruct`

- **Small, short-lived single-threaded JS state (`{ x, y, isOpen }`)**: Use **plain JavaScript objects**. V8's escape analysis and scalar replacement keep 3-field local objects in CPU registers with zero heap overhead; wrapping them in a `DataView` is slower.
- **Use `capnstruct` when** data crosses a **Web Worker (`SharedArrayBuffer` / `postMessage`)**, **WebAssembly (`WebAssembly.Memory`)**, or **Network / OPFS / SQLite binary boundary**, or when keeping **10,000&ndash;1,000,000 rows** in memory with **0 MB V8 heap / 0 GC pauses** and **in-place mutation**.

---

## Code Recipes for the 3 Core Use Cases

### 1. Rust / Go WASM Shared Memory (`Schema.inWasm` + Safe `#[repr(C)]` Codegen)

Allocate or pack directly inside `WebAssembly.Memory` (via `WasmArena` or exported `capn_alloc` / `alloc`) and generate `rustc`-verified `#[repr(C)]` structs with safe, bounds-checked `.as_slice(arena)`, `.as_str(arena)`, and `.as_ref(arena)` accessors (usable even inside `#[forbid(unsafe_code)]` user kernels):

```ts
import { struct, u32, f32, str, slice, ref } from 'capnstruct';
import { toRustReprC, toGoStruct } from 'capnstruct/codegen';

export const Waypoint = struct('Waypoint', { lat: f32, lon: f32 });
export const Flight   = struct('Flight', {
  id: u32,
  callsign: str,              // 8B [u32 relOffset, u32 byteLen] -> CapnStr
  waypoints: slice(Waypoint), // 8B [u32 relOffset, u32 len]     -> CapnSlice<Waypoint>
  nextRelay: ref('Flight'),   // 8B [u32 relOffset, u32 present] -> CapnRef<Flight>
});

// 1. Allocate 100k structs directly in WebAssembly.Memory (auto-rebinds if memory.grow() runs!)
const { view, ptr, len } = Flight.inWasm(wasmInstance.exports, initialFlights);
wasmInstance.exports.step_airspace(ptr, len); // 0 FFI copies, 0 serde-wasm-bindgen overhead

// 2. Generate #[repr(C)] Rust or Go/TinyGo WASM struct definitions + compile-time offset_of! assertions
console.log(toRustReprC([Waypoint, Flight]));
console.log(toGoStruct([Waypoint, Flight], { pkg: 'airspace', wasm: true }));
```

```rust
// Inside your Rust WASM kernel — zero unsafe boilerplate required:
#[forbid(unsafe_code)]
pub fn inspect_airspace(arena: &[u8], ptr: usize, len: usize) -> usize {
    let flights = Flight::as_slice(&arena[ptr..], len);
    flights.iter().filter(|f| f.waypoints.as_slice(arena).len() >= 2).count()
}
```

```bash
# Or generate directly via the CLI:
npx capnstruct ./src/schema.ts -o ./src/schema.rs          # Rust #[repr(C)] + safe .as_str/.as_slice/.as_ref
npx capnstruct ./src/schema.ts -o ./src/main_schema.go --go-wasm # Go / TinyGo WASM + capn_alloc exports
```

### 2. Zero-Copy Web Worker &harr; Main Thread State (`Schema.shared` + In-Place Mutation)

Eliminate the **45 ms `structuredClone` `postMessage` freeze** without flattening your domain model into unreadable `Float32Array` offsets. Both threads read and mutate strings, variable-length slices, and cyclic pointers in place on the same `SharedArrayBuffer`:

```ts
// main.ts — allocate a 25,000-row table backed by a SharedArrayBuffer
const fleet = Flight.shared(25_000);
worker.postMessage({ buffer: fleet.buffer, count: fleet.length }); // 0 ms reference transfer

// worker.ts — wrap the SharedArrayBuffer in O(1) and mutate in place at 120 FPS
self.onmessage = ({ data: { buffer, count } }) => {
  const rows = Flight.array(buffer, { byteOffset: 0, count });
  rows.at(0).callsign = 'UAL418-HEAVY';                   // overwrites or bump-allocates in tail arena (0 GC)
  rows.at(0).waypoints = [{ lat: 37.62, lon: -122.38 }];  // updates slice(Waypoint) in place
  rows.at(0).nextRelay = rows.at(1);                      // rewires cyclic ref('Flight') pointer in O(1)
};
```

### 3. Binary Streaming, `O(log N)` Range Queries & 100k-Row Virtual Tables (`Schema.from`)

Wrap a fetched `.bin` shard, `DecompressionStream` chunk, or SQLite blob in `O(1)` with **0 heap allocations**, binary-search time windows in `O(log N)`, or project zero-copy `TypedArray` columns directly into WebGL / Deck.gl / Apache Arrow:

```ts
// Wrap wire bytes in O(1) — 0 JSON.parse, 0 per-row JS objects
const packets = Flight.from(wireBytes);

// O(log N) binary search slice + zero-heap filter (decodes UTF-8 callsign ONLY on matching rows!)
const windowView = packets.rangeBy('id', 1000, 5000);
const matchingBytes = windowView.filterBytes((f) => f.waypoints.length > 0 && f.callsign.startsWith('UAL'));

// Extract contiguous Float32Array column for WebGL / WebGPU / Chart.js
const ids: Uint32Array = packets.column('id');
```

---

## Why Data Layout Beats Engine & Language Switches

Switching JS engines (**Node.js V8 &rarr; Bun JavaScriptCore**) speeds up `JSON.parse` + `.filter()` by **~2x**, and rewriting in **Rust (`rustc -O3` WASM)** without changing the wire format still spends **3.7 ms** scanning `5.27 MiB` of ASCII JSON text (or **23.0 ms** copying strings across the JS&harr;WASM FFI boundary).

Restructuring into a contiguous **`capnstruct #[repr(C)]` binary layout** drops execution to **0.17&ndash;0.31 ms in standard JavaScript** (**45x faster** than Rust JSON parsing!), and when you combine `capnstruct` with **Rust / Go / TinyGo WASM**, execution drops to **0.015&ndash;0.071 ms** (**198x&ndash;651x faster** with **0 MB heap / 0 GC pauses**):

| Workload                                                  | Node.js V8 (JSON)     | Bun JSC (~2x)          | Rust `-O3` (JSON / FFI)    | `capnstruct #[repr(C)]` (JS / Rust / Go WASM)            | Speedup                 |
| :-------------------------------------------------------- | :-------------------- | :--------------------- | :------------------------- | :------------------------------------------------------- | :---------------------- |
| **100k `SpdSample` Scan** (`5.27 MiB` JSON vs `2.29 MiB`) | 14.14 ms (`+10.3 MB`) | 5.65 ms (`+6.9 MB`)    | 3.68 ms JSON / 23.7 ms FFI | **0.31 ms JS** / **0.071 ms Rust** / **0.084 ms TinyGo** | **45x JS / 198x WASM**  |
| **25k Telemetry Filter** (4% hit rate)                    | 13.24 ms (`+8.2 MB`)  | 5.21 ms (`+5.2 MB`)    | 4.16 ms JSON               | **0.39 ms JS** / **0.020 ms Rust** / **0.031 ms Go**     | **34x JS / 651x WASM**  |
| **25k `QPPoint` JS &harr; WASM Boundary**                 | 5.48 ms (`+3.7 MB`)   | 2.10 ms (`+1.7 MB`)    | 5.48 ms (`serde` FFI)      | **0.34 ms JS** / **0.036 ms Rust** (`0 B` copy)          | **16x JS / 153x WASM**  |
| **25k Worker `postMessage` Round-Trip**                   | 45.94 ms (`+14.2 MB`) | 35.50 ms (`+5.7 MB`)   | -                          | **0.046 ms JS** (`SharedArrayBuffer` in-place)           | **~1,000x faster**      |
| **100k Sorted `rangeBy('id', min, max)`**                 | 14.06 ms (`+10.3 MB`) | 5.88 ms (`+6.9 MB`)    | -                          | **0.0058 ms JS** (`O(log N)` binary search, `0 B`)       | **~2,400x faster**      |
| **10k Cyclic `RingNode` Graph Clone**                     | 2.63 ms (`+0.7 MB`)   | 3.23 ms (`serde_json`) | Throws on cycle            | **0.30 ms JS** / **0.016 ms Rust** / **0.019 ms Go**     | **173x Go / 190x Rust** |

### Wire Layout, Safety & Bundle Size

```text
+------------------------------------------------------------------+
| Fixed #[repr(C)] Struct Table (N * def.size bytes, 8B-aligned)   |
|   Row 0: [primitive | fixedStr | CapnStr(off,len) | CapnRef(off)]|
|   Row 1: [primitive | fixedStr | CapnStr(off,len) | CapnRef(off)]|
+------------------------------------------------------------------+
| Optional Tail Arena (UTF-8 strings, slices & ref targets)        |
|   target_offset = structBaseOffset + fieldOffset + relOff        |
+------------------------------------------------------------------+
```

| Entrypoint | Minified | Minified + Gzip |
| :--- | :--- | :--- |
| **`capnstruct`** (Core Runtime + `StructArrayView` + `ref` + `slice` + `WasmArena` + `inWasm`) | 18.12 KiB | **7.12 KiB** (`6.62 KiB` schema core) |
| **`capnstruct/codegen`** (Rust `#[repr(C)]` + Go / TinyGo WASM Codegen) | 7.63 KiB | **2.57 KiB** |
