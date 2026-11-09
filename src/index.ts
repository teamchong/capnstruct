import {
  type GoCodegenOptions,
  type RustCodegenOptions,
  type SchemaCollection,
  generateGo,
  generateRust,
  toGoStruct,
  toRustReprC,
} from './codegen.js';

export {
  generateGo,
  generateRust,
  toGoStruct,
  toRustReprC,
  type GoCodegenOptions,
  type RustCodegenOptions,
  type SchemaCollection,
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

export type SelfRef = { readonly kind: 'self' } | string;

export interface SliceDesc<E extends FieldDesc | SelfRef = FieldDesc> {
  readonly kind: 'slice';
  readonly element: E;
  readonly size: 8;
  readonly align: 4;
  readonly rustType: string;
}

export interface RefDesc<S extends StructDefLike<any> | SelfRef = StructDefLike<any>> {
  readonly kind: 'ref';
  readonly element: S;
  readonly size: 8;
  readonly align: 4;
  readonly rustType: string;
}

export interface StructDefLike<F extends FieldRecord = FieldRecord> {
  readonly kind: 'struct';
  readonly name: string;
  readonly rustType: string;
  readonly size: number;
  readonly byteSize: number;
  readonly stride: number;
  readonly align: number;
  readonly schema: F;
  readonly fields: { readonly [K in keyof F]: FieldLayout<F[K]> };
  readonly fieldList: readonly FieldLayout[];
  /** @internal */
  readonly _fv: number;
  /** @internal */
  readonly _D: PropertyDescriptorMap;
}

export type FieldDesc =
  | PrimitiveDesc
  | NullablePrimitiveDesc
  | FixedStrDesc
  | FixedBytesDesc
  | StrDesc
  | ArrayDesc
  | SliceDesc<any>
  | RefDesc<any>
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

export type FieldValue<D extends FieldDesc = FieldDesc, SelfF extends FieldRecord = FieldRecord> =
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
                : PlainFieldValue<E, SelfF>[]
            : D extends SliceDesc<infer E>
              ? E extends SelfRef
                ? StructArrayView<SelfF>
                : E extends PrimitiveDesc<infer P>
                  ? TypedArrayFor<P>
                  : E extends StructDefLike<infer SF>
                    ? StructArrayView<SF>
                    : E extends FieldDesc
                      ? PlainFieldValue<E, SelfF>[]
                      : never
              : D extends RefDesc<infer SF>
                ? SF extends SelfRef
                  ? StructView<SelfF> | null
                  : SF extends StructDefLike<infer F>
                    ? StructView<F> | null
                    : any
                : D extends StructDefLike<infer SF>
                  ? StructView<SF>
                  : never;

export type FieldInput<D extends FieldDesc = FieldDesc, SelfF extends FieldRecord = FieldRecord> =
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
                    | ArrayLike<Partial<StructInput<SF>> | StructView<SF> | readonly unknown[]>
                    | Iterable<Partial<StructInput<SF>> | StructView<SF> | readonly unknown[]>
                    | ArrayBufferView
                    | StructArrayView<SF>
                : E extends FieldDesc
                  ? ArrayLike<FieldInput<E, SelfF>> | Iterable<FieldInput<E, SelfF>>
                  : never
            : D extends SliceDesc<infer E>
              ? E extends SelfRef
                ?
                    | ArrayLike<Partial<StructInput<SelfF>> | StructView<SelfF> | readonly unknown[]>
                    | Iterable<Partial<StructInput<SelfF>> | StructView<SelfF> | readonly unknown[]>
                    | ArrayBufferView
                    | StructArrayView<SelfF>
                : E extends PrimitiveDesc<infer P>
                  ? ArrayLike<PrimitiveInputType<P>> | Iterable<PrimitiveInputType<P>>
                  : E extends StructDefLike<infer SF>
                    ?
                        | ArrayLike<Partial<StructInput<SF>> | StructView<SF> | readonly unknown[]>
                        | Iterable<Partial<StructInput<SF>> | StructView<SF> | readonly unknown[]>
                        | ArrayBufferView
                        | StructArrayView<SF>
                    : E extends FieldDesc
                      ? ArrayLike<FieldInput<E, SelfF>> | Iterable<FieldInput<E, SelfF>>
                      : never
              : D extends RefDesc<infer SF>
                ? SF extends SelfRef
                  ? Partial<StructInput<SelfF>> | StructView<SelfF> | readonly unknown[] | null | undefined
                  : SF extends StructDefLike<infer F>
                    ? Partial<StructInput<F>> | StructView<F> | readonly unknown[] | null | undefined
                    : any
                : D extends StructDefLike<infer SF>
                  ? Partial<StructInput<SF>> | StructView<SF> | readonly unknown[]
                  : never;

export type StructInput<F extends FieldRecord> = {
  [K in keyof F]: FieldInput<F[K], F>;
};

export type StructValues<F extends FieldRecord> = {
  [K in keyof F]: FieldValue<F[K], F>;
};

export type PlainFieldValue<D extends FieldDesc = FieldDesc, SelfF extends FieldRecord = FieldRecord> =
  D extends NullablePrimitiveDesc<infer P>
    ? PrimitiveTsType<P> | null
    : D extends PrimitiveDesc<infer P>
      ? PrimitiveTsType<P>
      : D extends StrDesc | FixedStrDesc
        ? string
        : D extends FixedBytesDesc
          ? number[]
          : D extends ArrayDesc<infer E, number>
            ? PlainFieldValue<E, SelfF>[]
            : D extends SliceDesc<infer E>
              ? E extends SelfRef
                ? PlainStructValues<SelfF>[]
                : E extends FieldDesc
                  ? PlainFieldValue<E, SelfF>[]
                  : never
              : D extends RefDesc<infer SF>
                ? SF extends SelfRef
                  ? PlainStructValues<SelfF> | null
                  : SF extends StructDefLike<infer F>
                    ? PlainStructValues<F> | null
                    : any
                : D extends StructDefLike<infer SF>
                  ? PlainStructValues<SF>
                  : never;

/** Plain JavaScript object representation of a struct schema `F`. */
export type PlainStructValues<F extends FieldRecord> = {
  [K in keyof F]: PlainFieldValue<F[K], F>;
};

/** True when field descriptor `D` is stored inline in the fixed-size struct header (`0` tail arena bytes). */
export type IsInlineField<D extends FieldDesc> =
  D extends PrimitiveDesc<any> | NullablePrimitiveDesc<any> | FixedStrDesc<any> | FixedBytesDesc<any>
    ? true
    : D extends ArrayDesc<infer E, any>
      ? IsInlineField<E>
      : D extends StructDefLike<infer SF>
        ? { [K in keyof SF]: IsInlineField<SF[K]> }[keyof SF] extends true
          ? true
          : false
        : false;
/** Sub-record of `F` containing only inline fixed-offset header fields (omitting tail-allocated `str`, `slice`, and `ref` fields). */
export type HeaderFieldRecord<F extends FieldRecord> = {
  [K in keyof F as IsInlineField<F[K]> extends true ? K : never]: F[K];
};
/** Zero-copy view over only the inline fixed-size header fields of `F` (safe on partial `file.slice(0, Schema.byteSize)` buffers). */
export type StructHeaderView<F extends FieldRecord = FieldRecord> =
  StructViewBase<HeaderFieldRecord<F>> & StructValues<HeaderFieldRecord<F>>;
/** Infers the zero-copy `StructView` type from a `StructDef`. */
export type InferView<S extends StructDefLike<any>> =
  S extends StructDefLike<infer F> ? StructView<F> : never;
/** Infers the plain JavaScript object type (`toObject()`) from a `StructDef`. */
export type InferPlain<S extends StructDefLike<any>> =
  S extends StructDefLike<infer F> ? PlainStructValues<F> : never;
/** Infers the input object type accepted by `pack()`, `create()`, and `push()` from a `StructDef`. */
export type InferInput<S extends StructDefLike<any>> =
  S extends StructDefLike<infer F> ? Partial<StructInput<F>> : never;
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
  '_d _b _o _m _a _tl _dead _dirty'.split(' ').map((k) => [k, hid()]),
);
const dvP = DataView.prototype as any;
function prim<T extends PrimitiveName>(type: T): PrimitiveDesc<T> {
  const c = type[0],
    bits = +type.slice(1) || 8,
    size = bits >> 3,
    float = c === 'f',
    big = size === 8 && !float,
    m = (float ? 'Float' : (big ? 'Big' : '') + (c === 'i' ? 'Int' : 'Uint')) + bits,
    g = dvP['get' + m],
    s = dvP['set' + m];
  return {
    kind: 'primitive',
    type,
    rustType: (type === 'f16' ? 'u16' : type) as any,
    size,
    align: size,
    float,
    _C: (globalThis as any)[m + 'Array'] ?? Uint16Array,
    _g: (d: DataView, o: number) => g.call(d, o, true),
    _s: (d: DataView, o: number, v: any) => s.call(d, o, big ? BigInt(v) : N(v), true),
  } as any;
}
/** Unsigned 8-bit integer (`0..255`, 1 byte, 1-byte aligned). */
export const u8: PrimitiveDesc<'u8'> = /* @__PURE__ */ prim('u8');
/** Signed 8-bit integer (`-128..127`, 1 byte, 1-byte aligned). */
export const i8: PrimitiveDesc<'i8'> = /* @__PURE__ */ prim('i8');
/** Little-endian unsigned 16-bit integer (`0..65535`, 2 bytes, 2-byte aligned). */
export const u16: PrimitiveDesc<'u16'> = /* @__PURE__ */ prim('u16');
/** Little-endian signed 16-bit integer (`-32768..32767`, 2 bytes, 2-byte aligned). */
export const i16: PrimitiveDesc<'i16'> = /* @__PURE__ */ prim('i16');
/** Little-endian unsigned 32-bit integer (4 bytes, 4-byte aligned). */
export const u32: PrimitiveDesc<'u32'> = /* @__PURE__ */ prim('u32');
/** Little-endian signed 32-bit integer (4 bytes, 4-byte aligned). */
export const i32: PrimitiveDesc<'i32'> = /* @__PURE__ */ prim('i32');
/** Little-endian unsigned 64-bit integer (`bigint`, 8 bytes, 8-byte aligned). */
export const u64: PrimitiveDesc<'u64'> = /* @__PURE__ */ prim('u64');
/** Little-endian signed 64-bit integer (`bigint`, 8 bytes, 8-byte aligned). */
export const i64: PrimitiveDesc<'i64'> = /* @__PURE__ */ prim('i64');
/** IEEE 754 16-bit half-precision float (2 bytes, 2-byte aligned). */
export const f16: PrimitiveDesc<'f16'> = /* @__PURE__ */ prim('f16');
/** IEEE 754 32-bit float (4 bytes, 4-byte aligned). */
export const f32: PrimitiveDesc<'f32'> = /* @__PURE__ */ prim('f32');
/** IEEE 754 64-bit float (8 bytes, 8-byte aligned). */
export const f64: PrimitiveDesc<'f64'> = /* @__PURE__ */ prim('f64');
/** 1-byte boolean (`0` or `1`, 1-byte aligned). */
export const bool: PrimitiveDesc<'bool'> = {
  .../* @__PURE__ */ prim('bool'),
  _g: (d: DataView, o: number) => d.getUint8(o) !== 0,
  _s: (d: DataView, o: number, v: any) => d.setUint8(o, v ? 1 : 0),
};
/** Inline fixed-length null-padded UTF-8 string `[u8; N]` (`align: 1, size: length`) with zero tail indirection. */
export function fixedStr<N extends number>(length: N): FixedStrDesc<N> {
  return {
    ...fixedBytes(length),
    type: 'fixedStr',
    _g(d, o) {
      const u = u8s(d, o, length), i = u.indexOf(0);
      return textDecoder.decode(i < 0 ? u : u.subarray(0, i));
    },
    _s: (d, o, v) => (u8s(d, o, length).fill(0), textEncoder.encodeInto(String(v), u8s(d, o, length))),
  };
}

/** Inline fixed-length byte array `[u8; N]` (`align: 1, size: length`) read as a zero-copy `Uint8Array`. */
export function fixedBytes<N extends number>(length: N): FixedBytesDesc<N> {
  chkLen(length);
  return {
    ...u8,
    type: 'fixedBytes',
    length,
    size: length,
    rustType: `[u8; ${length}]`,
    _C: undefined,
    _g: (d: DataView, o: number) => u8s(d, o, length),
    _s: (d: DataView, o: number, v: any) => {
      const u = u8s(d, o, length);
      u.fill(0);
      if (v) u.set((ArrayBuffer.isView(v) ? u8s(v) : new Uint8Array(v)).subarray(0, length));
    },
  } as any;
}

/** Maps an inline sentinel value (e.g. `-32768` for `i16` or `NaN` for `f32`) to `null` in JS with 0 extra wire bytes. */
export function sentinel<P extends PrimitiveDesc<any>>(
  primDesc: P,
  nullValue: PrimitiveTsType<P['type']>,
): NullablePrimitiveDesc<P['type']> {
  return {
    ...primDesc,
    _null: nullValue,
    _C: undefined,
    _g: (d: DataView, o: number) => { const v = primDesc._g(d, o); return Object.is(v, nullValue) ? null : (v as PrimitiveTsType<P['type']>); },
    _s: (d: DataView, o: number, v: any) => primDesc._s(d, o, (v ?? nullValue) as number | bigint | boolean),
  } as any;
}

/** Alias for `sentinel(primDesc, nullValue)`. */
export const nullable = sentinel;

/** Fixed-point scaled primitive (stores `Math.round(val * factor)` in `primDesc`, reads `raw / factor`). */
export function scaled<P extends PrimitiveDesc<any>>(
  primDesc: P,
  factor: number,
): PrimitiveDesc<'f64'>;
export function scaled<P extends PrimitiveDesc<any>>(
  primDesc: P,
  factor: number,
  nullOpt: { null: number } | number,
): NullablePrimitiveDesc<'f64'>;
export function scaled<P extends PrimitiveDesc<any>>(
  primDesc: P,
  factor: number,
  nullOpt?: { null?: number } | number,
): PrimitiveDesc<'f64'> | NullablePrimitiveDesc<'f64'> {
  const nv = typeof nullOpt === 'number' ? nullOpt : nullOpt?.null;
  return {
    ...sentinel(primDesc, nv as any),
    type: 'f64',
    _g: (d: DataView, o: number) => {
      const r = primDesc._g(d, o) as number;
      return Object.is(r, nv) ? null : r / factor;
    },
    _s: (d: DataView, o: number, v: any) =>
      primDesc._s(d, o, v == null ? (nv ?? 0) : Math.round(+v * factor)),
  };
}

/** Variable-length UTF-8 string stored in the tail arena via an 8-byte `[u32 off, u32 len]` descriptor. */
export const str: StrDesc = {
  kind: 'str',
  size: 8,
  align: 4,
  _fv: 0,
  rustType: 'CapnStr',
} as any;
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
const _reg: Record<string, any> = {};
function ptrDesc(kind: 'slice' | 'ref', target: any): any {
  const getEl = () => _reg[target] ?? (typeof target === 'function' ? target() : target);
  return {
    kind,
    get element() { return getEl(); },
    _fv: 0,
    size: 8,
    align: 4,
    get rustType(): string {
      return `Capn${kind === 'ref' ? 'Ref' : 'Slice'}<${getEl().rustType}>`;
    },
  };
}

/** Variable-length slice `CapnSlice<T>` stored in the tail arena via an 8-byte `[u32 off, u32 len]` descriptor. */
export function slice(element: SelfRef): SliceDesc<SelfRef>;
export function slice<E extends FieldDesc = FieldDesc>(element: E | (() => E)): SliceDesc<E>;
export function slice<E extends FieldDesc = FieldDesc>(element: E | (() => E) | SelfRef, kind: 'slice' | 'ref' = 'slice'): SliceDesc<any> { return ptrDesc(kind, element); }

/** Alias for `slice(element)`. */
export const list = slice;

/** Nullable relative-offset pointer `CapnRef<T>` (`[u32 off, u32 present]`, 8 bytes inline, supports recursive & circular graphs). */
export function ref(target: SelfRef): RefDesc<SelfRef>;
export function ref<S extends StructDefLike<any> = StructDefLike<any>>(target: S | (() => S)): RefDesc<S>;
export function ref<S extends StructDefLike<any> = StructDefLike<any>>(target: S | (() => S) | SelfRef): RefDesc<any> { return ptrDesc('ref', target); }
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
  _m: (WebAssembly.Memory & { offset?: number }) | WasmArena | null;
  _a?: InternalStructView;
  _k(): DataView;
  compact(): Uint8Array;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
}

interface ResolvedSource {
  d: DataView;
  o: number;
  max: number;
  m: WebAssembly.Memory | WasmArena | null;
}

function growMem(m: WebAssembly.Memory, end: number): void {
  if (end > m.buffer.byteLength) m.grow(Math.ceil((end - m.buffer.byteLength) / 65536));
}

function resolveSource(s: BufferSourceInput, o = 0): ResolvedSource {
  const v = ArrayBuffer.isView(s),
    m = !v && (s as any)?.buffer ? (s as WebAssembly.Memory | WasmArena) : null,
    b = v ? s.buffer : m ? m.buffer : (s as ArrayBufferLike),
    len = v ? s.byteLength : b.byteLength;
  if (o < 0 || o > len) oob();
  return {
    d: s instanceof DataView ? s : (m as any)?._d ?? new DataView(b, v ? s.byteOffset : 0, len),
    o,
    max: len - o,
    m,
  };
}
function defVal(desc: FieldDesc, plain: boolean): unknown {
  const d = new DataView(new ArrayBuffer(desc.size));
  return readVal({ def: desc as any, _d: d, _b: 0, _o: 0, _ws: desc.size, _m: null, _k: () => d } as any, desc, 0, plain);
}

const rootOf = (v: InternalStructView): InternalStructView => {
  while (v._a) v = v._a;
  return v;
};

function allocTail(v: InternalStructView, bytes: number, align: number): number {
  const root = rootOf(v),
    m = root._m;
  if (m && '_u8' in m) {
    const p = m._alloc(bytes, align, true);
    if (root._tl !== undefined && m.offset > root._tl) root._tl = m.offset;
    v._d = root._d = m._d;
    return p;
  }
  const d = root._k(),
    cur = Math.max(root._tl ?? root._o + al(root.byteLength, 8), m?.offset ?? 0),
    p = al(cur, align),
    end = p + bytes;
  if (end > d.byteLength) {
    if (m) {
      growMem(m, end);
      root._d = new DataView(m.buffer);
    } else {
      const nb = new ArrayBuffer(Math.max(al(end, 8), d.byteLength * 2, 64));
      new Uint8Array(nb).set(u8s(d, 0, cur));
      root._d = new DataView(nb);
    }
    v._d = root._d;
  } else if (bytes) {
    u8s(d, p, bytes).fill(0);
  }
  root._tl = end;
  if (m) m.offset = end;
  return p;
}

function mutVar(
  v: InternalStructView | null,
  off: number,
  base: number,
  count: number,
  elSize: number,
  align: number,
): number {
  const bytes = count * elSize;
  if (!v) {
    const st = count ? al(tail, align) : tail;
    ensureScratch((tail = st + bytes) + 64);
    sU8.fill(0, st, tail);
    setDesc(off, count ? st - base : 0, count);
    return st;
  }
    const root = rootOf(v),
      d = v._k(),
    oldP = d.getUint32(off, true),
    oldB = d.getUint32(off + 4, true) * elSize,
    st0 = base + oldP,
    inTail = oldP > 0 && st0 >= root._o + root.byteLength,
    atTip = inTail && oldB > 0 && st0 + oldB === (root._tl ?? root._o + root.byteLength);
  let st = st0;
  if (inTail && bytes <= oldB) {
    if (atTip) root._tl = st0 + bytes;
    if (oldB > bytes) root._dead = (root._dead ?? 0) + (oldB - bytes);
  } else {
    if (atTip && !root._m) root._tl = st0;
    else if (inTail && oldB) root._dead = (root._dead ?? 0) + oldB;
    st = allocTail(root, bytes, align);
  }
  if (bytes) u8s(root._d, st, bytes).fill(0);
  setDesc(off, count ? st - base : 0, count, root._d);
  return st;
}
function upgradeView(v: InternalStructView): void {
  if (v._ws < v.def.size) rootOf(v).compact();
  }
let _budget = 0;
let _rSeen: Map<number, Record<string, unknown>> | null = null;
let _wSeen: Map<object, number> | null = null;
let _wActive: Set<object> | null = null;
let _wFix: [number, number, number][] | null = null;

function readVal(v: InternalStructView, desc: FieldDesc, off: number, plain: boolean): unknown {
  const d = v._k(),
    k = desc.kind;
  if (k === 'primitive') {
    const r = desc._g(d, off);
    return plain && r instanceof Uint8Array ? Array.from(r) : r;
  }
  const minP = v._o === v._b ? v._o + v._ws : v._b;
  if (k !== 'struct') {
    const el = (desc as any).element,
      sz = el ? el.size : 1,
      n = k === 'array' ? desc.length : d.getUint32(off + 4, true);
    if (k !== 'array') {
      if (!n && (k === 'str' || k === 'ref')) return k === 'str' ? '' : null;
      const p = n ? v._b + d.getUint32(off, true) : v._b,
        bl = (k === 'ref' ? 1 : n) * sz,
        inTbl = el === v.def && p >= v._b && p < minP && (p - v._b) % (v._ws || v.def.size) === 0;
      if (n && ((!inTbl && p < minP) || p + bl > d.byteLength || (!inTbl && p < off + 8 && p + bl > off))) oob();
      if (k === 'ref') return readVal(v, el, p, plain);
      off = p;
    }
    if (k === 'str') return plain && (_budget -= n) < 0 ? oob() : textDecoder.decode(u8s(d, off, n));
    const tot = d.byteOffset + off;
    if (!plain && el._C && el.type !== 'bool' && tot % sz === 0)
      return new el._C(d.buffer, tot, n);
    if (!plain && el.kind === 'struct') {
      const sav = new StructArrayView(el, d, off, n, v._b);
      sav._m = v._m;
      sav._a = v;
      return sav;
    }
    if (plain && (_budget -= n * sz) < 0) oob();
    return Array.from({ length: n }, (_, i) => readVal(v, el, off + i * sz, plain));
  }
  if (!plain) {
    if (desc === v.def && v === (v as any)._a?._c) {
      v._o = off;
      return v;
    }
    const nv = new StructViewBase(desc, d, v._b, off, v._m);
      nv._ws = desc === v.def ? v._ws : desc.size;
      nv._a = v;
      return nv;
  }
  const prev = _rSeen?.get(off);
  if (prev) return prev;
  const ws = desc === v.def ? (v._ws ?? desc.size) : desc.size;
  if ((_budget -= ws) < 0) oob();
  const out: Record<string, unknown> = {};
  _rSeen?.set(off, out);
  for (const f of desc.fieldList) {
    if ((v as any)._hdr && (f.desc as any)._fv >= 0) continue;
    out[f.name] =
      f.offset + f.size > ws
        ? defVal(f.desc, true)
        : readVal(v, f.desc, off + f.offset, true);
  }
  return out;
}
function readPlain(v: any, o?: number): any {
  _budget = Math.max(v._k().byteLength * 8, 65536);
  _rSeen = new Map();
  try {
    return o === undefined && 'length' in v
      ? Array.from({ length: v.length }, (_, i) => readVal(v, v.def, v._o + i * v.stride, true))
      : readVal(v, v.def, o ?? v._o, true);
  } finally {
    _rSeen = null;
  }
}
function setDesc(off: number, ptr: number, len: number, d: DataView = sDv): void {
  d.setUint32(off, ptr, true);
  d.setUint32(off + 4, len, true);
}
function fixFv(d: DataView, f: number, ts: number): void {
  const h = d.getUint32(f, true) || d.getUint32(f + 4, true) ? 4 : 0;
  d.setUint32(f + h, ts | (h >> 2), true);
}

function writeVal(
  v: InternalStructView | null,
  desc: FieldDesc,
  val: unknown,
  base: number,
  off: number,
): void {
  if (val === undefined || (val === null && desc.kind !== 'ref' && (desc as any)._null === undefined)) return;
  const top = _wSeen === null && desc.kind !== 'primitive' && desc.kind !== 'str',
    dv = () => (v ? v._k() : sDv);
  if (top) {
    _wSeen = new Map();
    _wActive = new Set();
    _wFix = [];
  }
  try {
    const k = desc.kind;
    if (k === 'primitive') {
      (desc as PrimitiveDesc)._s(dv(), off, val as number | bigint | boolean);
    } else if (k === 'str') {
      const b = textEncoder.encode(String(val)),
        st = mutVar(v, off, base, b.byteLength, 1, 1);
      u8s(dv(), st, b.byteLength).set(b);
    } else if (k === 'ref') {
      const el = desc.element;
      if (val === null) mutVar(v, off, base, 0, el.size, el.align);
      else {
        const d = dv(),
          sv =
            val instanceof MemView && val._k().buffer === d.buffer && val._d.byteOffset === d.byteOffset
              ? val._o
              : _wSeen?.get(val as object);
        if (sv !== undefined) setDesc(off, sv - base, 1, d);
        else writeVal(v, el, val, base, mutVar(v, off, base, 1, el.size, el.align));
      }
    } else if (k === 'array' || k === 'slice') {
      const el = desc.element,
        isSav = val instanceof StructArrayView,
        isRaw = el.kind === 'struct' && (el as any)._fv < 0 && ArrayBuffer.isView(val),
        src: ArrayLike<unknown> = isSav || isRaw || 'length' in (val as any) ? (val as any) : Array.from(val as any),
        rawLen = isRaw ? ((val as ArrayBufferView).byteLength / el.size) | 0 : src.length,
        n = k === 'array' ? desc.length : rawLen,
        cp = Math.min(n, rawLen) * el.size,
        st = k === 'slice' ? mutVar(v, off, base, n, el.size, el.align) : off,
        d = dv();
      if (v && k !== 'slice' && n) u8s(d, st, n * el.size).fill(0);
    const sb =
      isRaw || (el._C && val instanceof el._C)
        ? u8s(val as ArrayBufferView, 0, cp)
            : null;
      if (sb) {
        if (cp) u8s(d, st, cp).set(sb);
      } else {
        const m = Math.min(n, src.length),
          savCur = isSav ? (val as StructArrayView<any>)._mv(0) : null;
        if (el.kind === 'struct' && _wSeen && !isSav)
          for (let i = 0; i < m; i++) {
            const it = src[i];
            if (it && typeof it === 'object' && !Array.isArray(it) && !_wSeen.has(it)) _wSeen.set(it, st + i * el.size);
          }
        for (let i = 0; i < m; i++)
          writeVal(v, el, savCur ? (val as StructArrayView<any>)._mv(i, savCur) : src[i], base, st + i * el.size);
        if ((el as any)._null !== undefined)
          for (let i = m; i < n; i++) (el as any)._s(dv(), st + i * el.size, null);
      }
  } else if (k === 'struct') {
    const rec = val as Record<string, unknown>,
      isTuple = Array.isArray(rec),
      trackObj = !isTuple && !(rec instanceof MemView);
    if (trackObj) {
        if (_wActive?.has(rec)) {
          _wFix!.push([off, _wSeen!.get(rec)!, desc.size]);
          return;
        }
        if (_wSeen && !_wSeen.has(rec)) _wSeen.set(rec, off);
        _wActive?.add(rec);
      }
      if (v && v._ws < desc.size) upgradeView(v);
      for (let i = 0; i < desc.fieldList.length; i++) {
        const f = desc.fieldList[i],
          fv = isTuple ? (rec as unknown[])[i] : rec[f.name];
        if (fv !== undefined) writeVal(v, f.desc, fv, base, off + f.offset);
        else if ((!v || off !== v._o) && (f.desc as any)._null !== undefined)
          (f.desc as any)._s(dv(), off + f.offset, null);
      }
      if (trackObj) _wActive?.delete(rec);
    }
  } finally {
    if (top) {
      const dEnd = dv();
      for (const [dst, src, sz] of _wFix!) u8s(dEnd, dst, sz).set(u8s(dEnd, src, sz));
      _wSeen = _wActive = _wFix = null;
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
  declare _a?: InternalStructView;
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
    if (this._a) return (this._d = this._a._k());
    const m = this._m as any;
    if (m && m.buffer !== this._d.buffer) this._d = m._d ?? new DataView(m.buffer);
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
  /** Total active + dead bytes occupied by this view's fixed table and tail arena. */
  get usedByteLength(): number {
    const r = rootOf(this);
    return Math.max(r.byteLength, (r._tl ?? 0) - r._o);
  }
  /** Dead bytes in the tail arena reclaimable via `.compact()`. */
  get deadByteLength(): number {
    return rootOf(this)._dead ?? 0;
  }

  /** Ratio (`0..1`) of dead tail bytes to total used bytes. */
  get compactionRatio(): number {
    const used = this.usedByteLength;
    return used > 0 ? Math.min(1, this.deadByteLength / used) : 0;
  }


  /** Returns a structured inspection summary (`{ schema, stride, rowCount, usedByteLength, deadByteLength, compactionRatio, data }`). */
  toDebugObject(): {
    schema: string;
    stride: number;
    rowCount: number;
    usedByteLength: number;
    deadByteLength: number;
    compactionRatio: number;
    data: unknown;
  } {
    const a = this as any;
    return {
      schema: this.def.rustType,
      stride: a.stride ?? this.def.size,
      rowCount: a.length ?? 1,
      usedByteLength: this.usedByteLength,
      deadByteLength: this.deadByteLength,
      compactionRatio: this.compactionRatio,
      data: a.toJSON(),
    };
  }
  /** Re-packs only live fields and tail data into a tight `Uint8Array` and rebinds this view in-place. */
  compact(): Uint8Array {
    const a = this as any,
      isArr = 'length' in a,
      p = pack(this.def as StructDef<F>, (isArr ? a.toJSON() : [a.toJSON()]) as any),
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
    if (this._dirty || this._dead || (this.def._fv >= 0 && this._b !== this._o)) return this.compact();
    const d = this._k(),
      rawEnd = Math.max(this.byteLength, (this._tl ?? 0) - this._o),
      end = !this._m && this._tl !== undefined ? Math.min(d.byteLength - this._o, al(rawEnd, 8)) : rawEnd;
    if (this.byteLength && this.def._fv >= 0) {
      const ts = al(this.byteLength, 8),
        f = this._b + this.def._fv,
        p0 = d.getUint32(f, true);
      if (this._tl !== undefined && p0 > ts) return this.compact();
      if (p0 < ts && end >= ts) fixFv(d, f, ts);
    }
    return u8s(d, this._o, end);
  }
  toJSON(): any {
    return readPlain(this);
  }
}

export class StructViewBase<
  F extends FieldRecord = FieldRecord,
> extends MemView<F> {
  /** @internal */
  constructor(
    def: StructDefLike<F>,
    dv: DataView,
    base: number,
    off: number,
    mem: WebAssembly.Memory | WasmArena | null = null,
  ) {
    super();
    Object.defineProperties(this, def._D)._set(dv, base, off, mem);
  }

  /** Re-positions this flyweight cursor to row `index` (supports negative indices from the end). */
  seek(index: number): this {
    if (this._a instanceof StructArrayView) return this._a.at(index, this as unknown as StructView<F>) as unknown as this;
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
  /** Updates multiple fields in-place from a partial object or positional tuple. */
  set(values: Partial<StructInput<F>> | readonly unknown[]): this;
  set(fieldOrValues: unknown, value?: unknown): this {
    if (typeof fieldOrValues === 'string') (this as any)[fieldOrValues] = value;
    else writeVal(this as any, this.def, fieldOrValues, this._b, this._o);
    return this;
  }
  /** Updates multiple fields in-place from a partial object or positional tuple. */
  declare setAll: (values: Partial<StructInput<F>> | readonly unknown[]) => this;
  declare toObject: () => PlainStructValues<F>;
  /** Serializes this struct view to a plain object for `JSON.stringify()`. */
  declare toJSON: () => PlainStructValues<F>;
}
const kInspect = /* @__PURE__ */ Symbol.for('nodejs.util.inspect.custom');
StructViewBase.prototype.at = StructViewBase.prototype.seek;
StructViewBase.prototype.setAll = StructViewBase.prototype.set;
(MemView.prototype as any)[kInspect] = StructViewBase.prototype.toObject = MemView.prototype.toJSON as any;
/** Zero-copy view over a single binary struct with direct getter/setter properties for every field in `F`. */
export type StructView<F extends FieldRecord = FieldRecord> =
  StructViewBase<F> & StructValues<F>;
function normOpts(
  b: number | ViewOptions | StructDefLike<any> = 0,
  c?: number,
  bo?: number,
  s?: number,
): { o: number; c?: number; b?: number; s?: number } {
  return typeof b === 'number'
    ? { o: b, c, b: bo, s }
    : { o: (b as any).byteOffset ?? 0, c: (b as any).count, b: (b as any).baseOffset, s: b.stride };
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
  const v = new StructViewBase(def, r.d, n.b ?? r.o, r.o, r.m) as StructView<F>;
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
    const sz = n.s ?? def.size,
      r = resolveSource(source, n.o),
      hasVar = def._fv >= 0 && def._fv < sz;
    let f = 0;
    if (n.c === undefined && r.max >= sz && hasVar) {
      f = (((def as any)._fvr && r.d.getUint32(r.o + def._fv + 4, true) & ~7) || r.d.getUint32(r.o + def._fv, true)) | 0;
      for (let ro = 0; f < sz && ro + sz <= r.max; ro += sz)
        for (const fl of def.fieldList)
          if ((fl.desc.kind === 'str' || fl.desc.kind === 'slice') && fl.offset < sz) {
            const p = r.d.getUint32(r.o + ro + fl.offset, true);
            if (p >= sz && p <= r.max) {
              f = p;
              break;
            }
          }
    }
    const len = n.c ?? (f >= sz && f <= r.max ? f / sz : r.max / sz) | 0,
      tot = len * sz;
    if (len < 0 || r.o < 0 || r.max < tot) oob();
    Object.assign(this, {
      def,
      stride: sz,
      length: len,
      byteLength: tot,
      _ws: sz,
      _tl: r.o + (!hasVar && n.c !== undefined ? tot : Math.max(tot, r.max)),
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
      nv = (v ? v._set(d, this._b, o, this._m) : new StructViewBase(this.def, d, this._b, o, this._m)) as StructView<F>;
    nv._ws = this._ws;
    nv._a = this;
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
    return out ? this._mv(index, out) : ((this._p ??= [])[index] = this._mv(index, this._p[index]));
  }

  /** Writes `value` into the struct at `index` (supports negative indices from the end). */
  set(index: number, value: Partial<StructInput<F>> | StructView<F> | readonly unknown[]): this {
    this.at(index).set(value as any);
    return this;
  }

  /** Appends one or more rows to the binary array, automatically growing capacity if needed. */
  push(...items: (Partial<StructInput<F>> | StructView<F> | readonly unknown[])[]): number {
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

  pop(): PlainStructValues<F> | undefined {
    if (!this.length) return undefined;
    const lastIdx = --this.length,
      val = readPlain(this, this._o + lastIdx * this.stride);
    this.byteLength = this.length * this.stride;
    if (this.def._fv >= 0) this._dead = (this._dead ?? 0) + this.stride;
    else if (this._tl === this._o + (lastIdx + 1) * this.stride) {
      this._tl -= this.stride;
      this._cap = this.length;
    }
    return val;
  }
  /** Returns a zero-copy `StructArrayView` over `[begin, end)` without copying bytes. */
  subarray(begin = 0, end = this.length): StructArrayView<F> {
    const len = this.length,
      cl = (i: number) => Math.max(0, Math.min(len, i < 0 ? len + i : i)),
      s = cl(begin),
      e = cl(end),
      sub = new StructArrayView(this.def, this._k(), this._o + s * this.stride, Math.max(0, e - s), this._b, this._ws);
    sub._m = this._m;
    sub._a = this;
    sub._dirty = (this.def._fv >= 0 && (s > 0 || e < len)) || Boolean(this._dirty || this._dead);
    return sub;
  }
  /** Alias for `subarray(begin, end)` returning a zero-copy `StructArrayView` slice over `[begin, end)`. */
  declare slice: (begin?: number, end?: number) => StructArrayView<F>;
  /** Calls `callbackfn` for each row using a flyweight cursor (`0` allocations). */
  forEach(fn: (row: StructView<F>, index: number, array: this) => void): void {
    this.map(fn);
  }
  /** Projects each row in this view into a new JavaScript array (`row` is a distinct `StructView` per element). */
  map<U = StructView<F>>(fn: (row: StructView<F>, index: number, array: this) => U = (r) => r as any): U[] {
    return Array.from({ length: this.length }, (_, i) => fn(this._mv(i), i, this));
  }
  /** Returns the first row matching `predicate` (or `undefined`). */
  find(fn: (row: StructView<F>, index: number, array: this) => unknown): StructView<F> | undefined {
    return this.map().find(fn as any);
  }
  /** Returns `true` if any row matches `predicate`. */
  some(fn: (row: StructView<F>, index: number, array: this) => unknown): boolean {
    return this.map().some(fn as any);
  }
  /** Returns `true` if every row matches `predicate`. */
  every(fn: (row: StructView<F>, index: number, array: this) => unknown): boolean {
    return this.map().every(fn as any);
  }
  /** Filters rows with a reusable flyweight cursor and returns a new `StructArrayView<F>` containing matching rows. */
  filter(fn: (row: StructView<F>, index: number) => unknown): StructArrayView<F> {
    const b = this.filterBytes(fn as any);
    return new StructArrayView(this.def, b, 0, b.byteLength ? undefined : 0);
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
      st = this.stride,
      rows: any[] = [];
    ensureScratch(len * st);
    let outOff = 0;
    for (let i = 0; i < len; i++)
      if (predicate(c.seek(i), i))
        def._fv < 0 && st === def.size && this._ws === st
          ? (sU8.set(u8s(this._k(), this._o + i * st, st), outOff), (outOff += st))
          : rows.push(c.toObject());
    return rows.length ? pack(def as StructDef<F>, rows) : sU8.slice(0, outOff);
  }

  /** Extracts a `TypedArray` column for primitive `field` (zero-copy when `stride === field.size`). */
  column<K extends PrimitiveFieldKeys<F>>(
    field: K,
  ): F[K] extends PrimitiveDesc<infer P> ? TypedArrayFor<P> : never {
    const lay = colDesc(this, field),
      desc = lay.desc,
      n = this.length,
      st = this.stride,
      fo = lay.offset,
      d = this._k(),
      start = d.byteOffset + this._o + fo,
      out = new desc._C!(n) as any;
    if (fo + desc.size <= this._ws) {
      if (desc.type !== 'bool' && (st === desc.size || n <= 1) && !(start % desc.align))
        return new desc._C!(d.buffer, start, n) as any;
      for (let i = 0, off = this._o + fo; i < n; i++, off += st) out[i] = desc._g(d, off);
    }
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
  declare toObjects: () => PlainStructValues<F>[];
  /** Serializes this array of rows to an array of plain objects for `JSON.stringify()`. */
  declare toJSON: () => PlainStructValues<F>[];
  /**
   * Iterates rows in this view. By default (`flyweight: true`), reuses a single flyweight cursor (`0` allocations).
   * Pass `{ flyweight: false }` when collecting `StructView` instances into an array/Set.
   */
  values(options?: { flyweight?: boolean }): IterableIterator<StructView<F>> {
    return (options?.flyweight === false ? this.map() : this)[Symbol.iterator]();
  }
  /** Zero-allocation flyweight iterator (`for (const row of view)`). Use `view.map(...)` or `view.toObjects()` when collecting rows. */
  *[Symbol.iterator](): IterableIterator<StructView<F>> {
    for (let i = 0, c = this.cursor(0), b = this._o, st = this.stride, n = this.length; i < n; i++) {
      c._o = b + i * st;
      yield c;
    }
  }
}
StructArrayView.prototype.slice = StructArrayView.prototype.subarray;
StructArrayView.prototype.toObjects = MemView.prototype.toJSON as any;
function colDesc(a: StructArrayView<any>, k: PropertyKey): FieldLayout<PrimitiveDesc<any>> {
  const lay = a.def.fields[k as string];
  if (!lay?.desc._C) oob();
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

export type WasmTarget =
  | WasmArena
  | WebAssembly.Memory
  | WebAssembly.Instance
  | {
      readonly memory: WebAssembly.Memory;
      readonly capn_alloc?: (byteLength: number) => number;
      readonly alloc?: (byteLength: number) => number;
    };

export interface WasmSlice<F extends FieldRecord = FieldRecord> {
  readonly view: StructArrayView<F>;
  readonly ptr: number;
  readonly len: number;
  readonly byteLength: number;
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
    this.memory = (backing as any)?.buffer ? (backing as WebAssembly.Memory) : null;
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
    this._u8 = u8s((this._d = new DataView(buf)));
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
    return (this.offset = al(this.offset, align));
  }

  ensureCapacity(requiredByteLength: number): this {
    this.sync();
    if (requiredByteLength <= this._buf.byteLength) return this;
    if (this.memory !== null) {
      growMem(this.memory, requiredByteLength);
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

  alloc<F extends FieldRecord>(
    def: StructDef<F>,
    count = 1,
    zero = false,
  ): StructArrayView<F> {
    const p = this._alloc(count * def.size, def.align, zero);
    initNulls(def, this._d, p, count);
    const v = new StructArrayView(def, this, p, count, p);
    v._tl = p + count * def.size;
    return v;
  }

  allocOne<F extends FieldRecord>(
    def: StructDef<F>,
    init?: Partial<StructInput<F>>,
  ): StructView<F> {
    const p = this._alloc(def.size, def.align, true),
      v = new StructViewBase(def, this._d, p, p, this) as StructView<F>;
    initNulls(def, this._d, p);
    return init !== undefined ? v.setAll(init) : v;
  }

  placeBytes<F extends FieldRecord = FieldRecord>(
    bytes: Uint8Array | ArrayBufferView,
    alignOrDef: number | StructDefLike<F> = 8,
  ): PlacedBytes {
    const u = u8s(bytes as any),
      p = this._alloc(
        u.byteLength,
        typeof alignOrDef === 'number' ? alignOrDef : alignOrDef.align,
      );
    this._u8.set(u, p);
    return Object.defineProperties(new Uint8Array(this._buf, p, u.byteLength) as PlacedBytes, {
      ptr: hid(p),
      as: hid(<SF extends FieldRecord>(def: StructDef<SF>, count = def.array(u).length) => {
        const v = new StructArrayView(def, this, p, count, p);
        v._tl = p + u.byteLength;
        return v;
      }),
    });
  }

  view<F extends FieldRecord>(
    def: StructDef<F>,
    byteOffset: number,
    baseOffset = byteOffset,
  ): StructView<F> {
    return structView(def, this, byteOffset, baseOffset);
  }

  viewArray<F extends FieldRecord>(
    def: StructDef<F>,
    byteOffset: number,
    count: number,
    baseOffset = byteOffset,
  ): StructArrayView<F> {
    return new StructArrayView(def, this, byteOffset, count, baseOffset);
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
  /** Fixed struct header byte size (alias for `size`, useful for partial `file.slice(0, Schema.byteSize)` reads). */
  declare readonly byteSize: number;
  declare readonly stride: number;
  declare readonly align: number;
  declare readonly schema: F;
  declare readonly fields: { readonly [K in keyof F]: FieldLayout<F[K]> };
  declare readonly fieldList: readonly FieldLayout[];
  /** Phantom type helper: `typeof MySchema.$view` resolves to `StructView<F>`. */
  declare readonly $view: StructView<F>;
  /** Phantom type helper: `typeof MySchema.$header` resolves to `StructHeaderView<F>`. */
  declare readonly $header: StructHeaderView<F>;
  /** Phantom type helper: `typeof MySchema.$plain` resolves to `PlainStructValues<F>`. */
  declare readonly $plain: PlainStructValues<F>;
  /** Phantom type helper: `typeof MySchema.$input` resolves to `Partial<StructInput<F>>`. */
  declare readonly $input: Partial<StructInput<F>>;
  /** @internal */
  declare readonly _fv: number;
  declare readonly _D: PropertyDescriptorMap;
  constructor(name: string, schemaOrBuilder: F | ((self: SelfRef) => F)) {
    if (name) _reg[name] = this;
    const schema = typeof schemaOrBuilder === 'function' ? schemaOrBuilder((() => this) as unknown as SelfRef) : schemaOrBuilder;
    if (!schema) oob();
    let off = 0, maxA = 1;
    let firstV = -1,
      fvr = false;
    const fObj: Record<string, FieldLayout> = {},
      descs: PropertyDescriptorMap = { ...BASE_DESCS };
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
      if ((d as any)._fv >= 0 && firstV < 0) {
        firstV = dk === 'struct' ? fo + d._fv : fo;
        fvr = dk === 'ref';
      }
      const end = fo + d.size;
      descs[k] = {
        enumerable: true,
        configurable: true,
        get(this: StructViewBase<F>) {
          return end > this._ws
            ? defVal(d, false)
            : dk === 'primitive'
              ? d._g(this._k(), this._o + fo)
              : readVal(this, d, this._o + fo, false);
        },
        set(this: StructViewBase<F>, v: unknown) {
          if (end > this._ws) upgradeView(this);
          writeVal(this, d, v, this._b, this._o + fo);
        },
      };
    }
    const sz = al(off, maxA);
    descs._ws = descs.byteLength = hid(sz);
    descs.def = hid(this);
    Object.assign(this, {
      kind: 'struct',
      name,
      rustType: name || 'AnonStruct',
      size: sz,
      byteSize: sz,
      stride: sz,
      align: maxA,
      fields: fObj,
      fieldList: Object.values(fObj),
      _fv: firstV,
      _fvr: fvr,
      _D: descs,
    });
  }
  offsetOf<K extends keyof F>(field: K): number {
    return this.fields[field].offset;
  }

  /** Allocates a single `StructView<F>` backed by a fresh buffer and optionally initializes fields. */
  create(init?: Partial<StructInput<F>> | readonly unknown[]): StructView<F> {
    const v = this.view(new ArrayBuffer(this.size));
    initNulls(this, v._d, 0);
    return init !== undefined ? v.setAll(init) : v;
  }

  /** Infers `Partial<StructInput<F>>` on a plain JS object literal (for building typed cyclic JS graphs without `any`). */
  item(init: Partial<StructInput<F>>): Partial<StructInput<F>> {
    return init;
  }
  view(
    source: BufferSourceInput,
    byteOffset?: number | ViewOptions | StructDefLike<any>,
    baseOffset?: number,
    wireStride?: number,
  ): StructView<F> {
    return structView(this, source, byteOffset, baseOffset, wireStride);
  }
  /**
   * Wraps a partial binary buffer containing at least `this.byteSize` bytes (e.g. `file.slice(0, Schema.byteSize)`)
   * in a type-safe header view exposing only inline fixed-offset fields (omitting tail-allocated `str`, `slice`, and `ref` fields).
   */
  viewHeader(
    source: BufferSourceInput,
    byteOffset?: number | ViewOptions,
  ): StructHeaderView<F> {
    const v = structView(this, source, byteOffset) as any;
    v._hdr = 1;
    return v;
  }
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
  alloc(count: number, Ctor: typeof ArrayBuffer = ArrayBuffer): StructArrayView<F> {
    const a = this.array(new Ctor(count * this.size), 0, count);
    initNulls(this, a._d, 0, count);
    return a;
  }

  from(
    sourceOrRows:
      | readonly (Partial<StructInput<F>> | readonly unknown[])[]
      | Iterable<Partial<StructInput<F>> | readonly unknown[]>
      | BufferSourceInput
      | StructArrayView<F>
      | number,
  ): StructArrayView<F> {
    if (typeof sourceOrRows === 'number') return this.alloc(sourceOrRows);
    if (sourceOrRows instanceof StructArrayView) return sourceOrRows;
    if ('byteLength' in (sourceOrRows as any) || (sourceOrRows as any)?.buffer) {
      return this.array(sourceOrRows as BufferSourceInput);
    }
    return this.array(this.pack([...(sourceOrRows as any)]));
  }

  shared(
    rowsOrCount:
      | readonly (Partial<StructInput<F>> | readonly unknown[])[]
      | number,
  ): StructArrayView<F> {
    const B: typeof ArrayBuffer =
      typeof SharedArrayBuffer !== 'undefined'
        ? (SharedArrayBuffer as any)
        : ArrayBuffer;
    if (typeof rowsOrCount === 'number') return this.alloc(rowsOrCount, B);
    const p = this.pack(rowsOrCount),
      sb = new B(p.byteLength);
    new Uint8Array(sb).set(p);
    return this.array(sb);
  }

  /** Allocates or packs a `StructArrayView<F>` directly inside `WebAssembly.Memory` (via `WasmArena` or exported `capn_alloc`/`alloc`) and returns `{ view, ptr, len, byteLength }`. */
  inWasm(
    wasmMemoryOrExports: WasmTarget,
    rowsOrCount:
      | readonly (Partial<StructInput<F>> | readonly unknown[])[]
      | Iterable<Partial<StructInput<F>> | readonly unknown[]>
      | BufferSourceInput
      | StructArrayView<F>
      | number,
  ): WasmSlice<F> {
    const exp: any = (wasmMemoryOrExports as any)?.exports ?? wasmMemoryOrExports,
      src = typeof rowsOrCount === 'number' ? null : this.from(rowsOrCount),
      u = src?.bytes,
      len = src ? src.length : (rowsOrCount as number),
      byteLength = u ? u.byteLength : len * this.size,
      mem: any = exp._d ? exp : exp.memory ?? exp,
      fn = exp.capn_alloc ?? exp.alloc,
      ptr = exp._alloc
        ? exp._alloc(byteLength, this.align)
        : fn
          ? byteLength && fn.call(exp, byteLength) >>> 0
          : al(mem.offset ?? 64, this.align),
      end = (mem.offset = Math.max(mem.offset ?? 0, ptr + byteLength));
    if (!exp._d) growMem(mem, end);
    const view = this.array(mem, ptr, len, ptr);
    view._tl = end;
    u ? u8s(view._d, ptr, byteLength).set(u) : (u8s(view._d, ptr, byteLength).fill(0), initNulls(this, view._d, ptr, len));
    return { view, ptr, len, byteLength };
  }
  /** Packs an array of plain JavaScript objects or positional tuples into an 8-byte-aligned `Uint8Array`. */
  pack(rows: readonly (Partial<StructInput<F>> | readonly unknown[])[]): Uint8Array {
    return pack(this, rows);
  }
  concatBytes(chunks: readonly (StructArrayView<F> | Uint8Array)[]): Uint8Array {
    return concatBytes(this, chunks);
  }
}


/** Concatenates multiple `StructArrayView<F>` or `Uint8Array` chunks into a single packed `Uint8Array` via bulk `memcpy` when fixed-size. */
export function concatBytes<F extends FieldRecord>(
  def: StructDef<F>,
  chunks: readonly (StructArrayView<F> | Uint8Array)[],
): Uint8Array {
  if (def._fv >= 0) return pack(def, chunks.flatMap((c) => def.from(c as any).toObjects()) as any);
  const slices = chunks.map((c) =>
    c instanceof Uint8Array ? (c.byteLength % def.size && oob(), c) : c.stride === def.size ? c.bytes : c.compact(),
  );
  const out = new Uint8Array(slices.reduce((s, b) => s + b.byteLength, 0));
  let off = 0;
  for (const s of slices) (out.set(s, off), (off += s.byteLength));
  return out;
}

/** Packs an array of plain JavaScript objects into an 8-byte-aligned `Uint8Array`. */
export function pack<F extends FieldRecord>(
  def: StructDef<F>,
  rows: readonly (Partial<StructInput<F>> | readonly unknown[])[],
): Uint8Array {
  const n = rows.length;
  const st = def.size;
  const tb = n * st;
  const ts = def._fv >= 0 ? al(tb, 8) : tb;
  ensureScratch(ts + n * 64 + 64);
  sU8.fill(0, 0, ts);
  tail = ts;
  writeVal(null, { kind: 'array', element: def, length: n } as any, rows, 0, 0);
  if (n && def._fv >= 0 && sDv.getUint32(def._fv, true) < ts) fixFv(sDv, def._fv, ts);
  const end = al(tail, 8);
  sU8.fill(0, tail, end);
  return sU8.slice(0, end);
}
/** Compiles a declarative `#[repr(C)]` struct schema with zero-copy `StructView` and `StructArrayView` accessors. */
export function defineStruct<F extends FieldRecord>(fields: F | ((self: SelfRef) => F)): StructDef<F>;
/** Compiles a named `#[repr(C)]` struct schema (used by `toRustReprC()` codegen). */
export function defineStruct<F extends FieldRecord>(
  name: string,
  fields: F | ((self: SelfRef) => F),
): StructDef<F>;
export function defineStruct<F extends FieldRecord>(
  nameOrFields: string | F | ((self: SelfRef) => F),
  maybeFields?: F | ((self: SelfRef) => F),
): StructDef<F> {
  return typeof nameOrFields === 'string'
    ? new StructDef(nameOrFields, maybeFields!)
    : new StructDef('', nameOrFields);
}

/** Alias for `defineStruct`. */
export const struct = defineStruct;

const _dtf = {
  header(x: any) {
    if (!(x instanceof MemView)) return null;
    const n = x.def?.name || 'Struct';
    if ('length' in x) return ['span', {}, `${n}[${x.length}] (${x.usedByteLength} B)`];
    const ks = Object.keys(x);
    return ['span', {}, `${n} { ${ks.slice(0, 4).map((k) => `${k}: ${JSON.stringify((x as any)[k])}`).join(', ')}${ks.length > 4 ? ', ...' : ''} }`];
  },
  hasBody: (x: any) => x instanceof MemView,
  body: (x: any) => ['div', {}, ['object', { object: x.toJSON() }]],
};

/** Registers a lazy Chrome/Edge/Firefox DevTools custom formatter (`globalThis.devtoolsFormatters`) for `StructView` and `StructArrayView`. */
export function installDevtoolsFormatter(): typeof _dtf {
  const g = globalThis as any;
  const list: any[] = (g.devtoolsFormatters ??= []);
  if (!list.includes(_dtf)) list.push(_dtf);
  return _dtf;
}
