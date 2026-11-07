---
title: Live Mutation & Growable Views
description: Mutate strings and slices in-place on binary views, push and pop rows, and compact dead tail-arena bytes.
---

Unlike Apache Arrow, FlatBuffers, or Cap'n Proto (where binary buffers are strictly read-only or cannot shrink/grow variable-length fields), `capnstruct` separates the **developer-facing JS interface** from the **underlying binary arena mechanics**.

## 1. Mutating Strings (`str`) & Slices (`slice`) on Any View

Every `StructView` and `StructArrayView` supports direct property assignment for both fixed-size primitives and variable-length `str` / `slice(T)` fields:

```ts
import { defineStruct, u32, str, slice, pack } from 'capnstruct';

const User = defineStruct('User', {
  id: u32,
  name: str,
  scores: slice(u32),
});

const users = User.array(
  pack(User, [
    { id: 1, name: 'Alexander', scores: [10, 20, 30, 40] },
    { id: 2, name: 'Bob', scores: [50, 60] },
  ]),
);

// Case A: Shorter or equal-length UTF-8 string / slice
// -> Overwrites existing tail bytes in-place in O(1) with 0 allocations
users.at(0).name = 'Alex';
users.at(0).set({ scores: [100, 200] });

// Case B: Longer UTF-8 string / slice
// -> Automatically bump-allocates at the end of the tail arena (growing the
//    backing ArrayBuffer or WasmArena if needed) and updates [off, len] in place
users.at(1).name = 'Bartholomew-Christopherson';
users.at(1).set({ scores: [1, 2, 3, 4, 5, 6, 7, 8] });
```

### How It Works Under the Hood

Each `str` or `slice(T)` field stores an 8-byte descriptor `[u32 relOffsetFromStructBase, u32 elementCount]` in the fixed struct body:

1. **In-Place Overwrite (`O(1)`, 0 allocations)**: When `newByteLength <= oldByteLength`, `capnstruct` writes the new UTF-8 bytes or slice elements directly into the existing tail slot, updates `len` in the 8-byte descriptor, and only records dead bytes (`oldByteLength - newByteLength`) when strictly shorter (`newByteLength === oldByteLength` leaves `0` dead bytes).
2. **Tail-Tip In-Place Extension (`O(1)`, 0 dead bytes)**: When `newByteLength > oldByteLength` and the existing variable-length slot sits at the very end of the tail arena, `capnstruct` extends the existing slot in place with `0` dead bytes instead of orphaning the old allocation.
3. **Tail Arena Bump-Allocation**: When `newByteLength > oldByteLength` and the slot is not at the tail tip, `capnstruct` bump-allocates a new aligned region at the end of the tail arena (automatically doubling the backing `ArrayBuffer` or growing the `WasmArena` if capacity is exceeded), writes the new data there, and updates `[relOffset, len]` in the struct's 8-byte descriptor.

---

## 2. Fragmentation Tracking & `.compact()`

When variable-length fields are repeatedly overwritten with shorter or longer values, dead bytes accumulate in the tail arena. You can inspect the fragmentation ratio at any time via `view.compactionRatio` (`0` = 0% dead bytes, `0.25` = 25% dead bytes) and strip dead tail bytes via `view.compact()`:

```ts
console.log(users.compactionRatio); // e.g. 0.28 (28% dead tail bytes)

// Re-packs only live rows + live tail strings/slices and rebinds the view in-place:
const tightWireBytes: Uint8Array = users.compact();

console.log(users.compactionRatio); // 0
```

Both `StructView` and `StructArrayView` inherit `.compactionRatio` and `.compact()`. Accessing `.bytes` on any view with dead or dirty tail bytes **automatically compacts** the buffer so you always send a clean `Uint8Array` over the network.

---

## 3. Growable `StructArrayView` (`.push()`, `.pop()`, `.alloc()`)

You don't need to build a giant JS array before calling `pack()`. Start with `StructDef.alloc(0)` (or any existing `StructArrayView`) and `.push()` / `.pop()` rows directly on the binary view:

```ts
import { defineStruct, u32, f64, str } from 'capnstruct';

const Metric = defineStruct('Metric', {
  ts: u32,
  val: f64,
  tag: str,
});

// Start with an empty binary view
const metrics = Metric.alloc(0);

// Append rows directly into binary memory (automatically doubles capacity as needed)
metrics.push(
  { ts: 1000, val: 1.25, tag: 'cpu' },
  { ts: 1005, val: 2.50, tag: 'mem' },
);
console.log(metrics.length); // 2

// Pop the last row (returns PlainStructValues<F> and reclaims fixed-struct capacity)
const last = metrics.pop();
console.log(last); // { ts: 1005, val: 2.5, tag: 'mem' }

// Export clean wire bytes ready for fetch / WebSocket / Worker postMessage
const payload: Uint8Array = metrics.bytes;
```
