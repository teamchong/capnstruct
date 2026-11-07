import {
  type CCodegenOptions,
  type RustCodegenOptions,
  type SchemaCollection,
  type WgslCodegenOptions,
  generateC,
  generateRust,
  generateWgsl,
  toCHeader,
  toRustReprC,
  toWgsl,
} from './codegen.js';

export {
  generateC,
  generateRust,
  generateWgsl,
  toCHeader,
  toRustReprC,
  toWgsl,
  type CCodegenOptions,
  type RustCodegenOptions,
  type SchemaCollection,
  type WgslCodegenOptions,
};

export type PrimitiveName =
  | 'u8'
  | 'i8'
  | 'u16'
  | 'i16'
  | 'u32'
  | 'i32'
  | 'u64'
  | 'i64'
  | 'f16'
  | 'f32'
  | 'f64'
  | 'bool';

export interface TypedArrayConstructor {
  new (buffer: ArrayBufferLike, byteOffset?: number, length?: number): ArrayBufferView &
    Record<number, number | bigint | boolean>;
  new (length: number): ArrayBufferView & Record<number, number | bigint | boolean>;
}

export interface PrimitiveDesc<T extends PrimitiveName = PrimitiveName> {
  readonly kind: 'primitive';
  readonly type: T;
  readonly rustType: string;
  readonly size: number;
  readonly align: number;
  readonly signed: boolean;
  readonly float: boolean;
  readonly bigint: boolean;
  /** @internal */
  readonly _C: TypedArrayConstructor;
  /** @internal */
  readonly _g: (dv: DataView, off: number) => number | bigint | boolean;
  /** @internal */
  readonly _s: (dv: DataView, off: number, val: number | bigint | boolean) => void;
}

export interface NullablePrimitiveDesc<T extends PrimitiveName = PrimitiveName> {
  readonly kind: 'primitive';
  readonly type: T;
  readonly rustType: string;
  readonly size: number;
  readonly align: number;
  readonly signed: boolean;
  readonly float: boolean;
  readonly bigint: boolean;
  readonly nullable: true;
  /** @internal */
  readonly _null: number | bigint | boolean;
  /** @internal */
  readonly _C: undefined;
  /** @internal */
  readonly _g: (dv: DataView, off: number) => PrimitiveTsType<T> | null;
  /** @internal */
  readonly _s: (dv: DataView, off: number, val: PrimitiveInputType<T> | null | undefined) => void;
}

export interface FixedStrDesc<N extends number = number> {
  readonly kind: 'primitive';
  readonly type: 'fixedStr';
  readonly length: N;
  readonly size: N;
  readonly align: 1;
  readonly rustType: string;
  /** @internal */
  readonly _C: undefined;
  /** @internal */
  readonly _g: (dv: DataView, off: number) => string;
  /** @internal */
  readonly _s: (dv: DataView, off: number, val: string) => void;
}

export interface FixedBytesDesc<N extends number = number> {
  readonly kind: 'primitive';
  readonly type: 'fixedBytes';
  readonly length: N;
  readonly size: N;
  readonly align: 1;
  readonly rustType: string;
  /** @internal */
  readonly _C: undefined;
  /** @internal */
  readonly _g: (dv: DataView, off: number) => Uint8Array;
  /** @internal */
  readonly _s: (dv: DataView, off: number, val: ArrayLike<number> | Iterable<number>) => void;
}

export interface StrDesc {
  readonly kind: 'str';
  readonly size: 8;
  readonly align: 4;
  readonly rustType: 'CapnStr';
}

export interface ArrayDesc<E extends FieldDesc = FieldDesc, N extends number = number> {
  readonly kind: 'array';
  readonly element: E;
  readonly length: N;
  readonly size: number;
  readonly align: number;
  readonly rustType: string;
}

export interface SliceDesc<E extends FieldDesc = FieldDesc> {
  readonly kind: 'slice';
  readonly element: E;
  readonly size: 8;
  readonly align: 4;
  readonly rustType: string;
}

export interface StructDefLike<F extends FieldRecord = FieldRecord> {
  readonly kind: 'struct';
  readonly name: string;
  readonly rustType: string;
  readonly size: number;
  readonly stride: number;
  readonly align: number;
  readonly schema: F;
  readonly fields: { readonly [K in keyof F]: FieldLayout<F[K]> };
  readonly fieldList: readonly FieldLayout[];
  /** @internal */
  readonly _fv: number;
  /** @internal */
  readonly _V: new (
    dv: DataView,
    base: number,
    off: number,
    mem: WebAssembly.Memory | WasmArena | null,
  ) => InternalStructView;
}

export type FieldDesc =
  | PrimitiveDesc
  | NullablePrimitiveDesc
  | FixedStrDesc
  | FixedBytesDesc
  | StrDesc
  | ArrayDesc
  | SliceDesc
  | StructDefLike;

export type FieldRecord = Record<string, FieldDesc>;

export type PrimitiveTsType<T extends PrimitiveName> = T extends 'u64' | 'i64'
  ? bigint
  : T extends 'bool'
    ? boolean
    : number;

export type PrimitiveInputType<T extends PrimitiveName> = T extends 'u64' | 'i64'
  ? bigint | number
  : T extends 'bool'
    ? boolean | number
    : number;

export type TypedArrayFor<T extends PrimitiveName> = T extends 'u8'
  ? Uint8Array
  : T extends 'i8'
    ? Int8Array
    : T extends 'u16'
      ? Uint16Array
      : T extends 'i16'
        ? Int16Array
        : T extends 'f16'
          ? Uint16Array
          : T extends 'u32'
            ? Uint32Array
            : T extends 'i32'
              ? Int32Array
              : T extends 'u64'
                ? BigUint64Array
                : T extends 'i64'
                  ? BigInt64Array
                  : T extends 'f32'
                    ? Float32Array
                    : T extends 'f64'
                      ? Float64Array
                      : boolean[];

export type FieldValue<D extends FieldDesc = FieldDesc> =
  D extends NullablePrimitiveDesc<infer P>
    ? PrimitiveTsType<P> | null
    : D extends PrimitiveDesc<infer P>
      ? PrimitiveTsType<P>
      : D extends StrDesc | FixedStrDesc
        ? string
        : D extends FixedBytesDesc
          ? Uint8Array
          : D extends ArrayDesc<infer E, number>
            ? E extends PrimitiveDesc<infer P>
              ? TypedArrayFor<P>
              : E extends StructDefLike<infer SF>
                ? StructArrayView<SF>
                : PlainFieldValue<E>[]
            : D extends SliceDesc<infer E>
              ? E extends PrimitiveDesc<infer P>
                ? TypedArrayFor<P>
                : E extends StructDefLike<infer SF>
                  ? StructArrayView<SF>
                  : PlainFieldValue<E>[]
              : D extends StructDefLike<infer SF>
                ? StructView<SF>
                : never;

export type FieldInput<D extends FieldDesc> =
  D extends NullablePrimitiveDesc<infer P>
    ? PrimitiveInputType<P> | null | undefined
    : D extends PrimitiveDesc<infer P>
      ? PrimitiveInputType<P>
      : D extends StrDesc | FixedStrDesc
        ? string
        : D extends FixedBytesDesc
          ? ArrayLike<number> | Iterable<number>
          : D extends ArrayDesc<infer E, number>
            ? E extends PrimitiveDesc<infer P>
              ? ArrayLike<PrimitiveInputType<P>> | Iterable<PrimitiveInputType<P>>
              : E extends StructDefLike<infer SF>
                ?
                    | ArrayLike<Partial<StructInput<SF>> | StructView<SF>>
                    | Iterable<Partial<StructInput<SF>> | StructView<SF>>
                    | StructArrayView<SF>
                : ArrayLike<FieldInput<E>> | Iterable<FieldInput<E>>
            : D extends SliceDesc<infer E>
              ? E extends PrimitiveDesc<infer P>
                ? ArrayLike<PrimitiveInputType<P>> | Iterable<PrimitiveInputType<P>>
                : E extends StructDefLike<infer SF>
                  ?
                      | ArrayLike<Partial<StructInput<SF>> | StructView<SF>>
                      | Iterable<Partial<StructInput<SF>> | StructView<SF>>
                      | StructArrayView<SF>
                  : ArrayLike<FieldInput<E>> | Iterable<FieldInput<E>>
              : D extends StructDefLike<infer SF>
                ? Partial<StructInput<SF>> | StructView<SF>
                : never;

export type StructValues<F extends FieldRecord> = {
  [K in keyof F]: FieldValue<F[K]>;
};

export type StructInput<F extends FieldRecord> = {
  [K in keyof F]: FieldInput<F[K]>;
};

export type PlainFieldValue<D extends FieldDesc> =
  D extends NullablePrimitiveDesc<infer P>
    ? PrimitiveTsType<P> | null
    : D extends PrimitiveDesc<infer P>
      ? PrimitiveTsType<P>
      : D extends StrDesc | FixedStrDesc
        ? string
        : D extends FixedBytesDesc
          ? number[]
          : D extends ArrayDesc<infer E, number>
            ? PlainFieldValue<E>[]
            : D extends SliceDesc<infer E>
              ? PlainFieldValue<E>[]
              : D extends StructDefLike<infer SF>
                ? PlainStructValues<SF>
                : never;

/** Plain JavaScript object representation of a struct schema `F`. */
export type PlainStructValues<F extends FieldRecord> = {
  [K in keyof F]: PlainFieldValue<F[K]>;
};

/** Infers the zero-copy `StructView` type from a `StructDef`. */
export type InferView<S extends StructDefLike<any>> =
  S extends StructDefLike<infer F> ? StructView<F> : never;

/** Infers the plain JavaScript object type (`toObject()`) from a `StructDef`. */
export type InferPlain<S extends StructDefLike<any>> =
  S extends StructDefLike<infer F> ? PlainStructValues<F> : never;

/** Infers the input object type accepted by `pack()`, `create()`, and `push()` from a `StructDef`. */
export type InferInput<S extends StructDefLike<any>> =
  S extends StructDefLike<infer F> ? Partial<StructInput<F>> : never;

/** Computed byte offset, size, and alignment of a single struct field. */
export interface FieldLayout<D extends FieldDesc = FieldDesc> {
  readonly name: string;
  readonly desc: D;
  readonly offset: number;
  readonly size: number;
  readonly align: number;
}

/** Union of field keys in `F` whose descriptor is a fixed-width numeric/boolean primitive (`u8`..`f64`, `bool`). */
export type PrimitiveFieldKeys<F extends FieldRecord> = {
  [K in keyof F]: F[K] extends PrimitiveDesc<any> ? K : never;
}[keyof F];
 /** Options for wrapping a binary buffer in a `StructView` or `StructArrayView`. */
 export interface ViewOptions {
   /** Byte offset where the struct or struct table begins. */
   byteOffset?: number;
   /** Base byte offset from which relative tail pointers (`str` / `slice`) are resolved. */
   baseOffset?: number;
   /** Explicit number of rows when wrapping a `StructArrayView`. */
   count?: number;
   /** Wire byte stride per struct (used for forward/backward schema evolution). */
   stride?: number;
 }

/** Supported binary backing sources (`Uint8Array`, `ArrayBuffer`, `DataView`, `WebAssembly.Memory`, `WasmArena`). */
export type BufferSourceInput =
  | ArrayBufferLike
  | ArrayBufferView
  | WebAssembly.Memory
  | WasmArena;
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();
const oob = (): never => {
  throw new RangeError('Out of bounds');
};
const al = (x: number, a: number): number => (x + a - 1) & ~(a - 1);
const u8s = (d: ArrayBufferView, o = 0, l = d.byteLength - o): Uint8Array =>
  new Uint8Array(d.buffer, d.byteOffset + o, l);
const N = Number;
const chkLen = (n: number): void => {
  if (!N.isInteger(n) || n < 0) oob();
};
let sBuf = new ArrayBuffer(65536),
  sDv = new DataView(sBuf),
  sU8 = new Uint8Array(sBuf),
  tail = 0;
function hid(value?: unknown): PropertyDescriptor {
  return { value, writable: true, enumerable: false, configurable: true };
}
const BASE_DESCS: PropertyDescriptorMap = Object.fromEntries(
  ['_d', '_o', '_b', '_m', '_a', '_ws', '_tl', '_dead', '_dirty'].map((k) => [k, hid()]),
);
function prim<T extends PrimitiveName>(
  type: T,
  _C: TypedArrayConstructor,
  _g: (dv: DataView, off: number) => number | bigint | boolean,
  _s: (dv: DataView, off: number, val: number | bigint | boolean) => void,
): PrimitiveDesc<T> {
  const c = type[0],
    size = (+type.slice(1) || 8) >> 3,
    float = c === 'f';
  return {
    kind: 'primitive',
    type,
    rustType: (type === 'f16' ? 'u16' : type) as any,
    size,
    align: size,
    signed: c === 'i' || float,
    float,
    bigint: size === 8 && !float,
    _C,
    _g,
    _s,
  };
}
/** Unsigned 8-bit integer (`0..255`, 1 byte, 1-byte aligned). */
export const u8: PrimitiveDesc<'u8'> = prim('u8', Uint8Array, (d, o) => d.getUint8(o), (d, o, v) => d.setUint8(o, N(v)));
/** Signed 8-bit integer (`-128..127`, 1 byte, 1-byte aligned). */
export const i8: PrimitiveDesc<'i8'> = prim('i8', Int8Array, (d, o) => d.getInt8(o), (d, o, v) => d.setInt8(o, N(v)));
/** Little-endian unsigned 16-bit integer (`0..65535`, 2 bytes, 2-byte aligned). */
export const u16: PrimitiveDesc<'u16'> = prim('u16', Uint16Array, (d, o) => d.getUint16(o, true), (d, o, v) => d.setUint16(o, N(v), true));
/** Little-endian signed 16-bit integer (`-32768..32767`, 2 bytes, 2-byte aligned). */
export const i16: PrimitiveDesc<'i16'> = prim('i16', Int16Array, (d, o) => d.getInt16(o, true), (d, o, v) => d.setInt16(o, N(v), true));
/** Little-endian unsigned 32-bit integer (4 bytes, 4-byte aligned). */
export const u32: PrimitiveDesc<'u32'> = prim('u32', Uint32Array, (d, o) => d.getUint32(o, true), (d, o, v) => d.setUint32(o, N(v), true));
/** Little-endian signed 32-bit integer (4 bytes, 4-byte aligned). */
export const i32: PrimitiveDesc<'i32'> = prim('i32', Int32Array, (d, o) => d.getInt32(o, true), (d, o, v) => d.setInt32(o, N(v), true));
/** Little-endian unsigned 64-bit integer (`bigint`, 8 bytes, 8-byte aligned). */
export const u64: PrimitiveDesc<'u64'> = prim('u64', BigUint64Array, (d, o) => d.getBigUint64(o, true), (d, o, v) => d.setBigUint64(o, BigInt(v), true));
/** Little-endian signed 64-bit integer (`bigint`, 8 bytes, 8-byte aligned). */
export const i64: PrimitiveDesc<'i64'> = prim('i64', BigInt64Array, (d, o) => d.getBigInt64(o, true), (d, o, v) => d.setBigInt64(o, BigInt(v), true));
/** IEEE 754 16-bit half-precision float (2 bytes, 2-byte aligned). */
export const f16: PrimitiveDesc<'f16'> = /* @__PURE__ */ (() =>
  prim(
    'f16',
    (globalThis as any).Float16Array ?? Uint16Array,
    (d, o) => (d as any).getFloat16(o, true),
    (d, o, v) => (d as any).setFloat16(o, N(v), true),
  ))();
/** IEEE 754 32-bit float (4 bytes, 4-byte aligned). */
export const f32: PrimitiveDesc<'f32'> = prim('f32', Float32Array, (d, o) => d.getFloat32(o, true), (d, o, v) => d.setFloat32(o, N(v), true));
/** IEEE 754 64-bit float (8 bytes, 8-byte aligned). */
export const f64: PrimitiveDesc<'f64'> = prim('f64', Float64Array, (d, o) => d.getFloat64(o, true), (d, o, v) => d.setFloat64(o, N(v), true));
/** 1-byte boolean (`0` or `1`, 1-byte aligned). */
export const bool: PrimitiveDesc<'bool'> = prim(
  'bool',
  Uint8Array,
  (d, o) => d.getUint8(o) !== 0,
  (d, o, v) => d.setUint8(o, v ? 1 : 0),
);

/** Inline fixed-length null-padded UTF-8 string `[u8; N]` (`align: 1, size: length`) with zero tail indirection. */
export function fixedStr<N extends number>(length: N): FixedStrDesc<N> {
  chkLen(length);
  return {
    kind: 'primitive',
    type: 'fixedStr',
    length,
    size: length,
    align: 1,
    rustType: `[u8; ${length}]`,
    _C: undefined,
    _g(d, o) {
      let end = 0,
        s: string | null = '';
      for (; end < length; end++) {
        const c = d.getUint8(o + end);
        if (!c) break;
        if (c < 0x80 && s !== null) s += String.fromCharCode(c);
        else s = null;
      }
      return s !== null ? s : textDecoder.decode(u8s(d, o, end));
    },
    _s(d, o, v) {
      const u = u8s(d, o, length),
        w = v ? textEncoder.encodeInto(String(v), u).written : 0;
      if (w < length) u.fill(0, w);
    },
  };
}

/** Inline fixed-length byte array `[u8; N]` (`align: 1, size: length`) read as a zero-copy `Uint8Array`. */
export function fixedBytes<N extends number>(length: N): FixedBytesDesc<N> {
  chkLen(length);
  return {
    kind: 'primitive',
    type: 'fixedBytes',
    length,
    size: length,
    align: 1,
    rustType: `[u8; ${length}]`,
    _C: undefined,
    _g: (d, o) => u8s(d, o, length),
    _s(d, o, v) {
      const u = u8s(d, o, length);
      u.fill(0);
      if (v) {
        u.set(
          ArrayBuffer.isView(v)
            ? u8s(v, 0, Math.min(v.byteLength, length))
            : Array.from(v as Iterable<number>).slice(0, length),
        );
      }
    },
  };
}
/** Maps an inline sentinel value (e.g. `-32768` for `i16` or `NaN` for `f32`) to `null` in JS with 0 extra wire bytes. */
export function sentinel<P extends PrimitiveDesc<any>>(
  primDesc: P,
  nullValue: PrimitiveTsType<P['type']>,
): NullablePrimitiveDesc<P['type']> {
  const isNan = typeof nullValue === 'number' && Number.isNaN(nullValue);
  return {
    ...primDesc,
    nullable: true,
    _null: nullValue,
    _C: undefined,
    _g: (d, o) => {
      const v = primDesc._g(d, o) as PrimitiveTsType<P['type']>;
      return (isNan ? Number.isNaN(v as number) : v === nullValue) ? null : v;
    },
    _s: (d, o, v) => primDesc._s(d, o, (v == null ? nullValue : v) as number | bigint | boolean),
  };
}
/** Alias for `sentinel(primDesc, nullValue)`. */
export const nullable = sentinel;

/** Fixed-point scaled primitive (stores `Math.round(val * factor)` in `primDesc`, reads `raw / factor`). */
export function scaled<P extends PrimitiveDesc<any>>(
  primDesc: P,
  factor: number,
  nullOpt: { null: number },
): NullablePrimitiveDesc<'f64'>;
export function scaled<P extends PrimitiveDesc<any>>(
  primDesc: P,
  factor: number,
  nullOpt?: { null?: number },
): PrimitiveDesc<'f64'> | NullablePrimitiveDesc<'f64'>;
export function scaled<P extends PrimitiveDesc<any>>(
  primDesc: P,
  factor: number,
  nullOpt?: { null?: number },
): PrimitiveDesc<'f64'> | NullablePrimitiveDesc<'f64'> {
  const nv = typeof nullOpt === 'number' ? nullOpt : nullOpt?.null,
    hasN = nv !== undefined;
  return {
    ...primDesc,
    type: 'f64',
    float: true,
    nullable: hasN as true,
    _null: nv as number,
    _C: undefined as unknown as TypedArrayConstructor,
    _g: (d: DataView, o: number) => {
      const r = primDesc._g(d, o) as number;
      return hasN && r === nv ? null : r / factor;
    },
    _s: (d: DataView, o: number, v: number | bigint | boolean | null | undefined) =>
      primDesc._s(d, o, v == null && hasN ? nv : Math.round(+N(v) * factor)),
  };
}

/** Variable-length UTF-8 string stored in the tail arena via an 8-byte `[u32 off, u32 len]` descriptor. */
export const str: StrDesc = {
  kind: 'str',
  size: 8,
  align: 4,
  rustType: 'CapnStr',
};
export function fixedArray<E extends FieldDesc, N extends number>(
  element: E,
  length: N,
): ArrayDesc<E, N> {
  chkLen(length);
  return {
    kind: 'array',
    element,
    length,
    size: element.size * length,
    align: element.align,
    rustType: `[${element.rustType}; ${length}]`,
  };
}

/** Alias for `fixedArray(element, length)`. */
export const array = fixedArray;

/** Variable-length slice `CapnSlice<T>` stored in the tail arena via an 8-byte `[u32 off, u32 len]` descriptor. */
export function slice<E extends FieldDesc>(element: E): SliceDesc<E> {
  return {
    kind: 'slice',
    element,
    size: 8,
    align: 4,
    rustType: `CapnSlice<${element.rustType}>`,
  };
}

/** Alias for `slice(element)`. */
export const list = slice;

function ensureScratch(minBytes: number): void {
  if (minBytes > sBuf.byteLength) {
    const nb = new ArrayBuffer(Math.max(minBytes, sBuf.byteLength * 2));
    sDv = new DataView((sBuf = nb));
    const nu = new Uint8Array(nb);
    nu.set(sU8);
    sU8 = nu;
  }
}
interface InternalStructView {
  readonly def: StructDefLike;
  _d: DataView;
  _b: number;
  _o: number;
  _ws: number;
  _tl?: number;
  _dead?: number;
  _dirty?: boolean;
  _m: WebAssembly.Memory | WasmArena | null;
  _k(): DataView;
  readonly bytes: Uint8Array;
}

function isWasmMemory(x: unknown): x is WebAssembly.Memory {
  return typeof WebAssembly !== 'undefined' && x instanceof WebAssembly.Memory;
}

interface ResolvedSource {
  d: DataView;
  o: number;
  max: number;
  m: WebAssembly.Memory | WasmArena | null;
}

function isMemOrArena(x: unknown): x is WebAssembly.Memory | WasmArena {
  return (typeof x === 'object' && x !== null && '_u8' in x) || isWasmMemory(x);
}
function resolveSource(s: BufferSourceInput, byteOffset = 0): ResolvedSource {
  const v = ArrayBuffer.isView(s);
  const m = isMemOrArena(s) ? s : null;
  const b = v ? s.buffer : m ? m.buffer : (s as unknown as ArrayBufferLike);
  const len = v ? s.byteLength : b.byteLength;
  if (byteOffset < 0 || byteOffset > len) oob();
  return {
    d:
      s instanceof DataView
        ? s
        : v
          ? new DataView(b, s.byteOffset, len)
          : m && '_d' in m
            ? m.sync()._d
            : new DataView(b),
    o: byteOffset,
    max: len - byteOffset,
    m,
  };
}

function defVal(desc: FieldDesc, plain: boolean): unknown {
  const d = new DataView(new ArrayBuffer(desc.size));
  return readVal({ def: desc as any, _d: d, _b: 0, _o: 0, _ws: desc.size, _m: null, _k: () => d } as any, desc, 0, plain);
}

function allocTail(v: any, bytes: number, align: number): number {
  const root = v._a ?? v,
    m = root._m;
  if (m && '_u8' in m) {
    const p = m._alloc(bytes, align, true);
    if (root._tl !== undefined && m.offset > root._tl) root._tl = m.offset;
    v._d = root._d = m._d;
    return p;
  }
  const d = root._k(),
    cur = root._tl ?? root._o + root.byteLength,
    p = al(cur, align),
    end = p + bytes;
  if (end > d.byteLength) {
    if (m) {
      m.grow(Math.ceil((end - d.byteLength) / 65536));
        root._d = new DataView(m.buffer);
      } else {
        const nb = new ArrayBuffer(Math.max(end, d.byteLength * 2, 64));
        new Uint8Array(nb).set(u8s(d, 0, cur));
        root._d = new DataView(nb);
      }
    v._d = root._d;
    if (root._c) root._c._d = root._d;
    if (root._p) for (const pv of root._p) if (pv) pv._d = root._d;
  } else if (bytes) {
    u8s(d, p, bytes).fill(0);
  }
  root._tl = end;
  return p;
}

function mutVar(
  v: InternalStructView,
  off: number,
  base: number,
  count: number,
  elSize: number,
  align: number,
): number {
  const root: any = (v as any)._a ?? v;
  let d = v._k();
  const oldP = d.getUint32(off, true),
    oldB = d.getUint32(off + 4, true) * elSize,
    bytes = count * elSize,
    cur = root._tl ?? root._o + root.byteLength;
  let st = base + oldP;
  const atTip = oldB > 0 && st + oldB === cur;
  if (bytes <= oldB) {
    if (oldB > bytes) {
      if (atTip && !root._m) root._tl = st + bytes;
      else root._dead = (root._dead ?? 0) + (oldB - bytes);
    }
  } else {
    if (atTip) {
      root._tl = st;
      if (root._m && '_u8' in root._m && root._m.offset === cur) root._m.offset = st;
    } else if (oldB) {
      root._dead = (root._dead ?? 0) + oldB;
    }
    st = allocTail(root, bytes, align);
    d = v._d = root._d;
  }
  if (root.def && off === root._b + root.def._fv && st - base !== oldP) root._dirty = true;
  if (bytes) u8s(d, st, bytes).fill(0);
  setDesc(off, count ? st - base : 0, count, d);
  return st;
}

function upgradeView(v: any): void {
  if (v._ws < v.def.size) (v._a ?? v).compact();
}

let _budget = 0;

function readVal(
  v: InternalStructView,
  desc: FieldDesc,
  off: number,
  plain: boolean,
  len?: number,
): unknown {
  const d = v._k(),
    k = desc.kind;
  if (len !== undefined) {
    const sz = desc.size,
      tot = d.byteOffset + off;
    if (!plain && k === 'primitive' && desc._C && desc.type !== 'bool' && tot % sz === 0) {
      return new desc._C(d.buffer, tot, len);
    }
    if (!plain && k === 'struct') {
      const sav = new StructArrayView(desc, d, off, len, v._b);
      sav._m = v._m;
      (sav as any)._a = (v as any)._a ?? v;
      return sav;
    }
    if (plain && (_budget -= len * sz) < 0) oob();
    return Array.from({ length: len }, (_, i) =>
      readVal(v, desc, off + i * sz, plain),
    );
  }
  if (k === 'primitive') {
    const r = desc._g(d, off);
    return plain && r instanceof Uint8Array ? Array.from(r) : r;
  }
  const minP = v._o === v._b ? v._o + v._ws : v._b;
  if (k === 'str') {
    const p = v._b + d.getUint32(off, true),
      l = d.getUint32(off + 4, true);
    if (!l) return '';
    if (
      p < minP ||
      p + l > d.byteLength ||
      (p < off + 8 && p + l > off) ||
      (plain && (_budget -= l) < 0)
    )
      oob();
    let s = '';
    if (l <= 48) {
      for (let i = 0; i < l; i++) {
        const c = d.getUint8(p + i);
        if (c >= 0x80) {
          s = '';
          break;
        }
        s += String.fromCharCode(c);
      }
    }
    return s || textDecoder.decode(u8s(d, p, l));
  }
  if (k === 'array' || k === 'slice') {
    const n = k === 'array' ? desc.length : d.getUint32(off + 4, true);
    let p = off;
    if (k === 'slice') {
      const r = d.getUint32(off, true);
      if (!n) p = v._o;
      else {
        p = v._b + r;
        const bl = n * desc.element.size;
        if (p < minP || p + bl > d.byteLength || (p < off + 8 && p + bl > off)) oob();
      }
    }
    return readVal(v, desc.element, p, plain, n);
  }
  if (!plain) {
    const nv = new desc._V(d, v._b, off, v._m);
    nv._ws = desc.size;
    (nv as any)._a = (v as any)._a ?? v;
    return nv;
  }
  const out: Record<string, unknown> = {};
  const ws = v._ws ?? desc.size;
  if ((_budget -= ws) < 0) oob();
  for (const f of desc.fieldList) {
    out[f.name] =
      f.offset + f.size > ws
        ? defVal(f.desc, true)
        : readVal(v, f.desc, off + f.offset, true);
  }
  return out;
}

function setDesc(off: number, ptr: number, len: number, d: DataView = sDv): void {
  d.setUint32(off, ptr, true);
  d.setUint32(off + 4, len, true);
}

function writeVal(
  v: InternalStructView | null,
  desc: FieldDesc,
  val: unknown,
  base: number,
  off: number,
): void {
  if (val === undefined || (val === null && (desc as any)._null === undefined)) return;
  let d = v ? v._k() : sDv;
  const k = desc.kind;
  if (k === 'primitive') {
    (desc as PrimitiveDesc)._s(d, off, val as number | bigint | boolean);
  } else if (k === 'str') {
    const s = String(val);
    if (!v) {
      const st = tail;
      ensureScratch(st + s.length * 3 + 8);
      const w = textEncoder.encodeInto(s, sU8.subarray(st)).written;
      tail = st + w;
      setDesc(off, st - base, w);
    } else {
      const b = textEncoder.encode(s),
        st = mutVar(v, off, base, b.byteLength, 1, 1);
      d = v._k();
      u8s(d, st, b.byteLength).set(b);
    }
  } else if (k === 'array' || k === 'slice') {
    const el = desc.element,
      isSav = val instanceof StructArrayView,
      src: ArrayLike<unknown> =
        isSav || 'length' in (val as any) ? (val as ArrayLike<unknown>) : Array.from(val as Iterable<unknown>),
      n = k === 'array' ? desc.length : src.length,
      cp = Math.min(n, src.length) * el.size;
    let st = off;
    if (k === 'slice') {
      if (!v) {
        if (n) tail = al(tail, el.align);
        st = tail;
        ensureScratch((tail += n * el.size) + 64);
        sU8.fill(0, st, tail);
        setDesc(off, st - base, n);
      } else {
        st = mutVar(v, off, base, n, el.size, el.align);
        d = v._k();
      }
    } else if (v) {
      u8s(d, st, n * el.size).fill(0);
    }
    const sb =
      el.kind === 'primitive' && el._C && val instanceof el._C
        ? u8s(val as ArrayBufferView, 0, cp)
        : isSav && (el as any)._fv < 0 && (val as any).stride === el.size && (val as any)._ws === el.size
          ? (val as StructArrayView<any>).bytes.subarray(0, cp)
          : null;
    if (sb && cp) {
      u8s(d, st, cp).set(sb);
    } else {
      for (let i = 0; i < Math.min(n, src.length); i++) {
        writeVal(v, el, isSav ? (val as any).at(i) : src[i], base, st + i * el.size);
      }
    }
    if ((el as any)._null !== undefined) {
      for (let i = Math.min(n, src.length); i < n; i++) (el as any)._s(d, st + i * el.size, null);
    }
  } else {
    const rec = val as Record<string, unknown>;
    if (v && v._ws < desc.size) upgradeView(v);
    for (const f of desc.fieldList) {
      if (rec[f.name] !== undefined) {
        writeVal(v, f.desc, rec[f.name], base, off + f.offset);
      } else if (!v && (f.desc as any)._null !== undefined) {
        (f.desc as any)._s(d, off + f.offset, null);
      } else if (!v && off === base && f.offset === desc._fv) {
        setDesc(off + f.offset, tail - base, 0);
      }
    }
  }
}
function initNulls(def: StructDefLike<any>, d: DataView, o: number, n = 1, st = def.size): void {
  for (const f of def.fieldList)
    if ((f.desc as any)._null !== undefined)
      for (let i = 0; i < n; i++) (f.desc as any)._s(d, o + i * st + f.offset, null);
}
class MemView<F extends FieldRecord = FieldRecord> {
  declare def: StructDefLike<F>;
  declare byteLength: number;
  /** @internal */
  declare _d: DataView;
  /** @internal */
  declare _b: number;
  /** @internal */
  declare _o: number;
  /** @internal */
  declare _ws: number;
  /** @internal */
  declare _tl?: number;
  /** @internal */
  declare _dead?: number;
  /** @internal */
  declare _dirty?: boolean;
  /** @internal */
  declare _m: WebAssembly.Memory | WasmArena | null;
  /** @internal */
  declare _c?: StructView<F> | null;
  /** @internal */
  _set(
    d: DataView,
    b: number,
    o: number,
    m: WebAssembly.Memory | WasmArena | null,
  ): this {
    this._d = d;
    this._b = b;
    this._o = o;
    this._m = m;
    return this;
  }

  /** @internal */
  _k(): DataView {
    const m = this._m as any;
    if (m !== null) {
      const b = m._buf ? (m.memory ? m.memory.buffer : m._buf) : m.buffer;
      if (b !== this._d.buffer) this._d = m.sync ? m.sync()._d : new DataView(b);
    }
    return this._d;
  }

  /** Underlying `ArrayBuffer` (automatically re-bound if backed by a growing `WebAssembly.Memory` or `WasmArena`). */
  get buffer(): ArrayBufferLike {
    return this._k().buffer;
  }

  /** Byte offset of this view inside `buffer`. */
  get byteOffset(): number {
    return this._k().byteOffset + this._o;
  }

  /** Ratio (`0..1`) of dead tail bytes to total used bytes. */
  get compactionRatio(): number {
    const r: any = (this as any)._a ?? this,
      used = r._tl !== undefined ? r._tl - r._o : r.byteLength;
    return used > 0 ? Math.min(1, (r._dead ?? 0) / used) : 0;
  }

  /** Wire-ready `Uint8Array` view over the underlying bytes (automatically compacts dead tail bytes if dirty). */
  /** Re-packs only live fields and tail data into a tight `Uint8Array` and rebinds this view in-place. */
  compact(): Uint8Array {
    const a = this as any,
      isArr = 'length' in a,
      p = pack(this.def as StructDef<F>, (isArr ? a.toObjects() : [a.toObject()]) as any),
      o0 = this._o,
      sz = this.def.size;
    this.byteLength = (isArr ? a.length : 1) * sz;
    this._tl = p.byteLength;
    this._ws = sz;
    this._dead = 0;
    this._dirty = false;
    this._set(new DataView(p.buffer, p.byteOffset, p.byteLength), 0, 0, null);
    if (isArr) {
      a.stride = sz;
      a._cap = a.length;
      for (const pv of [a._c, ...(a._p ?? [])]) if (pv) { pv._set(this._d, 0, pv._o - o0, a); pv._ws = sz; }
    }
    return p;
  }

  /** Wire-ready `Uint8Array` view over the underlying bytes (automatically compacts dead tail bytes if dirty). */
  get bytes(): Uint8Array {
    if (this._dirty || this._dead) return this.compact();
    const d = this._k();
    return u8s(d, this._o, Math.max(this.byteLength, (this._tl ?? this._o + this.byteLength) - this._o));
  }
}

export class StructViewBase<
  F extends FieldRecord = FieldRecord,
> extends MemView<F> {
  /** @internal */
  constructor(
    descs: PropertyDescriptorMap,
    dv: DataView,
    base: number,
    off: number,
    mem: WebAssembly.Memory | WasmArena | null = null,
  ) {
    super();
    Object.defineProperties(this, descs);
    if (dv) this._set(dv, base, off, mem);
  }

  /** Re-positions this flyweight cursor to row `index` (supports negative indices from the end). */
  seek(index: number): this {
    const a = (this as any)._a as StructArrayView<F> | undefined;
    if (a !== undefined) return a.at(index, this as any) as any;
    const st = this._ws || this.def.size,
      o = this._b + index * st;
    if (o < 0 || o + st > this._k().byteLength) oob();
    this._o = o;
    return this;
  }

  /** Alias for `seek(index)` on a flyweight cursor. */
  declare at: (index: number) => this;

  /** Updates a single field in-place (accepts plain JS arrays/objects for `slice`, `fixedArray`, and nested structs). */
  set<K extends keyof F>(field: K, value: FieldInput<F[K]>): this;
  /** Updates multiple fields in-place from a partial object. */
  set(values: Partial<StructInput<F>>): this;
  set(fieldOrValues: unknown, value?: unknown): this {
    if (typeof fieldOrValues === 'string') (this as any)[fieldOrValues] = value;
    else writeVal(this as any, this.def, fieldOrValues, this._b, this._o);
    return this;
  }

  /** Updates multiple fields in-place from a partial object. */
  declare setAll: (values: Partial<StructInput<F>>) => this;

  /** Materializes this binary struct view into a plain JavaScript object. */
  toObject(): PlainStructValues<F> {
    _budget = Math.max(this._k().byteLength * 8, 65536);
    return readVal(this as unknown as InternalStructView, this.def, this._o, true) as PlainStructValues<F>;
  }

  /** Serializes this struct view to a plain object for `JSON.stringify()`. */
  declare toJSON: () => PlainStructValues<F>;
 }
 StructViewBase.prototype.at = StructViewBase.prototype.seek;
 StructViewBase.prototype.setAll = StructViewBase.prototype.set;
 StructViewBase.prototype.toJSON = StructViewBase.prototype.toObject;

/** Zero-copy view over a single binary struct with direct getter/setter properties for every field in `F`. */
export type StructView<F extends FieldRecord = FieldRecord> =
  StructViewBase<F> & StructValues<F>;
function normOpts(
  b: number | ViewOptions | StructDefLike<any> = 0,
  c?: number,
  bo?: number,
  s?: number,
): { o: number; c?: number; b?: number; s?: number } {
  if (typeof b === 'number') return { o: b, c, b: bo, s };
  return 'kind' in b
    ? { o: 0, s: b.stride }
    : { o: b.byteOffset ?? 0, c: b.count, b: b.baseOffset, s: b.stride };
}

export function structView<F extends FieldRecord>(
  def: StructDef<F>,
  source: BufferSourceInput,
  byteOffset: number | ViewOptions | StructDefLike<any> = 0,
  baseOffset?: number,
  wireStride?: number,
): StructView<F> {
  const n = normOpts(byteOffset, undefined, baseOffset, wireStride);
  const r = resolveSource(source, n.o), ws = n.s ?? (r.max < def.size ? r.max : def.size);
  if (r.o < 0 || r.max < ws) oob();
  const v = new def._V(r.d, n.b ?? r.o, r.o, r.m);
  v._ws = ws;
  v._tl = r.o + Math.max(ws, r.max);
  return v;
}
export class StructArrayView<F extends FieldRecord = FieldRecord>
  extends MemView<F>
  implements Iterable<StructView<F>>
{
  declare stride: number;
  declare length: number;
  /** @internal */
  declare _p: Array<StructView<F> | undefined> | null;
  /** @internal */
  declare _pi: number;
  /** @internal */
  declare _cap: number;

  constructor(
    def: StructDefLike<F>,
    source: BufferSourceInput,
    byteOffset: number | ViewOptions | StructDefLike<any> = 0,
    count?: number,
    baseOffset?: number,
    wireStride?: number,
  ) {
    super();
    const n = normOpts(byteOffset, count, baseOffset, wireStride);
    const sz = n.s ?? def.size, r = resolveSource(source, n.o);
    const hasVar = def._fv >= 0 && def._fv < sz;
    const f = n.c === undefined && r.max >= sz && hasVar ? r.d.getUint32(r.o + def._fv, true) : 0;
    const len = n.c ?? (f >= sz && f <= r.max ? f / sz : r.max / sz) | 0;
    const tot = len * sz;
    if (len < 0 || r.o < 0 || r.max < tot) oob();
    Object.assign(this, {
      def,
      stride: sz,
      length: len,
      byteLength: tot,
      _ws: sz,
      _tl: r.o + Math.max(tot, r.max),
      _cap: len,
      _dead: 0,
      _dirty: false,
    });
    this._set(r.d, n.b ?? r.o, r.o, r.m);
  }

  /** @internal */
  _mv(index: number, v?: StructView<F> | null): StructView<F> {
    const d = this._k(),
      o = this._o + index * this.stride,
      nv = v ? v._set(d, this._b, o, this._m) : (new this.def._V(d, this._b, o, this._m) as unknown as StructView<F>);
    nv._ws = this._ws;
    (nv as any)._a = this;
    return nv;
  }
  /** Returns a reusable flyweight cursor positioned at `index`. */
  cursor(index = 0): StructView<F> {
    return (this._c = this._mv(index, this._c));
  }

  /** Returns a `StructView<F>` at `index` (supports negative indices from the end, e.g. `rows.at(-1)`). */
  at(index: number, out?: StructView<F>): StructView<F> {
    if (index < 0) index += this.length;
    if (index < 0 || index >= this.length) oob();
    if (out) return this._mv(index, out);
    const p = this._p ?? (this._p = []);
    const s = (this._pi = ((this._pi ?? 0) + 1) & 255);
    return (p[s] = this._mv(index, p[s]));
  }

  /** Writes `value` into the struct at `index` (supports negative indices from the end). */
  set(index: number, value: Partial<StructInput<F>> | StructView<F>): this {
    this.at(index).set(value as any);
    return this;
  }

  /** Appends one or more rows to the binary array, automatically growing capacity if needed. */
  push(...items: (Partial<StructInput<F>> | StructView<F>)[]): number {
    if (this._ws < this.def.size) this.compact();
    const def = this.def, st = this.stride, need = this.length + items.length, hasVar = def._fv >= 0;
    if (need > this._cap) {
      const curEnd = this._tl ?? this._o + this.byteLength,
        tableEnd = this._o + this._cap * st;
      if ((!hasVar || !this.length) && tableEnd === curEnd) {
        allocTail(this, (need - this._cap) * st, def.align);
        this._cap = need;
      } else {
        const newCap = Math.max(need, (this._cap || 2) * 2),
          newO = allocTail(this, al(newCap * st, 8), def.align),
          d = this._k(),
          dO = newO - this._o;
        if (this.byteLength > 0) {
          u8s(d, newO, this.byteLength).set(u8s(d, this._o, this.byteLength));
          this._dead = (this._dead ?? 0) + this.byteLength;
        }
        this._o = newO;
        this._cap = newCap;
        for (const pv of [this._c, ...(this._p ?? [])]) if (pv) pv._o += dO;
      }
    }
    initNulls(def, this._k(), this._o + this.length * st, items.length, st);
    for (const item of items) {
      const idx = this.length++;
      this.byteLength = this.length * st;
      writeVal(this as unknown as InternalStructView, def, item, this._b, this._o + idx * st);
      if (hasVar) this._dirty = true;
    }
    return this.length;
  }

  /** Removes and returns the last row as a plain JS object (or `undefined` if empty). */
  pop(): PlainStructValues<F> | undefined {
    if (!this.length) return undefined;
    const lastIdx = --this.length;
    _budget = Math.max(this._k().byteLength * 8, 65536);
    const val = readVal(
        this as unknown as InternalStructView,
        this.def,
        this._o + lastIdx * this.stride,
        true,
      ) as PlainStructValues<F>;
    this.byteLength = this.length * this.stride;
    if (this.def._fv >= 0) {
      this._dirty = true;
      this._dead = (this._dead ?? 0) + this.stride;
    } else if (this._tl === this._o + (lastIdx + 1) * this.stride) {
      this._tl -= this.stride;
      this._cap = this.length;
    }
    return val;
  }
  /** Returns a zero-copy `StructArrayView` over `[begin, end)` without copying bytes. */
  subarray(begin = 0, end = this.length): StructArrayView<F> {
    const len = this.length,
      s = begin < 0 ? Math.max(len + begin, 0) : Math.min(begin, len),
      e = end < 0 ? Math.max(len + end, 0) : Math.min(end, len),
      cnt = Math.max(0, e - s),
      sub = new StructArrayView(this.def, this._k(), this._o + s * this.stride, cnt, this._b, this._ws);
    sub._m = this._m;
    sub._dirty = (this.def._fv >= 0 && (s > 0 || e < len)) || Boolean(this._dirty || this._dead);
    return sub;
  }
  /** Binary search: first row index `i` in `[0..length]` where `row[i][field] >= value` ($O(\log N)$, 0 allocations). */
  lowerBound<K extends PrimitiveFieldKeys<F>>(field: K, value: number | bigint): number {
    return bsearch(this, field, value, false);
  }
  /** Binary search: first row index `i` in `[0..length]` where `row[i][field] > value` ($O(\log N)$, 0 allocations). */
  upperBound<K extends PrimitiveFieldKeys<F>>(field: K, value: number | bigint): number {
    return bsearch(this, field, value, true);
  }
  /** Returns a zero-copy `StructArrayView` slice over the sorted range `min <= row[field] <= max` in $O(\log N)$. */
  rangeBy<K extends PrimitiveFieldKeys<F>>(
    field: K,
    min: number | bigint,
    max: number | bigint,
  ): StructArrayView<F> {
    return this.subarray(this.lowerBound(field, min), this.upperBound(field, max));
  }
  /** Filters rows with a reusable flyweight cursor (0 per-row JS objects) and copies matching binary rows into a `Uint8Array`. */
  filterBytes(predicate: (row: StructView<F>, index: number) => boolean): Uint8Array {
    const len = this.length,
      c = this.cursor(0),
      def = this.def,
      st = this.stride;
    if (def._fv >= 0 || st !== def.size || this._ws !== st) {
      const rows: PlainStructValues<F>[] = [];
      for (let i = 0; i < len; i++) if (predicate(c.seek(i), i)) rows.push(c.toObject());
      return pack(def as StructDef<F>, rows as unknown as Partial<StructInput<F>>[]);
    }
    ensureScratch(len * st);
    const src = u8s(this._k(), this._o, len * st);
    let outOff = 0;
    for (let i = 0; i < len; i++) {
      if (predicate(c.seek(i), i)) {
        sU8.set(src.subarray(i * st, (i + 1) * st), outOff);
        outOff += st;
      }
    }
    return sU8.slice(0, outOff);
  }

  /** Extracts a `TypedArray` column for primitive `field` (zero-copy when `stride === field.size`). */
  column<K extends PrimitiveFieldKeys<F>>(
    field: K,
  ): F[K] extends PrimitiveDesc<infer P> ? TypedArrayFor<P> : never {
    const lay = colDesc(this, field),
      desc = lay.desc,
      n = this.length,
      st = this.stride,
      fo = lay.offset;
    if (fo + desc.size > this._ws) return new desc._C!(n) as any;
    const d = this._k(),
      start = d.byteOffset + this._o + fo;
    if (desc.type !== 'bool' && (st === desc.size || n <= 1) && start % desc.align === 0) {
      return new desc._C!(d.buffer, start, n) as any;
    }
    const out = new desc._C!(n) as any;
    for (let i = 0, off = this._o + fo; i < n; i++, off += st) out[i] = desc._g(d, off);
    return out;
  }

  /** Bulk-writes a primitive column from `values` into `field` across all rows. */
  setColumn<K extends PrimitiveFieldKeys<F>>(
    field: K,
    values: ArrayLike<number | bigint | boolean>,
  ): this {
    const lay = colDesc(this, field);
    if (lay.offset + lay.size > this._ws) this.compact();
    const desc = lay.desc,
      d = this._k(),
      st = this.stride,
      n = Math.min(this.length, values.length);
    for (let i = 0, off = this._o + lay.offset; i < n; i++, off += st) {
      desc._s(d, off, values[i] as number | bigint | boolean);
    }
    return this;
  }

  /** Materializes all rows into an array of plain JavaScript objects. */
  toObjects(): PlainStructValues<F>[] {
    return Array.from(this, (r) => r.toObject());
  }
  /** Serializes this array of rows to an array of plain objects for `JSON.stringify()`. */
  declare toJSON: () => PlainStructValues<F>[];
  [Symbol.iterator](): Iterator<StructView<F>> {
    const c = this.cursor(0);
    const b = this._o;
    const st = this.stride;
    const len = this.length;
    let i = 0;
    const res: IteratorResult<StructView<F>> = { value: c, done: false };
    return {
      next(): IteratorResult<StructView<F>> {
        if (i < len) {
          c._o = b + i++ * st;
          return res;
        }
        return { value: undefined, done: true };
      },
    };
   }
 }
 StructArrayView.prototype.toJSON = StructArrayView.prototype.toObjects;
function colDesc(a: StructArrayView<any>, k: PropertyKey): FieldLayout<PrimitiveDesc<any>> {
  const lay = a.def.fields[k as string];
  if (!lay || lay.desc.kind !== 'primitive' || !lay.desc._C) {
    throw new TypeError(`Field "${String(k)}" is not a primitive column`);
  }
  return lay as FieldLayout<PrimitiveDesc<any>>;
}
function bsearch(a: StructArrayView<any>, k: PropertyKey, v: number | bigint, eq: boolean): number {
  const lay = colDesc(a, k),
    g = lay.desc._g,
    d = a._k(),
    b = a._o + lay.offset,
    st = a.stride;
  let lo = 0,
    hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1,
      x = g(d, b + mid * st) as number | bigint;
    if (eq ? x <= v : x < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
export interface PlacedBytes extends Uint8Array {
  readonly ptr: number;
  as<F extends FieldRecord>(
    def: StructDef<F>,
    count?: number,
  ): StructArrayView<F>;
}

export class WasmArena {
  declare readonly memory: WebAssembly.Memory | null;
  declare readonly baseOffset: number;
  declare offset: number;
  /** @internal */
  declare _buf: ArrayBuffer;
  /** @internal */
  declare _d: DataView;
  /** @internal */
  declare _u8: Uint8Array;

  constructor(
    backing: WebAssembly.Memory | ArrayBuffer | number = 65536,
    baseOffset = 0,
  ) {
    this.memory = isWasmMemory(backing) ? backing : null;
    this.baseOffset = this.offset = baseOffset;
    this._rebind(
      this.memory
        ? this.memory.buffer
        : backing instanceof ArrayBuffer
          ? backing
          : new ArrayBuffer(Math.max(backing as number, baseOffset)),
    );
  }

  /** @internal */
  _rebind(buf: ArrayBuffer): this {
    this._buf = buf;
    this._d = new DataView(buf);
    this._u8 = new Uint8Array(buf);
    return this;
  }

  sync(): this {
    if (this.memory !== null && this.memory.buffer !== this._buf) {
      this._rebind(this.memory.buffer);
    }
    return this;
  }

  get buffer(): ArrayBuffer {
    return this.sync()._buf;
  }

  get byteLength(): number {
    return this.sync()._buf.byteLength;
  }

  get bytesUsed(): number {
    return this.offset - this.baseOffset;
  }

  get u8(): Uint8Array {
    return this.sync()._u8;
  }

  get dataView(): DataView {
    return this.sync()._d;
  }

  alignTo(align: number): number {
    if (align > 1) {
      this.offset = (this.offset + align - 1) & ~(align - 1);
    }
    return this.offset;
  }

  ensureCapacity(requiredByteLength: number): this {
    this.sync();
    if (requiredByteLength <= this._buf.byteLength) return this;
    if (this.memory !== null) {
      this.memory.grow(
        Math.ceil((requiredByteLength - this._buf.byteLength) / 65536),
      );
      return this._rebind(this.memory.buffer);
    }
    const nb = new ArrayBuffer(
      Math.max(requiredByteLength, this._buf.byteLength * 2, 64),
    );
    new Uint8Array(nb).set(this._u8);
    return this._rebind(nb);
  }

  /** @internal */
  _alloc(bytes: number, align: number, zero = false): number {
    const p = this.alignTo(align),
      end = (this.offset = p + bytes);
    this.ensureCapacity(end);
    if (zero && bytes > 0) this._u8.fill(0, p, end);
    return p;
  }

  alloc<F extends FieldRecord>(def: StructDef<F>, count = 1, zero = false): StructArrayView<F> {
    const p = this._alloc(count * def.size, def.align, zero);
    initNulls(def, this._d, p, count);
    return new StructArrayView(def, this, p, count);
  }

  allocOne<F extends FieldRecord>(def: StructDef<F>, init?: Partial<StructInput<F>>): StructView<F> {
    const p = this._alloc(def.size, def.align, true),
      v = new def._V(this._d, p, p, this);
    initNulls(def, this._d, p);
    return init !== undefined ? v.setAll(init) : v;
  }

  placeBytes<F extends FieldRecord = FieldRecord>(
    bytes: Uint8Array | ArrayBufferView,
    alignOrDef: number | StructDefLike<F> = 8,
  ): PlacedBytes {
    const u = bytes instanceof Uint8Array ? bytes : u8s(bytes),
      p = this._alloc(
        u.byteLength,
        typeof alignOrDef === 'number' ? alignOrDef : alignOrDef.align,
      );
    this._u8.set(u, p);
    const sub = new Uint8Array(this._buf, p, u.byteLength) as PlacedBytes;
    Object.defineProperties(sub, {
      ptr: hid(p),
      as: hid(
        <SF extends FieldRecord>(
          def: StructDef<SF>,
          c = Math.floor(u.byteLength / def.size),
        ) => new StructArrayView(def, this, p, c),
      ),
    });
    return sub;
  }

  view<F extends FieldRecord>(
    def: StructDef<F>,
    byteOffset: number,
    baseOffset = byteOffset,
  ): StructView<F> {
    return structView(def, this.sync(), byteOffset, baseOffset);
  }

  viewArray<F extends FieldRecord>(
    def: StructDef<F>,
    byteOffset: number,
    count: number,
  ): StructArrayView<F> {
    return new StructArrayView(def, this.sync(), byteOffset, count);
  }
  reset(baseOffset = this.baseOffset): this {
    this.offset = baseOffset;
    return this;
  }
}

export const Arena = WasmArena;
export class StructDef<F extends FieldRecord = FieldRecord>
  implements StructDefLike<F>
{
  declare readonly kind: 'struct';
  declare readonly name: string;
  declare readonly rustType: string;
  declare readonly size: number;
  declare readonly stride: number;
  declare readonly align: number;
  declare readonly schema: F;
  declare readonly fields: { readonly [K in keyof F]: FieldLayout<F[K]> };
  declare readonly fieldList: readonly FieldLayout[];
  /** Phantom type helper: `typeof MySchema.$view` resolves to `StructView<F>`. */
  declare readonly $view: StructView<F>;
  /** Phantom type helper: `typeof MySchema.$plain` resolves to `PlainStructValues<F>`. */
  declare readonly $plain: PlainStructValues<F>;
  /** Phantom type helper: `typeof MySchema.$input` resolves to `Partial<StructInput<F>>`. */
  declare readonly $input: Partial<StructInput<F>>;
  /** @internal */
  declare readonly _fv: number;
  /** @internal */
  declare readonly _V: new (
    dv: DataView,
    base: number,
    off: number,
    mem: WebAssembly.Memory | WasmArena | null,
  ) => StructView<F>;
  constructor(name: string, schema: F) {
    if (!schema) throw new TypeError('Struct schema fields are required');
    let off = 0;
    let maxA = 1;
    let firstV = -1;
    const fObj: Record<string, FieldLayout> = {};
    const descs: PropertyDescriptorMap = { ...BASE_DESCS };
    for (const [k, d] of Object.entries(schema)) {
      const a = d.align;
      maxA = Math.max(maxA, a);
      const fo = (off = al(off, a));
      fObj[k] = {
        name: k,
        desc: d,
        offset: fo,
        size: d.size,
        align: a,
      };
      off += d.size;
      const dk = d.kind;
      if ((dk === 'str' || dk === 'slice' || (dk === 'struct' && d._fv >= 0)) && firstV < 0) {
        firstV = dk === 'struct' ? fo + d._fv : fo;
      }
      const end = fo + d.size;
      descs[k] = {
        enumerable: true,
        configurable: true,
        get(this: StructViewBase<F>) {
          if (end > this._ws) return defVal(d, false);
          if (dk === 'primitive') {
            try {
              return d._g((this._m as any)?._d ?? this._d, this._o + fo);
            } catch {
              return d._g(this._k(), this._o + fo);
            }
          }
          return readVal(this, d, this._o + fo, false);
        },
        set(this: StructViewBase<F>, v: unknown) {
          if (end > this._ws) upgradeView(this);
          writeVal(this, d, v, this._b, this._o + fo);
        },
      };
    }
    const sz = al(off, maxA);
    descs._ws = hid(sz);
    class SpecializedStructView extends StructViewBase<F> {
      constructor(dv: DataView, b: number, o: number, m: WebAssembly.Memory | WasmArena | null) {
        super(descs, dv, b, o, m);
      }
    }
    SpecializedStructView.prototype.def = this as any;
    SpecializedStructView.prototype.byteLength = sz;
    Object.assign(this, {
      kind: 'struct',
      name,
      rustType: name || 'AnonStruct',
      schema,
      size: sz,
      stride: sz,
      align: maxA,
      fields: fObj,
      fieldList: Object.values(fObj),
      _fv: firstV,
      _V: SpecializedStructView,
    });
  }
  offsetOf<K extends keyof F>(field: K): number {
    return this.fields[field].offset;
  }

  /** Allocates a single `StructView<F>` backed by a fresh buffer and optionally initializes fields. */
  create(init?: Partial<StructInput<F>>): StructView<F> {
    const v = this.view(new ArrayBuffer(this.size));
    initNulls(this, v._d, 0);
    return init !== undefined ? v.setAll(init) : v;
  }
  /** Wraps a binary buffer (`Uint8Array`, `ArrayBuffer`, `DataView`, `WebAssembly.Memory`, `WasmArena`) in a zero-copy `StructView<F>`. */
  view(
    source: BufferSourceInput,
    byteOffset?: number | ViewOptions | StructDefLike<any>,
    baseOffset?: number,
    wireStride?: number,
  ): StructView<F> {
    return structView(this, source, byteOffset, baseOffset, wireStride);
  }
  /** Wraps a binary buffer in a zero-copy `StructArrayView<F>`. */
  array(
    source: BufferSourceInput,
    byteOffset?: number | ViewOptions | StructDefLike<any>,
    count?: number,
    baseOffset?: number,
    wireStride?: number,
  ): StructArrayView<F> {
    return new StructArrayView(this, source, byteOffset, count, baseOffset, wireStride);
  }
  /** Allocates a growable `StructArrayView<F>` for `count` rows (pass `0` for an empty growable array). */
  alloc(count: number): StructArrayView<F> {
    const a = this.array(new ArrayBuffer(count * this.size), 0, count);
    initNulls(this, a._d, 0, count);
    return a;
  }
  /** Packs an array of plain JavaScript objects into an 8-byte-aligned `Uint8Array`. */
  pack(rows: readonly Partial<StructInput<F>>[]): Uint8Array {
    return pack(this, rows);
  }
  /** Concatenates multiple `StructArrayView<F>` or `Uint8Array` chunks into a single packed `Uint8Array` via bulk `memcpy` when fixed-size. */
  concatBytes(chunks: readonly (StructArrayView<F> | Uint8Array)[]): Uint8Array {
    return concatBytes(this, chunks);
  }
}


/** Concatenates multiple `StructArrayView<F>` or `Uint8Array` chunks into a single packed `Uint8Array` via bulk `memcpy` when fixed-size. */
export function concatBytes<F extends FieldRecord>(
  def: StructDef<F>,
  chunks: readonly (StructArrayView<F> | Uint8Array)[],
): Uint8Array {
  if (def._fv >= 0) {
    return pack(def, chunks.flatMap((c) => (c instanceof Uint8Array ? def.array(c) : c).toObjects()) as any);
  }
  const slices = chunks.map((c) =>
    c instanceof Uint8Array ? (c.byteLength % def.size && oob(), c) : c.stride === def.size ? c.bytes : c.compact(),
  );
  const out = new Uint8Array(slices.reduce((s, b) => s + b.byteLength, 0));
  let off = 0;
  for (const s of slices) {
    out.set(s, off);
    off += s.byteLength;
  }
  return out;
}

/** Packs an array of plain JavaScript objects into an 8-byte-aligned `Uint8Array`. */
export function pack<F extends FieldRecord>(
  def: StructDef<F>,
  rows: readonly Partial<StructInput<F>>[],
): Uint8Array {
  const n = rows.length;
  const st = def.size;
  const tb = n * st;
  const ts = def._fv >= 0 ? al(tb + 1, 8) : tb;
  ensureScratch(ts + n * 64 + 64);
  sU8.fill(0, 0, ts);
  tail = ts;
  for (let i = 0; i < n; i++) {
    writeVal(null, def, rows[i], 0, i * st);
  }
  const end = al(tail, 8);
  sU8.fill(0, tail, end);
  return sU8.slice(0, end);
}
/** Compiles a declarative `#[repr(C)]` struct schema with zero-copy `StructView` and `StructArrayView` accessors. */
export function defineStruct<F extends FieldRecord>(fields: F): StructDef<F>;
/** Compiles a named `#[repr(C)]` struct schema (used by `toRustReprC()` codegen). */
export function defineStruct<F extends FieldRecord>(
  name: string,
  fields: F,
): StructDef<F>;
export function defineStruct<F extends FieldRecord>(
  nameOrFields: string | F,
  maybeFields?: F,
): StructDef<F> {
  return typeof nameOrFields === 'string'
    ? new StructDef(nameOrFields, maybeFields!)
    : new StructDef('', nameOrFields);
}

/** Alias for `defineStruct`. */
export const struct = defineStruct;
