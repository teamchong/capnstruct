import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  Arena,
  array,
  bool,
  concatBytes,
  defineStruct,
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
  list,
  nullable,
  pack,
  ref,
  scaled,
  sentinel,
  slice,
  str,
  struct,
  structView,
  toGoStruct,
  toRustReprC,
  u8,
  u16,
  u32,
  u64,
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
      const view = structView(Entity, rawBuf, 1);
      view.tag = 7;
      view.setAll({
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
      const alignedView = Entity.view(rawBuf, 8);
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

      // Supports in-place assignment to variable-length field when new UTF-8 string fits in existing slot
      const prevByteLen = rows.bytes.byteLength;
      r0.callsign = 'NEW';
      expect(r0.callsign).toBe('NEW');
      expect(rows.bytes.byteLength).toBe(prevByteLen);
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
      const rawSamples = SpdSample.array(rawShard);
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
        const RingNode: any = defineStruct('RingNode', {
          id: u32,
          weight: f64,
          label: str,
          next: ref(() => RingNode),
        });
        const wasmGoCode =
          toGoStruct([SpdSample, RingNode], { wasm: true }) +
          `\n//go:wasmexport sum_ring\nfunc sum_ring(ptr uintptr, byteLen uint32, count uint32) float64 {\n\tb := CapnBytes(ptr, byteLen)\n\tnodes := CapnSliceView[RingNode](b, count)\n\tcur := &nodes[0]\n\tvar total float64\n\tfor i := uint32(0); i < count && cur != nil; i++ {\n\t\ttotal += cur.Weight + float64(len(cur.Label.String(b)))\n\t\tcur = cur.Next.Ptr(b)\n\t}\n\treturn total\n}\n\nfunc main() {}\n`;
        expect(wasmGoCode).toContain('package main');
        expect(wasmGoCode).toContain('//go:wasmexport capn_alloc');
        expect(wasmGoCode).toContain('//go:wasmexport capn_reset');

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
          return inst.exports as Record<string, any>;
        };

        const n1: any = { id: 1, weight: 10.5, label: 'alpha', next: null };
        const n2: any = { id: 2, weight: 20.25, label: 'beta', next: n1 };
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
      const users = User.array(packed);
      const initialBuf = users.buffer;
      const initialTailLen = packed.byteLength;

      // 1. Shorter in-place overwrite: reuses existing byte range, 0 buffer growth
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
      const v2Arr = PointV2.array(v1Bytes, PointV1);
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
      const bView = Bundle.view(packed);
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
      const GraphNode: any = defineStruct('GraphNode', {
        id: u32,
        label: str,
        next: ref(() => GraphNode),
        prev: ref(() => GraphNode),
      });

      // Build a circular doubly-linked list + self-referential node in JS
      const n1: any = { id: 1, label: 'alpha', next: null, prev: null };
      const n2: any = { id: 2, label: 'beta', next: null, prev: n1 };
      n1.next = n2;
      n2.next = n1; // cycle: n1 <-> n2
      n1.prev = n2;

      // JSON.stringify crashes on circular references, while capnstruct packs them into a flat Uint8Array!
      expect(() => JSON.stringify(n1)).toThrow(TypeError);

      const packed = GraphNode.pack([n1, n2]);
      const table = GraphNode.array(packed);
      expect(table.length).toBe(2);

      // Zero-copy O(1) cyclic traversal across arbitrary depth without allocating JS objects
      const v0 = table.at(0);
      expect(v0.id).toBe(1);
      expect(v0.next.id).toBe(2);
      expect(v0.next.label).toBe('beta');
      expect(v0.next.next.id).toBe(1);
      expect(v0.next.next.prev.id).toBe(2);
      expect(v0.prev.prev.id).toBe(1);

      // .toObject() and .toObjects() reconstruct the exact circular JS object graph without infinite recursion
      const materialized = v0.toObject();
      expect(materialized.id).toBe(1);
      expect(materialized.next.id).toBe(2);
      expect(materialized.next.next).toBe(materialized);
      expect(materialized.prev).toBe(materialized.next);

      const allObjs = table.toObjects();
      expect(allObjs[0].next).toBe(allObjs[1]);
      expect(allObjs[1].next).toBe(allObjs[0]);

      // Single-struct create() with a self-cycle (self.next = self) and tail-allocated cycle
      const selfNode: any = { id: 99, label: 'self-loop', prev: null };
      selfNode.next = selfNode;
      const sv = GraphNode.create(selfNode);
      expect(sv.next.next.next.id).toBe(99);
      const svObj = sv.toObject();
      expect(svObj.next).toBe(svObj);

      // O(1) zero-copy pointer relinking between existing StructViews in the same buffer
      v0.next = v0;
      expect(v0.next.id).toBe(1);
      v0.next = null;
      expect(v0.next).toBeNull();
    });

    it('supports parent/child cycles and mutually recursive schemas across ref() and slice()', () => {
      const TreeNode: any = defineStruct('TreeNode', {
        id: u32,
        parent: ref(() => TreeNode),
        children: slice(() => TreeNode),
      });

      const root: any = { id: 10, parent: null, children: [] };
      const childA: any = { id: 20, parent: root, children: [] };
      const childB: any = { id: 30, parent: root, children: [root] }; // childB.children points back to root!
      root.children = [childA, childB];

      const bytes = TreeNode.pack([root]);
      const view = TreeNode.view(bytes);

      expect(view.id).toBe(10);
      expect(view.children.length).toBe(2);
      expect(view.children.at(0).id).toBe(20);
      expect(view.children.at(0).parent.id).toBe(10);
      expect(view.children.at(1).id).toBe(30);
      expect(view.children.at(1).parent.children.at(0).id).toBe(20);
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
  });
});
