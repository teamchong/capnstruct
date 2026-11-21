import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  Arena,
  array,
  bool,
  concatBytes,
  defineStruct,
  defineUnion,
  f16,
  f32,
  f64,
  fixedArray,
  fixedBytes,
  fixedStr,
  generateGo,
  generateRust,
  i8,
  i16,
  i32,
  i64,
  installDevtoolsFormatter,
  isUnknownVariant,
  list,
  mutStructView,
  type MutStructArrayView,
  type MutStructView,
  nullable,
  optStr,
  pack,
  produce,
  ref,
  scaled,
  sentinel,
  slice,
  str,
  struct,
  type StructArrayView,
  type StructDefLike,
  type StructView,
  structView,
  toGoStruct,
  toRustReprC,
  typeHash,
  u8,
  u16,
  u32,
  u64,
  union,
  UnionArrayView,
  WasmArena,
} from '../src/index.js';
describe('capnstruct', () => {
  describe('Primitives & C #[repr(C)] Alignment Calculator', () => {
    it('reads and writes all primitive types with little-endian encoding', () => {
      const AllPrims = defineStruct('AllPrims', {
        a_u8: u8,
        b_i8: i8,
        c_bool: bool,
        d_u16: u16,
        e_i16: i16,
        f_u32: u32,
        g_i32: i32,
        h_f32: f32,
        i_u64: u64,
        j_i64: i64,
        k_f64: f64,
      });

      // Offsets:
      // a_u8: 0 (size 1, align 1)
      // b_i8: 1 (size 1, align 1)
      // c_bool: 2 (size 1, align 1)
      // pad: 1 byte
      // d_u16: 4 (size 2, align 2)
      // e_i16: 6 (size 2, align 2)
      // f_u32: 8 (size 4, align 4)
      // g_i32: 12 (size 4, align 4)
      // h_f32: 16 (size 4, align 4)
      // pad: 4 bytes
      // i_u64: 24 (size 8, align 8)
      // j_i64: 32 (size 8, align 8)
      // k_f64: 40 (size 8, align 8)
      // Total size: 48, align: 8
      expect(AllPrims.offsetOf('a_u8')).toBe(0);
      expect(AllPrims.offsetOf('b_i8')).toBe(1);
      expect(AllPrims.offsetOf('c_bool')).toBe(2);
      expect(AllPrims.offsetOf('d_u16')).toBe(4);
      expect(AllPrims.offsetOf('e_i16')).toBe(6);
      expect(AllPrims.offsetOf('f_u32')).toBe(8);
      expect(AllPrims.offsetOf('g_i32')).toBe(12);
      expect(AllPrims.offsetOf('h_f32')).toBe(16);
      expect(AllPrims.offsetOf('i_u64')).toBe(24);
      expect(AllPrims.offsetOf('j_i64')).toBe(32);
      expect(AllPrims.offsetOf('k_f64')).toBe(40);
      expect(AllPrims.size).toBe(48);
      expect(AllPrims.stride).toBe(48);
      expect(AllPrims.align).toBe(8);

      const v = AllPrims.create({
        a_u8: 255,
        b_i8: -128,
        c_bool: true,
        d_u16: 65535,
        e_i16: -32768,
        f_u32: 0xdeadbeef,
        g_i32: -2147483648,
        h_f32: 3.5,
        i_u64: 0x123456789abcdef0n,
        j_i64: -9007199254740993n,
        k_f64: Math.PI,
      });

      expect(v.a_u8).toBe(255);
      expect(v.b_i8).toBe(-128);
      expect(v.c_bool).toBe(true);
      expect(v.d_u16).toBe(65535);
      expect(v.e_i16).toBe(-32768);
      expect(v.f_u32).toBe(0xdeadbeef);
      expect(v.g_i32).toBe(-2147483648);
      expect(v.h_f32).toBeCloseTo(3.5, 5);
      expect(v.i_u64).toBe(0x123456789abcdef0n);
      expect(v.j_i64).toBe(-9007199254740993n);
      expect(v.k_f64).toBe(Math.PI);

      // Accepts numeric inputs for u64/i64 as well
      v.i_u64 = 42 as unknown as bigint;
      expect(v.i_u64).toBe(42n);
      v.c_bool = false;
      expect(v.c_bool).toBe(false);
    });

    it('computes trailing struct padding to match C/Rust #[repr(C)] stride', () => {
      const Padded = struct('Padded', {
        big: u64,
        small: u8,
      });
      expect(Padded.offsetOf('big')).toBe(0);
      expect(Padded.offsetOf('small')).toBe(8);
      expect(Padded.align).toBe(8);
      expect(Padded.size).toBe(16);
      expect(Padded.stride).toBe(16);
    });
  });

  describe('Fixed Inline Arrays & Nested Structs', () => {
    it('handles aligned and unaligned fixed primitive arrays and nested structs', () => {
      const Vec2 = defineStruct('Vec2', { x: f32, y: f32 });
      const Entity = defineStruct('Entity', {
        tag: u8,
        // offset 4 (aligned to 4):
        coords: fixedArray(f32, 3),
        // offset 16 (aligned to 4):
        pos: Vec2,
        // offset 24 (aligned to 4):
        history: array(Vec2, 2),
        // offset 40 (aligned to 1):
        flags: fixedArray(bool, 3),
        // offset 48 (aligned to 8):
        ids: fixedArray(u64, 2),
      });

      expect(Entity.offsetOf('tag')).toBe(0);
      expect(Entity.offsetOf('coords')).toBe(4);
      expect(Entity.offsetOf('pos')).toBe(16);
      expect(Entity.offsetOf('history')).toBe(24);
      expect(Entity.offsetOf('flags')).toBe(40);
      expect(Entity.offsetOf('ids')).toBe(48);
      expect(Entity.size).toBe(64);
      expect(Entity.align).toBe(8);

      // Test on an intentionally unaligned byteOffset (offset = 1) inside an ArrayBuffer
      const rawBuf = new ArrayBuffer(128);
      const view = mutStructView(Entity, rawBuf, 1);
      view.tag = 7;
      view.set({
        coords: [1.25, 2.5, 3.75],
        pos: { x: 10, y: 20 },
        history: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
        flags: [true, false, true],
        ids: [100n, 200n],
      });
      expect(view.tag).toBe(7);
      expect(Array.from(view.coords)).toEqual([1.25, 2.5, 3.75]);
      expect(view.pos.x).toBe(10);
      expect(view.pos.y).toBe(20);
      expect(view.history.length).toBe(2);
      expect(view.history.at(0).x).toBe(1);
      expect(view.history.at(1).y).toBe(4);
      expect(view.flags).toEqual([true, false, true]);
      expect(Array.from(view.ids)).toEqual([100n, 200n]);

      // Also test aligned access (offset = 8) where TypedArray view is zero-copy
      const alignedView = Entity.mutView(rawBuf, 8);
      alignedView.set('coords', [9, 8, 7]);
      expect(alignedView.coords).toBeInstanceOf(Float32Array);
      alignedView.coords[1] = 42;
      expect(alignedView.coords[1]).toBe(42);
    });
  });

  describe('Tail Arena: Variable-Length UTF-8 Strings (str) & Slices (slice/list)', () => {
    const FlightRow = defineStruct('FlightRow', {
      id: u32,
      lat: f64,
      lon: f64,
      callsign: str,
      route: str,
      waypoints: slice(f32),
      tags: list(u16),
    });

    it('packs and lazily decodes ASCII, UTF-8 multi-byte, emoji strings, and slices', () => {
      const input = [
        {
          id: 1,
          lat: 37.7749,
          lon: -122.4194,
          callsign: 'SFO_101',
          route: 'San Francisco → 東京 ✈️ 🌍',
          waypoints: [37.5, -122.0, 35.6762, 139.6503],
          tags: [10, 20, 30],
        },
        {
          id: 2,
          lat: 51.5074,
          lon: -0.1278,
          callsign: '',
          route: 'München / Zürich — long string exceeding 48 bytes to exercise TextDecoder path in decodeUtf8!',
          waypoints: [],
          tags: [99],
        },
      ];

      const packed = FlightRow.pack(input);
      expect(packed).toBeInstanceOf(Uint8Array);
      expect(packed.byteLength % 8).toBe(0); // 8-byte aligned total buffer

      // Recover StructArrayView directly from packed Uint8Array without passing count
      const rows = FlightRow.array(packed);
      expect(rows.length).toBe(2);

      const r0 = rows.at(0);
      expect(r0.id).toBe(1);
      expect(r0.lat).toBeCloseTo(37.7749, 6);
      expect(r0.lon).toBeCloseTo(-122.4194, 6);
      expect(r0.callsign).toBe('SFO_101');
      expect(r0.route).toBe('San Francisco → 東京 ✈️ 🌍');
      expect(Array.from(r0.waypoints)).toEqual([37.5, -122.0, 35.67620086669922, 139.65029907226562]);
      expect(Array.from(r0.tags)).toEqual([10, 20, 30]);

      const r1 = rows.at(1);
      expect(r1.id).toBe(2);
      expect(r1.callsign).toBe('');
      expect(r1.route).toBe(
        'München / Zürich — long string exceeding 48 bytes to exercise TextDecoder path in decodeUtf8!',
      );
      expect(r1.waypoints.length).toBe(0);
      expect(Array.from(r1.tags)).toEqual([99]);

      // Supports in-place assignment to variable-length field on mutArray when new UTF-8 string fits in existing slot
      const mutRows = FlightRow.mutArray(packed.slice());
      const mutR0 = mutRows.at(0);
      const prevByteLen = mutRows.bytes.byteLength;
      mutR0.callsign = 'NEW';
      expect(mutR0.callsign).toBe('NEW');
      expect(mutRows.bytes.byteLength).toBe(prevByteLen);
    });

    it('supports nested variable-length slices of structs and strings', () => {
      const Waypoint = defineStruct('Waypoint', {
        name: str,
        alt: i32,
      });
      const Plan = defineStruct('Plan', {
        flightId: u32,
        stops: slice(Waypoint),
        notes: slice(str),
      });

      const bytes = pack(Plan, [
        {
          flightId: 42,
          stops: [
            { name: 'KSFO', alt: 100 },
            { name: 'KJFK', alt: 35000 },
          ],
          notes: ['clear', 'turbulence 📌', 'landed'],
        },
      ]);

      const plans = Plan.array(bytes);
      expect(plans.length).toBe(1);
      const p = plans.at(0);
      expect(p.flightId).toBe(42);
      expect(p.stops.length).toBe(2);
      expect(p.stops.at(0).name).toBe('KSFO');
      expect(p.stops.at(0).alt).toBe(100);
      expect(p.stops.at(1).name).toBe('KJFK');
      expect(p.stops.at(1).alt).toBe(35000);
      expect(p.notes).toEqual(['clear', 'turbulence 📌', 'landed']);
    });
  });

  describe('JSON-Like Ergonomics & Flyweight Zero-Allocation Iteration', () => {
    const Point = defineStruct('Point', {
      id: u32,
      x: f64,
      y: f64,
      label: str,
    });

    it('supports object spread, destructuring, Object.keys, toObject, and JSON.stringify', () => {
      const bytes = pack(Point, [
        { id: 10, x: 1.5, y: -2.5, label: 'alpha' },
        { id: 20, x: 3.5, y: -4.5, label: 'beta' },
      ]);
      const arr = Point.array(bytes);
      const row = arr.at(0);

      // Object.keys only lists schema fields, no internal properties
      expect(Object.keys(row)).toEqual(['id', 'x', 'y', 'label']);

      // Destructuring
      const { id, x, y, label } = row;
      expect({ id, x, y, label }).toEqual({ id: 10, x: 1.5, y: -2.5, label: 'alpha' });

      // Object spread
      expect({ ...row }).toEqual({ id: 10, x: 1.5, y: -2.5, label: 'alpha' });

      // JSON.stringify on single row and entire array
      expect(JSON.parse(JSON.stringify(row))).toEqual({ id: 10, x: 1.5, y: -2.5, label: 'alpha' });
      expect(JSON.parse(JSON.stringify(arr))).toEqual([
        { id: 10, x: 1.5, y: -2.5, label: 'alpha' },
        { id: 20, x: 3.5, y: -4.5, label: 'beta' },
      ]);
    });

    it('iterates with a single reusable flyweight cursor and supports view.at(i, outCursor)', () => {
      const count = 500;
      const input = Array.from({ length: count }, (_, i) => ({
        id: i,
        x: i * 1.5,
        y: i * -0.5,
        label: `pt_${i}`,
      }));
      const bytes = pack(Point, input);
      const arr = Point.array(bytes);

      let sumX = 0;
      let firstRef: unknown = null;
      for (const row of arr) {
        if (firstRef === null) firstRef = row;
        else expect(row).toBe(firstRef); // Exact same flyweight instance reused!
        sumX += row.x;
      }
      expect(sumX).toBe((count * (count - 1) * 1.5) / 2);

      // Random access with explicit cursor (zero allocation)
      const cursor = arr.cursor(0);
      const res = arr.at(321, cursor);
      expect(res).toBe(cursor);
      expect(cursor.id).toBe(321);
      expect(cursor.label).toBe('pt_321');
    });
  });

  describe('WasmArena / WebAssembly.Memory Auto-Rebinding', () => {
    it('automatically re-binds views and cursors when WebAssembly.Memory.grow() detaches the buffer', () => {
      const Sample = defineStruct('Sample', {
        t: u32,
        val: f64,
      });

      const wasmMem = new WebAssembly.Memory({ initial: 1 }); // 64 KiB
      const arena = new WasmArena(wasmMem, 64);
      expect(Arena).toBe(WasmArena);

      const single = arena.allocOne(Sample, { t: 1, val: 42.5 });
      const arr = arena.alloc(Sample, 4, true);
      arr.set(0, { t: 10, val: 100.25 });
      arr.set(3, { t: 40, val: 400.75 });
      const cursor = arr.cursor(0);

      // Force WebAssembly.Memory growth (detaches previous ArrayBuffer)
      wasmMem.grow(2);

      // Reading and writing through existing views and cursors transparently re-binds!
      expect(single.t).toBe(1);
      expect(single.val).toBe(42.5);
      single.val = 99.5;
      expect(single.val).toBe(99.5);

      expect(cursor.t).toBe(10);
      expect(cursor.val).toBe(100.25);
      expect(arr.at(3).val).toBe(400.75);

      arr.at(3).val = 555.5;
      expect(arr.at(3).val).toBe(555.5);
    });
  });

  describe('doppler-geo Exact #[repr(C)] Struct Parity &Rust Compiler Verification', () => {
    // Exact struct definitions matching doppler-geo/scripts/search_kernel.rs
    const SpdSample = defineStruct('SpdSample', {
      fi: u32,
      t_ds: u32,
      lat_e6: i32,
      lon_e6: i32,
      z: i16,
      ve_dm: i16,
      vn_dm: i16,
      vz_dm: i16,
    });

    const ShardDesc = defineStruct('ShardDesc', {
      sample_off: u32,
      sample_cnt: u32,
      minute: i32,
      band: i32,
      fid_base: u32,
      _pad: u32,
      day0: f64,
    });

    const PassDesc = defineStruct('PassDesc', {
      v: f64,
      d: f64,
      tc: f64,
      qp_off: u32,
      qp_cnt: u32,
      sp0: u32,
      sp1: u32,
    });

    const QpPoint = defineStruct('QpPoint', {
      tr: f64,
      x0: f64,
      y0: f64,
      z0: f64,
    });

    const MAX_PASSES = 4;
    const OutHit = defineStruct('OutHit', {
      lat: f64,
      lon: f64,
      start: f64,
      pre: f64,
      set_idx: u32,
      n_flights: u32,
      fids: fixedArray(u32, MAX_PASSES),
      _pad: u32,
    });

    const OutShortlist = defineStruct('OutShortlist', {
      fid: u32,
      _pad: u32,
      lat: f64,
      lon: f64,
      start: f64,
      dv: f64,
    });

    const IOHeader = defineStruct('IOHeader', {
      num_samples: u32,
      num_shards: u32,
      num_hexes: u32,
      num_passes: u32,
      num_qp: u32,
      num_spans: u32,
      samples_ptr: u32,
      shards_ptr: u32,
      fid_to_hex_ptr: u32,
      passes_ptr: u32,
      qp_ptr: u32,
      spans_ptr: u32,
      out_hits_ptr: u32,
      out_shortlist_ptr: u32,
      out_hits_cnt: u32,
      out_shortlist_cnt: u32,
      out_unhealed_cnt: u32,
    });

    it('matches every doppler-geo struct size, alignment, and field byte offset', () => {
      expect(SpdSample.size).toBe(24);
      expect(SpdSample.align).toBe(4);
      expect(SpdSample.offsetOf('z')).toBe(16);
      expect(SpdSample.offsetOf('vz_dm')).toBe(22);

      expect(ShardDesc.size).toBe(32);
      expect(ShardDesc.align).toBe(8);
      expect(ShardDesc.offsetOf('day0')).toBe(24);

      expect(PassDesc.size).toBe(40);
      expect(PassDesc.align).toBe(8);
      expect(PassDesc.offsetOf('qp_off')).toBe(24);
      expect(PassDesc.offsetOf('sp1')).toBe(36);

      expect(QpPoint.size).toBe(32);
      expect(QpPoint.align).toBe(8);

      expect(OutHit.size).toBe(64);
      expect(OutHit.align).toBe(8);
      expect(OutHit.offsetOf('fids')).toBe(40);
      expect(OutHit.offsetOf('_pad')).toBe(56);

      expect(OutShortlist.size).toBe(40);
      expect(OutShortlist.align).toBe(8);
      expect(OutShortlist.offsetOf('lat')).toBe(8);

      expect(IOHeader.size).toBe(68);
      expect(IOHeader.align).toBe(4);
      expect(IOHeader.offsetOf('out_unhealed_cnt')).toBe(64);
    });

    it('replaces manual Int32Array/Float64Array offset math in doppler-geo search.js with clean views', () => {
      const arena = new WasmArena(65536, 64);
      const hdr = arena.allocOne(IOHeader);
      const shards = arena.alloc(ShardDesc, 2);
      const passes = arena.alloc(PassDesc, 1);
      const qps = arena.alloc(QpPoint, 2);

      // Place raw 24-byte SpdSample binary shard directly via placeBytes
      const rawShard = new Uint8Array(24 * 2);
      const rawSamples = SpdSample.mutArray(rawShard);
      rawSamples.set(0, {
        fi: 0,
        t_ds: 100,
        lat_e6: 37774900,
        lon_e6: -122419400,
        z: 1000,
        ve_dm: 50,
        vn_dm: -20,
        vz_dm: 0,
      });
      rawSamples.set(1, {
        fi: 1,
        t_ds: 110,
        lat_e6: 37780000,
        lon_e6: -122410000,
        z: 1050,
        ve_dm: 52,
        vn_dm: -18,
        vz_dm: 5,
      });

      const placed = arena.placeBytes(rawShard, SpdSample);
      const placedSamples = placed.as(SpdSample);
      expect(placedSamples.length).toBe(2);
      expect(placedSamples.at(1).lat_e6).toBe(37780000);

      shards.set(0, {
        sample_off: 0,
        sample_cnt: 2,
        minute: 120,
        band: 3,
        fid_base: 500,
        _pad: 0,
        day0: 1700000000,
      });
      passes.set(0, { v: 250.5, d: 12000.0, tc: 1700007200.0, qp_off: 0, qp_cnt: 2, sp0: 0, sp1: 1 });
      qps.set(0, { tr: 1700007200.0, x0: 1.0, y0: 2.0, z0: 3.0 });

      hdr.num_samples = placedSamples.length;
      hdr.num_shards = shards.length;
      hdr.num_passes = passes.length;
      hdr.num_qp = qps.length;
      hdr.samples_ptr = placed.ptr;
      hdr.shards_ptr = shards.byteOffset;
      hdr.passes_ptr = passes.byteOffset;
      hdr.qp_ptr = qps.byteOffset;

      expect(hdr.num_samples).toBe(2);
      expect(shards.at(0).day0).toBe(1700000000);
      expect(passes.at(0).v).toBe(250.5);
      expect(qps.at(0).z0).toBe(3.0);
    });

    it('generates valid Rust #[repr(C)] code and passes rustc compile-time layout assertions', () => {
      const TelemetryPacket = defineStruct('TelemetryPacket', {
        seq: u64,
        callsign: str,
        samples: slice(SpdSample),
      });

      const rustCode = toRustReprC([
        SpdSample,
        ShardDesc,
        PassDesc,
        QpPoint,
        OutHit,
        OutShortlist,
        IOHeader,
        TelemetryPacket,
      ]);

      expect(generateRust).toBe(toRustReprC);
      expect(rustCode).toContain('#[repr(C)]');
      expect(rustCode).toContain('pub struct SpdSample');
      expect(rustCode).toContain('pub struct CapnStr');
      expect(rustCode).toContain('pub struct CapnSlice<T>');
      expect(rustCode).toContain('core::mem::offset_of!(OutHit, fids) == 40');
      expect(rustCode).toContain('checked_add');
      expect(rustCode).toContain('checked_mul');
      // Compile with rustc to verify all compile-time size_of, align_of, and offset_of! assertions pass
      const tmp = mkdtempSync(join(tmpdir(), 'capnstruct-rust-'));
      try {
        const rsPath = join(tmp, 'layout_check.rs');
        const rmetaPath = join(tmp, 'layout_check.rmeta');
        writeFileSync(rsPath, rustCode, 'utf8');
        execFileSync('rustc', ['--edition=2021', '--crate-type=lib', '--emit=metadata', '-o', rmetaPath, rsPath], {
          stdio: 'pipe',
        });
        expect(readFileSync(rmetaPath).byteLength).toBeGreaterThan(0);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('generates valid Go zero-copy struct code and passes go compile-time layout assertions', () => {
      const TelemetryPacket = defineStruct('TelemetryPacket', {
        seq: u64,
        callsign: str,
        samples: slice(SpdSample),
      });

      const goCode = toGoStruct([
        SpdSample,
        ShardDesc,
        PassDesc,
        QpPoint,
        OutHit,
        OutShortlist,
        IOHeader,
        TelemetryPacket,
      ]);

      expect(generateGo).toBe(toGoStruct);
      expect(goCode).toContain('package capnschema');
      expect(goCode).toContain('type SpdSample struct');
      expect(goCode).toContain('type CapnStr struct');
      expect(goCode).toContain('type CapnSlice[T any] struct');
      expect(goCode).toContain('func CapnBytes(ptr uintptr, byteLen uint32) []byte');
      expect(goCode).toContain('func CapnView[T any](b []byte) *T');
      expect(goCode).toContain('func CapnSliceView[T any](b []byte, n uint32) []T');
      expect(goCode).toContain('unsafe.Offsetof(OutHit{}.Fids)');

      // Compile with `go tool compile` to verify all compile-time Sizeof, Alignof, and Offsetof assertions pass
      const tmp = mkdtempSync(join(tmpdir(), 'capnstruct-go-'));
      try {
        const goPath = join(tmp, 'layout_check.go');
        const objPath = join(tmp, 'layout_check.o');
        writeFileSync(goPath, goCode, 'utf8');
        execFileSync('go', ['tool', 'compile', '-o', objPath, goPath], {
          stdio: 'pipe',
        });
        expect(readFileSync(objPath).byteLength).toBeGreaterThan(0);

        // Also compile and execute Go WASM (GOOS=wasip1 GOARCH=wasm) & TinyGo WASM (-target=wasi) with { wasm: true }
    const RingNode = defineStruct('RingNode', (self) => ({
      id: u32,
      weight: f64,
      label: str,
      next: ref(self),
    }));
        const WasmDiag = defineStruct('WasmDiag', {
          line: u32,
          character: u32,
          code: u32,
          category: u32,
          fileName: str,
          text: str,
        });
        const WasmDiagBatch = defineStruct('WasmDiagBatch', {
          diags: slice(WasmDiag),
        });
        const wasmGoCode =
          toGoStruct([SpdSample, RingNode, WasmDiag, WasmDiagBatch], { wasm: true }) +
          `\nvar _diagOut []byte\nvar _diagBuilder CapnBuilder\n//go:wasmexport build_diags\nfunc build_diags() uintptr {\n\tfiles := [3]string{"", "src/checker.ts", "src/checker.ts"}\n\tmsgs := [3]string{"global config error", "Type string is not assignable to number", "Cannot find name x"}\n\t_diagOut = CapnBuild(&_diagBuilder, func(b *CapnBuilder) WasmDiagBatch {\n\t\treturn WasmDiagBatch{\n\t\t\tDiags: CapnBuildSlice(b, 3, func(i int, b *CapnBuilder) WasmDiag {\n\t\t\t\treturn WasmDiag{\n\t\t\t\t\tLine: uint32(i * 10),\n\t\t\t\t\tCharacter: uint32(i + 1),\n\t\t\t\t\tCode: uint32(2322 + i),\n\t\t\t\t\tCategory: 1,\n\t\t\t\t\tFileName: b.StrDedup(files[i]),\n\t\t\t\t\tText: b.Str(msgs[i]),\n\t\t\t\t}\n\t\t\t}),\n\t\t}\n\t})\n\treturn uintptr(unsafe.Pointer(unsafe.SliceData(_diagOut)))\n}\n//go:wasmexport build_diags_len\nfunc build_diags_len() uint32 { return uint32(len(_diagOut)) }\n//go:wasmexport sum_ring\nfunc sum_ring(ptr uintptr, byteLen uint32, count uint32) float64 {\n\tb := CapnBytes(ptr, byteLen)\n\tnodes := CapnSliceView[RingNode](b, count)\n\tcur := &nodes[0]\n\tvar total float64\n\tfor i := uint32(0); i < count && cur != nil; i++ {\n\t\ttotal += cur.Weight + float64(len(cur.Label.String(b)))\n\t\tcur = cur.Next.Ptr(b)\n\t}\n\treturn total\n}\n\nfunc main() {}\n`;
        expect(wasmGoCode).toContain('package main');
        expect(wasmGoCode).toContain('//go:wasmexport capn_alloc');
        expect(wasmGoCode).toContain('//go:wasmexport capn_reset');
        expect(wasmGoCode).toContain('type CapnBuilder struct');
        expect(wasmGoCode).toContain('func CapnBuild[T any]');
        writeFileSync(join(tmp, 'main.go'), wasmGoCode, 'utf8');
        writeFileSync(join(tmp, 'go.mod'), 'module capnwasmtest\ngo 1.24\n', 'utf8');

        const goWasmPath = join(tmp, 'go.wasm');
        execFileSync(
          'go',
          ['build', '-buildmode=c-shared', '-o', goWasmPath, join(tmp, 'main.go')],
          {
            cwd: tmp,
            env: { ...process.env, GOOS: 'wasip1', GOARCH: 'wasm' },
            stdio: 'pipe',
          },
        );

        const instantiateWasiModule = (wasmPath: string) => {
          let inst: WebAssembly.Instance;
          const shim = {
            wasi_snapshot_preview1: new Proxy(
              {},
              {
                get: (_, k) => {
                  if (k === 'args_sizes_get' || k === 'environ_sizes_get') {
                    return (cPtr: number, bPtr: number) => {
                      const dv = new DataView((inst.exports.memory as WebAssembly.Memory).buffer);
                      dv.setUint32(cPtr, 0, true);
                      dv.setUint32(bPtr, 0, true);
                      return 0;
                    };
                  }
                  if (k === 'clock_time_get') {
                    return (_id: number, _prec: bigint, tPtr: number) => {
                      const dv = new DataView((inst.exports.memory as WebAssembly.Memory).buffer);
                      dv.setBigUint64(tPtr, BigInt(Date.now()) * 1000000n, true);
                      return 0;
                    };
                  }
                  if (k === 'random_get') {
                    return (p: number, l: number) => {
                      new Uint8Array((inst.exports.memory as WebAssembly.Memory).buffer, p, l).fill(1);
                      return 0;
                    };
                  }
                  if (k === 'fd_write') {
                    return (_fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number) => {
                      const dv = new DataView((inst.exports.memory as WebAssembly.Memory).buffer);
                      let total = 0;
                      for (let i = 0; i < iovsLen; i++) {
                        total += dv.getUint32(iovsPtr + i * 8 + 4, true);
                      }
                      dv.setUint32(nwrittenPtr, total, true);
                      return 0;
                    };
                  }
                  return () => 0;
                },
              },
            ),
          };
          inst = new WebAssembly.Instance(
            new WebAssembly.Module(readFileSync(wasmPath)),
            shim as WebAssembly.Imports,
          );
          (inst.exports._initialize as () => void)();
      return inst.exports as {
        memory: WebAssembly.Memory;
            capn_alloc: (n: number) => number;
            capn_reset: () => void;
            sum_ring: (ptr: number, byteLen: number, count: number) => number;
            build_diags: () => number;
            build_diags_len: () => number;
          };
        };
    const n1 = RingNode.item({ id: 1, weight: 10.5, label: 'alpha', next: null });
    const n2 = RingNode.item({ id: 2, weight: 20.25, label: 'beta', next: n1 });
      n1.next = n2; // cycle: n1 <-> n2
      const packedRing = RingNode.pack([n1, n2]);
        const goExp = instantiateWasiModule(goWasmPath);
        const goPtr = goExp.capn_alloc(packedRing.byteLength) as number;
        new Uint8Array((goExp.memory as WebAssembly.Memory).buffer, goPtr, packedRing.byteLength).set(
          packedRing,
        );
        // 10.5 + 5 ('alpha') + 20.25 + 4 ('beta') = 39.75
        expect(goExp.sum_ring(goPtr, packedRing.byteLength, 2)).toBeCloseTo(39.75, 5);
        goExp.capn_reset();
        const goDiagPtr = goExp.build_diags() >>> 0;
        const goDiagLen = goExp.build_diags_len() >>> 0;
        expect(goDiagPtr).toBeGreaterThan(0);
        const goBatchFromMem = WasmDiagBatch.view(goExp.memory, goDiagPtr);
        expect(goBatchFromMem.diags.length).toBe(3);
        expect(goBatchFromMem.diags.at(0).fileName).toBe('');
        expect(goBatchFromMem.diags.at(0).text).toBe('global config error');
        expect(goBatchFromMem.diags.at(1).fileName).toBe('src/checker.ts');
        expect(goBatchFromMem.diags.at(2).fileName).toBe('src/checker.ts');
        const goDiagU8 = new Uint8Array(goExp.memory.buffer, goDiagPtr, goDiagLen);
        const goBatchFromU8 = WasmDiagBatch.view(goDiagU8);
        expect(goBatchFromU8.diags.map((d) => `${d.fileName}:${d.line}:${d.code}:${d.text}`)).toEqual([
          ':0:2322:global config error',
          'src/checker.ts:10:2323:Type string is not assignable to number',
          'src/checker.ts:20:2324:Cannot find name x',
        ]);
        // Verify StrDedup deduplicated "src/checker.ts" across rows 1 and 2 to the exact same tail offset
        const goDv = new DataView(goExp.memory.buffer, goDiagPtr, goDiagLen);
        const row1FnOff = goDv.getUint32(8 + 1 * 32 + 16, true);
        const row2FnOff = goDv.getUint32(8 + 2 * 32 + 16, true);
        expect(row1FnOff).toBeGreaterThan(0);
        expect(row2FnOff).toBe(row1FnOff);
        let hasTinyGo = false;
        try {
          execFileSync('tinygo', ['version'], { stdio: 'pipe' });
          hasTinyGo = true;
        } catch {
          hasTinyGo = false;
        }
        if (hasTinyGo) {
          const tinyWasmPath = join(tmp, 'tiny.wasm');
          execFileSync(
            'tinygo',
            ['build', '-buildmode=c-shared', '-o', tinyWasmPath, '-target=wasi', '-opt=2', '-no-debug', join(tmp, 'main.go')],
            { cwd: tmp, stdio: 'pipe' },
          );
          const tinyExp = instantiateWasiModule(tinyWasmPath);
          const tinyPtr = tinyExp.capn_alloc(packedRing.byteLength) as number;
          new Uint8Array((tinyExp.memory as WebAssembly.Memory).buffer, tinyPtr, packedRing.byteLength).set(
            packedRing,
          );
          expect(tinyExp.sum_ring(tinyPtr, packedRing.byteLength, 2)).toBeCloseTo(39.75, 5);
          tinyExp.capn_reset();
          const tinyDiagPtr = tinyExp.build_diags() >>> 0;
          const tinyDiagLen = tinyExp.build_diags_len() >>> 0;
          const tinyBatch = WasmDiagBatch.view(new Uint8Array(tinyExp.memory.buffer, tinyDiagPtr, tinyDiagLen));
          expect(tinyBatch.diags.length).toBe(3);
          expect(tinyBatch.diags.at(0).fileName).toBe('');
          expect(tinyBatch.diags.at(1).fileName).toBe('src/checker.ts');
          expect(tinyBatch.diags.at(2).text).toBe('Cannot find name x');
        }
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe('Mutable str & slice on Views (In-Place Overwrite + Auto-Tail Arena Growth)', () => {
    const User = defineStruct('User', {
      id: u32,
      name: str,
      scores: slice(u32),
    });

    it('overwrites shorter or equal-length str and slice in place with zero allocation and grows tail arena when longer', () => {
      const packed = pack(User, [
        { id: 1, name: 'Alexander', scores: [10, 20, 30, 40] },
        { id: 2, name: 'Bob', scores: [5] },
      ]);
      const users = User.mutArray(packed);
      const initialBuf = users.buffer;
      const initialTailLen = packed.byteLength;
      const u0 = users.at(0);
      u0.name = 'Alex';
      expect(u0.name).toBe('Alex');
      expect(users.buffer).toBe(initialBuf);
      expect(users.compactionRatio).toBeGreaterThan(0);

      // 2. Shorter slice overwrite in place
      u0.scores = new Uint32Array([100, 200]);
      expect(Array.from(u0.scores)).toEqual([100, 200]);
      expect(users.buffer).toBe(initialBuf);

      // 3. Longer string / slice automatically bump-allocates in tail arena (and grows backing buffer if needed)
      const u1 = users.at(1);
      u1.name = 'Bartholomew-Christopherson \u{1F680}';
      u1.set('scores', [1, 2, 3, 4, 5, 6, 7, 8]);
      expect(u1.name).toBe('Bartholomew-Christopherson \u{1F680}');
      expect(Array.from(u1.scores)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(u0.name).toBe('Alex');
      expect(Array.from(u0.scores)).toEqual([100, 200]);

      // 4. Compact strips dead bytes from overwritten strings/slices and produces a clean wire buffer
      const compacted = users.compact();
      expect(users.compactionRatio).toBe(0);
      expect(compacted.byteLength).toBeGreaterThan(initialTailLen - 16);

      const reloaded = User.array(compacted);
      expect(reloaded.toObjects()).toEqual([
        { id: 1, name: 'Alex', scores: [100, 200] },
        { id: 2, name: 'Bartholomew-Christopherson \u{1F680}', scores: [1, 2, 3, 4, 5, 6, 7, 8] },
      ]);
    });

    it('allocates variable-length fields directly inside a WasmArena when mutating arena-backed views', () => {
      const arena = new WasmArena(65536, 64);
      const u = arena.allocOne(User, { id: 7, name: 'Initial', scores: [1, 2] });
      expect(u.id).toBe(7);
      expect(u.name).toBe('Initial');
      expect(Array.from(u.scores)).toEqual([1, 2]);

      const usedBefore = arena.bytesUsed;
      // Shorter overwrite in-place does not bump arena offset
      u.name = 'Init';
      expect(u.name).toBe('Init');
      expect(arena.bytesUsed).toBe(usedBefore);

      // Longer overwrite bump-allocates inside the same WasmArena
      u.name = 'Much longer arena-backed string value';
      expect(u.name).toBe('Much longer arena-backed string value');
      expect(arena.bytesUsed).toBeGreaterThan(usedBefore);
    });
  });

  describe('Growable StructArrayView (.push, .pop, .compact, .bytes)', () => {
    const Metric = defineStruct('Metric', {
      ts: u32,
      val: f64,
      tag: str,
    });

    it('supports .push(), .pop(), automatic capacity doubling, and .bytes wire recovery', () => {
      const arr = Metric.alloc(0);
      expect(arr.length).toBe(0);
      expect(arr.pop()).toBeUndefined();

      arr.push(
        { ts: 100, val: 1.25, tag: 'cpu' },
        { ts: 200, val: 2.5, tag: 'mem' },
      );
      expect(arr.length).toBe(2);
      expect(arr.at(0).tag).toBe('cpu');
      expect(arr.at(-1).val).toBe(2.5);
      const lastPlain: typeof Metric.$plain = arr.at(-1).toObject();
      expect(lastPlain.tag).toBe('mem');

      // Push additional items to trigger table relocation + tail preservation
      for (let i = 0; i < 10; i++) {
        arr.push({ ts: 300 + i, val: i * 10.5, tag: `disk_${i}` });
      }
      expect(arr.length).toBe(12);
      expect(arr.at(0).tag).toBe('cpu');
      expect(arr.at(11).tag).toBe('disk_9');

      const popped = arr.pop();
      expect(popped).toEqual({ ts: 309, val: 94.5, tag: 'disk_9' });
      expect(arr.length).toBe(11);

      // Accessing .bytes on a dirty variable-length array automatically compacts for clean wire transfer
      const wireBytes = arr.bytes;
      const decoded = Metric.array(wireBytes);
      expect(decoded.length).toBe(11);
      expect(decoded.at(0).toObject()).toEqual({ ts: 100, val: 1.25, tag: 'cpu' });
      expect(decoded.at(10).toObject()).toEqual({ ts: 308, val: 84, tag: 'disk_8' });
    });
  });

  describe('Columnar TypedArray Projections (.column & .setColumn)', () => {
    const Sample8 = defineStruct('Sample8', {
      val: f64,
    });

    const Telemetry = defineStruct('Telemetry', {
      id: u32,
      active: bool,
      lat: f64,
      lon: f64,
    });

    it('extracts zero-copy TypedArray when stride == field size and contiguous TypedArray when strided', () => {
      // 1. Single-field 8-byte struct -> zero-copy Float64Array sharing the exact ArrayBuffer
      const sArr = Sample8.alloc(4);
      sArr.setColumn('val', [10.5, 20.5, 30.5, 40.5]);
      const zeroCopyCol = sArr.column('val');
      expect(zeroCopyCol).toBeInstanceOf(Float64Array);
      expect(zeroCopyCol.buffer).toBe(sArr.buffer);
      expect(Array.from(zeroCopyCol)).toEqual([10.5, 20.5, 30.5, 40.5]);

      // 2. Multi-field struct -> strided column extraction & bulk column update
      const tArr = Telemetry.alloc(3);
      tArr.set(0, { id: 1, active: true, lat: 37.7, lon: -122.4 });
      tArr.set(1, { id: 2, active: false, lat: 35.6, lon: 139.6 });
      tArr.set(2, { id: 3, active: true, lat: 51.5, lon: -0.1 });

      expect(Array.from(tArr.column('id'))).toEqual([1, 2, 3]);
      expect(Array.from(tArr.column('active'))).toEqual([1, 0, 1]);
      expect(Array.from(tArr.column('lat'))).toEqual([37.7, 35.6, 51.5]);

      tArr.setColumn('lat', [40.0, 41.0, 42.0]);
      expect(tArr.at(0).lat).toBe(40.0);
      expect(tArr.at(1).lat).toBe(41.0);
      expect(tArr.at(2).lat).toBe(42.0);
    });
  });

  describe("Cap'n-Style Schema Evolution (Forward / Backward Wire Stride Compatibility)", () => {
    const PointV1 = defineStruct('PointV1', {
      x: f64,
      y: f64,
    });

    const PointV2 = defineStruct('PointV2', {
      x: f64,
      y: f64,
      z: f64,
      label: str,
      flags: fixedArray(u32, 2),
    });

    it('reads older V1 binary buffers using newer V2 schema with default values and auto-upgrades on mutation', () => {
      const v1Bytes = pack(PointV1, [
        { x: 1.5, y: 2.5 },
        { x: 3.5, y: 4.5 },
      ]);

      // Read V1 bytes through V2 schema by passing PointV1 (or { stride: PointV1.size })
      const v2Arr = PointV2.mutArray(v1Bytes, PointV1);
      expect(v2Arr.length).toBe(2);

      const p0 = v2Arr.at(0);
      expect(p0.x).toBe(1.5);
      expect(p0.y).toBe(2.5);
      // Newly added V2 fields beyond V1 stride safely return default values
      expect(p0.z).toBe(0);
      expect(p0.label).toBe('');
      expect(Array.from(p0.flags)).toEqual([0, 0]);
      expect(p0.toObject()).toEqual({
        x: 1.5,
        y: 2.5,
        z: 0,
        label: '',
        flags: [0, 0],
      });

      // Columnar projection on a newly added V2 field returns zero-filled TypedArray
      expect(Array.from(v2Arr.column('z'))).toEqual([0, 0]);

      // Mutating a newly added V2 field automatically upgrades the view/array to full V2 stride!
      p0.z = 99.5;
      p0.label = 'upgraded';
      expect(p0.z).toBe(99.5);
      expect(p0.label).toBe('upgraded');
      expect(v2Arr.stride).toBe(PointV2.size);
      expect(v2Arr.at(1).x).toBe(3.5);
      expect(v2Arr.at(1).y).toBe(4.5);
      expect(v2Arr.at(1).z).toBe(0);

      // Older V1 schema can also read newer V2 fixed-only buffers by passing V2 stride
      const PointV2Fixed = defineStruct('PointV2Fixed', {
        x: f64,
        y: f64,
        z: f64,
      });
      const v2FixedBytes = pack(PointV2Fixed, [
        { x: 10, y: 20, z: 30 },
        { x: 40, y: 50, z: 60 },
      ]);
      const v1FromV2 = PointV1.array(v2FixedBytes, PointV2Fixed);
      expect(v1FromV2.toObjects()).toEqual([
        { x: 10, y: 20 },
        { x: 40, y: 50 },
      ]);
    });
  });

  describe('Wire-Safety Pointer Bounds, Sub-Slice Window Clamping & Amplification Defense', () => {
    const Msg = defineStruct('Msg', {
      id: u32,
      text: str,
      nums: slice(u32),
    });

    it('rejects corrupted str and slice [off, len] descriptors pointing past buffer or before descriptor', () => {
      const bytes = pack(Msg, [{ id: 1, text: 'hello', nums: [10, 20] }]);
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

      // Corrupt str length to read past buffer end
      const badLen = bytes.slice();
      new DataView(badLen.buffer).setUint32(Msg.offsetOf('text') + 4, 999999, true);
      expect(() => Msg.view(badLen).text).toThrow(RangeError);

      // Corrupt str offset to point into the fixed header before the descriptor
      const badOff = bytes.slice();
      new DataView(badOff.buffer).setUint32(Msg.offsetOf('text'), 2, true);
      expect(() => Msg.view(badOff).text).toThrow(RangeError);

      // Corrupt slice offset with u32 max to test 32-bit addition without wraparound
      const badSlice = bytes.slice();
      new DataView(badSlice.buffer).setUint32(Msg.offsetOf('nums'), 0xffffffff, true);
      new DataView(badSlice.buffer).setUint32(Msg.offsetOf('nums') + 4, 4, true);
      expect(() => Msg.view(badSlice).nums).toThrow(RangeError);
      expect(dv.byteLength).toBeGreaterThan(0);
    });

    it('clamps Uint8Array sub-slice window so corrupt pointers cannot bleed into trailing ArrayBuffer memory', () => {
      const valid = pack(Msg, [{ id: 7, text: 'safe', nums: [1, 2] }]);
      const backing = new ArrayBuffer(valid.byteLength + 128);
      new Uint8Array(backing, 0, valid.byteLength).set(valid);
      // Write secret data in the trailing 128 bytes of the shared ArrayBuffer
      new TextEncoder().encodeInto('TOP_SECRET_DATA', new Uint8Array(backing, valid.byteLength));

      const subView = new Uint8Array(backing, 0, valid.byteLength);
      // Corrupt str descriptor to point into the trailing 128 bytes of the shared ArrayBuffer
      new DataView(backing).setUint32(Msg.offsetOf('text'), valid.byteLength, true);
      new DataView(backing).setUint32(Msg.offsetOf('text') + 4, 15, true);
      expect(() => Msg.view(subView).text).toThrow(RangeError);
    });

    it('blocks cyclic and aliased pointer amplification attacks during .toObject() / .toObjects()', () => {
      const Node = defineStruct('Node', {
        items: slice(u32),
      });
      const Row = defineStruct('Row', {
        nodes: slice(Node),
      });
      const bytes = pack(Row, [{ nodes: [{ items: [1, 2, 3, 4] }] }]);
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      // Corrupt Row.nodes length to claim 100,000 structs in a tiny buffer
      dv.setUint32(4, 100_000, true);
      expect(() => Row.view(bytes).toObject()).toThrow(RangeError);
    });

    it('extends tail-tip allocations in place with 0 dead bytes and supports StructView.compact()', () => {
      const v = Msg.create({ id: 42, text: 'hi', nums: [1, 2] });
      expect(v.compactionRatio).toBe(0);

      // Exact-fit overwrite produces 0 dead bytes
      v.text = 'yo';
      expect(v.text).toBe('yo');
      expect(v.compactionRatio).toBe(0);

      // Tail-tip growth on the last variable-length field ('nums') extends in-place with 0 dead bytes!
      v.set('nums', [1, 2, 3, 4, 5, 6]);
      expect(Array.from(v.nums)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(v.compactionRatio).toBe(0);

      // Growing non-tip field ('text') creates dead bytes which .compact() or .bytes automatically strips
      v.text = 'longer string that moves to new tail tip';
      expect(v.compactionRatio).toBeGreaterThan(0);
      const wire = v.bytes;
      expect(v.compactionRatio).toBe(0);
      expect(Msg.view(wire).toObject()).toEqual({
        id: 42,
        text: 'longer string that moves to new tail tip',
        nums: [1, 2, 3, 4, 5, 6],
      });
    });
  });

  describe('Inline Fixed-Length & Zero-Overhead Primitives (f16, fixedStr, fixedBytes, sentinel/nullable, scaled)', () => {
    it('supports f16 half-precision floats and zero-copy Float16Array columns', () => {
      const TfPoint = defineStruct('TfPoint', {
        t: f16,
        f: f16,
      });
      expect(TfPoint.size).toBe(4);
      expect(TfPoint.align).toBe(2);

      const arr = TfPoint.alloc(3);
      arr.at(0).set({ t: 1.5, f: -2.25 });
      arr.at(1).set({ t: 0, f: 65504 });
      arr.at(2).set({ t: -0.0625, f: Infinity });

      expect(arr.at(0).t).toBeCloseTo(1.5, 3);
      expect(arr.at(0).f).toBeCloseTo(-2.25, 3);
      expect(arr.at(1).t).toBe(0);
      expect(arr.at(1).f).toBe(65504);
      expect(arr.at(2).t).toBeCloseTo(-0.0625, 4);
      expect(arr.at(2).f).toBe(Infinity);

      const col = arr.column('t');
      expect(col.length).toBe(3);
      expect(col[0]).toBeCloseTo(1.5, 3);
    });

    it('packs fixedStr(N) and fixedBytes(N) inline with 0 tail indirection', () => {
      const Header = defineStruct('Header', {
        magic: fixedStr(4),
        hex: fixedStr(6),
        callsign: fixedStr(8),
        raw: fixedBytes(4),
        count: u32,
      });
      // 4 + 6 + 8 + 4 = 22 -> padded to 24 for u32 @ offset 24..28 -> size 28, align 4
      expect(Header.size).toBe(28);
      expect(Header.align).toBe(4);

      const bytes = Header.pack([
        { magic: 'RIFF', hex: 'a8b2c3', callsign: 'SFO12345678', raw: new Uint8Array([1, 2, 3, 4, 5]), count: 7 },
        { magic: 'WAVE', hex: 'ff00', callsign: '東京', raw: [9, 8], count: 9 },
      ]);
      // 100% flat fixed-size table: 2 * 28 = 56 bytes (no 8-byte tail pointers!)
      expect(bytes.byteLength).toBe(56);

      const view = Header.array(bytes);
      expect(view.length).toBe(2);
      expect(view.at(0).magic).toBe('RIFF');
      expect(view.at(0).hex).toBe('a8b2c3');
      expect(view.at(0).callsign).toBe('SFO12345'); // truncated to 8 bytes
      expect(Array.from(view.at(0).raw)).toEqual([1, 2, 3, 4]);
      expect(view.at(0).count).toBe(7);

      expect(view.at(1).magic).toBe('WAVE');
      expect(view.at(1).hex).toBe('ff00');
      expect(view.at(1).callsign).toBe('東京');
      expect(Array.from(view.at(1).raw)).toEqual([9, 8, 0, 0]);
      expect(view.at(1). toObject()).toEqual({
        magic: 'WAVE',
        hex: 'ff00',
        callsign: '東京',
        raw: [9, 8, 0, 0],
        count: 9,
      });
    });

    it('maps sentinel / nullable and scaled fixed-point primitives with 0 extra wire bytes', () => {
      const AdsbPoint = defineStruct('AdsbPoint', {
        lat: scaled(i32, 1e6),
        lon: scaled(i32, 1e6),
        gs: scaled(i16, 10, { null: -32768 }),
        track: sentinel(i16, -32768),
        rms: nullable(f32, Number.NaN),
      });
      expect(AdsbPoint.size).toBe(16);
      expect(AdsbPoint.align).toBe(4);

      // Default creation initializes sentinel/nullable fields to null automatically
      const single = AdsbPoint.create({ lat: 37.774929, lon: -122.419416 });
      expect(single.lat).toBeCloseTo(37.774929, 6);
      expect(single.lon).toBeCloseTo(-122.419416, 6);
      expect(single.gs).toBeNull();
      expect(single.track).toBeNull();
      expect(single.rms).toBeNull();

      // Verify raw wire bytes hold the exact integer scaled values and -32768 / NaN sentinels
      const dv = new DataView(single.bytes.buffer, single.bytes.byteOffset, single.bytes.byteLength);
      expect(dv.getInt32(0, true)).toBe(37774929);
      expect(dv.getInt32(4, true)).toBe(-122419416);
      expect(dv.getInt16(8, true)).toBe(-32768);
      expect(dv.getInt16(10, true)).toBe(-32768);
      expect(Number.isNaN(dv.getFloat32(12, true))).toBe(true);

      // Set non-null values and back to null
      single.gs = 452.3;
      single.track = 180;
      single.rms = 1.25;
      expect(single.gs).toBeCloseTo(452.3, 1);
      expect(single.track).toBe(180);
      expect(single.rms).toBeCloseTo(1.25, 4);

      single.gs = null;
      single.track = null;
      single.rms = null;
      expect(single.gs).toBeNull();
      expect(single.track).toBeNull();
      expect(single.rms).toBeNull();

      // Also initializes sentinels in WasmArena.alloc / allocOne and StructDef.pack
      const arena = new WasmArena(4096);
      const aOne = arena.allocOne(AdsbPoint);
      expect(aOne.gs).toBeNull();
      expect(aOne.track).toBeNull();
    });
  });

  describe('Cursor .seek(i) / .at(i) & Bulk memcpy Slice Assignment', () => {
    it('repositions flyweight cursors via .seek(i) and .at(i) and bulk-copies StructArrayView / TypedArray into slices', () => {
      const Pt = defineStruct('Pt', {
        x: i32,
        y: i32,
      });
      const Bundle = defineStruct('Bundle', {
        id: u32,
        pts: slice(Pt),
        weights: slice(f32),
      });

      const ptsView = Pt.alloc(4);
      const cur = ptsView.cursor(0);
      for (let i = 0; i < 4; i++) {
        cur.seek(i).set({ x: i * 10, y: i * 20 });
      }
      expect(cur.at(-1).x).toBe(30);
      expect(cur.at(-1).y).toBe(60);

      const f32Weights = new Float32Array([0.5, 1.5, 2.5]);
      const packed = Bundle.pack([{ id: 9, pts: ptsView, weights: f32Weights }]);
      const bView = Bundle.mutView(packed);
      expect(bView.id).toBe(9);
      expect(bView.pts.toObjects()).toEqual([
        { x: 0, y: 0 },
        { x: 10, y: 20 },
        { x: 20, y: 40 },
        { x: 30, y: 60 },
      ]);
      expect(Array.from(bView.weights)).toEqual([0.5, 1.5, 2.5]);

      // In-place mutation of slice(Pt) from a subarray of ptsView via bulk memcpy
      bView.pts = ptsView.subarray(1, 3);
      expect(bView.pts.toObjects()).toEqual([
        { x: 10, y: 20 },
        { x: 20, y: 40 },
      ]);
    });
  });

  describe('Zero-Heap Queryable Table Primitives (subarray, lowerBound, upperBound, rangeBy, filterBytes, concatBytes)', () => {
    const EventRow = defineStruct('EventRow', {
      ts: u32,
      val: f64,
    });

    it('performs O(log N) binary search (lowerBound, upperBound, rangeBy) and O(1) subarray slicing without copying', () => {
      const rows = EventRow.pack([
        { ts: 100, val: 1.0 },
        { ts: 200, val: 2.0 },
        { ts: 200, val: 2.5 },
        { ts: 300, val: 3.0 },
        { ts: 400, val: 4.0 },
      ]);
      const table = EventRow.array(rows);

      expect(table.lowerBound('ts', 200)).toBe(1);
      expect(table.upperBound('ts', 200)).toBe(3);
      expect(table.lowerBound('ts', 250)).toBe(3);
      expect(table.lowerBound('ts', 50)).toBe(0);
      expect(table.upperBound('ts', 999)).toBe(5);

      const slice200to300 = table.rangeBy('ts', 200, 300);
      expect(slice200to300.length).toBe(3);
      expect(slice200to300.buffer).toBe(table.buffer); // Zero-copy!
      expect(slice200to300.toObjects()).toEqual([
        { ts: 200, val: 2.0 },
        { ts: 200, val: 2.5 },
        { ts: 300, val: 3.0 },
      ]);

      // Negative indices on subarray
      const lastTwo = table.subarray(-2);
      expect(lastTwo.toObjects()).toEqual([
        { ts: 300, val: 3.0 },
        { ts: 400, val: 4.0 },
      ]);
    });

    it('preserves baseOffset on subarray of variable-length tables and compacts cleanly', () => {
      const LogRow = defineStruct('LogRow', {
        ts: u32,
        msg: str,
      });
      const table = LogRow.array(
        LogRow.pack([
          { ts: 10, msg: 'first' },
          { ts: 20, msg: 'second-message' },
          { ts: 30, msg: 'third' },
        ]),
      );
      const mid = table.subarray(1, 2);
      expect(mid.length).toBe(1);
      expect(mid.at(0).ts).toBe(20);
      expect(mid.at(0).msg).toBe('second-message');

      // Accessing .bytes on a variable-length sub-slice compacts just the sub-slice rows for wire transfer
      const wire = mid.bytes;
      const decoded = LogRow.array(wire);
      expect(decoded.toObjects()).toEqual([{ ts: 20, msg: 'second-message' }]);
    });

    it('filters binary rows with 0 per-row object allocations via filterBytes and merges chunks via concatBytes', () => {
      const chunk1 = EventRow.pack([
        { ts: 10, val: 1 },
        { ts: 20, val: 2 },
      ]);
      const chunk2 = EventRow.array(
        EventRow.pack([
          { ts: 30, val: 3 },
          { ts: 40, val: 4 },
        ]),
      );
      const merged = EventRow.concatBytes([chunk1, chunk2]);
      const all = EventRow.array(merged);
      expect(all.length).toBe(4);

      const filteredBytes = all.filterBytes((row) => row.ts >= 20 && row.ts <= 30);
      const filtered = EventRow.array(filteredBytes);
      expect(filtered.toObjects()).toEqual([
        { ts: 20, val: 2 },
        { ts: 30, val: 3 },
      ]);
      expect(concatBytes(EventRow, [filtered]).byteLength).toBe(32);
    });
  });

  describe('Circular References, Self-Referential & Mutually Recursive Schemas (ref & slice)', () => {
    it('packs, traverses in zero-copy, mutates, compacts, and materializes circular object graphs via ref(() => Node)', () => {
      const GraphNode = defineStruct('GraphNode', (self) => ({
        id: u32,
        label: str,
        next: ref(self),
        prev: ref(self),
      }));

      // Build a circular doubly-linked list + self-referential node in JS
      const n1 = GraphNode.item({ id: 1, label: 'alpha', next: null, prev: null });
      const n2 = GraphNode.item({ id: 2, label: 'beta', next: null, prev: n1 });
      n1.next = n2;
      n2.next = n1; // cycle: n1 <-> n2
      n1.prev = n2;
      // JSON.stringify crashes on circular references, while capnstruct packs them into a flat Uint8Array!
      expect(() => JSON.stringify(n1)).toThrow(TypeError);

      const packed = GraphNode.pack([n1, n2]);
      const table = GraphNode.mutArray(packed);
      expect(table.length).toBe(2);

      // Zero-copy O(1) cyclic traversal across arbitrary depth without allocating JS objects
      const v0 = table.at(0);
      expect(v0.id).toBe(1);
    expect(v0.next?.id).toBe(2);
    expect(v0.next?.label).toBe('beta');
    expect(v0.next?.next?.id).toBe(1);
    expect(v0.next?.next?.prev?.id).toBe(2);
    expect(v0.prev?.prev?.id).toBe(1);

      // .toObject() and .toObjects() reconstruct the exact circular JS object graph without infinite recursion
      const materialized = v0.toObject();
      expect(materialized.id).toBe(1);
    expect(materialized.next?.id).toBe(2);
    expect(materialized.next?.next).toBe(materialized);
      expect(materialized.prev).toBe(materialized.next);

      const allObjs = table.toObjects();
      expect(allObjs[0].next).toBe(allObjs[1]);
      expect(allObjs[1].next).toBe(allObjs[0]);

      // Single-struct create() with a self-cycle (self.next = self) and tail-allocated cycle
      const selfNode = GraphNode.item({ id: 99, label: 'self-loop', prev: null });
      selfNode.next = selfNode;
      const sv = GraphNode.create(selfNode);
    expect(sv.next?.next?.next?.id).toBe(99);
      const svObj = sv.toObject();
      expect(svObj.next).toBe(svObj);

      // O(1) zero-copy pointer relinking between existing StructViews in the same buffer
      v0.next = v0;
      expect(v0.next.id).toBe(1);
      v0.next = null;
      expect(v0.next).toBeNull();
    });

    it('supports parent/child cycles and mutually recursive schemas across ref() and slice()', () => {
      const TreeNode = defineStruct('TreeNode', (self) => ({
        id: u32,
        parent: ref(self),
        children: slice(self),
      }));

      const root = TreeNode.item({ id: 10, parent: null, children: [] });
      const childA = TreeNode.item({ id: 20, parent: root, children: [] });
      const childB = TreeNode.item({ id: 30, parent: root, children: [root] }); // childB.children points back to root!
      root.children = [childA, childB];
      const bytes = TreeNode.pack([root]);
      const view = TreeNode.view(bytes);

      expect(view.id).toBe(10);
      expect(view.children.length).toBe(2);
      expect(view.children.at(0).id).toBe(20);
    expect(view.children.at(0).parent?.id).toBe(10);
    expect(view.children.at(1).id).toBe(30);
    expect(view.children.at(1).parent?.children.at(0).id).toBe(20);
      // Cyclic slice traversal: root -> childB -> root -> childA
      expect(view.children.at(1).children.at(0).children.at(0).id).toBe(20);

      const plain = view.toObject();
      expect(plain.children[0].parent).toBe(plain);
      expect(plain.children[1].parent).toBe(plain);
      expect(plain.children[1].children[0].id).toBe(10);

      // Verify Rust #[repr(C)] codegen handles recursive structs and CapnRef<T> without infinite loops
      const rust = toRustReprC([TreeNode]);
      expect(rust).toContain('pub struct CapnRef<T>');
      expect(rust).toContain('pub parent: CapnRef<TreeNode>');
      expect(rust).toContain('pub children: CapnSlice<TreeNode>');

      // Verify Go codegen handles recursive structs and CapnRef[T] / CapnSlice[T] without infinite loops
      const go = toGoStruct([TreeNode], { pkg: 'tree' });
      expect(go).toContain('package tree');
      expect(go).toContain('type CapnRef[T any] struct');
      expect(go).toContain('Parent CapnRef[TreeNode]');
      expect(go).toContain('Children CapnSlice[TreeNode]');
    });

    it('produces identical zero-gap layout between create(init).bytes, pack([init]), view(bytes), and array(bytes).at(0)', () => {
      const LiveTrackHeader = defineStruct('LiveTrackHeader', {
        pt_off: u32,
        pt_cnt: u32,
        hex: fixedStr(8),
        flight: fixedStr(12),
      });
      const LiveTrackPoint = defineStruct('LiveTrackPoint', {
        t_ds: u32,
        lat: scaled(i32, 1e5),
        lon: scaled(i32, 1e5),
      });
      const TrackBundle = defineStruct('TrackBundle', {
        base_sec: f64,
        headers: slice(LiveTrackHeader),
        points: slice(LiveTrackPoint),
      });

      const hdrs = LiveTrackHeader.alloc(1);
      hdrs.at(0).pt_off = 0;
      hdrs.at(0).pt_cnt = 2;
      hdrs.at(0).hex = 'A1B2C3';
      hdrs.at(0).flight = 'UAL123';

      const pts = LiveTrackPoint.alloc(2);
      pts.at(0).t_ds = 10;
      pts.at(0).lat = 37.6188;
      pts.at(0).lon = -122.375;
      pts.at(1).t_ds = 20;
      pts.at(1).lat = 37.62;
      pts.at(1).lon = -122.38;

      const created = TrackBundle.create({ base_sec: 1700000000, headers: hdrs, points: pts });
      const createdBytes = created.bytes;
      const packedBytes = TrackBundle.pack([{ base_sec: 1700000000, headers: hdrs, points: pts }]);

      expect(Array.from(createdBytes)).toEqual(Array.from(packedBytes));
      // First tail slice starts immediately at TrackBundle.size (24), not 32
      expect(new DataView(createdBytes.buffer, createdBytes.byteOffset, createdBytes.byteLength).getUint32(8, true)).toBe(24);
      expect(TrackBundle.view(createdBytes).toObject()).toEqual(TrackBundle.array(createdBytes).at(0).toObject());

      // 8-byte single-str struct array length inference
      const Msg = defineStruct('Msg', { s: str });
      const msgBytes = Msg.pack([{ s: 'hello' }]);
      const arr = Msg.array(msgBytes);
      const view = Msg.view(msgBytes);
      expect(arr.length).toBe(1);
      expect(view.s).toBe('hello');

      // Node/Bun custom inspect & browser DevTools formatter
      const inspectSym = Symbol.for('nodejs.util.inspect.custom');
      expect((view as any)[inspectSym]()).toEqual({ s: 'hello' });
      expect((arr as any)[inspectSym]()).toEqual([{ s: 'hello' }]);
      const fmt = installDevtoolsFormatter();
      expect(fmt.header(view)).toEqual(['span', {}, 'Msg { s: "hello" }']);
      expect(fmt.header(arr)).toEqual(['span', {}, 'Msg[1] (16 B)']);
      expect(fmt.hasBody(view)).toBe(true);
      expect(fmt.body(view)).toEqual(['div', {}, ['object', { object: { s: 'hello' } }]]);
      expect(view.toDebugObject()).toMatchObject({
        schema: 'Msg',
        stride: 8,
        rowCount: 1,
        usedByteLength: 16,
        deadByteLength: 0,
        compactionRatio: 0,
        data: { s: 'hello' },
      });

      // 2-function mental model: struct() + .from() & .shared()
      const Particle = struct('Particle', { x: f32, y: f32, tag: str });
      const list = Particle.from([
        { x: 1, y: 2, tag: 'a' },
        { x: 3, y: 4, tag: 'b' },
      ]);
      list.at(0).x += 10;
      expect(Particle.from(list.bytes).at(0).x).toBe(11);
      expect(Particle.from(5).length).toBe(5);
      const sharedList = Particle.shared([{ x: 5, y: 6, tag: 'shared' }]);
      expect(sharedList.at(0).tag).toBe('shared');
      const sharedAlloc = Particle.shared(4);
      expect(sharedAlloc.length).toBe(4);
    });

    it('packs positional tuple arrays ([t, f]), flat TypedArrays, and nested slice(Struct) views without manual cursor plumbing', () => {
      const TimeFreqPoint = defineStruct('TimeFreqPoint', { t: f32, f: f32 });
      const DetectedPass = defineStruct('DetectedPass', {
        v: f64,
        f0: f64,
        pts: slice(TimeFreqPoint),
        curve: slice(TimeFreqPoint),
      });
      const SpectrogramBundle = defineStruct('SpectrogramBundle', {
        F: u32,
        B: u32,
        passes: slice(DetectedPass),
      });

      // 1. Pack nested slices directly from [t, f] tuples and flat Float32Array
      const flatCurve = new Float32Array([0.0, 410.0, 0.5, 400.0, 1.0, 390.0]);
      const meta = SpectrogramBundle.create({
        F: 128,
        B: 240,
        passes: [
          {
            v: 55.5,
            f0: 400.0,
            pts: [
              [1.25, 405.5],
              [2.5, 395.25],
            ],
            curve: flatCurve,
          },
        ],
      }).bytes;

      const unpacked = SpectrogramBundle.view(meta);
      expect(unpacked.F).toBe(128);
      expect(unpacked.B).toBe(240);
      expect(unpacked.passes.length).toBe(1);
      const p0 = unpacked.passes.at(0);
      expect(p0.v).toBeCloseTo(55.5, 5);
      expect(p0.f0).toBeCloseTo(400.0, 5);
      expect(p0.pts.length).toBe(2);
      expect([p0.pts.at(0).t, p0.pts.at(0).f]).toEqual([1.25, 405.5]);
      expect([p0.pts.at(1).t, p0.pts.at(1).f]).toEqual([2.5, 395.25]);
      expect(p0.curve.length).toBe(3);
      expect([p0.curve.at(0).t, p0.curve.at(0).f]).toEqual([0.0, 410.0]);
      expect([p0.curve.at(2).t, p0.curve.at(2).f]).toEqual([1.0, 390.0]);

      // 2. Also verify passing a pre-built StructArrayView with variable-length slices into an outer bundle
      const passesView = DetectedPass.from([
        {
          v: 62.0,
          f0: 380.0,
          pts: [[3.0, 382.0]],
          curve: [[3.0, 382.0], [4.0, 378.0]],
        },
      ]);
      const meta2 = SpectrogramBundle.pack([{ F: 64, B: 120, passes: passesView }]);
      const unpacked2 = SpectrogramBundle.view(meta2);
      expect(unpacked2.passes.at(0).v).toBeCloseTo(62.0, 5);
      expect(unpacked2.passes.at(0).pts.at(0).f).toBeCloseTo(382.0, 5);
      expect(unpacked2.passes.at(0).curve.length).toBe(2);
      expect(unpacked2.passes.at(0).curve.at(1).f).toBeCloseTo(378.0, 5);

      // 3. Direct positional tuple construction & mutation on StructArrayView
      const pts = TimeFreqPoint.from([
        [10, 20],
        [30, 40],
      ]);
      pts.push([50, 60]);
      pts.at(0).set([15, 25]);
      expect(pts.toObjects()).toEqual([
        { t: 15, f: 25 },
        { t: 30, f: 40 },
        { t: 50, f: 60 },
      ]);
    });

    it("supports string struct names in ref('Flight') with in-place cyclic rewiring and slice(Waypoint) mutation", () => {
      const Waypoint = struct('Waypoint', { lat: f32, lon: f32 });
      const Flight = struct('Flight', {
        id: u32,
        callsign: str,
        alt: u16,
        waypoints: slice(Waypoint),
        nextRelay: ref('Flight'),
      });
      const fleet = Flight.from([
        { id: 1, callsign: 'UAL418', alt: 34200, waypoints: [[37.6, -122.4], [38.1, -120.0]], nextRelay: null },
        { id: 2, callsign: 'DAL141', alt: 31800, waypoints: [[39.0, -118.5], [40.2, -115.0]], nextRelay: null },
      ]);
      fleet.at(0).nextRelay = fleet.at(1);
      fleet.at(1).nextRelay = fleet.at(0);
      expect(fleet.at(0).nextRelay?.nextRelay?.callsign).toBe('UAL418');
      fleet.at(0).waypoints.at(1).lat = 38.5;
      expect(fleet.at(0).waypoints.at(1).lat).toBeCloseTo(38.5, 4);
    });

    it('allocates and packs directly into WebAssembly.Memory via Schema.inWasm() and traverses str/slice/ref in safe Rust without unsafe boilerplate', () => {
      const Waypoint = struct('Waypoint', { lat: f32, lon: f32 });
      const Flight = struct('Flight', {
        id: u32,
        callsign: str,
        alt: u16,
        waypoints: slice(Waypoint),
        nextRelay: ref('Flight'),
      });

      // 1. Schema.inWasm with WasmArena (rows + count)
      const wasmMem = new WebAssembly.Memory({ initial: 1 });
      const arena = new WasmArena(wasmMem, 128);
      const { view, ptr, len, byteLength } = Flight.inWasm(arena, [
        { id: 10, callsign: 'UAL418', alt: 34200, waypoints: [[37.6, -122.4], [38.0, -121.0]], nextRelay: null },
        { id: 20, callsign: 'DAL141', alt: 31800, waypoints: [[39.0, -118.5]], nextRelay: null },
      ]);
      view.at(0).nextRelay = view.at(1);
      view.at(1).nextRelay = view.at(0);
      expect(ptr).toBe(128);
      expect(len).toBe(2);
      expect(byteLength).toBeGreaterThanOrEqual(80);
      expect(view.at(0).nextRelay?.callsign).toBe('DAL141');

      const emptySlice = Flight.inWasm(arena, 3);
      expect(emptySlice.len).toBe(3);
      expect(emptySlice.ptr).toBeGreaterThanOrEqual(ptr + byteLength);

      // 2. Schema.inWasm with raw WebAssembly.Memory & exported capn_alloc
      const rawMem = new WebAssembly.Memory({ initial: 1 });
      const rawAllocated = Flight.inWasm(rawMem, [
        { id: 99, callsign: 'ANA809', alt: 38000, waypoints: [[35.6, 139.7]], nextRelay: null },
      ]);
      expect(rawAllocated.ptr).toBe(64);
      expect(rawAllocated.view.at(0).callsign).toBe('ANA809');
      rawAllocated.view.at(0).callsign = 'ANA809-HEAVY-EXTENDED';
      expect(rawAllocated.view.at(0).callsign).toBe('ANA809-HEAVY-EXTENDED');

      let bump = 256;
      const mockExports = {
        memory: rawMem,
        capn_alloc(n: number) {
          const p = (bump + 7) & ~7;
          bump = p + n;
          return p;
        },
      };
      const expSlice = Flight.inWasm(mockExports, rawAllocated.view);
      expect(expSlice.ptr).toBe(256);
      expect(expSlice.view.at(0).callsign).toBe('ANA809-HEAVY-EXTENDED');

      // 3. Verify toRustReprC() emits safe Struct::as_slice, .as_str(arena), .as_slice(arena), .as_ref(arena)
      // that compile under #[forbid(unsafe_code)] in user kernel code
      const rustSchema = toRustReprC([Waypoint, Flight]);
      expect(rustSchema).toContain('pub fn as_slice(base: &[u8], len: usize) -> &[Self]');
      const rustKernel = `${rustSchema}
#[forbid(unsafe_code)]
pub mod safe_kernel {
  use super::*;
  pub fn inspect_fleet(arena: &[u8], len: usize) -> usize {
    let flights = Flight::as_slice(arena, len);
    let mut total = 0usize;
    for f in flights {
      if let Ok(cs) = f.callsign.as_str(arena) {
        total += cs.len();
      }
      for wp in f.waypoints.as_slice(arena) {
        if wp.lat > 0.0 { total += 1; }
      }
      if let Some(next) = f.nextRelay.as_ref(arena) {
        total += next.id as usize;
      }
    }
    total
  }
}
`;
      const tmp = mkdtempSync(join(tmpdir(), 'capnstruct-safe-rust-'));
      try {
        const rsPath = join(tmp, 'safe_kernel.rs');
        const rmetaPath = join(tmp, 'safe_kernel.rmeta');
        writeFileSync(rsPath, rustKernel, 'utf8');
        execFileSync('rustc', ['--edition=2021', '--crate-type=lib', '--emit=metadata', '-o', rmetaPath, rsPath], {
          stdio: 'pipe',
        });
        expect(readFileSync(rmetaPath).byteLength).toBeGreaterThan(0);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('supports cursor().at() / seek() on nested slices and packs >64KB nested slices without scratch buffer detachment', () => {
      const Header = struct('Header', { off: u32, cnt: u32 });
      const Point = struct('Point', { t: u32, lat: i32, lon: i32 });
      const Bundle = struct('Bundle', {
        base: f64,
        headers: slice(Header),
        points: slice(Point),
      });

      const hdrs = Header.alloc(600);
      const pts = Point.alloc(9000);
      const hCur = hdrs.cursor();
      const pCur = pts.cursor();
      for (let i = 0; i < 600; i++) {
        hCur.at(i);
        hCur.off = i * 15;
        hCur.cnt = 15;
        for (let j = 0; j < 15; j++) {
          const idx = i * 15 + j;
          pCur.at(idx);
          pCur.t = idx;
          pCur.lat = 4300000 + idx;
          pCur.lon = -7900000 - idx;
        }
      }

      const bytes = Bundle.create({ base: 1794150000, headers: hdrs, points: pts }).bytes;
      const view = Bundle.view(bytes);
      const vCur = view.points.cursor();
      expect(vCur.at(0).t).toBe(0);
      expect(vCur.at(0).lat).toBe(4300000);
      expect(vCur.at(1).t).toBe(1);
      expect(vCur.at(1).lat).toBe(4300001);
      expect(vCur.at(8999).t).toBe(8999);
      expect(vCur.at(8999).lat).toBe(4308999);
      expect(vCur.at(8999).lon).toBe(-7908999);
    });
  });

  describe('Dogfooding Regressions & Ergonomics (Wasm Views, Auto-Count, Array Helpers, viewHeader)', () => {
    const Diag = defineStruct('Diag', {
      line: u32,
      character: u32,
      code: u32,
      category: u32,
      fileName: str,
      text: str,
    });
    const DiagBatch = defineStruct('DiagBatch', {
      diags: slice(Diag),
    });

    it('reads views at non-zero byteOffset over WebAssembly.Memory, ArrayBuffer, and Uint8Array subviews without baseOffset workarounds', () => {
      const packed = DiagBatch.pack([
        {
          diags: [
            { line: 1, character: 5, code: 2322, category: 1, fileName: 'a.ts', text: 'type mismatch' },
            { line: 9, character: 2, code: 2304, category: 1, fileName: 'b.ts', text: 'cannot find name' },
          ],
        },
      ]);
      const wasmMem = new WebAssembly.Memory({ initial: 2 });
      const outPtr = 72000;
      new Uint8Array(wasmMem.buffer, outPtr, packed.byteLength).set(packed);

      // 1. Direct view over WebAssembly.Memory + outPtr
      const fromMem = DiagBatch.view(wasmMem, outPtr);
      expect(fromMem.diags.length).toBe(2);
      expect(fromMem.diags.at(0).fileName).toBe('a.ts');
      expect(fromMem.diags.at(1).text).toBe('cannot find name');

      // 2. Direct view over Uint8Array(wasmMemory.buffer, outPtr, outLen) without { baseOffset: 0 }
      const subU8 = new Uint8Array(wasmMem.buffer, outPtr, packed.byteLength);
      const fromU8 = DiagBatch.view(subU8);
      expect(fromU8.diags.length).toBe(2);
      expect(fromU8.diags.at(0).text).toBe('type mismatch');
      expect(fromU8.diags.at(1).fileName).toBe('b.ts');

      // 3. Backwards-compatible when { baseOffset: 0 } is explicitly passed on a sub-Uint8Array
      const fromU8WithBase0 = DiagBatch.view(subU8, { baseOffset: 0 });
      expect(fromU8WithBase0.diags.at(0).fileName).toBe('a.ts');
      expect(fromU8WithBase0.diags.at(1).fileName).toBe('b.ts');
    });

    it('infers StructArrayView.length accurately when row 0 has an empty first variable-length field (off = 0)', () => {
      const packed = Diag.pack([
        { line: 0, character: 0, code: 5023, category: 1, fileName: '', text: 'global compiler option error' },
        { line: 12, character: 4, code: 2322, category: 1, fileName: 'index.ts', text: 'bad assignment' },
      ]);
      // Simulate external Wasm producer (e.g. Go/Rust) that leaves row[0].fileName = { off: 0, len: 0 }
      const rawCopy = packed.slice();
      new DataView(rawCopy.buffer, rawCopy.byteOffset, rawCopy.byteLength).setUint32(16, 0, true);
      new DataView(rawCopy.buffer, rawCopy.byteOffset, rawCopy.byteLength).setUint32(20, 0, true);

      const arr = Diag.array(rawCopy);
      expect(arr.length).toBe(2);
      expect(arr.at(0).fileName).toBe('');
      expect(arr.at(0).text).toBe('global compiler option error');
      expect(arr.at(1).fileName).toBe('index.ts');
      expect(arr.at(1).text).toBe('bad assignment');

      // Also when row 0 has ALL variable-length fields empty (off = 0) and row 1 has a non-empty string
      const packed2 = Diag.pack([
        { line: 0, character: 0, code: 1000, category: 0, fileName: '', text: '' },
        { line: 3, character: 1, code: 2000, category: 1, fileName: 'main.ts', text: 'syntax error' },
      ]);
      const rawCopy2 = packed2.slice();
      const dv2 = new DataView(rawCopy2.buffer, rawCopy2.byteOffset, rawCopy2.byteLength);
      dv2.setUint32(16, 0, true);
      dv2.setUint32(24, 0, true);
      const arr2 = Diag.array(rawCopy2);
      expect(arr2.length).toBe(2);
      expect(arr2.at(0).fileName).toBe('');
      expect(arr2.at(0).text).toBe('');
      expect(arr2.at(1).fileName).toBe('main.ts');
    });

    it('provides array-like .map(), .filter(), .slice(), .forEach(), .find(), .some(), .every(), and .values({ flyweight: false }) on StructArrayView', () => {
      const rows = Diag.from([
        { line: 10, character: 1, code: 2322, category: 1, fileName: 'a.ts', text: 'err 1' },
        { line: 20, character: 2, code: 7006, category: 2, fileName: 'b.ts', text: 'warn 2' },
        { line: 30, character: 3, code: 2304, category: 1, fileName: 'c.ts', text: 'err 3' },
      ]);

      // .map() provides distinct StructView instances per row
      const mappedViews = rows.map((r) => r);
      expect(mappedViews.map((v) => v.fileName)).toEqual(['a.ts', 'b.ts', 'c.ts']);
      expect(mappedViews[0]).not.toBe(mappedViews[1]);

      // .values({ flyweight: false }) yields distinct StructView instances safe for [...spread] / Array.from
      const spreadViews = [...rows.values({ flyweight: false })];
      expect(spreadViews.map((v) => v.line)).toEqual([10, 20, 30]);

      // .filter() returns a new StructArrayView<F>
      const errorsOnly = rows.filter((r) => r.category === 1);
      expect(errorsOnly.length).toBe(2);
      expect(errorsOnly.map((r) => r.fileName)).toEqual(['a.ts', 'c.ts']);

      // .slice(start, end) aliases .subarray(start, end)
      const tailSlice = rows.slice(1, 3);
      expect(tailSlice.length).toBe(2);
      expect(tailSlice.map((r) => r.code)).toEqual([7006, 2304]);

      // .forEach(), .find(), .some(), .every()
      const lines: number[] = [];
      rows.forEach((r, idx) => lines.push(r.line + idx));
      expect(lines).toEqual([10, 21, 32]);
      expect(rows.find((r) => r.code === 7006)?.fileName).toBe('b.ts');
      expect(rows.find((r) => r.code === 9999)).toBeUndefined();
      expect(rows.some((r) => r.category === 2)).toBe(true);
      expect(rows.every((r) => r.line >= 10)).toBe(true);
      expect(rows.every((r) => r.category === 1)).toBe(false);
    });

    it('exposes Schema.byteSize and Schema.viewHeader(headBytes) for safe partial-file header inspection', () => {
      const Checkpoint = defineStruct('Checkpoint', {
        magic: u32,
        seq: u32,
        byteLen: u32,
        done: bool,
        chunks: u32,
        tag: fixedStr(8),
        memoryDump: str,
        diags: slice(Diag),
      });

      expect(Checkpoint.byteSize).toBe(Checkpoint.size);
      expect(Checkpoint.byteSize).toBe(44);

      const fullBytes = Checkpoint.create({
        magic: 0x434b5054,
        seq: 42,
        byteLen: 2170000,
        done: true,
        chunks: 19,
        tag: 'DOOM_42',
        memoryDump: 'x'.repeat(4096),
        diags: [{ line: 1, character: 1, code: 100, category: 1, fileName: 'doom.ts', text: 'ok' }],
      }).bytes;
      expect(fullBytes.byteLength).toBeGreaterThan(4096);

      // Slice ONLY the fixed 44-byte header (omitting the 4KB+ tail arena completely)
      const headBytes = fullBytes.slice(0, Checkpoint.byteSize);
      expect(headBytes.byteLength).toBe(44);

      const hdr: typeof Checkpoint.$header = Checkpoint.viewHeader(headBytes);
      expect(hdr.magic).toBe(0x434b5054);
      expect(hdr.seq).toBe(42);
      expect(hdr.byteLen).toBe(2170000);
      expect(hdr.done).toBe(true);
      expect(hdr.chunks).toBe(19);
      expect(hdr.tag).toBe('DOOM_42');

      // Even calling .toObject() / JSON.stringify() on viewHeader skips tail-allocated str/slice/ref fields instead of throwing RangeError
      expect(hdr.toObject()).toEqual({
        magic: 0x434b5054,
        seq: 42,
        byteLen: 2170000,
        done: true,
        chunks: 19,
        tag: 'DOOM_42',
      });
    });
  });

  describe('Forge Dogfooding: Wire-Safety, Cursor, Nested Structs, QuickJS Fallback & DevTools', () => {
    it('imports and round-trips UTF-8 (ASCII, 2/3/4-byte, lone surrogates, fixedStr) without global TextDecoder/TextEncoder', async () => {
      const g = globalThis as unknown as { TextDecoder?: typeof TextDecoder; TextEncoder?: typeof TextEncoder };
      const savedTD = g.TextDecoder;
      const savedTE = g.TextEncoder;
      delete g.TextDecoder;
      delete g.TextEncoder;
      vi.resetModules();
      try {
        // Dynamic import intentionally tests module load with TextDecoder/TextEncoder absent (QuickJS).
        const fresh = await import('../src/index.js');
        const Utf = fresh.defineStruct('Utf', { s: fresh.str, fs: fresh.fixedStr(5) });
        const cases: [string, string][] = [
          ['hello', 'hello'],
          ['café naïve', 'café naïve'],
          ['東京 日本語', '東京 日本語'],
          ['🚀🔥🇺🇸', '🚀🔥🇺🇸'],
          ['a\ud800b\udfffc', 'a\ufffdb\ufffdc'],
        ];
        for (const [input, expected] of cases) {
          const v = Utf.create({ s: input, fs: 'ab🚀' });
          expect(v.s).toBe(expected);
          // "ab" (2B) + "🚀" (4B) exceeds 5 bytes, so truncation cleanly drops the partial 4-byte sequence
          expect(v.fs).toBe('ab');
        }
      } finally {
        g.TextDecoder = savedTD;
        g.TextEncoder = savedTE;
        vi.resetModules();
      }
    });

    it('serializes inline nested structs at offset 0 without false circular references and supports nested back-refs to root', () => {
      const Name = defineStruct('Name', { words: slice(str) });
      const MethodSimple = defineStruct('MethodSimple', { name: Name, path: str });
      const m = MethodSimple.create({ name: { words: ['get', 'by', 'id'] }, path: '/accounts' });
      const plain = m.toObject();
      expect(plain).toEqual({ name: { words: ['get', 'by', 'id'] }, path: '/accounts' });
      expect(JSON.parse(JSON.stringify(m))).toEqual(plain);

      // Inline nested struct holding a ref back to the enclosing root struct
      let OuterRef!: StructDefLike;
      const InnerRef = defineStruct('InnerRef', { owner: ref(() => OuterRef), tag: u32 });
      const Outer = defineStruct('OuterRef', { inner: InnerRef, id: u32 });
      OuterRef = Outer;
      const item = Outer.item({ inner: { owner: null, tag: 7 }, id: 42 });
      item.inner = { owner: item, tag: 7 };
      const view = Outer.view(Outer.pack([item]));
      const owner = view.inner.owner as unknown as typeof Outer.$view;
      expect(owner.id).toBe(42);
      expect(owner.inner.tag).toBe(7);
      const oPlain = view.toObject();
      expect(oPlain.inner.owner).toBe(oPlain);
    });

    it('does not clobber the active flyweight cursor when reading ref(self) or slice(ref(self)) inside for..of', () => {
      const Group = defineStruct('Group', (self) => ({
        id: str,
        parent: ref(self),
        children: slice(ref(self)),
      }));
      const root = Group.item({ id: 'root', parent: null, children: [] });
      const c1 = Group.item({ id: 'accounts', parent: root, children: [] });
      const c2 = Group.item({ id: 'zones', parent: root, children: [] });
      root.children = [c1, c2];
      const groups = Group.array(Group.pack([root, c1, c2]));

      const seen: Array<{ id: string; kids: string[]; afterKids: string; parent: string | null; afterParent: string }> = [];
      for (const g of groups) {
        const id = g.id;
        const kids = g.children.map((k) => k!.id);
        const afterKids = g.id;
        const parent = g.parent?.id ?? null;
        const afterParent = g.id;
        seen.push({ id, kids, afterKids, parent, afterParent });
      }
      expect(seen).toEqual([
        { id: 'root', kids: ['accounts', 'zones'], afterKids: 'root', parent: null, afterParent: 'root' },
        { id: 'accounts', kids: [], afterKids: 'accounts', parent: 'root', afterParent: 'accounts' },
        { id: 'zones', kids: [], afterKids: 'zones', parent: 'root', afterParent: 'zones' },
      ]);
    });

    it('allows row>=1 self-refs while rejecting row>=1 corrupted str pointers into row 0 header', () => {
      const Ring = defineStruct('Ring', (self) => ({ id: u32, next: ref(self) }));
      const n0 = Ring.item({ id: 10, next: null });
      const n1 = Ring.item({ id: 20, next: null });
      n1.next = n1;
      const arr = Ring.array(Ring.pack([n0, n1]));
      expect(arr.at(1).next?.id).toBe(20);
      const objs = arr.toObjects();
      expect(objs[1].next).toBe(objs[1]);

      const Msg = defineStruct('Msg', { id: u32, text: str });
      const bad = Msg.pack([
        { id: 0x41424344, text: 'ok' },
        { id: 2, text: 'hi' },
      ]).slice();
      // Corrupt row 1 text descriptor to point into row 0's fixed header bytes (offset 0, len 4)
      const dv = new DataView(bad.buffer, bad.byteOffset);
      dv.setUint32(Msg.size + Msg.offsetOf('text'), 0, true);
      dv.setUint32(Msg.size + Msg.offsetOf('text') + 4, 4, true);
      expect(() => Msg.array(bad).at(1).text).toThrow(RangeError);
    });

    it('preserves null ref when ref precedes str, auto-counts nested inline structs, propagates fixedArray _fv, and handles subarray/nested compact', () => {
      // 1. ref before str: fixFv must not corrupt row 0's null ref present word
      const RefFirst = defineStruct('RefFirst', (self) => ({ parent: ref(self), name: str }));
      const rf0 = RefFirst.item({ parent: null, name: 'root' });
      const rf1 = RefFirst.item({ parent: rf0, name: 'child' });
      const rfBytes = RefFirst.pack([rf0, rf1]);
      expect(new DataView(rfBytes.buffer, rfBytes.byteOffset).getUint32(4, true)).toBe(0);
      const rfArr = RefFirst.array(rfBytes);
      expect(rfArr.length).toBe(2);
      expect(rfArr.at(0).parent).toBeNull();
      expect(rfArr.at(1).parent?.name).toBe('root');

      // 2. Nested inline struct auto-count when WASM producer leaves off=0 on empty row 0 slice
      const Inner = defineStruct('Inner', { words: slice(str) });
      const Outer = defineStruct('Outer', { inner: Inner, flag: u32 });
      const ob = Outer.pack([
        { inner: { words: [] }, flag: 1 },
        { inner: { words: ['long-tail-str-exceeding-row'] }, flag: 2 },
      ]).slice();
      new DataView(ob.buffer, ob.byteOffset).setUint32(0, 0, true);
      expect(Outer.array(ob).length).toBe(2);

      // 3. fixedArray(str, 2) propagates _fv to viewHeader, subarray, and auto-count
      const FA = defineStruct('FA', { tag: u32, names: fixedArray(str, 2) });
      const faBytes = FA.pack([
        { tag: 1, names: ['a', 'b'] },
        { tag: 2, names: ['c', 'd'] },
      ]);
      expect(FA.array(faBytes).length).toBe(2);
      const faSub = FA.array(faBytes).subarray(1, 2);
      expect(FA.array(faSub.bytes).at(0).names).toEqual(['c', 'd']);
      const faHdr = FA.viewHeader(faBytes.slice(0, FA.byteSize));
      expect(faHdr.toObject()).toEqual({ tag: 1 });

      // 4. subarray().compact() clears stale _a parent link and live nested mutation compacts cleanly
      const gSub = RefFirst.mutArray(rfBytes.slice()).subarray(1, 2);
      expect(RefFirst.array(gSub.compact()).at(0).name).toBe('child');
      const Method = defineStruct('Method', { id: u32, name: Inner, summary: str });
      const mv = Method.create({ id: 1, name: { words: ['get'] }, summary: 'Get' });
      mv.name.words = ['list', 'all', 'items'];
      expect(Method.view(mv.compact()).name.words).toEqual(['list', 'all', 'items']);
    });

    it('formats BigInt (u64/i64) and cyclic StructViews in installDevtoolsFormatter without throwing', () => {
      const BigRing = defineStruct('BigRing', (self) => ({ ts: u64, delta: i64, next: ref(self) }));
      const br = BigRing.item({ ts: 1700000000n, delta: -42n, next: null });
      br.next = br;
      const fmt = installDevtoolsFormatter();
      const hdr = fmt.header(BigRing.view(BigRing.pack([br])));
      expect(hdr).not.toBeNull();
      expect(hdr![2]).toContain('1700000000n');
      expect(hdr![2]).toContain('-42n');
      expect(hdr![2]).toContain('BigRing{...}');
    });
  });

  describe('Tagged Unions (defineUnion / union) & Rust WASM CapnBuilder Parity', () => {
    it('computes #[repr(u8)] / #[repr(C, u8)] union layouts, handles nested & recursive unions, mutation, viewHeader, and invalid tag wire-safety', () => {
      const Avail = defineUnion('Avail', { Alpha: null, Beta: null, GA: null });
      expect(Avail.size).toBe(1);
      expect(Avail.align).toBe(1);
      expect(Avail.unitOnly).toBe(true);
      expect(Avail.tagOf('GA')).toBe(2);

      const Scalar = union('Scalar', { Unknown: null, Int: u32, Float: f64 });
      expect(Scalar.align).toBe(8);
      expect(Scalar.size).toBe(16);
      expect(Scalar.byName.Int.payloadOffset).toBe(8);
      expect(Scalar.byName.Float.payloadOffset).toBe(8);

      const Expr = defineUnion('Expr', (self) => ({
        Lit: u32,
        Neg: ref(self),
        List: slice(self),
      }));
      const Host = defineStruct('Host', {
        id: u32,
        avail: Avail,
        scalar: Scalar,
        expr: Expr,
      });
      const v = Host.create({
        id: 1,
        avail: { tag: 'Beta' },
        scalar: { tag: 'Float', value: 2.5 },
        expr: {
          tag: 'List',
          value: [
            { tag: 'Lit', value: 10 },
            { tag: 'Neg', value: { tag: 'Lit', value: 20 } },
          ],
        },
      });
      expect(v.toObject()).toEqual({
        id: 1,
        avail: { tag: 'Beta' },
        scalar: { tag: 'Float', value: 2.5 },
        expr: {
          tag: 'List',
          value: [
            { tag: 'Lit', value: 10 },
            { tag: 'Neg', value: { tag: 'Lit', value: 20 } },
          ],
        },
      });

      // In-place variant mutation across payload and unit variants
      v.scalar = { tag: 'Int', value: 7 };
      expect(v.scalar).toEqual({ tag: 'Int', value: 7 });
      v.scalar = { tag: 'Unknown' };
      expect(v.scalar).toEqual({ tag: 'Unknown' });

      // viewHeader keeps inline unions (Avail, Scalar) and omits tail-allocating unions (Expr)
      const hdr = Host.viewHeader(v.bytes.slice(0, Host.byteSize));
      expect(hdr.toObject()).toEqual({ id: 1, avail: { tag: 'Beta' }, scalar: { tag: 'Unknown' } });

      // Wire-safety: corrupting discriminant tag throws RangeError
      const bad = v.bytes.slice();
      bad[Host.offsetOf('avail')] = 99;
      expect(() => Host.view(bad).avail).toThrow(RangeError);
    });

    it('compiles #![no_std] mod schemas and runs 3-way binary parity across Rust WASM CapnBuilder, JS, and Go WASI WASM with tagged unions', () => {
      const Availability = defineUnion('Availability', { Alpha: null, Beta: null, Preview: null, GenerallyAvailable: null });
      const Location = defineUnion('Location', { Path: null, Query: bool, Header: str });
      const Name = defineStruct('Name', { words: slice(str) });
      const FieldDef = defineStruct('FieldDef', { name: Name, wireName: str, loc: Location, required: bool });
      const Scalar = defineUnion('Scalar', { Unknown: null, Int: u32, Float: f64 });
      const TypeInfo = defineUnion('TypeInfo', { Scalar, Array: u32, Object: slice(FieldDef) });
      const Method = defineStruct('Method', { name: Name, path: str, avail: Availability, reqType: TypeInfo });
      const schemas = [Availability, Location, Name, FieldDef, Scalar, TypeInfo, Method];

      const rsNoStd = toRustReprC(schemas);
      // Outer #[allow(...)] (not inner #![allow(...)]) so output compiles inside #![no_std] mod / include!
      expect(rsNoStd).not.toContain('#![allow(');
      expect(rsNoStd).toContain('#[repr(u8)]');
      expect(rsNoStd).toContain('#[repr(C, u8)]');

      const rsWasm = toRustReprC(schemas, { wasm: true });
      expect(rsWasm).toContain('struct CapnBuilder');
      expect(rsWasm).toContain('pub extern "C" fn capn_alloc');

      const tmp = mkdtempSync(join(tmpdir(), 'capnstruct-forge-parity-'));
      try {
        // 1. Always verify #![no_std] nested mod and CapnBuilder compile with native rustc (works on ubuntu-latest CI)
        const nostdRs = join(tmp, 'nostd.rs');
        writeFileSync(nostdRs, `#![no_std]\npub mod schema {\n${rsNoStd}\n}\n`);
        execFileSync(
          'rustc',
          ['--edition=2021', '--crate-type=lib', '--emit=metadata', nostdRs, '-o', join(tmp, 'nostd.rmeta')],
          { stdio: 'pipe' },
        );

        // 2. Rust WASM producer (CapnBuilder + str_dedup + #[repr(C, u8)]) <-> JS round-trip
        const wasmRs = join(tmp, 'producer.rs');
        writeFileSync(
          wasmRs,
          `${rsWasm}
static mut OUT_BUF: Option<alloc::vec::Vec<u8>> = None;

#[no_mangle]
pub extern "C" fn build_method() -> *const u8 {
  let mut b = CapnBuilder::new();
  let bytes = b.build(|b| {
    let w_get = b.build_slice(2, |i, b| b.str_dedup(if i == 0 { "get" } else { "accounts" }));
    let fields = b.build_slice(2, |i, b| {
      if i == 0 {
        let nw = b.build_slice(1, |_, b| b.str_dedup("accounts"));
        FieldDef { name: Name { words: nw }, wireName: b.str_dedup("account_id"), loc: Location::Path, required: true, _pad0: [0; 3] }
      } else {
        let nw = b.build_slice(1, |_, b| b.str_dedup("hdr"));
        let hv = b.str_dedup("bearer");
        FieldDef { name: Name { words: nw }, wireName: b.str_dedup("X-Auth"), loc: Location::Header(hv), required: false, _pad0: [0; 3] }
      }
    });
    Method {
      name: Name { words: w_get },
      path: b.str_dedup("/accounts"),
      avail: Availability::GenerallyAvailable,
      _pad0: [0; 7],
      reqType: TypeInfo::Object(fields),
    }
  }).to_vec();
  let ptr = bytes.as_ptr();
  unsafe { OUT_BUF = Some(bytes); }
  ptr
}
#[no_mangle]
pub extern "C" fn build_method_len() -> u32 { unsafe { OUT_BUF.as_ref().map_or(0, |v| v.len() as u32) } }
#[no_mangle]
pub extern "C" fn inspect_method(ptr: *const u8, len: usize) -> i32 {
  let buf = unsafe { core::slice::from_raw_parts(ptr, len) };
  let m = Method::as_slice(buf, 1)[0];
  let mut score: i32 = 0;
  if m.avail == Availability::Beta { score += 100; }
  if let TypeInfo::Scalar(Scalar::Float(v)) = m.reqType { score += (v * 10.0) as i32; }
  score
}
`,
        );
        execFileSync(
          'rustc',
          ['--edition=2021', '--crate-type=lib', '--emit=metadata', wasmRs, '-o', join(tmp, 'producer.rmeta')],
          { stdio: 'pipe' },
        );
        const jsPacked = Method.pack([
          {
            name: { words: ['list', 'zones'] },
            path: '/zones',
            avail: { tag: 'Beta' },
            reqType: { tag: 'Scalar', value: { tag: 'Float', value: 3.5 } },
          },
        ]);
        let hasRustWasm = false;
        try {
          hasRustWasm = execFileSync('rustup', ['target', 'list', '--installed'], { encoding: 'utf8', stdio: 'pipe' }).includes(
            'wasm32-unknown-unknown',
          );
        } catch {
          hasRustWasm = false;
        }
        if (hasRustWasm) {
          const rustWasmPath = join(tmp, 'producer.wasm');
          execFileSync(
            'rustc',
            ['--edition=2021', '--target=wasm32-unknown-unknown', '--crate-type=cdylib', '-O', wasmRs, '-o', rustWasmPath],
            { stdio: 'pipe' },
          );
          const rustInst = new WebAssembly.Instance(new WebAssembly.Module(readFileSync(rustWasmPath)), {});
          const rEx = rustInst.exports as unknown as {
            memory: WebAssembly.Memory;
            build_method: () => number;
            build_method_len: () => number;
            capn_alloc: (n: number) => number;
            capn_reset: () => void;
            inspect_method: (p: number, l: number) => number;
          };
          const rPtr = rEx.build_method() >>> 0;
          const rLen = rEx.build_method_len() >>> 0;
          const fromRust = Method.view(new Uint8Array(rEx.memory.buffer, rPtr, rLen));
          expect(fromRust.toObject()).toEqual({
            name: { words: ['get', 'accounts'] },
            path: '/accounts',
            avail: { tag: 'GenerallyAvailable' },
            reqType: {
              tag: 'Object',
              value: [
                { name: { words: ['accounts'] }, wireName: 'account_id', loc: { tag: 'Path' }, required: true },
                { name: { words: ['hdr'] }, wireName: 'X-Auth', loc: { tag: 'Header', value: 'bearer' }, required: false },
              ],
            },
          });
          // Verify Rust CapnBuilder.str_dedup reused the exact same tail offset for "accounts"
          const rDv = new DataView(rEx.memory.buffer, rPtr, rLen);
          const methodWordsOff = rDv.getUint32(0, true);
          const accWordOff1 = rDv.getUint32(methodWordsOff + 8, true);
          const objSliceOff = rDv.getUint32(Method.offsetOf('reqType') + 8, true);
          const field0WordsOff = rDv.getUint32(objSliceOff, true);
          const accWordOff2 = rDv.getUint32(field0WordsOff, true);
          expect(accWordOff1).toBe(accWordOff2);

          // JS -> Rust WASM via capn_alloc
          const rIn = rEx.capn_alloc(jsPacked.byteLength) >>> 0;
          new Uint8Array(rEx.memory.buffer, rIn, jsPacked.byteLength).set(jsPacked);
          expect(rEx.inspect_method(rIn, jsPacked.byteLength)).toBe(135);
          rEx.capn_reset();
        }

        // 3. Go WASI WASM tagged union producer <-> JS round-trip
        const goCode = toGoStruct(schemas, { wasm: true });
        writeFileSync(join(tmp, 'go.mod'), 'module capnuniontest\n\ngo 1.24\n');
        writeFileSync(
          join(tmp, 'main.go'),
          `${goCode}
func main() {}
var outBuf []byte
//go:wasmexport go_build_method
func go_build_method() uintptr {
  var b CapnBuilder
  outBuf = CapnBuild(&b, func(b *CapnBuilder) Method {
    words := CapnBuildSlice(b, 2, func(i int, b *CapnBuilder) CapnStr {
      if i == 0 { return b.StrDedup("list") }
      return b.StrDedup("items")
    })
    return Method{
      Name: Name{ Words: words },
      Path: b.StrDedup("/items"),
      Avail: AvailabilityPreview,
      ReqType: TypeInfoMakeScalar(ScalarMakeInt(42)),
    }
  })
  return uintptr(unsafe.Pointer(&outBuf[0]))
}
//go:wasmexport go_build_len
func go_build_len() uint32 { return uint32(len(outBuf)) }
//go:wasmexport go_inspect_method
func go_inspect_method(ptr uintptr, byteLen uint32) int32 {
  buf := CapnBytes(ptr, byteLen)
  m := CapnView[Method](buf)
  var score int32
  if m.Avail == AvailabilityBeta { score += 100 }
  if m.ReqType.Tag == TypeInfoScalar {
    sc := m.ReqType.AsScalar()
    if sc.Tag == ScalarFloat { score += int32((*sc.AsFloat()) * 10.0) }
  }
  return score
}
`,
        );
        const goWasmPath = join(tmp, 'go.wasm');
        execFileSync('go', ['build', '-buildmode=c-shared', '-o', goWasmPath, join(tmp, 'main.go')], {
          cwd: tmp,
          env: { ...process.env, GOOS: 'wasip1', GOARCH: 'wasm' },
          stdio: 'pipe',
        });
        let goInst!: WebAssembly.Instance;
        const shim: WebAssembly.Imports = {
          wasi_snapshot_preview1: new Proxy(
            {},
            {
              get: (_, k) => {
                if (k === 'args_sizes_get' || k === 'environ_sizes_get') {
                  return (cPtr: number, bPtr: number) => {
                    const dv = new DataView((goInst.exports.memory as WebAssembly.Memory).buffer);
                    dv.setUint32(cPtr, 0, true);
                    dv.setUint32(bPtr, 0, true);
                    return 0;
                  };
                }
                if (k === 'clock_time_get') {
                  return (_id: number, _prec: bigint, tptr: number) => {
                    new DataView((goInst.exports.memory as WebAssembly.Memory).buffer).setBigUint64(tptr, BigInt(Date.now()) * 1000000n, true);
                    return 0;
                  };
                }
                if (k === 'random_get') {
                  return (p: number, l: number) => {
                    new Uint8Array((goInst.exports.memory as WebAssembly.Memory).buffer, p, l).fill(1);
                    return 0;
                  };
                }
                if (k === 'fd_write') {
                  return (_fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number) => {
                    const dv = new DataView((goInst.exports.memory as WebAssembly.Memory).buffer);
                    let total = 0;
                    for (let i = 0; i < iovsLen; i++) total += dv.getUint32(iovsPtr + i * 8 + 4, true);
                    dv.setUint32(nwrittenPtr, total, true);
                    return 0;
                  };
                }
                return () => 0;
              },
            },
          ),
        };
        goInst = new WebAssembly.Instance(new WebAssembly.Module(readFileSync(goWasmPath)), shim);
        const gEx = goInst.exports as unknown as {
          memory: WebAssembly.Memory;
          _initialize?: () => void;
          go_build_method: () => number;
          go_build_len: () => number;
          capn_alloc: (n: number) => number;
          capn_reset: () => void;
          go_inspect_method: (p: number, l: number) => number;
        };
        gEx._initialize?.();
        const gPtr = gEx.go_build_method() >>> 0;
        const gLen = gEx.go_build_len() >>> 0;
        const fromGo = Method.view(new Uint8Array(gEx.memory.buffer, gPtr, gLen));
        expect(fromGo.toObject()).toEqual({
          name: { words: ['list', 'items'] },
          path: '/items',
          avail: { tag: 'Preview' },
          reqType: { tag: 'Scalar', value: { tag: 'Int', value: 42 } },
        });
        const gIn = gEx.capn_alloc(jsPacked.byteLength) >>> 0;
        new Uint8Array(gEx.memory.buffer, gIn, jsPacked.byteLength).set(jsPacked);
        expect(gEx.go_inspect_method(gIn, jsPacked.byteLength)).toBe(135);
        gEx.capn_reset();
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe('Dogfooding Improvements: UnionArrayView, optStr, Codegen Ergonomics & Strict no-DOM Types', () => {
    it('returns lazy zero-copy UnionArrayView for slice(Union) and fixedArray(Union, N)', () => {
      const Value = defineUnion('Value', {
        None: null,
        Num: i32,
        Text: str,
        OptText: optStr,
      });
      const Bucket = defineStruct('Bucket', {
        id: u32,
        items: slice(Value),
        fixed: fixedArray(Value, 2),
      });

      const b = Bucket.create({
        id: 7,
        items: [
          { tag: 'None' },
          { tag: 'Num', value: -42 },
          { tag: 'Text', value: 'hello' },
          { tag: 'OptText', value: null },
          { tag: 'OptText', value: '' },
          { tag: 'OptText', value: 'world' },
        ],
        fixed: [
          { tag: 'Num', value: 10 },
          { tag: 'Text', value: 'two' },
        ],
      });

      const items = b.items;
      expect(items).toBeInstanceOf(UnionArrayView);
      expect(items.length).toBe(6);
      expect(items.stride).toBe(Value.size);
      expect(items.byteLength).toBe(6 * Value.size);

      // O(1) discriminant-only tagAt without allocating union objects
      expect(items.tagAt(0)).toBe('None');
      expect(items.tagAt(1)).toBe('Num');
      expect(items.tagAt(-1)).toBe('OptText');
      expect(() => items.tagAt(6)).toThrow(RangeError);
      expect(() => items.tagAt(-7)).toThrow(RangeError);

      // O(1) indexed reads + negative indexing
      expect(items.at(0)).toEqual({ tag: 'None' });
      expect(items.at(1)).toEqual({ tag: 'Num', value: -42 });
      expect(items.at(2)).toEqual({ tag: 'Text', value: 'hello' });
      expect(items.at(3)).toEqual({ tag: 'OptText', value: null });
      expect(items.at(4)).toEqual({ tag: 'OptText', value: '' });
      expect(items.at(-1)).toEqual({ tag: 'OptText', value: 'world' });
      expect(() => items.at(6)).toThrow(RangeError);

      // fixedArray(Union, N) also returns lazy UnionArrayView
      expect(b.fixed).toBeInstanceOf(UnionArrayView);
      expect(b.fixed.length).toBe(2);
      expect(b.fixed.at(0)).toEqual({ tag: 'Num', value: 10 });
      expect(b.fixed.at(1)).toEqual({ tag: 'Text', value: 'two' });

      // Zero-copy subarray / slice
      const sub = items.subarray(1, 4);
      expect(sub).toBeInstanceOf(UnionArrayView);
      expect(sub.length).toBe(3);
      expect(sub.buffer).toBe(items.buffer);
      expect(sub.at(0)).toEqual({ tag: 'Num', value: -42 });
      expect(sub.at(2)).toEqual({ tag: 'OptText', value: null });
      expect(items.slice(-2).toObjects()).toEqual([
        { tag: 'OptText', value: '' },
        { tag: 'OptText', value: 'world' },
      ]);

      // Iteration & array-like helpers
      expect([...items].map((x) => x.tag)).toEqual(['None', 'Num', 'Text', 'OptText', 'OptText', 'OptText']);
      const tags: string[] = [];
      items.forEach((x) => tags.push(x.tag));
      expect(tags).toEqual(['None', 'Num', 'Text', 'OptText', 'OptText', 'OptText']);
      expect(items.map((x) => x.tag)).toEqual(tags);
      expect(items.find((x) => x.tag === 'Num')).toEqual({ tag: 'Num', value: -42 });
      expect(items.some((x) => x.tag === 'Text' && x.value === 'hello')).toBe(true);
      expect(items.every((x) => typeof x.tag === 'string')).toBe(true);
      expect(JSON.parse(JSON.stringify(items))).toEqual(items.toObjects());

      // In-place mutation via set() (including through subarray) + compact()
      sub.set(0, { tag: 'Text', value: 'mutated' });
      items.set(-1, { tag: 'None' });
      expect(b.items.at(1)).toEqual({ tag: 'Text', value: 'mutated' });
      expect(b.items.at(5)).toEqual({ tag: 'None' });
      const compacted = Bucket.view(b.compact());
      expect(compacted.items.at(1)).toEqual({ tag: 'Text', value: 'mutated' });
      expect(compacted.items.at(5)).toEqual({ tag: 'None' });

      // Bulk copy a UnionArrayView into another struct's slice(Union)
      const InlineU = defineUnion('InlineU', { A: null, B: u32 });
      const InlineHolder = defineStruct('InlineHolder', { arr: slice(InlineU) });
      const ih1 = InlineHolder.create({ arr: [{ tag: 'A' }, { tag: 'B', value: 99 }] });
      const ih2 = InlineHolder.create({ arr: ih1.arr });
      expect(ih2.arr.toObjects()).toEqual([{ tag: 'A' }, { tag: 'B', value: 99 }]);
      // And tail-allocating UnionArrayView copy
      const b2 = Bucket.create({ id: 8, items: compacted.items, fixed: compacted.fixed });
      expect(b2.toObject()).toEqual({ ...compacted.toObject(), id: 8 });

      // Wire safety: corrupt discriminant tag throws RangeError on at() and tagAt()
      const bad = b2.bytes.slice();
      const itemsOff = new DataView(bad.buffer, bad.byteOffset).getUint32(Bucket.offsetOf('items'), true);
      bad[itemsOff] = 200;
      expect(() => Bucket.view(bad).items.tagAt(0)).toThrow(RangeError);
      expect(() => Bucket.view(bad).items.at(0)).toThrow(RangeError);
    });

    it('supports optStr / nullable(str) distinguishing null, empty string, and UTF-8 strings', () => {
      expect(nullable(str)).toBe(optStr);
      const Doc = defineStruct('Doc', {
        id: u32,
        summary: optStr,
        note: nullable(str),
      });

      // Default value is null
      const empty = Doc.create({ id: 1 });
      expect(empty.summary).toBeNull();
      expect(empty.note).toBeNull();
      expect(empty.toObject()).toEqual({ id: 1, summary: null, note: null });

      // Distinguishes null vs "" vs UTF-8
      const d = Doc.create({ id: 2, summary: '', note: '東京 🚀' });
      expect(d.summary).toBe('');
      expect(d.note).toBe('東京 🚀');
      // Verify wire encoding of "" is { off: 1, len: 0 }
      const dv = new DataView(d.bytes.buffer, d.bytes.byteOffset);
      expect(dv.getUint32(Doc.offsetOf('summary'), true)).toBe(1);
      expect(dv.getUint32(Doc.offsetOf('summary') + 4, true)).toBe(0);

      // In-place mutation across null <-> "" <-> non-empty
      d.summary = null;
      expect(d.summary).toBeNull();
      expect(new DataView(d.bytes.buffer, d.bytes.byteOffset).getUint32(Doc.offsetOf('summary'), true)).toBe(0);
      d.summary = 'filled';
      expect(d.summary).toBe('filled');
      d.summary = '';
      expect(d.summary).toBe('');
      d.note = null;
      expect(d.note).toBeNull();
      const repacked = Doc.view(d.compact());
      expect(repacked.toObject()).toEqual({ id: 2, summary: '', note: null });

      // Auto-count StructArrayView when optStr is the ONLY variable field
      const OnlyOpt = defineStruct('OnlyOpt', { label: optStr });
      const packed = OnlyOpt.pack([{ label: null }, { label: '' }, { label: 'abc' }, { label: null }]);
      const arr = OnlyOpt.array(packed);
      expect(arr.length).toBe(4);
      expect(arr.toObjects()).toEqual([{ label: null }, { label: '' }, { label: 'abc' }, { label: null }]);

      // All-null and all-empty arrays auto-count cleanly with zero tail bytes
      const allNull = OnlyOpt.array(OnlyOpt.pack([{ label: null }, { label: '' }]));
      expect(allNull.length).toBe(2);
      expect(allNull.toObjects()).toEqual([{ label: null }, { label: '' }]);

      // viewHeader omits optStr fields cleanly
      const hdr = Doc.viewHeader(d.bytes.slice(0, Doc.byteSize));
      expect(hdr.toObject()).toEqual({ id: 2 });

      // Wire safety: corrupt optStr with len > 0 and OOB offset throws RangeError
      const bad = Doc.create({ id: 3, summary: 'ok' }).bytes.slice();
      new DataView(bad.buffer, bad.byteOffset).setUint32(Doc.offsetOf('summary'), 9999, true);
      expect(() => Doc.view(bad).summary).toThrow(RangeError);
    });

    it('auto-rebinds UnionArrayView across WebAssembly.Memory.grow', () => {
      const Tag = defineUnion('Tag', { Empty: null, Code: u32, Name: optStr });
      const Holder = defineStruct('Holder', { tags: slice(Tag) });
      const mem = new WebAssembly.Memory({ initial: 1 });
      const arena = new WasmArena(mem);
      const h = arena.allocOne(Holder, {
        tags: [
          { tag: 'Empty' },
          { tag: 'Code', value: 404 },
          { tag: 'Name', value: 'not-found' },
        ],
      });
      const tagsView = h.tags;
      expect(tagsView).toBeInstanceOf(UnionArrayView);
      mem.grow(2);
      expect(tagsView.at(1)).toEqual({ tag: 'Code', value: 404 });
      expect(tagsView.at(2)).toEqual({ tag: 'Name', value: 'not-found' });
      tagsView.set(0, { tag: 'Name', value: '' });
      expect(tagsView.at(0)).toEqual({ tag: 'Name', value: '' });
    });

    it('emits clean Rust 2021/2024 + Clippy code with builder/wasmExports/allow options and 3-way optStr + sentinel parity', () => {
      const Item = defineUnion('Item', {
        None: null,
        Count: u32,
        Note: optStr,
      });
      const Record = defineStruct('Record', {
        id: u32,
        parentId: sentinel(u32, 0xffffffff),
        score: sentinel(f32, Number.NaN),
        title: optStr,
        subtitle: optStr,
        items: slice(Item),
        child: ref(defineStruct('Child', { tag: optStr })),
      });
      const Child = (Record.fields.child.desc as { element: StructDefLike<any> }).element;
      const schemas = [Child, Record, Item];

      // 1. builder: true with wasmExports: false omits capn_alloc/capn_reset
      const builderOnlyRs = toRustReprC(schemas, { builder: true, wasmExports: false });
      expect(builderOnlyRs).toContain('extern crate alloc;');
      expect(builderOnlyRs).toContain('struct CapnBuilder');
      expect(builderOnlyRs).toContain('fn build_vec');
      expect(builderOnlyRs).toContain('fn opt_str_dedup');
      expect(builderOnlyRs).toContain('fn build_ref_opt');
      expect(builderOnlyRs).toContain('pub const PARENT_ID_NULL: u32 = 4294967295;');
      expect(builderOnlyRs).toContain('pub fn parentId_opt(&self) -> Option<u32>');
      expect(builderOnlyRs).toContain('pub const SCORE_NULL: f32 = f32::NAN;');
      expect(builderOnlyRs).toContain('pub fn score_opt(&self) -> Option<f32>');
      expect(builderOnlyRs).not.toContain('capn_alloc');
      expect(builderOnlyRs).not.toContain('capn_reset');

      // 2. wasmExports as cfg string gates capn_alloc/capn_reset
      const cfgRs = toRustReprC(schemas, {
        builder: true,
        wasmExports: 'all(target_arch = "wasm32", feature = "library")',
      });
      expect(cfgRs).toContain('#[cfg(all(target_arch = "wasm32", feature = "library"))]');
      expect(cfgRs).toContain('unexpected_cfgs');
      expect(cfgRs).toContain('pub extern "C" fn capn_alloc');

      // 3. Compile under strict #![no_std] + deny(unsafe_code) + Rust 2021 & 2024 + clippy-driver (if installed)
      const tmp = mkdtempSync(join(tmpdir(), 'capnstruct-dogfood-'));
      try {
        const strictCrate = `#![no_std]\n#![deny(unsafe_code, clippy::all, clippy::pedantic, clippy::unwrap_used, clippy::as_conversions, clippy::indexing_slicing)]\npub mod schema {\n${cfgRs}\n}\n`;
        const strictRsPath = join(tmp, 'strict.rs');
        writeFileSync(strictRsPath, strictCrate);
        for (const edition of ['2021', '2024']) {
          execFileSync(
            'rustc',
            ['--edition', edition, '--crate-type=lib', '--check-cfg=cfg(feature, values("other"))', '-D', 'warnings', strictRsPath, '-o', join(tmp, `strict_${edition}.rlib`)],
            { stdio: 'pipe' },
          );
        }
        let hasClippy = false;
        try {
          execFileSync('clippy-driver', ['--version'], { stdio: 'pipe' });
          hasClippy = true;
        } catch {
          hasClippy = false;
        }
        if (hasClippy) {
          execFileSync(
            'clippy-driver',
            ['--edition=2024', '--crate-type=lib', '-D', 'warnings', strictRsPath, '-o', join(tmp, 'strict_clippy.rlib')],
            { stdio: 'pipe' },
          );
        }

        // 4. Full Rust WASM CapnBuilder (with_capacity, build_vec, opt_str, opt_str_dedup, build_ref_opt, pack_slice, sentinel *_NULL / *_opt) <-> JS parity
        const wasmRs = toRustReprC(schemas, { wasm: true });
        const producerRs = `
${wasmRs}
static mut OUT: Option<alloc::vec::Vec<u8>> = None;
#[unsafe(no_mangle)]
pub extern "C" fn build_rec() -> *const u8 {
  let mut b = CapnBuilder::with_capacity(256);
  let bytes = b.build_vec(|b| {
    let items_data = [
      Item::None,
      Item::Count(12),
      Item::Note(b.opt_str(None)),
      Item::Note(b.opt_str(Some(""))),
      Item::Note(b.opt_str_dedup(Some("shared"))),
    ];
    let items = b.pack_slice(&items_data);
    let title = b.opt_str_dedup(Some("shared"));
    let subtitle = b.opt_str(Some(""));
    let child = b.build_ref_opt(Some(()), |b, ()| Child { tag: b.opt_str(None) });
    Record {
      id: 42,
      parentId: Record::PARENT_ID_NULL,
      score: Record::SCORE_NULL,
      title,
      subtitle,
      items,
      child,
    }
  });
  let ptr = bytes.as_ptr();
  unsafe { *core::ptr::addr_of_mut!(OUT) = Some(bytes); }
  ptr
}
#[unsafe(no_mangle)]
pub extern "C" fn build_rec_len() -> u32 {
  unsafe { (*core::ptr::addr_of!(OUT)).as_ref().map_or(0, |v| v.len() as u32) }
}
#[unsafe(no_mangle)]
pub extern "C" fn check_rec(ptr: *const u8, len: usize) -> i32 {
  let buf = unsafe { core::slice::from_raw_parts(ptr, len) };
  let r = Record::as_slice(buf, 1)[0];
  let mut ok = 0;
  if r.parentId_opt().is_none() { ok += 1; }
  if r.score_opt().is_none() { ok += 2; }
  if r.title.as_str(buf) == Ok(Some("shared")) { ok += 4; }
  if r.subtitle.as_str(buf) == Ok(Some("")) { ok += 8; }
  if r.child.is_some() && r.child.as_ref(buf).unwrap().tag.is_none() { ok += 16; }
  let items = r.items.as_slice(buf);
  if items.len() == 5 && matches!(items[1], Item::Count(12)) { ok += 32; }
  ok
}
`;
        const producerPath = join(tmp, 'producer.rs');
        writeFileSync(producerPath, producerRs);
        let hasWasmTarget = false;
        try {
          hasWasmTarget = execFileSync('rustup', ['target', 'list', '--installed'], {
            encoding: 'utf8',
            stdio: 'pipe',
          }).includes('wasm32-unknown-unknown');
        } catch {
          hasWasmTarget = false;
        }
        if (hasWasmTarget) {
          const wasmOut = join(tmp, 'producer.wasm');
          execFileSync(
            'rustc',
            ['--edition=2024', '--target=wasm32-unknown-unknown', '--crate-type=cdylib', '-O', producerPath, '-o', wasmOut],
            { stdio: 'pipe' },
          );
          const inst = new WebAssembly.Instance(new WebAssembly.Module(readFileSync(wasmOut)));
          const ex = inst.exports as unknown as {
            memory: WebAssembly.Memory;
            build_rec: () => number;
            build_rec_len: () => number;
            check_rec: (ptr: number, len: number) => number;
            capn_alloc: (n: number) => number;
            capn_reset: () => void;
          };
          const rPtr = ex.build_rec() >>> 0;
          const rLen = ex.build_rec_len() >>> 0;
          const view = Record.view(new Uint8Array(ex.memory.buffer, rPtr, rLen));
          expect(view.toObject()).toEqual({
            id: 42,
            parentId: null,
            score: null,
            title: 'shared',
            subtitle: '',
            items: [
              { tag: 'None' },
              { tag: 'Count', value: 12 },
              { tag: 'Note', value: null },
              { tag: 'Note', value: '' },
              { tag: 'Note', value: 'shared' },
            ],
            child: { tag: null },
          });
          expect(view.items).toBeInstanceOf(UnionArrayView);
          expect(view.items.tagAt(4)).toBe('Note');
          // Verify JS -> Rust check_rec passes all 6 checks (1+2+4+8+16+32 = 63)
          const jsPacked = Record.pack([view.toObject()]);
          const inPtr = ex.capn_alloc(jsPacked.byteLength) >>> 0;
          new Uint8Array(ex.memory.buffer, inPtr, jsPacked.byteLength).set(jsPacked);
          expect(ex.check_rec(inPtr, jsPacked.byteLength)).toBe(63);
          ex.capn_reset();
        }

        // 5. Go codegen emits CapnOptStr, OptStr/OptStrDedup, and sentinel constants & compiles cleanly
        const goCode = toGoStruct(schemas, { wasm: true });
        expect(goCode).toContain('type CapnOptStr struct');
        expect(goCode).toContain('const RecordParentIdNull uint32 = 4294967295');
        writeFileSync(join(tmp, 'go.mod'), 'module capnoptstrtest\n\ngo 1.24\n');
        writeFileSync(
          join(tmp, 'main.go'),
          `${goCode}
func main() {}
var _out []byte
//go:wasmexport go_build
func go_build() uintptr {
	var b CapnBuilder
	s := "shared"
	empty := ""
	_out = CapnBuild(&b, func(b *CapnBuilder) Record {
		return Record{
			Id:       42,
			ParentId: RecordParentIdNull,
			Title:    b.OptStrDedup(&s),
			Subtitle: b.OptStr(&empty),
			Items: CapnPackSlice(b, []Item{
				ItemMakeNone(),
				ItemMakeCount(12),
				ItemMakeNote(b.OptStr(nil)),
				ItemMakeNote(b.OptStr(&empty)),
				ItemMakeNote(b.OptStrDedup(&s)),
			}),
			Child: CapnPackRef(b, &Child{Tag: b.OptStr(nil)}),
		}
	})
	return uintptr(unsafe.Pointer(&_out[0]))
}
//go:wasmexport go_len
func go_len() uint32 { return uint32(len(_out)) }
`,
        );
        let hasGo = false;
        try {
          execFileSync('go', ['version'], { stdio: 'pipe' });
          hasGo = true;
        } catch {
          hasGo = false;
        }
        if (hasGo) {
          const goWasm = join(tmp, 'go.wasm');
          execFileSync('go', ['build', '-buildmode=c-shared', '-o', goWasm, join(tmp, 'main.go')], {
            cwd: tmp,
            env: { ...process.env, GOOS: 'wasip1', GOARCH: 'wasm' },
            stdio: 'pipe',
          });
          let goInst!: WebAssembly.Instance;
          const shim: WebAssembly.Imports = {
            wasi_snapshot_preview1: new Proxy(
              {},
              {
                get: (_, k) => {
                  if (k === 'args_sizes_get' || k === 'environ_sizes_get') {
                    return (cPtr: number, bPtr: number) => {
                      const dv = new DataView((goInst.exports.memory as WebAssembly.Memory).buffer);
                      dv.setUint32(cPtr, 0, true);
                      dv.setUint32(bPtr, 0, true);
                      return 0;
                    };
                  }
                  if (k === 'clock_time_get') {
                    return (_id: number, _prec: bigint, tPtr: number) => {
                      new DataView((goInst.exports.memory as WebAssembly.Memory).buffer).setBigUint64(tPtr, BigInt(Date.now()) * 1000000n, true);
                      return 0;
                    };
                  }
                  if (k === 'random_get') {
                    return (p: number, l: number) => {
                      new Uint8Array((goInst.exports.memory as WebAssembly.Memory).buffer, p, l).fill(1);
                      return 0;
                    };
                  }
                  return () => 0;
                },
              },
            ),
          };
          goInst = new WebAssembly.Instance(new WebAssembly.Module(readFileSync(goWasm)), shim);
          const gEx = goInst.exports as unknown as {
            memory: WebAssembly.Memory;
            _initialize?: () => void;
            go_build: () => number;
            go_len: () => number;
          };
          gEx._initialize?.();
          const gPtr = gEx.go_build() >>> 0;
          const gLen = gEx.go_len() >>> 0;
          const gView = Record.view(new Uint8Array(gEx.memory.buffer, gPtr, gLen));
          expect(gView.id).toBe(42);
          expect(gView.parentId).toBeNull();
          expect(gView.title).toBe('shared');
          expect(gView.subtitle).toBe('');
          expect(gView.items.toObjects()).toEqual([
            { tag: 'None' },
            { tag: 'Count', value: 12 },
            { tag: 'Note', value: null },
            { tag: 'Note', value: '' },
            { tag: 'Note', value: 'shared' },
          ]);
          expect(gView.child?.tag).toBeNull();
        }
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('type-checks dist/*.d.ts under strict skipLibCheck: false with lib: ["es2022"] and types: [] (no DOM lib)', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'capnstruct-nodom-'));
      try {
        writeFileSync(
          join(tmp, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              noEmit: true,
              strict: true,
              skipLibCheck: false,
              target: 'es2022',
              module: 'NodeNext',
              moduleResolution: 'NodeNext',
              lib: ['es2022'],
              types: [],
            },
            include: ['consumer.ts'],
          }),
        );
        const distIndex = join(process.cwd(), 'dist/index.js');
        const distCodegen = join(process.cwd(), 'dist/codegen.js');
        writeFileSync(
          join(tmp, 'consumer.ts'),
          `import { defineStruct, defineUnion, optStr, nullable, slice, str, u32, UnionArrayView, WasmArena } from ${JSON.stringify(distIndex)};
import { toRustReprC } from ${JSON.stringify(distCodegen)};
const U = defineUnion('U', { A: null, B: optStr });
const S = defineStruct('S', { id: u32, desc: nullable(str), items: slice(U) });
const v = S.create({ id: 1, desc: null, items: [{ tag: 'A' }, { tag: 'B', value: 'hi' }] });
const uav: UnionArrayView<typeof U.variants> = v.items;
const arena = new WasmArena(4096);
const rust: string = toRustReprC([U, S], { builder: true, wasmExports: false });
export { uav, arena, rust };
`,
        );
        execFileSync(join(process.cwd(), 'node_modules/.bin/tsc'), ['-p', join(tmp, 'tsconfig.json')], {
          stdio: 'pipe',
        });
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('supports --builder, --no-wasm-exports, --wasm-exports-cfg, and --allow CLI flags', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'capnstruct-cli-'));
      try {
        const schemaPath = join(tmp, 'schema.mjs');
        writeFileSync(
          schemaPath,
          `import { defineStruct, optStr, u32 } from ${JSON.stringify(join(process.cwd(), 'dist/index.js'))};
export const Item = defineStruct('Item', { id: u32, label: optStr });
`,
        );
        const cliPath = join(process.cwd(), 'dist/cli.js');
        const builderOut = execFileSync(process.execPath, [cliPath, schemaPath, '--builder'], { encoding: 'utf8' });
        expect(builderOut).toContain('struct CapnBuilder');
        expect(builderOut).not.toContain('capn_alloc');

        const cfgOut = execFileSync(
          process.execPath,
          [
            cliPath,
            schemaPath,
            '--wasm',
            '--wasm-exports-cfg',
            'all(target_arch = "wasm32", feature = "library")',
            '--allow',
            'dead_code,clippy::all',
          ],
          { encoding: 'utf8' },
        );
        expect(cfgOut).toContain('#[cfg(all(target_arch = "wasm32", feature = "library"))]');
        expect(cfgOut).toContain('#[allow(dead_code, clippy::all)]');
        expect(cfgOut).toContain('pub extern "C" fn capn_alloc');

        const noExpOut = execFileSync(process.execPath, [cliPath, schemaPath, '--wasm', '--no-wasm-exports'], {
          encoding: 'utf8',
        });
        expect(noExpOut).toContain('struct CapnBuilder');
        expect(noExpOut).not.toContain('capn_alloc');
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

  it('keeps MemView internals private, decodes short/long ASCII & UTF-8 via utf8At, and auto-counts ref-only arrays', () => {
    const Target = defineStruct('RefTarget', { label: str });
    const Holder = defineStruct('RefHolder', { id: u32, target: ref(Target) });
    const longAscii = 'a'.repeat(80);
    const shortUtf8 = '東京🚀';
    const longUtf8 = '日本語テスト'.repeat(12);
    const bytes = Holder.pack([
      { id: 1, target: { label: 'short_ascii' } },
      { id: 2, target: { label: shortUtf8 } },
      { id: 3, target: { label: longAscii } },
      { id: 4, target: { label: longUtf8 } },
      { id: 5, target: null },
    ]);
    // Auto-count without explicit count when ref() is the ONLY variable field
    const rows = Holder.array(bytes);
    expect(rows.length).toBe(5);
    expect(rows.at(0).target?.label).toBe('short_ascii');
    expect(rows.at(1).target?.label).toBe(shortUtf8);
    expect(rows.at(2).target?.label).toBe(longAscii);
    expect(rows.at(3).target?.label).toBe(longUtf8);
    expect(rows.at(4).target).toBeNull();
    // MemView internals are ES private fields: zero internal own property names on StructView
    expect(Object.getOwnPropertyNames(rows.at(0))).toEqual(['id', 'target']);
    expect(Object.keys(rows.at(0))).toEqual(['id', 'target']);
  });
  });
  describe('v0.5 Safe Rust Reader (#![forbid(unsafe_code)]) & Self-Describing CS01 Schema Evolution', () => {

    function makeV1Schemas() {
      const Child = defineStruct('EvChild', {
        id: u32,
        label: str,
      });
      const Status = defineUnion('EvStatus', {
        Pending: null,
        Active: u32,
      });
      // Inline union with stable size/align (12B / align 4) when adding unit or <=8B/align<=4 variants
      const Badge = defineUnion('EvBadge', {
        None: null,
        Custom: str,
      });
      const Doc = defineStruct('EvDoc', {
        id: u32,
        name: str,
        opt: optStr,
        score: nullable(f64, Number.NaN),
        flag: bool,
        badge: Badge,
        child: ref(Child),
        items: slice(Child),
        statuses: slice(Status),
        parent: ref(Child),
        fixedTag: fixedStr(8),
        fixedBin: fixedBytes(4),
        nums: fixedArray(u16, 3),
      });
      return { Child, Status, Badge, Doc };
    }

    function makeV2Schemas() {
      const NewHelper = defineStruct('EvHelper', {
        code: u16,
        note: str,
      });
      const Child = defineStruct('EvChild', {
        id: u32,
        label: str,
        extra: u64,
        note: optStr,
        missingOpt: nullable(u32, 0xffffffff),
      });
      // Alignment grows 4 -> 8 and payloadOffset grows 4 -> 8!
      const Status = defineUnion('EvStatus', {
        Pending: null,
        Active: u32,
        Completed: u64,
        Failed: str,
      });
      // Adds unit + u32 variants while preserving size 12 / align 4
      const Badge = defineUnion('EvBadge', {
        None: null,
        Custom: str,
        Code: u32,
        Verified: null,
      });
      const Doc = defineStruct('EvDoc', {
        id: u32,
        name: str,
        opt: optStr,
        score: nullable(f64, Number.NaN),
        flag: bool,
        badge: Badge,
        child: ref(Child),
        items: slice(Child),
        statuses: slice(Status),
        parent: ref(Child),
        fixedTag: fixedStr(8),
        fixedBin: fixedBytes(4),
        nums: fixedArray(u16, 3),
        // Appended v2 fields:
        addedU32: u32,
        addedStr: str,
        addedOptStr: optStr,
        addedNullable: nullable(u32, 9999),
        addedBool: bool,
        addedChild: Child,
        addedStatus: Status,
        addedSlice: slice(Child),
        addedRef: ref(Child),
        addedArr: fixedArray(u16, 2),
        helperRef: ref(NewHelper),
      });
      return { NewHelper, Child, Status, Badge, Doc };
    }

    it('compiles reader-only and safe-builder crates under #![no_std] #![forbid(unsafe_code)] on Rust 2021, 2024, and clippy', () => {
      const v2 = makeV2Schemas();
      const readerOnlyRs = toRustReprC(v2, { builder: false, unsafeSlice: false });
      const safeBuilderRs = toRustReprC(v2, { builder: true, wasmExports: false, unsafeSlice: false });

      expect(readerOnlyRs).not.toContain('unsafe');
      expect(safeBuilderRs).not.toContain('unsafe');
      expect(readerOnlyRs).toContain('impl core::error::Error for CapnError');
      expect(readerOnlyRs).toContain('pub fn parse_envelope');
      expect(safeBuilderRs).toContain('pub fn build_envelope_vec');

      const tmp = mkdtempSync(join(tmpdir(), 'capnstruct-forbid-unsafe-'));
      try {
        const readerLib = join(tmp, 'reader_only.rs');
        const builderLib = join(tmp, 'safe_builder.rs');
        writeFileSync(
          readerLib,
          `#![no_std]\n#![forbid(unsafe_code)]\n#![deny(clippy::all, clippy::pedantic)]\npub mod schema {\n${readerOnlyRs}\n}\n`,
        );
        writeFileSync(
          builderLib,
          `#![no_std]\n#![forbid(unsafe_code)]\n#![deny(clippy::all, clippy::pedantic)]\npub mod schema {\n${safeBuilderRs}\n}\n`,
        );

        for (const [name, path] of [
          ['reader', readerLib],
          ['builder', builderLib],
        ] as const) {
          for (const edition of ['2021', '2024'] as const) {
            execFileSync(
              'rustc',
              ['--edition', edition, '--crate-type=lib', '-D', 'warnings', path, '-o', join(tmp, `${name}_${edition}.rlib`)],
              { stdio: 'pipe' },
            );
          }
        }

        let hasClippy = false;
        try {
          execFileSync('clippy-driver', ['--version'], { stdio: 'pipe' });
          hasClippy = true;
        } catch {
          hasClippy = false;
        }
        if (hasClippy) {
          for (const [name, path] of [
            ['reader', readerLib],
            ['builder', builderLib],
          ] as const) {
            execFileSync(
              'clippy-driver',
              ['--edition=2024', '--crate-type=lib', '-D', 'warnings', path, '-o', join(tmp, `${name}_clippy.rlib`)],
              { stdio: 'pipe' },
            );
          }
        }
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('supports --no-unsafe-slice CLI flag', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'capnstruct-cli-nounsafe-'));
      try {
        const schemaPath = join(tmp, 'schema.mjs');
        const distIndex = join(process.cwd(), 'dist/index.js');
        const cliPath = join(process.cwd(), 'dist/cli.js');
        writeFileSync(
          schemaPath,
          `import { defineStruct, u32, str } from ${JSON.stringify(distIndex)};\nexport const Item = defineStruct('Item', { id: u32, name: str });\n`,
        );
        const out = execFileSync(
          process.execPath,
          [cliPath, schemaPath, '--builder', '--no-wasm-exports', '--no-unsafe-slice'],
          { encoding: 'utf8' },
        );
        expect(out).not.toContain('unsafe');
        expect(out).not.toContain('pub fn as_slice');
        expect(out).toContain('pub fn parse_envelope');
        expect(out).toContain('pub fn build_envelope_vec');
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('supports 3-way v1 <-> v2 forward and backward schema evolution across JS and #![forbid(unsafe_code)] Rust', () => {
      const v1 = makeV1Schemas();
      const v2 = makeV2Schemas();

      // Verify typeHash stability & alignment growth assumptions
      expect(typeHash('EvDoc')).toBe(typeHash('EvDoc'));
      expect(v1.Status.align).toBe(4);
      expect(v2.Status.align).toBe(8);
      expect(v2.Status.size).toBeGreaterThan(v1.Status.size);
      expect(v2.Child.size).toBeGreaterThan(v1.Child.size);
      expect(v1.Badge.size).toBe(v2.Badge.size);
      expect(v1.Badge.align).toBe(v2.Badge.align);

      // 1. JS packs v1 envelope
      const jsV1Env = v1.Doc.packEnvelope({
        id: 101,
        name: 'v1-doc',
        opt: 'present-opt',
        score: 42.5,
        flag: true,
        badge: { tag: 'Custom', value: 'gold' },
        child: { id: 7, label: 'c7' },
        items: [
          { id: 1, label: 'first' },
          { id: 2, label: 'second' },
        ],
        statuses: [{ tag: 'Pending' }, { tag: 'Active', value: 55 }],
        parent: { id: 9, label: 'p9' },
        fixedTag: 'TAG1',
        fixedBin: [10, 20, 30, 40],
        nums: [11, 22, 33],
      });

      // 2. JS packs v2 envelope (with higher-alignment union variants & appended fields + brand-new EvHelper type)
      const jsV2Env = v2.Doc.packEnvelope({
        id: 202,
        name: 'v2-doc',
        opt: null,
        score: null,
        flag: false,
        badge: { tag: 'Code', value: 777 },
        child: { id: 17, label: 'c17', extra: 0x1122334455667788n, note: 'child-note', missingOpt: 123 },
        items: [
          { id: 10, label: 'v2-first', extra: 100n, note: 'n1', missingOpt: null },
          { id: 20, label: 'v2-second', extra: 200n, note: null, missingOpt: 456 },
        ],
        statuses: [
          { tag: 'Pending' },
          { tag: 'Active', value: 99 },
          { tag: 'Completed', value: 0xdeadbeefcafebaben },
          { tag: 'Failed', value: 'boom-err' },
        ],
        parent: { id: 90, label: 'p90', extra: 999n, note: 'p-note', missingOpt: 7 },
        fixedTag: 'V2TAG',
        fixedBin: [1, 2, 3, 4],
        nums: [100, 200, 300],
        addedU32: 987654,
        addedStr: 'hello-v2',
        addedOptStr: 'opt-v2',
        addedNullable: 42,
        addedBool: true,
        addedChild: { id: 33, label: 'ac33', extra: 333n, note: 'ac-note', missingOpt: 11 },
        addedStatus: { tag: 'Failed', value: 'inner-fail' },
        addedSlice: [{ id: 44, label: 'as44', extra: 444n, note: null, missingOpt: null }],
        addedRef: { id: 55, label: 'ar55', extra: 555n, note: 'ar-note', missingOpt: 22 },
        addedArr: [7, 8],
        helperRef: { code: 500, note: 'helper-ok' },
      });

      // JS v2 reading JS v1 (backward compat: missing fields get defaults)
      const jsV2FromV1 = v2.Doc.viewEnvelope(jsV1Env);
      expect(jsV2FromV1.id).toBe(101);
      expect(jsV2FromV1.name).toBe('v1-doc');
      expect(jsV2FromV1.opt).toBe('present-opt');
      expect(jsV2FromV1.score).toBe(42.5);
      expect(jsV2FromV1.flag).toBe(true);
      expect(jsV2FromV1.badge).toEqual({ tag: 'Custom', value: 'gold' });
      expect(jsV2FromV1.child?.id).toBe(7);
      expect(jsV2FromV1.child?.label).toBe('c7');
      expect(jsV2FromV1.child?.extra).toBe(0n);
      expect(jsV2FromV1.child?.note).toBeNull();
      expect(jsV2FromV1.child?.missingOpt).toBeNull();
      expect(jsV2FromV1.items.length).toBe(2);
      expect(jsV2FromV1.items.at(1).label).toBe('second');
      expect(jsV2FromV1.items.at(1).extra).toBe(0n);
      expect(jsV2FromV1.items.at(1).missingOpt).toBeNull();
      expect(jsV2FromV1.statuses.length).toBe(2);
      expect(jsV2FromV1.statuses.at(0)).toEqual({ tag: 'Pending' });
      expect(jsV2FromV1.statuses.at(1)).toEqual({ tag: 'Active', value: 55 });
      expect(jsV2FromV1.parent?.label).toBe('p9');
      expect(jsV2FromV1.parent?.extra).toBe(0n);
      expect(jsV2FromV1.fixedTag).toBe('TAG1');
      expect(Array.from(jsV2FromV1.fixedBin)).toEqual([10, 20, 30, 40]);
      expect(Array.from(jsV2FromV1.nums)).toEqual([11, 22, 33]);
      // Appended v2 fields default cleanly:
      expect(jsV2FromV1.addedU32).toBe(0);
      expect(jsV2FromV1.addedStr).toBe('');
      expect(jsV2FromV1.addedOptStr).toBeNull();
      expect(jsV2FromV1.addedNullable).toBeNull();
      expect(jsV2FromV1.addedBool).toBe(false);
      expect(jsV2FromV1.addedChild.id).toBe(0);
      expect(jsV2FromV1.addedChild.missingOpt).toBeNull();
      expect(isUnknownVariant(jsV2FromV1.addedStatus)).toBe(true);
      expect(jsV2FromV1.addedSlice.length).toBe(0);
      expect(jsV2FromV1.addedRef).toBeNull();
      expect(Array.from(jsV2FromV1.addedArr)).toEqual([0, 0]);
      expect(jsV2FromV1.helperRef).toBeNull();
      // Plain materialization (toObject) also succeeds
      const plainV2FromV1 = jsV2FromV1.toObject();
      expect(plainV2FromV1.addedNullable).toBeNull();
      expect(plainV2FromV1.child?.missingOpt).toBeNull();

      // JS v1 reading JS v2 (forward compat: ignores extra fields, honors wire payloadOffset & wire stride, surfaces unknown union variants)
      const jsV1FromV2 = v1.Doc.viewEnvelope(jsV2Env);
      expect(jsV1FromV2.id).toBe(202);
      expect(jsV1FromV2.name).toBe('v2-doc');
      expect(jsV1FromV2.opt).toBeNull();
      expect(jsV1FromV2.score).toBeNull();
      expect(jsV1FromV2.flag).toBe(false);
      expect(jsV1FromV2.badge).toEqual({ tag: '$unknown', rawTag: 2 });
      expect(isUnknownVariant(jsV1FromV2.badge)).toBe(true);
      expect(jsV1FromV2.child?.id).toBe(17);
      expect(jsV1FromV2.child?.label).toBe('c17');
      expect(jsV1FromV2.items.length).toBe(2);
      expect(jsV1FromV2.items.at(0).label).toBe('v2-first');
      expect(jsV1FromV2.items.at(1).id).toBe(20);
      expect(jsV1FromV2.items.at(1).label).toBe('v2-second');
      expect(jsV1FromV2.statuses.length).toBe(4);
      expect(jsV1FromV2.statuses.at(0)).toEqual({ tag: 'Pending' });
      // Active u32 sits at wire payloadOffset=8 in v2 (vs 4 in v1)!
      expect(jsV1FromV2.statuses.at(1)).toEqual({ tag: 'Active', value: 99 });
      expect(jsV1FromV2.statuses.at(2)).toEqual({ tag: '$unknown', rawTag: 2 });
      expect(isUnknownVariant(jsV1FromV2.statuses.at(2))).toBe(true);
      expect(jsV1FromV2.statuses.at(3)).toEqual({ tag: '$unknown', rawTag: 3 });
      expect(jsV1FromV2.statuses.tagAt(2)).toBe('$unknown');
      expect(jsV1FromV2.parent?.id).toBe(90);
      expect(jsV1FromV2.parent?.label).toBe('p90');
      expect(jsV1FromV2.fixedTag).toBe('V2TAG');
      expect(Array.from(jsV1FromV2.fixedBin)).toEqual([1, 2, 3, 4]);
      expect(Array.from(jsV1FromV2.nums)).toEqual([100, 200, 300]);
      // 3. Cross-language JS <-> #![forbid(unsafe_code)] Rust binary test!
      const v1Rs = toRustReprC(v1, { builder: true, wasmExports: false, unsafeSlice: false });
      const v2Rs = toRustReprC(v2, { builder: true, wasmExports: false, unsafeSlice: false });

      const tmp = mkdtempSync(join(tmpdir(), 'capnstruct-evolve-rs-'));
      try {
        const jsV1Path = join(tmp, 'js_v1.bin');
        const jsV2Path = join(tmp, 'js_v2.bin');
        const rsV1Path = join(tmp, 'rs_v1.bin');
        const rsV2Path = join(tmp, 'rs_v2.bin');
        writeFileSync(jsV1Path, jsV1Env);
        writeFileSync(jsV2Path, jsV2Env);

        const mainRs = join(tmp, 'main.rs');
        const binPath = join(tmp, 'evolve_test');
        writeFileSync(
          mainRs,
          `#![forbid(unsafe_code)]
mod v1 {
${v1Rs}
}
mod v2 {
${v2Rs}
}

fn check_v1_from_v1(buf: &[u8]) {
    let tbl = v1::EvDoc::parse_envelope(buf).expect("parse v1->v1");
    let doc = v1::EvDoc::reader(buf, &tbl).expect("reader v1->v1");
    assert_eq!(doc.id(), 101);
    assert_eq!(doc.name().unwrap(), "v1-doc");
    assert_eq!(doc.opt().unwrap(), Some("present-opt"));
    assert_eq!(doc.score(), Some(42.5));
    assert!(doc.flag().unwrap());
    assert!(matches!(doc.badge().unwrap(), v1::EvBadgeReader::Custom("gold")));
    let ch = doc.child().unwrap().unwrap();
    assert_eq!(ch.id(), 7);
    assert_eq!(ch.label().unwrap(), "c7");
    let items = doc.items().unwrap();
    assert_eq!(items.len(), 2);
    assert_eq!(items.get(0).unwrap().unwrap().label().unwrap(), "first");
    assert_eq!(items.get(1).unwrap().unwrap().label().unwrap(), "second");
    // Reverse iterator check
    let rev_ids: Vec<u32> = items.iter().rev().map(|r| r.unwrap().id()).collect();
    assert_eq!(rev_ids, vec![2, 1]);
    let statuses = doc.statuses().unwrap();
    assert_eq!(statuses.len(), 2);
    assert!(matches!(statuses.get(0).unwrap().unwrap(), v1::EvStatusReader::Pending));
    assert!(matches!(statuses.get(1).unwrap().unwrap(), v1::EvStatusReader::Active(55)));
    assert_eq!(doc.parent().unwrap().unwrap().label().unwrap(), "p9");
    assert_eq!(doc.fixedTag().unwrap(), "TAG1");
    assert_eq!(doc.fixedBin(), &[10, 20, 30, 40]);
    let nums: Vec<u16> = doc.nums().unwrap().iter().map(|x| x.unwrap()).collect();
    assert_eq!(nums, vec![11, 22, 33]);
}
fn check_v2_from_v1(buf: &[u8]) {
    let tbl = v2::EvDoc::parse_envelope(buf).expect("parse v1->v2");
    let doc = v2::EvDoc::reader(buf, &tbl).expect("reader v1->v2");
    assert_eq!(doc.id(), 101);
    assert_eq!(doc.name().unwrap(), "v1-doc");
    assert_eq!(doc.opt().unwrap(), Some("present-opt"));
    assert_eq!(doc.score(), Some(42.5));
    assert!(doc.flag().unwrap());
    assert!(matches!(doc.badge().unwrap(), v2::EvBadgeReader::Custom("gold")));
    let ch = doc.child().unwrap().unwrap();
    assert_eq!(ch.id(), 7);
    assert_eq!(ch.label().unwrap(), "c7");
    assert_eq!(ch.extra(), 0);
    assert_eq!(ch.note().unwrap(), None);
    assert_eq!(ch.missingOpt(), None);
    let items = doc.items().unwrap();
    assert_eq!(items.len(), 2);
    assert_eq!(items.get(1).unwrap().unwrap().label().unwrap(), "second");
    assert_eq!(items.get(1).unwrap().unwrap().extra(), 0);
    assert_eq!(items.get(1).unwrap().unwrap().missingOpt(), None);
    let statuses = doc.statuses().unwrap();
    assert_eq!(statuses.len(), 2);
    assert!(matches!(statuses.get(1).unwrap().unwrap(), v2::EvStatusReader::Active(55)));
    // Appended v2 fields default cleanly
    assert_eq!(doc.addedU32(), 0);
    assert_eq!(doc.addedStr().unwrap(), "");
    assert_eq!(doc.addedOptStr().unwrap(), None);
    assert_eq!(doc.addedNullable(), None);
    assert!(!doc.addedBool().unwrap());
    assert_eq!(doc.addedChild().unwrap().id(), 0);
    assert_eq!(doc.addedChild().unwrap().missingOpt(), None);
    assert!(matches!(doc.addedStatus().unwrap(), v2::EvStatusReader::Unknown(0)));
    assert!(doc.addedSlice().unwrap().is_empty());
    assert!(doc.addedRef().unwrap().is_none());
    assert!(doc.addedArr().unwrap().is_empty());
    assert!(doc.helperRef().unwrap().is_none());
}
fn check_v1_from_v2(buf: &[u8]) {
    let tbl = v1::EvDoc::parse_envelope(buf).expect("parse v2->v1");
    let doc = v1::EvDoc::reader(buf, &tbl).expect("reader v2->v1");
    assert_eq!(doc.id(), 202);
    assert_eq!(doc.name().unwrap(), "v2-doc");
    assert_eq!(doc.opt().unwrap(), None);
    assert_eq!(doc.score(), None);
    assert!(!doc.flag().unwrap());
    assert!(matches!(doc.badge().unwrap(), v1::EvBadgeReader::Unknown(2)));
    let ch = doc.child().unwrap().unwrap();
    assert_eq!(ch.id(), 17);
    assert_eq!(ch.label().unwrap(), "c17");
    let items = doc.items().unwrap();
    assert_eq!(items.len(), 2);
    assert_eq!(items.get(0).unwrap().unwrap().label().unwrap(), "v2-first");
    assert_eq!(items.get(1).unwrap().unwrap().id(), 20);
    assert_eq!(items.get(1).unwrap().unwrap().label().unwrap(), "v2-second");
    let statuses = doc.statuses().unwrap();
    assert_eq!(statuses.len(), 4);
    assert!(matches!(statuses.get(0).unwrap().unwrap(), v1::EvStatusReader::Pending));
    assert!(matches!(statuses.get(1).unwrap().unwrap(), v1::EvStatusReader::Active(99)));
    assert!(matches!(statuses.get(2).unwrap().unwrap(), v1::EvStatusReader::Unknown(2)));
    assert!(matches!(statuses.get(3).unwrap().unwrap(), v1::EvStatusReader::Unknown(3)));
    assert_eq!(doc.parent().unwrap().unwrap().label().unwrap(), "p90");
    assert_eq!(doc.fixedTag().unwrap(), "V2TAG");
    assert_eq!(doc.fixedBin(), &[1, 2, 3, 4]);
    let nums: Vec<u16> = doc.nums().unwrap().iter().map(|x| x.unwrap()).collect();
    assert_eq!(nums, vec![100, 200, 300]);
}
fn check_v2_from_v2(buf: &[u8]) {
    let tbl = v2::EvDoc::parse_envelope(buf).expect("parse v2->v2");
    let doc = v2::EvDoc::reader(buf, &tbl).expect("reader v2->v2");
    assert_eq!(doc.id(), 202);
    assert!(matches!(doc.badge().unwrap(), v2::EvBadgeReader::Code(777)));
    assert_eq!(doc.child().unwrap().unwrap().extra(), 0x1122334455667788);
    assert_eq!(doc.addedU32(), 987654);
    assert_eq!(doc.addedStr().unwrap(), "hello-v2");
    assert_eq!(doc.addedOptStr().unwrap(), Some("opt-v2"));
    assert_eq!(doc.addedNullable(), Some(42));
    assert!(doc.addedBool().unwrap());
    assert_eq!(doc.addedChild().unwrap().extra(), 333);
    assert!(matches!(doc.addedStatus().unwrap(), v2::EvStatusReader::Failed("inner-fail")));
    assert_eq!(doc.addedSlice().unwrap().get(0).unwrap().unwrap().id(), 44);
    assert_eq!(doc.addedRef().unwrap().unwrap().missingOpt(), Some(22));
    let arr: Vec<u16> = doc.addedArr().unwrap().iter().map(|x| x.unwrap()).collect();
    assert_eq!(arr, vec![7, 8]);
    let helper = doc.helperRef().unwrap().unwrap();
    assert_eq!(helper.code(), 500);
    assert_eq!(helper.note().unwrap(), "helper-ok");
    let statuses = doc.statuses().unwrap();
    assert!(matches!(statuses.get(2).unwrap().unwrap(), v2::EvStatusReader::Completed(0xdeadbeefcafebabe)));
    assert!(matches!(statuses.get(3).unwrap().unwrap(), v2::EvStatusReader::Failed("boom-err")));
}
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let js_v1 = std::fs::read(&args[1]).unwrap();
    let js_v2 = std::fs::read(&args[2]).unwrap();
    // Test both aligned AND unaligned (+1 byte offset) reads!
    let mut unaligned_v1 = vec![0xAAu8];
    unaligned_v1.extend_from_slice(&js_v1);
    let mut unaligned_v2 = vec![0xBBu8];
    unaligned_v2.extend_from_slice(&js_v2);
    check_v1_from_v1(&js_v1);
    check_v1_from_v1(&unaligned_v1[1..]);
    check_v2_from_v1(&js_v1);
    check_v2_from_v1(&unaligned_v1[1..]);
    check_v1_from_v2(&js_v2);
    check_v1_from_v2(&unaligned_v2[1..]);
    check_v2_from_v2(&js_v2);
    check_v2_from_v2(&unaligned_v2[1..]);
    // Build v1 envelope in Rust (zero unsafe!)
    let mut b1 = v1::CapnBuilder::new();
    let rs_v1 = b1.build_envelope_vec(|b| {
        let name = b.str("v1-doc");
        let opt = b.opt_str(Some("present-opt"));
        let badge_s = b.str("gold");
        let child = b.build_ref(|b| {
            let l = b.str("c7");
            v1::EvChild { id: 7, label: l }
        });
        let items = b.build_slice(2, |i, b| {
            let l = b.str(if i == 0 { "first" } else { "second" });
            v1::EvChild { id: (i as u32) + 1, label: l }
        });
        let statuses = b.pack_slice(&[v1::EvStatus::Pending, v1::EvStatus::Active(55)]);
        let parent = b.build_ref(|b| {
            let l = b.str("p9");
            v1::EvChild { id: 9, label: l }
        });
        v1::EvDoc {
            id: 101,
            name,
            opt,
            _pad0: [0; 4],
            score: 42.5,
            flag: true,
            _pad1: [0; 3],
            badge: v1::EvBadge::Custom(badge_s),
            child,
            items,
            statuses,
            parent,
            fixedTag: *b"TAG1\0\0\0\0",
            fixedBin: [10, 20, 30, 40],
            nums: [11, 22, 33],
            _pad2: [0; 6],
        }
    });
    check_v1_from_v1(&rs_v1);
    check_v2_from_v1(&rs_v1);
    std::fs::write(&args[3], &rs_v1).unwrap();
    // Build v2 envelope in Rust (zero unsafe!)
    let mut b2 = v2::CapnBuilder::new();
    let rs_v2 = b2.build_envelope_vec(|b| {
        let name = b.str("v2-doc");
        let opt = b.opt_str(None);
        let child = b.build_ref(|b| {
            let l = b.str("c17");
            let note = b.opt_str(Some("child-note"));
            v2::EvChild { id: 17, label: l, _pad0: [0; 4], extra: 0x1122334455667788, note, missingOpt: 123, _pad1: [0; 4] }
        });
        let items = b.build_slice(2, |i, b| {
            let l = b.str(if i == 0 { "v2-first" } else { "v2-second" });
            let n = b.opt_str(if i == 0 { Some("n1") } else { None });
            v2::EvChild {
                id: if i == 0 { 10 } else { 20 },
                label: l,
                _pad0: [0; 4],
                extra: if i == 0 { 100 } else { 200 },
                note: n,
                missingOpt: if i == 0 { v2::EvChild::MISSING_OPT_NULL } else { 456 },
                _pad1: [0; 4],
            }
        });
        let fail_s = b.str("boom-err");
        let statuses = b.pack_slice(&[
            v2::EvStatus::Pending,
            v2::EvStatus::Active(99),
            v2::EvStatus::Completed(0xdeadbeefcafebabe),
            v2::EvStatus::Failed(fail_s),
        ]);
        let parent = b.build_ref(|b| {
            let l = b.str("p90");
            let n = b.opt_str(Some("p-note"));
            v2::EvChild { id: 90, label: l, _pad0: [0; 4], extra: 999, note: n, missingOpt: 7, _pad1: [0; 4] }
        });
        let added_str = b.str("hello-v2");
        let added_opt = b.opt_str(Some("opt-v2"));
        let ac_lbl = b.str("ac33");
        let ac_note = b.opt_str(Some("ac-note"));
        let inner_fail = b.str("inner-fail");
        let added_slice = b.build_slice(1, |_, b| {
            let l = b.str("as44");
            v2::EvChild { id: 44, label: l, _pad0: [0; 4], extra: 444, note: b.opt_str(None), missingOpt: v2::EvChild::MISSING_OPT_NULL, _pad1: [0; 4] }
        });
        let added_ref = b.build_ref(|b| {
            let l = b.str("ar55");
            let n = b.opt_str(Some("ar-note"));
            v2::EvChild { id: 55, label: l, _pad0: [0; 4], extra: 555, note: n, missingOpt: 22, _pad1: [0; 4] }
        });
        let helper_ref = b.build_ref(|b| {
            let n = b.str("helper-ok");
            v2::EvHelper { code: 500, _pad0: [0; 2], note: n }
        });
        v2::EvDoc {
            id: 202,
            name,
            opt,
            _pad0: [0; 4],
            score: v2::EvDoc::SCORE_NULL,
            flag: false,
            _pad1: [0; 3],
            badge: v2::EvBadge::Code(777),
            child,
            items,
            statuses,
            parent,
            fixedTag: *b"V2TAG\0\0\0",
            fixedBin: [1, 2, 3, 4],
            nums: [100, 200, 300],
            _pad2: [0; 2],
            addedU32: 987654,
            addedStr: added_str,
            addedOptStr: added_opt,
            addedNullable: 42,
            addedBool: true,
            _pad3: [0; 3],
            addedChild: v2::EvChild { id: 33, label: ac_lbl, _pad0: [0; 4], extra: 333, note: ac_note, missingOpt: 11, _pad1: [0; 4] },
            addedStatus: v2::EvStatus::Failed(inner_fail),
            addedSlice: added_slice,
            addedRef: added_ref,
            addedArr: [7, 8],
            helperRef: helper_ref,
            _pad4: [0; 4],
        }
    });
    check_v1_from_v2(&rs_v2);
    check_v2_from_v2(&rs_v2);
    std::fs::write(&args[4], &rs_v2).unwrap();
    // Native (raw non-envelope) safe read & read_slice on unaligned buffer!
    let mut b_raw = v1::CapnBuilder::new();
    let raw = b_raw.build_vec(|b| {
        let l = b.str("native-child");
        v1::EvChild { id: 42, label: l }
    });
    let mut unaligned_raw = vec![0xCCu8];
    unaligned_raw.extend_from_slice(&raw);
    let r = v1::EvChild::read(&unaligned_raw[1..]).unwrap();
    assert_eq!(r.id(), 42);
    assert_eq!(r.label().unwrap(), "native-child");
    let rs = v1::EvChild::read_slice(&unaligned_raw[1..], 1).unwrap();
    assert_eq!(rs.len(), 1);
    assert_eq!(rs.get(0).unwrap().unwrap().label().unwrap(), "native-child");
}
`,
          );
        execFileSync('rustc', ['--edition=2021', mainRs, '-o', binPath], { stdio: 'pipe' });
        execFileSync(binPath, [jsV1Path, jsV2Path, rsV1Path, rsV2Path], { stdio: 'pipe' });

        // Now read Rust-built v1 & v2 envelopes back in JS (both same-version and cross-version)!
        const rsV1Env = new Uint8Array(readFileSync(rsV1Path));
        const rsV2Env = new Uint8Array(readFileSync(rsV2Path));

        const jsV2FromRsV1 = v2.Doc.viewEnvelope(rsV1Env);
        expect(jsV2FromRsV1.id).toBe(101);
        expect(jsV2FromRsV1.name).toBe('v1-doc');
        expect(jsV2FromRsV1.opt).toBe('present-opt');
        expect(jsV2FromRsV1.score).toBe(42.5);
        expect(jsV2FromRsV1.badge).toEqual({ tag: 'Custom', value: 'gold' });
        expect(jsV2FromRsV1.child?.extra).toBe(0n);
        expect(jsV2FromRsV1.child?.missingOpt).toBeNull();
        expect(jsV2FromRsV1.addedNullable).toBeNull();
        expect(jsV2FromRsV1.helperRef).toBeNull();

        const jsV1FromRsV2 = v1.Doc.viewEnvelope(rsV2Env);
        expect(jsV1FromRsV2.id).toBe(202);
        expect(jsV1FromRsV2.name).toBe('v2-doc');
        expect(jsV1FromRsV2.badge).toEqual({ tag: '$unknown', rawTag: 2 });
        expect(jsV1FromRsV2.items.at(1).label).toBe('v2-second');
        expect(jsV1FromRsV2.statuses.at(1)).toEqual({ tag: 'Active', value: 99 });
        expect(jsV1FromRsV2.statuses.at(2)).toEqual({ tag: '$unknown', rawTag: 2 });
        expect(jsV1FromRsV2.statuses.at(3)).toEqual({ tag: '$unknown', rawTag: 3 });

        const jsV2FromRsV2 = v2.Doc.viewEnvelope(rsV2Env);
        expect(jsV2FromRsV2.addedU32).toBe(987654);
        expect(jsV2FromRsV2.addedStr).toBe('hello-v2');
        expect(jsV2FromRsV2.addedStatus).toEqual({ tag: 'Failed', value: 'inner-fail' });
        expect(jsV2FromRsV2.statuses.at(2)).toEqual({ tag: 'Completed', value: 0xdeadbeefcafebaben });
        expect(jsV2FromRsV2.helperRef?.code).toBe(500);
        expect(jsV2FromRsV2.helperRef?.note).toBe('helper-ok');
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('rejects corrupt buffers deterministically in both JS and Rust without panicking or UB', () => {
      const Choice = defineUnion('CorruptChoice', { A: null, B: u32 });
      const Other = defineStruct('OtherRoot', { x: u32 });
      const Rec = defineStruct('CorruptRec', {
        flag: bool,
        name: str,
        opt: optStr,
        tag: fixedStr(4),
        choice: Choice,
        nums: slice(u32),
        next: ref(Other),
      });

      const validEnv = Rec.packEnvelope({
        flag: true,
        name: 'ok',
        opt: 'yes',
        tag: 'abcd',
        choice: { tag: 'B', value: 7 },
        nums: [1, 2],
        next: { x: 9 },
      });

      // JS rejections
      // 1. Truncated header
      expect(() => Rec.viewEnvelope(validEnv.subarray(0, 8))).toThrow(RangeError);
      // 2. Bad magic
      const badMagic = validEnv.slice();
      badMagic[0] = 0x00;
      expect(() => Rec.viewEnvelope(badMagic)).toThrow(RangeError);
      // 3. Unsupported version
      const badVer = validEnv.slice();
      badVer[4] = 2;
      expect(() => Rec.viewEnvelope(badVer)).toThrow(RangeError);
      // 4. Root hash mismatch
      expect(() => Other.viewEnvelope(validEnv)).toThrow(RangeError);
      // 5. Corrupt union tag (>= wire variant_count)
      const po = new DataView(validEnv.buffer, validEnv.byteOffset).getUint32(12, true);
      const choiceOff = po + Rec.offsetOf('choice');
      const badTag = validEnv.slice();
      badTag[choiceOff] = 99;
      expect(() => Rec.viewEnvelope(badTag).choice).toThrow(RangeError);
      // 6. Out-of-bounds slice length/offset
      const numsOff = po + Rec.offsetOf('nums');
      const badSlice = validEnv.slice();
      new DataView(badSlice.buffer).setUint32(numsOff, 0xffff_ff00, true);
      expect(() => Rec.viewEnvelope(badSlice).nums).toThrow(RangeError);
      // 7. Out-of-bounds ref
      const nextOff = po + Rec.offsetOf('next');
      const badRef = validEnv.slice();
      new DataView(badRef.buffer).setUint32(nextOff, 0x00ff_ffff, true);
      expect(() => Rec.viewEnvelope(badRef).next).toThrow(RangeError);

      // Rust rejections for every CapnError variant!
      const rsCode = toRustReprC({ Choice, Other, Rec }, { builder: false, unsafeSlice: false });
      const tmp = mkdtempSync(join(tmpdir(), 'capnstruct-corrupt-rs-'));
      try {
        const envPath = join(tmp, 'valid.bin');
        writeFileSync(envPath, validEnv);
        const mainRs = join(tmp, 'main.rs');
        const binPath = join(tmp, 'corrupt_test');
        writeFileSync(
          mainRs,
          `#![forbid(unsafe_code)]
mod s {
${rsCode}
}
use s::{CapnError, CorruptRec, OtherRoot};

fn main() {
    let valid = std::fs::read(std::env::args().nth(1).unwrap()).unwrap();
    let po = u32::from_le_bytes(valid[12..16].try_into().unwrap()) as usize;

    // 1. Truncated header
    assert_eq!(CorruptRec::parse_envelope(&valid[..8]).unwrap_err(), CapnError::Truncated);
    // 2. Bad magic
    let mut bad_magic = valid.clone();
    bad_magic[0] = 0;
    assert_eq!(CorruptRec::parse_envelope(&bad_magic).unwrap_err(), CapnError::BadMagic);
    // 3. Unsupported version
    let mut bad_ver = valid.clone();
    bad_ver[4] = 2;
    assert_eq!(CorruptRec::parse_envelope(&bad_ver).unwrap_err(), CapnError::UnsupportedVersion(2));
    // 4. Root hash mismatch
    assert!(matches!(OtherRoot::parse_envelope(&valid), Err(CapnError::RootHashMismatch { .. })));
    // 5. Truncated payload
    assert_eq!(CorruptRec::parse_envelope(&valid[..po + 2]).unwrap_err(), CapnError::Truncated);
    // 6. Missing non-root wire type (zero out OtherRoot's type_hash in header)
    let mut missing_type = valid.clone();
    let tc = u16::from_le_bytes(missing_type[6..8].try_into().unwrap()) as usize;
    for i in 0..tc {
        let o = 16 + i * 8;
        let h = u32::from_le_bytes(missing_type[o..o+4].try_into().unwrap());
        if h == OtherRoot::TYPE_HASH {
            missing_type[o..o+4].copy_from_slice(&0x1234_5678u32.to_le_bytes());
        }
    }
    let tbl_mt = CorruptRec::parse_envelope(&missing_type).unwrap();
    let doc_mt = CorruptRec::reader(&missing_type, &tbl_mt).unwrap();
    assert_eq!(doc_mt.next().unwrap_err(), CapnError::MissingType(OtherRoot::TYPE_HASH));
    // 7. Invalid bool byte (0xff)
    let mut bad_bool = valid.clone();
    bad_bool[po + ${Rec.offsetOf('flag')}] = 0xff;
    let tbl = CorruptRec::parse_envelope(&bad_bool).unwrap();
    let doc = CorruptRec::reader(&bad_bool, &tbl).unwrap();
    assert_eq!(doc.flag().unwrap_err(), CapnError::InvalidBool(0xff));
    // 8. Invalid UTF-8 in str, optStr, fixedStr
    let mut bad_utf8 = valid.clone();
    let name_off = u32::from_le_bytes(bad_utf8[po + ${Rec.offsetOf('name')}..po + ${Rec.offsetOf('name')} + 4].try_into().unwrap()) as usize;
    bad_utf8[po + name_off] = 0xff;
    bad_utf8[po + ${Rec.offsetOf('tag')}] = 0xff;
    let tbl = CorruptRec::parse_envelope(&bad_utf8).unwrap();
    let doc = CorruptRec::reader(&bad_utf8, &tbl).unwrap();
    assert!(matches!(doc.name(), Err(CapnError::InvalidUtf8(_))));
    assert!(matches!(doc.tag(), Err(CapnError::InvalidUtf8(_))));
    // 9. Corrupt union tag (>= wire variant_count)
    let mut bad_tag = valid.clone();
    bad_tag[po + ${Rec.offsetOf('choice')}] = 99;
    let tbl = CorruptRec::parse_envelope(&bad_tag).unwrap();
    let doc = CorruptRec::reader(&bad_tag, &tbl).unwrap();
    assert_eq!(doc.choice().unwrap_err(), CapnError::InvalidTag(99));
    // 10. Out-of-bounds slice & overflow
    let mut bad_slice = valid.clone();
    let nums_pos = po + ${Rec.offsetOf('nums')};
    bad_slice[nums_pos..nums_pos+4].copy_from_slice(&0xffff_ff00u32.to_le_bytes());
    let tbl = CorruptRec::parse_envelope(&bad_slice).unwrap();
    let doc = CorruptRec::reader(&bad_slice, &tbl).unwrap();
    assert_eq!(doc.nums().unwrap_err(), CapnError::OutOfBounds);
    // 11. Out-of-bounds ref
    let mut bad_ref = valid.clone();
    let ref_pos = po + ${Rec.offsetOf('next')};
    bad_ref[ref_pos..ref_pos+4].copy_from_slice(&0x00ff_ffffu32.to_le_bytes());
    let tbl = CorruptRec::parse_envelope(&bad_ref).unwrap();
    let doc = CorruptRec::reader(&bad_ref, &tbl).unwrap();
    assert_eq!(doc.next().unwrap_err(), CapnError::OutOfBounds);
    // 12. Display & core::error::Error smoke check
    let err: &dyn core::error::Error = &CapnError::BadMagic;
    assert!(format!("{err}").contains("magic"));
}
`,
        );

        execFileSync('rustc', ['--edition=2021', mainRs, '-o', binPath], { stdio: 'pipe' });
        execFileSync(binPath, [envPath], { stdio: 'pipe' });
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('supports innerAllow (--inner-allow), Default (no manual _pad0), CapnSliceReader::at, O(1) str_dedup hash table, and same-version viewEnvelope fast path', () => {
      const Kind = defineUnion('ErgKind', { Empty: null, Code: u32, Text: str });
      const Item = defineStruct('ErgItem', {
        flag: bool,
        label: str,
        note: optStr,
        kind: Kind,
        big: fixedBytes(64),
      });
      const Root = defineStruct('ErgRoot', {
        ok: bool,
        items: slice(Item),
        extra: ref(Item),
      });

      // 1. innerAllow emits one top-level #![allow(...)] and zero per-item #[allow(...)]
      const rs = toRustReprC([Kind, Item, Root], {
        builder: true,
        wasmExports: false,
        unsafeSlice: false,
        innerAllow: true,
      });
      expect(rs).toContain('#![allow(');
      expect(rs).not.toContain('#[allow(');
      expect(rs).not.toContain('unsafe');
      expect(rs).toContain('impl Default for ErgItem');
      expect(rs).toContain('impl Default for ErgKind');
      expect(rs).toContain('pub fn at(&self, i: usize) -> Result<T::Out, CapnError>');

      // 2. CLI --inner-allow flag smoke test
      const tmp = mkdtempSync(join(tmpdir(), 'capnstruct-v051-'));
      try {
        const schemaPath = join(tmp, 'schema.mjs');
        const distIndex = join(process.cwd(), 'dist/index.js');
        const cliPath = join(process.cwd(), 'dist/cli.js');
        writeFileSync(
          schemaPath,
          `import { defineStruct, bool, u32 } from ${JSON.stringify(distIndex)};\nexport const S = defineStruct('S', { b: bool, n: u32 });\n`,
        );
        const cliOut = execFileSync(process.execPath, [cliPath, schemaPath, '--builder', '--no-wasm-exports', '--no-unsafe-slice', '--inner-allow'], { encoding: 'utf8' });
        expect(cliOut).toContain('#![allow(');
        expect(cliOut).not.toContain('#[allow(');

        // 3. Compile & run under #![no_std] / #![forbid(unsafe_code)] + Rust 2021/2024 + Clippy + runtime test
        const modPath = join(tmp, 'erg_schema.rs');
        const libPath = join(tmp, 'lib.rs');
        const mainPath = join(tmp, 'main.rs');
        const binPath = join(tmp, 'erg_test');
        const outPath = join(tmp, 'erg.bin');
        writeFileSync(modPath, rs);
        writeFileSync(
          libPath,
          `#![no_std]\n#![forbid(unsafe_code)]\n#![deny(clippy::all, clippy::pedantic)]\nmod erg_schema;\n`,
        );
        for (const edition of ['2021', '2024']) {
          execFileSync('rustc', ['--edition', edition, '--crate-type=lib', '-D', 'warnings', libPath, '-o', join(tmp, `lib_${edition}.rlib`)], { stdio: 'pipe' });
        }
        let hasClippy = false;
        try {
          execFileSync('clippy-driver', ['--version'], { stdio: 'pipe' });
          hasClippy = true;
        } catch {
          hasClippy = false;
        }
        if (hasClippy) {
          execFileSync('clippy-driver', ['--edition=2024', '--crate-type=lib', '-D', 'warnings', libPath, '-o', join(tmp, 'clippy.rlib')], { stdio: 'pipe' });
        }

        writeFileSync(
          mainPath,
          `#![forbid(unsafe_code)]
mod erg_schema;
use erg_schema::*;

fn main() {
    let mut b = CapnBuilder::with_capacity(65536);
    // Stress O(1) str_dedup hash table across multiple resizes (256 -> 512 -> 1024 -> 2048)
    let env = b.build_envelope_vec(|b| {
        let items = b.build_slice(600, |i, b| {
            let unique = format!("key_{i}");
            let s1 = b.str_dedup(&unique);
            let s2 = b.str_dedup(&unique);
            assert_eq!(s1, s2, "dedup must return identical offset/len");
            let shared = b.str_dedup(if i % 2 == 0 { "even_tag" } else { "odd_tag" });
            let note = b.opt_str_dedup(if i % 3 == 0 { Some("shared_note") } else if i % 3 == 1 { Some("") } else { None });
            // Construct ErgItem using ..Default::default() without specifying _pad0 or big!
            ErgItem {
                flag: i % 2 == 0,
                label: s1,
                note,
                kind: if i % 3 == 0 { ErgKind::Text(shared) } else if i % 3 == 1 { ErgKind::Code(i as u32) } else { ErgKind::Empty },
                ..Default::default()
            }
        });
        let extra = b.build_ref(|b| ErgItem {
            flag: true,
            label: b.str_dedup("extra_item"),
            ..Default::default()
        });
        ErgRoot { ok: true, items, extra, ..Default::default() }
    });
    // Verify CapnSliceReader::at(i) + OutOfBounds
    let tbl = ErgRoot::parse_envelope(&env).unwrap();
    let doc = ErgRoot::reader(&env, &tbl).unwrap();
    assert!(doc.ok().unwrap());
    let items = doc.items().unwrap();
    assert_eq!(items.len(), 600);
    assert_eq!(items.at(0).unwrap().label().unwrap(), "key_0");
    assert_eq!(items.at(599).unwrap().label().unwrap(), "key_599");
    assert_eq!(items.at(0).unwrap().note().unwrap(), Some("shared_note"));
    assert_eq!(items.at(1).unwrap().note().unwrap(), Some(""));
    assert_eq!(items.at(2).unwrap().note().unwrap(), None);
    assert_eq!(items.at(600).unwrap_err(), CapnError::OutOfBounds);
    assert_eq!(doc.extra().unwrap().unwrap().label().unwrap(), "extra_item");
    // Verify reset() clears dedup table cleanly for reuse
    let env2 = b.build_envelope_vec(|b| {
        let s = b.str_dedup("key_0");
        let extra = b.build_ref(|_| ErgItem { label: s, ..Default::default() });
        ErgRoot { ok: false, extra, ..Default::default() }
    });
    let tbl2 = ErgRoot::parse_envelope(&env2).unwrap();
    let doc2 = ErgRoot::reader(&env2, &tbl2).unwrap();
    assert!(!doc2.ok().unwrap());
    assert_eq!(doc2.extra().unwrap().unwrap().label().unwrap(), "key_0");
    std::fs::write(std::env::args().nth(1).unwrap(), &env).unwrap();
}
`,
        );
        execFileSync('rustc', ['--edition=2024', mainPath, '-o', binPath], { stdio: 'pipe' });
        execFileSync(binPath, [outPath], { stdio: 'pipe' });

        // 4. Verify JS viewEnvelope takes the exact same-version fast path (_e === null) and reads all 600 items
        const envBytes = new Uint8Array(readFileSync(outPath));
        const view = Root.viewEnvelope(envBytes);
        expect((view as unknown as { _e: unknown })._e).toBeNull();
        expect(view.ok).toBe(true);
        expect(view.items.length).toBe(600);
        expect(view.items.at(0).label).toBe('key_0');
        expect(view.items.at(0).kind).toEqual({ tag: 'Text', value: 'even_tag' });
        expect(view.items.at(1).note).toBe('');
        expect(view.items.at(2).note).toBeNull();
        expect(view.items.at(599).label).toBe('key_599');
        expect(view.extra?.label).toBe('extra_item');
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe('v0.6.0 Read-Only Default Views, Explicit mutView/mutArray, Immer-Style produce(), & UTF-8/Alignment Fast Paths', () => {
    it('returns read-only views by default and enforces compile-time + runtime immutability', () => {
      const TagUnion = defineUnion('RoTag', {
        Num: u32,
        Text: str,
      });
      const Inner = defineStruct('RoInner', { x: u32, label: str });
      const Doc = defineStruct('RoDoc', {
        id: u32,
        name: str,
        inner: Inner,
        nums: slice(u32),
        items: slice(Inner),
        tags: slice(TagUnion),
        fixed: fixedArray(u16, 3),
        raw: fixedBytes(4),
      });

      const packed = Doc.pack([
        {
          id: 1,
          name: 'alpha',
          inner: { x: 10, label: 'in1' },
          nums: [1, 2, 3],
          items: [{ x: 100, label: 'a' }],
          tags: [{ tag: 'Num', value: 7 }],
          fixed: [10, 20, 30],
          raw: new Uint8Array([1, 2, 3, 4]),
        },
        {
          id: 2,
          name: 'beta',
          inner: { x: 20, label: 'in2' },
          nums: [4, 5],
          items: [{ x: 200, label: 'b' }],
          tags: [{ tag: 'Text', value: 'hi' }],
          fixed: [40, 50, 60],
          raw: new Uint8Array([5, 6, 7, 8]),
        },
      ]);

      const singlePacked = Doc.pack([
        {
          id: 9,
          name: 'solo',
          inner: { x: 99, label: 's' },
          nums: [9],
          items: [],
          tags: [{ tag: 'Num', value: 42 }],
          fixed: [1, 2, 3],
          raw: new Uint8Array([9, 8, 7, 6]),
        },
      ]);

      const v: StructView<typeof Doc.schema> = Doc.view(singlePacked);
      const vFn = structView(Doc, singlePacked);
      const arr: StructArrayView<typeof Doc.schema> = Doc.array(packed);
      const sub = arr.subarray(0, 1);
      const envBytes = Doc.packEnvelope({
        id: 5,
        name: 'env',
        inner: { x: 50, label: 'e' },
        nums: [5],
        items: [],
        tags: [],
        fixed: [1, 2, 3],
        raw: new Uint8Array([1, 1, 1, 1]),
      });
      const envView = Doc.viewEnvelope(envBytes);
      const hdrView = Doc.viewHeader(singlePacked.slice(0, Doc.byteSize));

      expect(v.readonly).toBe(true);
      expect(vFn.readonly).toBe(true);
      expect(arr.readonly).toBe(true);
      expect(sub.readonly).toBe(true);
      expect(arr.at(0).readonly).toBe(true);
      expect(arr.at(0).inner.readonly).toBe(true);
      expect(arr.at(0).items.readonly).toBe(true);
      expect(arr.at(0).tags.readonly).toBe(true);
      expect(envView.readonly).toBe(true);
      expect(hdrView.readonly).toBe(true);

      // Compile-time immutability checks (must fail tsc without @ts-expect-error)
      const checkReadonlyTypes = () => {
        // @ts-expect-error Cannot assign to read-only StructView field
        v.id = 2;
        // @ts-expect-error set() does not exist on read-only StructView
        v.set({ id: 2 });
        // @ts-expect-error compact() does not exist on read-only StructView
        v.compact();
        // @ts-expect-error Cannot assign to nested read-only struct field
        v.inner.x = 5;
        // @ts-expect-error push() does not exist on read-only StructArrayView
        arr.push({ id: 3 });
        // @ts-expect-error pop() does not exist on read-only StructArrayView
        arr.pop();
        // @ts-expect-error set() does not exist on read-only StructArrayView
        arr.set(0, { id: 3 });
        // @ts-expect-error setColumn() does not exist on read-only StructArrayView
        arr.setColumn('id', [1, 2]);
        // @ts-expect-error compact() does not exist on read-only StructArrayView
        arr.compact();
        // @ts-expect-error set() does not exist on read-only UnionArrayView
        v.tags.set(0, { tag: 'Num', value: 1 });
        // @ts-expect-error Cannot assign to subarray element field
        sub.at(0).id = 99;
      };
      expect(typeof checkReadonlyTypes).toBe('function');

      // Runtime immutability enforcement on every mutation path
      expect(() => { (v as any).id = 2; }).toThrow(TypeError);
      expect(() => { (v as any).name = 'changed'; }).toThrow(TypeError);
      expect(() => { (v as any).set({ id: 2 }); }).toThrow(TypeError);
      expect(() => { (v as any).compact(); }).toThrow(TypeError);
      expect(() => { (v.inner as any).x = 5; }).toThrow(TypeError);
      expect(() => { (v.tags as any).set(0, { tag: 'Num', value: 1 }); }).toThrow(TypeError);
      expect(() => { (arr as any).set(0, { id: 3 }); }).toThrow(TypeError);
      expect(() => { (arr as any).push({ id: 3 }); }).toThrow(TypeError);
      expect(() => { (arr as any).pop(); }).toThrow(TypeError);
      expect(() => { (arr as any).setColumn('id', [9, 8]); }).toThrow(TypeError);
      expect(() => { (arr as any).compact(); }).toThrow(TypeError);
      expect(() => { (arr.at(0) as any).id = 77; }).toThrow(TypeError);
      expect(() => { (arr.at(0).items as any).push({ x: 1, label: 'z' }); }).toThrow(TypeError);
      expect(() => { (sub.at(0) as any).id = 77; }).toThrow(TypeError);
      expect(() => { (envView as any).id = 123; }).toThrow(TypeError);

      // Explicit mutable constructors and views have readonly === false
      const mv: MutStructView<typeof Doc.schema> = Doc.mutView(singlePacked.slice());
      const ma: MutStructArrayView<typeof Doc.schema> = Doc.mutArray(packed.slice());
      const mFn = mutStructView(Doc, singlePacked.slice());
      const mc = Doc.create({ id: 1, name: 'c' });
      const mal = Doc.alloc(2);
      const msh = Doc.shared(2);
      const mfr = Doc.from([{ id: 1, name: 'f' }]);
      expect(mv.readonly).toBe(false);
      expect(ma.readonly).toBe(false);
      expect(mFn.readonly).toBe(false);
      expect(mc.readonly).toBe(false);
      expect(mal.readonly).toBe(false);
      expect(msh.readonly).toBe(false);
      expect(mfr.readonly).toBe(false);
      expect(ma.subarray(0, 1).readonly).toBe(false);
      expect(ma.at(0).inner.readonly).toBe(false);
      expect(ma.at(0).tags.readonly).toBe(false);

      mv.id = 999;
      mv.inner.x = 777;
      mv.tags.set(0, { tag: 'Text', value: 'mutated' });
      expect(mv.id).toBe(999);
      expect(mv.inner.x).toBe(777);
      expect(mv.tags.at(0)).toEqual({ tag: 'Text', value: 'mutated' });

      // WasmArena read-only view/viewArray vs mutable mutView/mutViewArray/alloc/allocOne/placeBytes.as
      const arena = new WasmArena(new ArrayBuffer(65536), 64);
      const one = arena.allocOne(Inner, { x: 11, label: 'arena' });
      const roOne = arena.view(Inner, one.byteOffset);
      const rwOne = arena.mutView(Inner, one.byteOffset);
      expect(one.readonly).toBe(false);
      expect(roOne.readonly).toBe(true);
      expect(rwOne.readonly).toBe(false);
      expect(() => { (roOne as any).x = 22; }).toThrow(TypeError);
      rwOne.x = 33;
      expect(roOne.x).toBe(33);

      const many = arena.alloc(Inner, 2);
      many.at(0).set({ x: 1, label: 'one' });
      const roMany = arena.viewArray(Inner, many.byteOffset, 2);
      const rwMany = arena.mutViewArray(Inner, many.byteOffset, 2);
      expect(many.readonly).toBe(false);
      expect(roMany.readonly).toBe(true);
      expect(rwMany.readonly).toBe(false);
      expect(() => { (roMany.at(0) as any).x = 9; }).toThrow(TypeError);
      rwMany.at(0).x = 44;
      expect(roMany.at(0).x).toBe(44);

      const placed = arena.placeBytes(Inner.pack([{ x: 5, label: 'p' }]), Inner);
      const placedArr = placed.as(Inner);
      expect(placedArr.readonly).toBe(false);
      placedArr.at(0).x = 55;
      expect(placedArr.at(0).x).toBe(55);
    });

    it('supports Immer-style produce() no-op O(1) identity, mutable snapshot isolation, and inline fixed-size fast path', () => {
      const Coord = defineStruct('ProdCoord', { lat: f64, lon: f64 });
      const Stat = defineStruct('ProdStat', {
        id: u32,
        big: u64,
        flag: bool,
        opt: nullable(i32, -2147483648),
        tag: fixedStr(4),
        raw: fixedBytes(4),
        fixedNums: fixedArray(u16, 3),
        origin: Coord,
        name: str,
      });

      const packed = Stat.pack([
        {
          id: 1,
          big: 100n,
          flag: false,
          opt: null,
          tag: 'AB',
          raw: new Uint8Array([1, 2, 3, 4]),
          fixedNums: [10, 20, 30],
          origin: { lat: 1.5, lon: 2.5 },
          name: 'keep-me',
        },
      ]);

      // 1. No-op on read-only view returns exact same reference in O(1)
      const ro = Stat.view(packed);
      const same = produce(ro, () => {});
      expect(same).toBe(ro);

      // 2. No-op on mutable view returns an isolated read-only snapshot
      const mut = Stat.mutView(packed.slice());
      const snap = produce(mut, () => {});
      expect(snap).not.toBe(mut);
      expect(snap.readonly).toBe(true);
      mut.id = 999;
      expect(snap.id).toBe(1);

      // 3. Inline fixed-size fast path patches only dirty fixed fields without mutating base
      const next = produce(ro, (d) => {
        d.id = 42;
        d.big = 9007199254740993n;
        d.flag = true;
        d.opt = -7;
        d.tag = 'WXYZ';
        d.raw[1] = 88;
        d.fixedNums[2] = 333;
        d.origin.lat = 37.75;
      });
      expect(next).not.toBe(ro);
      expect(next.readonly).toBe(true);
      expect(next.id).toBe(42);
      expect(next.big).toBe(9007199254740993n);
      expect(next.flag).toBe(true);
      expect(next.opt).toBe(-7);
      expect(next.tag).toBe('WXYZ');
      expect(Array.from(next.raw)).toEqual([1, 88, 3, 4]);
      expect(Array.from(next.fixedNums)).toEqual([10, 20, 333]);
      expect(next.origin.lat).toBe(37.75);
      expect(next.origin.lon).toBe(2.5);
      expect(next.name).toBe('keep-me');

      // Base view is completely untouched
      expect(ro.id).toBe(1);
      expect(ro.big).toBe(100n);
      expect(ro.flag).toBe(false);
      expect(ro.opt).toBeNull();
      expect(ro.tag).toBe('AB');
      expect(Array.from(ro.raw)).toEqual([1, 2, 3, 4]);
      expect(Array.from(ro.fixedNums)).toEqual([10, 20, 30]);
      expect(ro.origin.lat).toBe(1.5);

      // 4. Setting same value on primitive field is a true no-op on read-only view
      const noopWrite = produce(ro, (d) => {
        d.id = 1;
        d.tag = 'AB';
      });
      expect(noopWrite).toBe(ro);
    });

    it('supports produce() variable-length, nested arrays, unions, replacement returns, currying, and revocation', () => {
      const EventUnion = defineUnion('ProdEvt', {
        Ping: null,
        Score: u32,
        Msg: str,
      });
      const Item = defineStruct('ProdItem', {
        id: u32,
        label: str,
        note: optStr,
        scores: slice(f32),
        pair: fixedArray(u32, 2),
        evt: EventUnion,
        log: slice(EventUnion),
      });
      const Batch = defineStruct('ProdBatch', {
        title: str,
        items: slice(Item),
        fixedItems: fixedArray(Item, 2),
      });

      const base = Batch.view(
        Batch.pack([
          {
            title: 'v1',
            items: [
              {
                id: 1,
                label: 'first',
                note: null,
                scores: [1.5, 2.5],
                pair: [10, 20],
                evt: { tag: 'Ping' },
                log: [{ tag: 'Score', value: 5 }],
              },
              {
                id: 2,
                label: 'second',
                note: 'old',
                scores: [3.5],
                pair: [30, 40],
                evt: { tag: 'Msg', value: 'hello' },
                log: [],
              },
            ],
            fixedItems: [
              { id: 10, label: 'f0', note: null, scores: [], pair: [1, 2], evt: { tag: 'Ping' }, log: [] },
              { id: 20, label: 'f1', note: 'n1', scores: [9], pair: [3, 4], evt: { tag: 'Score', value: 8 }, log: [] },
            ],
          },
        ]),
      );

      let leakedDraft: any = null;
      let leakedNested: any = null;
      const updated = produce(base, (d) => {
        leakedDraft = d;
        leakedNested = d.items[0];
        d.title = 'v2-longer-utf8-🚀';
        d.items[0].label = 'first-edited';
        d.items[0].note = 'added-note';
        d.items[0].scores.push(4.5, 5.5);
        d.items[0].pair[0] = 111;
        d.items[0].evt = { tag: 'Msg', value: 'upgraded' };
        d.items[0].log.push({ tag: 'Msg', value: 'logged' });
        // Mutating union discriminant 'tag' in-place must throw
        expect(() => { (d.items[1].evt as any).tag = 'Score'; }).toThrow(TypeError);
        // Resizing a fixedArray must throw
        expect(() => { d.fixedItems.push({ id: 30, label: 'x', note: null, scores: [], pair: [0, 0], evt: { tag: 'Ping' }, log: [] }); }).toThrow(TypeError);
        expect(() => { d.fixedItems.length = 3; }).toThrow(TypeError);
        // In-place mutation of fixedArray element works
        d.fixedItems[1].label = 'f1-edited';
        // Array structural operations on slice(struct)
        d.items.push({
          id: 3,
          label: 'third',
          note: null,
          scores: [7],
          pair: [50, 60],
          evt: { tag: 'Score', value: 99 },
          log: [{ tag: 'Ping' }],
        });
        d.items.splice(1, 1); // remove 'second'
      });

      expect(updated.readonly).toBe(true);
      expect(updated.title).toBe('v2-longer-utf8-🚀');
      expect(updated.items.length).toBe(2);
      expect(updated.items.at(0).label).toBe('first-edited');
      expect(updated.items.at(0).note).toBe('added-note');
      expect(Array.from(updated.items.at(0).scores)).toEqual([1.5, 2.5, 4.5, 5.5]);
      expect(Array.from(updated.items.at(0).pair)).toEqual([111, 20]);
      expect(updated.items.at(0).evt).toEqual({ tag: 'Msg', value: 'upgraded' });
      expect(updated.items.at(0).log.toObjects()).toEqual([
        { tag: 'Score', value: 5 },
        { tag: 'Msg', value: 'logged' },
      ]);
      expect(updated.items.at(1).id).toBe(3);
      expect(updated.items.at(1).label).toBe('third');
      expect(updated.fixedItems.at(1).label).toBe('f1-edited');

      // Base remains intact
      expect(base.title).toBe('v1');
      expect(base.items.length).toBe(2);
      expect(base.items.at(1).label).toBe('second');
      expect(base.fixedItems.at(1).label).toBe('f1');

      // Revoked drafts throw on read or write after produce() finishes
      expect(() => leakedDraft.title).toThrow(TypeError);
      expect(() => { leakedDraft.title = 'nope'; }).toThrow(TypeError);
      expect(() => leakedNested.label).toThrow(TypeError);

      // StructArrayView produce(): push, sort, splice, filter-like replacement, and curried producer
      const Row = defineStruct('ProdRow', { id: u32, name: str });
      const rows = Row.array(Row.pack([{ id: 3, name: 'c' }, { id: 1, name: 'a' }, { id: 2, name: 'b' }]));
      const sorted = produce(rows, (d) => {
        d.sort((a, b) => a.id - b.id);
        d.push({ id: 4, name: 'd' });
      });
      expect(sorted.toObjects()).toEqual([
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 3, name: 'c' },
        { id: 4, name: 'd' },
      ]);
      expect(rows.at(0).id).toBe(3);

      // Replacement return values (object, tuple, iterable) and invalid return TypeError
      const replacedSingle = produce(rows.at(0), () => ({ id: 99, name: 'replaced' }));
      expect(replacedSingle.toObject()).toEqual({ id: 99, name: 'replaced' });
      const replacedTuple = produce(rows.at(0), () => [77, 'tuple'] as const);
      expect(replacedTuple.toObject()).toEqual({ id: 77, name: 'tuple' });
      const replacedArr = produce(rows, () => [{ id: 10, name: 'ten' }]);
      expect(replacedArr.toObjects()).toEqual([{ id: 10, name: 'ten' }]);
      expect(() => produce(rows.at(0), () => 123 as any)).toThrow(TypeError);
      expect(() => produce(rows, () => 123 as any)).toThrow(TypeError);
      expect(() => produce({} as any, () => {})).toThrow(TypeError);

      // Curried produce(recipe)
      const bumpId = produce((d: typeof Row.$draft) => {
        d.id += 100;
      });
      const bumped = bumpId(rows.at(1));
      expect(bumped.id).toBe(101);
      expect(bumped.name).toBe('a');
      expect(rows.at(1).id).toBe(1);

      // Subarray produce() returns a clean standalone view containing only the slice
      const sub = rows.subarray(1, 2);
      const subNoop = produce(sub, () => {});
      expect(subNoop).toBe(sub);
      const subMut = produce(sub, (d) => {
        d[0].id = 55;
      });
      expect(subMut.length).toBe(1);
      expect(subMut.at(0).toObject()).toEqual({ id: 55, name: 'a' });
      expect(rows.at(1).id).toBe(1);
      const mutSub = Row.mutArray(Row.pack([{ id: 1, name: 'x' }, { id: 2, name: 'y' }])).subarray(1, 2);
      const mutSubSnap = produce(mutSub, () => {});
      expect(mutSubSnap.readonly).toBe(true);
      expect(mutSubSnap.length).toBe(1);
      expect(mutSubSnap.at(0).toObject()).toEqual({ id: 2, name: 'y' });
    });

    it('preserves cyclic/diamond ref graphs, CS01 envelopes, and schema-evolved views across produce()', () => {
      // 1. Cyclic & diamond ref graph preservation
      const Node = defineStruct('ProdNode', (self) => ({
        id: u32,
        name: str,
        left: ref(self),
        right: ref(self),
      }));
      const sharedLeaf = Node.item({ id: 3, name: 'shared', left: null, right: null });
      const rootItem = Node.item({ id: 1, name: 'root', left: sharedLeaf, right: sharedLeaf });
      sharedLeaf.left = rootItem; // cycle + diamond
      const graphView = Node.view(Node.pack([rootItem]));

      const graphNext = produce(graphView, (d) => {
        d.left!.name = 'shared-updated';
        d.name = 'root-updated';
      });
      expect(graphNext.name).toBe('root-updated');
      expect(graphNext.left?.name).toBe('shared-updated');
      expect(graphNext.right?.name).toBe('shared-updated');
      expect(graphNext.left?.left?.name).toBe('root-updated');
      expect(graphView.left?.name).toBe('shared');

      // Nulling out a ref
      const graphCut = produce(graphView, (d) => {
        d.right = null;
      });
      expect(graphCut.right).toBeNull();
      expect(graphCut.left?.name).toBe('shared');

      // 2. CS01 envelope round-trip for both fast-path fixed edits and variable-length edits
      const EnvDoc = defineStruct('ProdEnvDoc', { ver: u32, title: str });
      const envBytes = EnvDoc.packEnvelope({ ver: 1, title: 'orig' });
      const envView = EnvDoc.viewEnvelope(envBytes);

      const envFast = produce(envView, (d) => {
        d.ver = 2;
      });
      expect(envFast.ver).toBe(2);
      expect(envFast.title).toBe('orig');
      expect(EnvDoc.viewEnvelope(envFast.bytes).toObject()).toEqual({ ver: 2, title: 'orig' });

      const envVar = produce(envView, (d) => {
        d.title = 'envelope-repacked-longer';
      });
      expect(envVar.ver).toBe(1);
      expect(envVar.title).toBe('envelope-repacked-longer');
      expect(EnvDoc.viewEnvelope(envVar.bytes).toObject()).toEqual({ ver: 1, title: 'envelope-repacked-longer' });

      // 3. Schema evolution (V1 bytes viewed as V2) through produce()
      const V1 = defineStruct('ProdV1', { x: f64 });
      const V2 = defineStruct('ProdV2', { x: f64, y: f64, label: str });
      const v1Bytes = V1.pack([{ x: 1.25 }, { x: 2.5 }]);
      const v2View = V2.array(v1Bytes, V1);
      const v2Next = produce(v2View, (d) => {
        d[0].y = 9.5;
        d[1].label = 'evolved';
      });
      expect(v2Next.toObjects()).toEqual([
        { x: 1.25, y: 9.5, label: '' },
        { x: 2.5, y: 0, label: 'evolved' },
      ]);
      expect(v2View.at(0).y).toBe(0);
      expect(v2View.at(1).label).toBe('');
    });

    it('handles aligned and unaligned byteOffset reads and SWAR/SIMD UTF-8 decode boundaries cleanly', () => {
      const Rec = defineStruct('AlignUtf8', {
        a: u32,
        b: i32,
        c: f32,
        d: u64,
        e: f64,
        s: str,
      });

      const strings = [
        '',
        'short',
        '15-char-ascii!!',
        '16-char-ascii!!!',
        '32-character-pure-ascii-string!!',
        '48-character-pure-ascii-string-for-swar-boundary',
        '49-character-pure-ascii-string-exceeding-boundary',
        'ascii-prefix-then-é-in-middle-of-32-bytes',
        '🚀 emoji at start then ascii padding beyond sixteen bytes',
        'prefix-longer-than-16-bytes-then-東京-日本語-🚀',
      ];
      const packed = Rec.pack(
        strings.map((s, i) => ({
          a: 0x80000000 + i,
          b: -1000 - i,
          c: i * 0.5,
          d: BigInt(i) * 1_000_000_000_000n,
          e: i * 1.25,
          s,
        })),
      );

      // Test byte offsets 0, 1, 2, 3 (aligned and all unaligned mod-4 offsets)
      for (const offset of [0, 1, 2, 3]) {
        const padded = new Uint8Array(packed.byteLength + offset + 4);
        padded.set(packed, offset);
        const view = Rec.array(padded.subarray(offset, offset + packed.byteLength));
        expect(view.length).toBe(strings.length);
        for (let i = 0; i < strings.length; i++) {
          const row = view.at(i);
          expect(row.a).toBe(0x80000000 + i);
          expect(row.b).toBe(-1000 - i);
          expect(row.c).toBe(i * 0.5);
          expect(row.d).toBe(BigInt(i) * 1_000_000_000_000n);
          expect(row.e).toBe(i * 1.25);
          expect(row.s).toBe(strings[i]);
        }
        // produce() works on unaligned views too
        const edited = produce(view, (d) => {
          d[0].a = 123456;
        });
        expect(edited.at(0).a).toBe(123456);
        expect(edited.at(strings.length - 1).s).toBe(strings[strings.length - 1]);
      }
    });
  });
});
