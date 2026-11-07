# <img src="docs/public/icon.svg" width="32" height="32" align="top" alt="capnstruct icon" /> capnstruct

**Zero-copy `#[repr(C)]` binary structs, cyclic object graphs (`ref`), and queryable tables for TypeScript, WebAssembly, Web Workers, and WebGPU.**

[![Live Playground & Docs](https://img.shields.io/badge/Live_Playground-capnstruct.teamchong.net-3b82f6?style=flat-square)](https://capnstruct.teamchong.net)
[![Core Bundle](https://img.shields.io/badge/Core_Gzip-6.51_KiB-10b981?style=flat-square)](https://capnstruct.teamchong.net/wasm-and-rust/)
[![Targets](https://img.shields.io/badge/Targets-TS_%7C_Rust_%23%5Brepr(C)%5D_%7C_Go_%26_TinyGo_WASM-f59e0b?style=flat-square)](https://capnstruct.teamchong.net/wasm-and-rust/)

[**Live Interactive Playground &rarr; capnstruct.teamchong.net**](https://capnstruct.teamchong.net) · [**MP4 Video (`docs/public/demo.mp4`)**](docs/public/demo.mp4)

[![Live Side-by-Side Comparison: Bun JSC (~2x) vs Rust -O3 WASM (JSON / FFI) vs capnstruct #[repr(C)]](docs/public/demo.gif)](https://capnstruct.teamchong.net)

---

## Why Data Layout Beats Engine & Language Switches

Switching JS engines (**Node.js V8 &rarr; Bun JavaScriptCore**) speeds up `JSON.parse` + `.filter()` by **~2x**, and rewriting in **Rust (`rustc -O3` WASM)** without changing the wire format still spends **3.7 ms** scanning `5.27 MiB` of ASCII JSON text (or **23.0 ms** copying strings across the JS&harr;WASM FFI boundary).

Restructuring into a contiguous **`capnstruct #[repr(C)]` binary layout** drops execution to **0.17&ndash;0.31 ms in standard JavaScript** (**45x faster** than Rust JSON parsing!), and when you combine `capnstruct` with **Rust / Go / TinyGo WASM**, execution drops to **0.015&ndash;0.071 ms** (**198x&ndash;651x faster** with **0 MB heap / 0 GC pauses**):

| Workload                                                  | Node.js V8 (JSON)     | Bun JSC (~2x)          | Rust `-O3` (JSON / FFI)    | `capnstruct #[repr(C)]` (JS / Rust / Go WASM)            | Speedup                 |
| :-------------------------------------------------------- | :-------------------- | :--------------------- | :------------------------- | :------------------------------------------------------- | :---------------------- |
| **100k `SpdSample` Scan** (`5.27 MiB` JSON vs `2.29 MiB`) | 14.14 ms (`+10.3 MB`) | 5.65 ms (`+6.9 MB`)    | 3.68 ms JSON / 23.7 ms FFI | **0.31 ms JS** / **0.071 ms Rust** / **0.084 ms TinyGo** | **45x JS / 198x WASM**  |
| **25k Telemetry Filter** (4% hit rate)                    | 13.24 ms (`+8.2 MB`)  | 5.21 ms (`+5.2 MB`)    | 4.16 ms JSON               | **0.39 ms JS** / **0.020 ms Rust** / **0.031 ms Go**     | **34x JS / 651x WASM**  |
| **25k `QpPoint` JS &harr; WASM Boundary**                 | 5.48 ms (`+3.7 MB`)   | 2.10 ms (`+1.7 MB`)    | 5.48 ms (`serde` FFI)      | **0.34 ms JS** / **0.036 ms Rust** (`0 B` copy)          | **16x JS / 153x WASM**  |
| **25k Worker `postMessage` Round-Trip**                   | 45.94 ms (`+14.2 MB`) | 35.50 ms (`+5.7 MB`)   | -                          | **0.046 ms JS** (`SharedArrayBuffer` in-place)           | **~1,000x faster**      |
| **100k Sorted `rangeBy('id', min, max)`**                 | 14.06 ms (`+10.3 MB`) | 5.88 ms (`+6.9 MB`)    | -                          | **0.0058 ms JS** (`O(log N)` binary search, `0 B`)       | **~2,400x faster**      |
| **10k Cyclic `RingNode` Graph Clone**                     | 2.63 ms (`+0.7 MB`)   | 3.23 ms (`serde_json`) | Throws on cycle            | **0.30 ms JS** / **0.016 ms Rust** / **0.019 ms Go**     | **173x Go / 190x Rust** |

### Wire Layout & Safety Guarantees

```text
+-------------------------------------------------------------------+
| Fixed #[repr(C)] Struct Table (N * def.size bytes, 8B-aligned)    |
|   Row 0: [primitive | fixedStr | CapnStr(off,len) | CapnRef(off)] |
|   Row 1: [primitive | fixedStr | CapnStr(off,len) | CapnRef(off)] |
+-------------------------------------------------------------------+
| Optional Tail Arena (UTF-8 strings, slices & ref targets)         |
|   target_offset = structBaseOffset + fieldOffset + relOff         |
+-------------------------------------------------------------------+
```

1. **Zero-Header Fixed Layouts**: Structs using only primitives, `fixedArray`, `fixedStr(N)`, `fixedBytes(N)`, `sentinel()`, `scaled()`, and `f16` have **zero pointers and zero tail arena** (100% byte-for-byte identical to a C/Rust `#[repr(C)]` struct or array).
2. **Wire-Safe Pointer Bounds & Amplification Defense**: Wrapping a `Uint8Array` sub-slice clamps the `DataView` window to `[byteOffset .. byteOffset + byteLength]`, validates every `[relOffset, length]` descriptor against `[structEnd .. bufferEnd]`, and enforces an `8x` traversal budget against pointer-aliasing amplification attacks while preserving valid cycles.
3. **Cap'n-Style Wire Stride Evolution**: Pass an older schema to `NewSchema.array(v1Bytes, OldSchema)` to read older binary payloads with zero copying; fields beyond the older wire stride return default values (`0`, `""`, `[]`, `null`) and upgrade in place on mutation.

---

## Quick Start

### 1. Fixed `#[repr(C)]` Structs, Variable-Length Strings/Slices & In-Place Mutation

```ts
import { defineStruct, u32, i32, i16, fixedStr, sentinel, scaled, str, slice } from 'capnstruct';

const Waypoint = defineStruct('Waypoint', {
  lat: scaled(i32, 1e6),               // 4B int32 on wire <-> float degrees in JS
  lon: scaled(i32, 1e6),
  alt: sentinel(i16, -32768),          // -32768 on wire <-> null in JS (0 extra bytes)
});

const RadarPacket = defineStruct('RadarPacket', {
  magic: fixedStr(4),                  // inline [u8; 4] ASCII
  seq: u32,
  callsign: str,                       // [u32 relOffset, u32 byteLen] into tail arena
  route: slice(Waypoint),              // [u32 relOffset, u32 count] into tail arena
});

const pkt = RadarPacket.create({
  magic: 'RADR',
  seq: 42,
  callsign: 'SFO_101',
  route: [{ lat: 37.6188, lon: -122.375, alt: null }],
});

pkt.seq += 1;                          // mutates u32 in-place (0 allocations)
pkt.route.at(0).alt = 1500;            // updates nested struct in-place
const wireBytes: Uint8Array = pkt.bytes;
```

### 2. Queryable Binary Tables (`O(log N)` Range Search) & Cyclic Graphs (`ref`)

```ts
import { defineStruct, u32, str, ref, slice } from 'capnstruct';

// 1. O(log N) binary search time-window slice & zero-heap filterBytes:
const table = RadarPacket.array(wireBytes);
const subView = table.rangeBy('seq', 10, 50);

// 2. Cyclic object graphs packed into flat Uint8Array in O(1) stack space (100% inferred types):
const GraphNode = defineStruct('GraphNode', (self) => ({
  id: u32,
  label: str,
  next: ref(self),
  children: slice(self),
}));

const n1 = GraphNode.item({ id: 1, label: 'alpha', next: null, children: [] });
const n2 = GraphNode.item({ id: 2, label: 'beta', next: n1, children: [n1] });
n1.next = n2;

const bytes = GraphNode.pack([n1, n2]);
const view = GraphNode.array(bytes);
console.log(view.at(0).next?.next?.id === view.at(0).id); // true (0 allocations)
```

### 3. Rust `#[repr(C)]` & Go / TinyGo WASM Zero-Copy Codegen

```ts
import { toRustReprC, toGoStruct } from 'capnstruct/codegen';

console.log(toRustReprC([Waypoint, RadarPacket]));
console.log(toGoStruct([Waypoint, RadarPacket], { pkg: 'radar', tinygo: true }));
```

```bash
npx capnstruct ./src/schema.ts -o ./src/schema.rs                         # Rust #[repr(C)]
npx capnstruct ./src/schema.ts -o ./src/schema.go --pkg radar             # Native Go / GOOS=wasip1
npx capnstruct ./src/schema.ts -o ./src/main_schema.go --go-wasm          # TinyGo (-target=wasi)
```

| Entrypoint                                                                          | Minified  | Minified + Gzip                       |
| :---------------------------------------------------------------------------------- | :-------- | :------------------------------------ |
| **`capnstruct`** (Core Runtime + `StructArrayView` + `ref` + `slice` + `WasmArena`) | 18.53 KiB | **7.02 KiB** (`6.51 KiB` schema core) |
| **`capnstruct/codegen`** (Rust `#[repr(C)]` + Go / TinyGo WASM Codegen)             | 7.44 KiB  | **2.53 KiB**                          |
