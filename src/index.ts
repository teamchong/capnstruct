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
export interface OptStrDesc {
  readonly kind: 'optStr';
  readonly size: 8;
  readonly align: 4;
  readonly rustType: 'CapnOptStr';
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

export interface RefDesc<S extends StructDefLike<any> | UnionDefLike<any> | SelfRef = StructDefLike<any>> {
  readonly kind: 'ref';
  readonly element: S;
  readonly size: 8;
  readonly align: 4;
  readonly rustType: string;
}

export interface UnionVariantLayout<D extends FieldDesc | null = FieldDesc | null> {
  readonly name: string;
  readonly tag: number;
  readonly desc: D;
  readonly payloadOffset: number;
}
export type UnionVariantDesc = FieldDesc | SelfRef | null;
export type UnionVariantRecord = Record<string, UnionVariantDesc>;
export interface UnionDefLike<V extends UnionVariantRecord = UnionVariantRecord> {
  readonly kind: 'union';
  readonly name: string;
  readonly rustType: string;
  readonly size: number;
  readonly byteSize: number;
  readonly stride: number;
  readonly align: number;
  readonly unitOnly: boolean;
  readonly variants: V;
  readonly variantList: readonly UnionVariantLayout[];
  readonly byName: Record<string, UnionVariantLayout>;
  /** @internal */
  readonly _fv: number;
  /** @internal */
  readonly _fvs: number;
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
  readonly _fvs: number;
  /** @internal */
  readonly _fvr?: boolean;
  /** @internal */
  readonly _K: readonly string[];
  /** @internal */
  readonly _G: readonly PropertyDescriptor[];
}

export type FieldDesc =
  | PrimitiveDesc
  | NullablePrimitiveDesc
  | FixedStrDesc
  | StrDesc
  | OptStrDesc
  | FixedBytesDesc
  | ArrayDesc<any, number>
  | SliceDesc<any>
  | RefDesc<any>
  | UnionDefLike<any>
  | StructDefLike<any>;
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

type UnionPayloadValue<D extends FieldDesc, V extends UnionVariantRecord, SelfF extends FieldRecord = FieldRecord> =
  D extends RefDesc<SelfRef>
    ? UnionValue<V, SelfF> | null
    : D extends SliceDesc<SelfRef>
      ? UnionArrayView<V, SelfF>
      : FieldValue<D, SelfF>;
type UnionPayloadInput<D extends FieldDesc, V extends UnionVariantRecord, SelfF extends FieldRecord = FieldRecord> =
  D extends RefDesc<SelfRef>
    ? UnionInput<V, SelfF> | null | undefined
    : D extends SliceDesc<SelfRef>
      ? UnionArrayView<V, SelfF> | ArrayLike<UnionInput<V, SelfF>> | Iterable<UnionInput<V, SelfF>>
      : FieldInput<D, SelfF>;
type PlainUnionPayload<D extends FieldDesc, V extends UnionVariantRecord, SelfF extends FieldRecord> =
  D extends RefDesc<SelfRef>
    ? PlainUnionValue<V, SelfF> | null
    : D extends SliceDesc<SelfRef>
      ? PlainUnionValue<V, SelfF>[]
      : PlainFieldValue<D, SelfF>;
export type UnionValue<V extends UnionVariantRecord, SelfF extends FieldRecord = FieldRecord> = {
  [K in keyof V & string]: V[K] extends null
    ? { readonly tag: K }
    : V[K] extends SelfRef
      ? { readonly tag: K; readonly value: UnionValue<V, SelfF> }
      : V[K] extends FieldDesc
        ? { readonly tag: K; readonly value: UnionPayloadValue<V[K], V, SelfF> }
        : never;
}[keyof V & string];
export type UnionInput<V extends UnionVariantRecord, SelfF extends FieldRecord = FieldRecord> = {
  [K in keyof V & string]: V[K] extends null
    ? { readonly tag: K }
    : V[K] extends SelfRef
      ? { readonly tag: K; readonly value: UnionInput<V, SelfF> }
      : V[K] extends FieldDesc
        ? { readonly tag: K; readonly value: UnionPayloadInput<V[K], V, SelfF> }
        : never;
}[keyof V & string];
export type PlainUnionValue<V extends UnionVariantRecord, SelfF extends FieldRecord = FieldRecord> = {
  [K in keyof V & string]: V[K] extends null
    ? { readonly tag: K }
    : V[K] extends SelfRef
      ? { readonly tag: K; readonly value: PlainUnionValue<V, SelfF> }
      : V[K] extends FieldDesc
        ? { readonly tag: K; readonly value: PlainUnionPayload<V[K], V, SelfF> }
        : never;
}[keyof V & string];
export type FieldValue<D extends FieldDesc = FieldDesc, SelfF extends FieldRecord = FieldRecord> =
  D extends NullablePrimitiveDesc<infer P>
    ? PrimitiveTsType<P> | null
    : D extends PrimitiveDesc<infer P>
      ? PrimitiveTsType<P>
      : D extends StrDesc | FixedStrDesc
        ? string
        : D extends OptStrDesc
          ? string | null
          : D extends FixedBytesDesc
            ? Uint8Array
            : D extends ArrayDesc<infer E, number>
              ? E extends PrimitiveDesc<infer P>
                ? TypedArrayFor<P>
                : E extends StructDefLike<infer SF>
                  ? StructArrayView<SF>
                  : E extends SelfRef
                    ? StructArrayView<SelfF>
                    : E extends UnionDefLike<infer UV>
                      ? UnionArrayView<UV, SelfF>
                      : E extends FieldDesc
                        ? FieldValue<E, SelfF>[]
                        : never
              : D extends SliceDesc<infer E>
                ? E extends PrimitiveDesc<infer P>
                  ? TypedArrayFor<P>
                  : E extends StructDefLike<infer SF>
                    ? StructArrayView<SF>
                    : E extends SelfRef
                      ? StructArrayView<SelfF>
                      : E extends UnionDefLike<infer UV>
                        ? UnionArrayView<UV, SelfF>
                        : E extends FieldDesc
                          ? FieldValue<E, SelfF>[]
                          : never
                : D extends RefDesc<infer SF>
                  ? SF extends SelfRef
                    ? StructView<SelfF> | null
                    : SF extends StructDefLike<infer F>
                      ? StructView<F> | null
                      : SF extends UnionDefLike<infer UV>
                        ? UnionValue<UV, SelfF> | null
                        : never
                  : D extends UnionDefLike<infer UV>
                    ? UnionValue<UV, SelfF>
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
        : D extends OptStrDesc
          ? string | null | undefined
          : D extends FixedBytesDesc
            ? ArrayLike<number> | Iterable<number>
            : D extends ArrayDesc<infer E, number>
              ? E extends PrimitiveDesc<infer P>
                ? ArrayLike<PrimitiveInputType<P>> | Iterable<PrimitiveInputType<P>>
                : E extends StructDefLike<infer SF>
                  ? ArrayLike<Partial<StructInput<SF>> | StructView<SF> | readonly unknown[]>
                    | Iterable<Partial<StructInput<SF>> | StructView<SF> | readonly unknown[]>
                    | ArrayBufferView
                    | StructArrayView<SF>
                  : E extends UnionDefLike<infer UV>
                    ? UnionArrayView<UV, SelfF> | ArrayLike<UnionInput<UV, SelfF>> | Iterable<UnionInput<UV, SelfF>>
                    : E extends FieldDesc
                      ? ArrayLike<FieldInput<E, SelfF>> | Iterable<FieldInput<E, SelfF>>
                      : E extends SelfRef
                        ? ArrayLike<Partial<StructInput<SelfF>> | StructView<SelfF> | readonly unknown[]>
                          | Iterable<Partial<StructInput<SelfF>> | StructView<SelfF> | readonly unknown[]>
                        : never
              : D extends SliceDesc<infer E>
                ? E extends PrimitiveDesc<infer P>
                  ? ArrayLike<PrimitiveInputType<P>> | Iterable<PrimitiveInputType<P>>
                  : E extends StructDefLike<infer SF>
                    ? ArrayBufferView
                      | StructArrayView<SF>
                      | ArrayLike<Partial<StructInput<SF>> | StructView<SF> | readonly unknown[]>
                      | Iterable<Partial<StructInput<SF>> | StructView<SF> | readonly unknown[]>
                    : E extends SelfRef
                      ? ArrayBufferView
                        | StructArrayView<SelfF>
                        | ArrayLike<Partial<StructInput<SelfF>> | StructView<SelfF> | readonly unknown[]>
                        | Iterable<Partial<StructInput<SelfF>> | StructView<SelfF> | readonly unknown[]>
                      : E extends UnionDefLike<infer UV>
                        ? UnionArrayView<UV, SelfF> | ArrayLike<UnionInput<UV, SelfF>> | Iterable<UnionInput<UV, SelfF>>
                        : E extends FieldDesc
                          ? ArrayLike<FieldInput<E, SelfF>> | Iterable<FieldInput<E, SelfF>>
                          : never
                : D extends RefDesc<infer SF>
                  ? SF extends SelfRef
                    ? Partial<StructInput<SelfF>> | StructView<SelfF> | readonly unknown[] | null | undefined
                    : SF extends StructDefLike<infer F>
                      ? Partial<StructInput<F>> | StructView<F> | readonly unknown[] | null | undefined
                      : SF extends UnionDefLike<infer UV>
                        ? UnionInput<UV, SelfF> | null | undefined
                        : never
                  : D extends UnionDefLike<infer UV>
                    ? UnionInput<UV, SelfF>
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
        : D extends OptStrDesc
          ? string | null
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
                      : SF extends UnionDefLike<infer UV>
                        ? PlainUnionValue<UV, SelfF> | null
                        : never
                  : D extends UnionDefLike<infer UV>
                    ? PlainUnionValue<UV, SelfF>
                    : D extends StructDefLike<infer SF>
                      ? PlainStructValues<SF>
                      : never;
/** Plain JavaScript object representation of a struct schema `F`. */
export type PlainStructValues<F extends FieldRecord> = { [K in keyof F]: PlainFieldValue<F[K], F> };
/** True when field descriptor `D` is stored inline in the fixed-size struct header (`0` tail arena bytes). */
export type IsInlineField<D extends FieldDesc = FieldDesc> = D extends PrimitiveDesc<any> | NullablePrimitiveDesc<any> | FixedStrDesc<any> | FixedBytesDesc<any>
  ? true
  : D extends ArrayDesc<infer E, any>
    ? IsInlineField<E>
    : D extends UnionDefLike<infer UV>
      ? ({ [K in keyof UV]: UV[K] extends null ? true : UV[K] extends FieldDesc ? IsInlineField<UV[K]> : false }[keyof UV] extends true ? true : false)
      : D extends StructDefLike<infer SF>
        ? ({ [K in keyof SF]: IsInlineField<SF[K]> }[keyof SF] extends true ? true : false)
        : false;
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
/** Structural interface matching `WebAssembly.Memory` without requiring DOM/WebAssembly lib types. */
export interface WasmMemoryLike {
  readonly buffer: ArrayBuffer;
  grow(delta: number): number;
}
/** Structural interface matching `WebAssembly.Instance` without requiring DOM/WebAssembly lib types. */
export interface WasmInstanceLike {
  readonly exports: Record<string, unknown>;
}
/** Supported binary backing sources (`Uint8Array`, `ArrayBuffer`, `DataView`, `WebAssembly.Memory`, `WasmArena`). */
export type BufferSourceInput =
  | ArrayBufferLike
  | ArrayBufferView
  | WasmMemoryLike
  | WasmArena;
const _td = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null,
  _te = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
function utf8Dec(b: Uint8Array): string {
  if (_td) return _td.decode(b);
  let s = '',
    i = 0,
    n = b.length;
  while (i < n) {
    const c = b[i++];
    if (c < 0x80) s += String.fromCharCode(c);
    else if ((c & 0xe0) === 0xc0 && i < n) s += String.fromCharCode(((c & 31) << 6) | (b[i++] & 63));
    else if ((c & 0xf0) === 0xe0 && i + 1 < n) s += String.fromCharCode(((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63));
    else if ((c & 0xf8) === 0xf0 && i + 2 < n) {
      const cp = (((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63)) - 0x10000;
      s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else s += '\ufffd';
  }
  return s;
}
function utf8At(d: DataView, o: number, n: number): string {
  if (n < 48) {
    let s = '',
      i = 0;
    for (; i < n; i++) {
      const c = d.getUint8(o + i);
      if (c > 127) break;
      s += String.fromCharCode(c);
    }
    if (i === n) return s;
  }
  return utf8Dec(u8s(d, o, n));
}
function utf8Enc(s: string): Uint8Array {
  if (_te) return _te.encode(s);
  const out = new Uint8Array(s.length * 3);
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) out[n++] = c;
    else if (c < 0x800) (out[n++] = 0xc0 | (c >> 6)), (out[n++] = 0x80 | (c & 63));
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const nx = s.charCodeAt(i + 1);
      if (nx >= 0xdc00 && nx <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (nx - 0xdc00);
        i++;
        (out[n++] = 0xf0 | (c >> 18)), (out[n++] = 0x80 | ((c >> 12) & 63)), (out[n++] = 0x80 | ((c >> 6) & 63)), (out[n++] = 0x80 | (c & 63));
        continue;
      }
      (out[n++] = 0xef), (out[n++] = 0xbf), (out[n++] = 0xbd);
    } else if (c >= 0xdc00 && c <= 0xdfff) (out[n++] = 0xef), (out[n++] = 0xbf), (out[n++] = 0xbd);
    else (out[n++] = 0xe0 | (c >> 12)), (out[n++] = 0x80 | ((c >> 6) & 63)), (out[n++] = 0x80 | (c & 63));
  }
  return out.subarray(0, n);
}
function oob(): never { throw new RangeError('Out of bounds'); }
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
    _g(d: DataView, o: number) {
      const u = u8s(d, o, length),
        i = u.indexOf(0);
      return utf8Dec(i < 0 ? u : u.subarray(0, i));
    },
    _s(d: DataView, o: number, v: string) {
      const dst = u8s(d, o, length);
      dst.fill(0);
      if (_te) _te.encodeInto(String(v), dst);
      else {
        const b = utf8Enc(String(v));
        let e = Math.min(b.length, length);
        if (e < b.length) while (e > 0 && (b[e] & 0xc0) === 0x80) e--;
        dst.set(b.subarray(0, e));
      }
    },
  } as unknown as FixedStrDesc<N>;
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
/** Alias for `sentinel(primDesc, nullValue)`, or `nullable(str)` for a zero-overhead optional string (`optStr`). */
export function nullable(desc: StrDesc): OptStrDesc;
export function nullable<P extends PrimitiveDesc<any>>(primDesc: P, nullValue: PrimitiveTsType<P['type']>): NullablePrimitiveDesc<P['type']>;
export function nullable(desc: StrDesc | PrimitiveDesc<any>, nullValue?: unknown): OptStrDesc | NullablePrimitiveDesc<any> {
  return desc.kind === 'str' ? optStr : sentinel(desc, nullValue as never);
}
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
export const str: StrDesc = { kind: 'str', size: 8, align: 4, _fv: 0, _fvs: 0, rustType: 'CapnStr' } as unknown as StrDesc;
/** Zero-overhead optional UTF-8 string (`CapnOptStr`, 8 bytes `[u32 off, u32 len]`: `{0, 0}` = `null`, `{1, 0}` = `""`, `{off, len}` = non-empty). */
export const optStr: OptStrDesc = { kind: 'optStr', size: 8, align: 4, _fv: 0, _fvs: -1, rustType: 'CapnOptStr' } as unknown as OptStrDesc;
export function fixedArray<E extends FieldDesc, N extends number>(element: E, length: N): ArrayDesc<E, N> {
  chkLen(length);
  const elMeta = element as FieldDesc & { _fv?: number; _fvs?: number; _fvr?: boolean };
  return {
    kind: 'array',
    element,
    length,
    size: element.size * length,
    align: element.align,
    _fv: length > 0 && elMeta._fv !== undefined && elMeta._fv >= 0 ? elMeta._fv : -1,
    _fvs: length > 0 && elMeta._fvs !== undefined && elMeta._fvs >= 0 ? elMeta._fvs : -1,
    _fvr: length > 0 && Boolean(elMeta._fvr),
    rustType: `[${element.rustType}; ${length}]`,
  } as ArrayDesc<E, N>;
}
/** Alias for `fixedArray(element, length)`. */
export const array = fixedArray;
/** Variable-length slice `CapnSlice<T>` stored in the tail arena via an 8-byte `[u32 off, u32 len]` descriptor. */
const _reg: Record<string, FieldDesc> = {};
function ptrDesc(kind: 'slice' | 'ref', target: unknown): SliceDesc<FieldDesc> | RefDesc<StructDefLike> {
  const getEl = (): FieldDesc => _reg[target as string] ?? (typeof target === 'function' ? (target as () => FieldDesc)() : (target as FieldDesc));
  return {
    kind,
    get element() {
      return getEl();
    },
    _fv: 0,
    _fvs: kind === 'slice' ? 0 : -1,
    size: 8,
    align: 4,
    get rustType(): string {
      return `Capn${kind === 'ref' ? 'Ref' : 'Slice'}<${getEl().rustType}>`;
    },
  } as unknown as SliceDesc<FieldDesc>;
}

/** Variable-length slice `CapnSlice<T>` stored in the tail arena via an 8-byte `[u32 off, u32 len]` descriptor. */
export function slice(element: SelfRef): SliceDesc<SelfRef>;
export function slice<E extends FieldDesc = FieldDesc>(element: E | (() => E)): SliceDesc<E>;
export function slice<E extends FieldDesc = FieldDesc>(element: E | (() => E) | SelfRef, kind: 'slice' | 'ref' = 'slice'): SliceDesc<E> { return ptrDesc(kind, element) as SliceDesc<E>; }

/** Alias for `slice(element)`. */
export const list = slice;

/** Nullable relative-offset pointer `CapnRef<T>` (`[u32 off, u32 present]`, 8 bytes inline, supports recursive & circular graphs). */
export function ref(target: SelfRef): RefDesc<SelfRef>;
export function ref<S extends StructDefLike<any> | UnionDefLike<any> = StructDefLike<any>>(target: S | (() => S)): RefDesc<S>;
export function ref<S extends StructDefLike<FieldRecord> | UnionDefLike<UnionVariantRecord> = StructDefLike<FieldRecord>>(target: S | (() => S) | SelfRef): RefDesc<S> { return ptrDesc('ref', target) as RefDesc<S>; }
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
  _m: (WasmMemoryLike & { offset?: number }) | WasmArena | null;
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
  m: WasmMemoryLike | WasmArena | null;
}
function growMem(m: WasmMemoryLike, end: number): void {
  if (end > m.buffer.byteLength) m.grow(Math.ceil((end - m.buffer.byteLength) / 65536));
}
function resolveSource(s: BufferSourceInput, o = 0): ResolvedSource {
  const v = ArrayBuffer.isView(s),
    m = !v && (s as any)?.buffer ? (s as WasmMemoryLike | WasmArena) : null,
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
  return readVal({ def: desc as StructDefLike, _d: d, _b: 0, _o: 0, byteLength: desc.size, _ws: desc.size, _m: null, _k: () => d } as unknown as InternalStructView, desc, 0, plain);
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
let _rSeen: Map<unknown, Map<number, Record<string, unknown>>> | null = null;
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
  if (k === 'union') {
    const tag = d.getUint8(off),
      vr = desc.variantList[tag];
    if (!vr) oob();
    return vr.desc === null ? { tag: vr.name } : { tag: vr.name, value: readVal(v, vr.desc, off + vr.payloadOffset, plain) };
  }
  if (k !== 'struct') {
    const el = (desc as { element?: FieldDesc }).element,
      sz = el ? el.size : 1,
      n = k === 'array' ? desc.length : d.getUint32(off + 4, true);
    if (k !== 'array') {
    if (!n && (k === 'str' || k === 'optStr' || k === 'ref')) return k === 'str' ? '' : k === 'optStr' ? (d.getUint32(off, true) ? '' : null) : null;
    const p = n ? v._b + d.getUint32(off, true) : v._b,
      root = rootOf(v),
      ts = root._o,
      te = ts + root.byteLength,
      rst = (root as InternalStructView & { stride?: number }).stride ?? (root._ws || root.def.size),
      rsz = k === 'ref' && el === root.def ? rst : sz,
      bl = (k === 'ref' ? 1 : n) * rsz,
      ovTbl = p < te && p + bl > ts,
      okTbl = k === 'ref' && el === root.def && p >= ts && p + bl <= te && (p - ts) % rst === 0;
    if (n && ((p < v._b || p + bl > d.byteLength) || (ovTbl && !okTbl) || (k !== 'ref' && p < off + 8 && p + bl > off))) oob();
    if (k === 'ref') return readVal(v, el!, p, plain);
    off = p;
  }
  if (k === 'str' || k === 'optStr') return plain && (_budget -= n) < 0 ? oob() : utf8At(d, off, n);
  const tot = d.byteOffset + off,
    elPrim = el as PrimitiveDesc;
  if (!plain && elPrim._C && elPrim.type !== 'bool' && tot % sz === 0) return new elPrim._C(d.buffer, tot, n);
  if (!plain && el!.kind === 'struct') {
    const sav = new StructArrayView(el as StructDefLike, d, off, n, v._b);
    sav._m = v._m;
    sav._a = v;
    return sav;
  }
  if (!plain && el!.kind === 'union') {
    const uav = new UnionArrayView(el as UnionDefLike, d, off, n, v._b, v._m);
    uav._a = v;
    return uav;
  }
  if (plain && (_budget -= n * sz) < 0) oob();
    return Array.from({ length: n }, (_, i) => readVal(v, el!, off + i * sz, plain));
  }
  if (!plain) {
    const nv = new StructViewBase(desc, d, v._b, off, v._m);
    nv._ws = desc === v.def ? v._ws : desc.size;
    nv._a = v;
    return nv;
  }
  let sm = _rSeen?.get(desc);
  const prev = sm?.get(off);
  if (prev) return prev;
  const ws = desc === v.def ? v._ws ?? desc.size : desc.size;
  if ((_budget -= ws) < 0) oob();
  const out: Record<string, unknown> = {};
  if (_rSeen) {
    if (!sm) _rSeen.set(desc, (sm = new Map()));
    sm.set(off, out);
  }
  const isHdr = Boolean((v as InternalStructView & { _hdr?: number })._hdr);
  for (const f of desc.fieldList) {
    if (isHdr && ((f.desc as { _fv?: number })._fv ?? -1) >= 0) continue;
    out[f.name] = f.offset + f.size > ws ? defVal(f.desc, true) : readVal(v, f.desc, off + f.offset, true);
  }
  return out;
}
function readPlain(v: InternalStructView & { length?: number; stride?: number }, o?: number): unknown {
  _budget = Math.max(v._k().byteLength * 8, 65536);
  _rSeen = new Map();
  try {
    return o === undefined && 'length' in v
      ? Array.from({ length: v.length! }, (_, i) => readVal(v, v.def, v._o + i * v.stride!, true))
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
function writeVal(v: InternalStructView | null, desc: FieldDesc, val: unknown, base: number, off: number): void {
  const nullDesc = desc as { _null?: number | bigint };
  if (val === undefined || (val === null && desc.kind !== 'ref' && desc.kind !== 'optStr' && nullDesc._null === undefined)) return;
  const top = _wSeen === null && desc.kind !== 'primitive' && desc.kind !== 'str' && desc.kind !== 'optStr',
    dv = () => (v ? v._k() : sDv);
  if (top) {
    _wSeen = new Map();
    _wActive = new Set();
    _wFix = [];
  }
  try {
    const k = desc.kind;
    if (k === 'primitive') (desc as PrimitiveDesc)._s(dv(), off, val as number | bigint | boolean);
    else if (k === 'union') {
      const obj = typeof val === 'object' && val !== null ? (val as { tag?: string; value?: unknown }) : null,
        vr = obj?.tag !== undefined ? desc.byName[obj.tag] : undefined;
      if (!vr) oob();
      const d = dv();
      if (!v || d.getUint8(off) !== vr.tag) {
        u8s(d, off, desc.size).fill(0);
        if (v && desc._fv >= 0) rootOf(v)._dirty = true;
      }
      d.setUint8(off, vr.tag);
      if (vr.desc !== null) writeVal(v, vr.desc, obj!.value, base, off + vr.payloadOffset);
  } else if (k === 'str' || k === 'optStr') {
    if (k === 'optStr' && val === null) mutVar(v, off, base, 0, 1, 1);
    else {
      const b = utf8Enc(String(val)),
        st = mutVar(v, off, base, b.byteLength, 1, 1);
      if (b.byteLength) u8s(dv(), st, b.byteLength).set(b);
      else if (k === 'optStr') dv().setUint32(off, 1, true);
    }
  } else if (k === 'ref') {
    const el = desc.element as FieldDesc;
      if (val === null) mutVar(v, off, base, 0, el.size, el.align);
      else {
        const d = dv(),
          sv = val instanceof MemView && val._k().buffer === d.buffer && val._d.byteOffset === d.byteOffset ? val._o : _wSeen?.get(val as object);
        if (sv !== undefined) setDesc(off, sv - base, 1, d);
        else writeVal(v, el, val, base, mutVar(v, off, base, 1, el.size, el.align));
      }
    } else if (k === 'array' || k === 'slice') {
      const el = desc.element as FieldDesc,
        elMeta = el as FieldDesc & { _fv?: number; _C?: TypedArrayConstructor; _null?: number | bigint; _s?: PrimitiveDesc['_s'] },
      isSav = val instanceof StructArrayView,
      isUav = val instanceof UnionArrayView,
      isRaw = el.kind === 'struct' && (elMeta._fv ?? -1) < 0 && ArrayBuffer.isView(val),
      src: ArrayLike<unknown> = isSav || isUav || isRaw || (typeof val === 'object' && val !== null && 'length' in val) ? (val as ArrayLike<unknown>) : Array.from(val as Iterable<unknown>),
      rawLen = isRaw ? ((val as ArrayBufferView).byteLength / el.size) | 0 : src.length,
      n = k === 'array' ? desc.length : rawLen,
      cp = Math.min(n, rawLen) * el.size,
      st = k === 'slice' ? mutVar(v, off, base, n, el.size, el.align) : off,
      d = dv();
    if (v && k !== 'slice' && n) u8s(d, st, n * el.size).fill(0);
    const sb = isRaw || (elMeta._C && val instanceof elMeta._C) ? u8s(val as ArrayBufferView, 0, cp) : null;
    const bulkSrc = ((isSav && (val as StructArrayView).stride === el.size) || isUav) && (elMeta._fv ?? -1) < 0 && (val as { def: unknown }).def === el
      ? u8s((val as StructArrayView)._k(), (val as StructArrayView)._o, cp) : null;
    if (sb || bulkSrc) {
      if (cp) u8s(d, st, cp).set((sb ?? bulkSrc)!);
    } else {
      const m = Math.min(n, src.length),
        savCur = isSav ? (val as StructArrayView<FieldRecord>)._mv(0) : null;
      if (el.kind === 'struct' && _wSeen && !isSav)
        for (let i = 0; i < m; i++) {
          const it = src[i];
          if (it && typeof it === 'object' && !Array.isArray(it) && !_wSeen.has(it)) _wSeen.set(it, st + i * el.size);
        }
      for (let i = 0; i < m; i++) writeVal(v, el, isUav ? (val as UnionArrayView).at(i) : savCur ? (val as StructArrayView<FieldRecord>)._mv(i, savCur) : src[i], base, st + i * el.size);
      if (elMeta._null !== undefined && elMeta._s) for (let i = m; i < n; i++) elMeta._s(dv(), st + i * el.size, null as unknown as number);
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
          fv = isTuple ? (rec as unknown[])[i] : rec[f.name],
          fNull = f.desc as { _null?: number | bigint; _s?: PrimitiveDesc['_s'] };
        if (fv !== undefined) writeVal(v, f.desc, fv, base, off + f.offset);
        else if ((!v || off !== v._o) && fNull._null !== undefined && fNull._s) fNull._s(dv(), off + f.offset, null as unknown as number);
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
class MemView<F extends FieldRecord = FieldRecord, D = StructDefLike<F>> {
  #def!: D;
  #bl!: number;
  #d!: DataView;
  #b!: number;
  #o!: number;
  #ws!: number;
  #tl: number | undefined;
  #dead: number | undefined;
  #dirty: boolean | undefined;
  #a: InternalStructView | undefined;
  #m!: WasmMemoryLike | WasmArena | null;
  get def(): D { return this.#def; }
  get byteLength(): number { return this.#bl; }
  /** @internal */ set _bl(v: number) { this.#bl = v; }
  /** @internal */ get _d(): DataView { return this.#d; }
  /** @internal */ set _d(v: DataView) { this.#d = v; }
  /** @internal */ get _b(): number { return this.#b; }
  /** @internal */ get _o(): number { return this.#o; }
  /** @internal */ set _o(v: number) { this.#o = v; }
  /** @internal */ get _ws(): number { return this.#ws; }
  /** @internal */ set _ws(v: number) { this.#ws = v; }
  /** @internal */ get _tl(): number | undefined { return this.#tl; }
  /** @internal */ set _tl(v: number | undefined) { this.#tl = v; }
  /** @internal */ get _dead(): number | undefined { return this.#dead; }
  /** @internal */ set _dead(v: number | undefined) { this.#dead = v; }
  /** @internal */ get _dirty(): boolean | undefined { return this.#dirty; }
  /** @internal */ set _dirty(v: boolean | undefined) { this.#dirty = v; }
  /** @internal */ get _a(): InternalStructView | undefined { return this.#a; }
  /** @internal */ set _a(v: InternalStructView | undefined) { this.#a = v; }
  /** @internal */ get _m(): WasmMemoryLike | WasmArena | null { return this.#m; }
  /** @internal */ set _m(v: WasmMemoryLike | WasmArena | null) { this.#m = v; }
  /** @internal */
  _init(def: D, bl: number, ws: number, d: DataView, b: number, o: number, m: WasmMemoryLike | WasmArena | null): this {
    this.#def = def;
    this.#bl = bl;
    this.#ws = ws;
    return this._set(d, b, o, m);
  }
  /** @internal */
  _set(d: DataView, b: number, o: number, m: WasmMemoryLike | WasmArena | null): this {
    this.#d = d;
    this.#b = b;
    this.#o = o;
    this.#m = m;
    return this;
  }
  /** @internal */
  _k(): DataView {
    if (this.#a) return (this.#d = this.#a._k());
    const m = this.#m as any;
    if (m && m.buffer !== this.#d.buffer) this.#d = m._d ?? new DataView(m.buffer);
    return this.#d;
  }
  /** Underlying `ArrayBuffer` (automatically re-bound if backed by a growing `WebAssembly.Memory` or `WasmArena`). */
  get buffer(): ArrayBufferLike {
    return this._k().buffer;
  }
  /** Byte offset of this view inside `buffer`. */
  get byteOffset(): number {
    return this._k().byteOffset + this.#o;
  }
  /** Total active + dead bytes occupied by this view's fixed table and tail arena. */
  get usedByteLength(): number {
    const r = rootOf(this as unknown as InternalStructView);
    return Math.max(r.byteLength, (r._tl ?? 0) - r._o);
  }
  /** Dead bytes in the tail arena reclaimable via `.compact()`. */
  get deadByteLength(): number {
    return rootOf(this as unknown as InternalStructView)._dead ?? 0;
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
      schema: (this.def as any).rustType,
      stride: a.stride ?? (this.def as any).size,
      rowCount: a.length ?? 1,
      usedByteLength: this.usedByteLength,
      deadByteLength: this.deadByteLength,
      compactionRatio: this.compactionRatio,
      data: a.toJSON(),
    };
  }
  /** Re-packs only live fields and tail data into a tight `Uint8Array` and rebinds this view in-place. */
  compact(): Uint8Array {
    if ((this.#def as any).kind === 'union') return u8s(this._k(), this.#o, this.#bl);
    const a = this as any,
      isArr = 'length' in a,
      p = pack(this.#def as StructDef<F>, (isArr ? a.toJSON() : [a.toJSON()]) as readonly Partial<StructInput<F>>[]),
      o0 = this.#o,
      oldSt = isArr ? a.stride : 0,
      sz = (this.#def as any).size;
    this.#bl = (isArr ? a.length : 1) * sz;
    this.#tl = p.byteLength;
    this.#ws = sz;
    this.#dead = 0;
    this.#dirty = false;
    this.#a = undefined;
    this._set(new DataView(p.buffer, p.byteOffset, p.byteLength), 0, 0, null);
    if (isArr) {
      a.stride = sz;
      a._cap = a.length;
      for (const pv of [a._c, ...(a._p ?? [])]) if (pv) pv._set(this.#d, 0, oldSt ? Math.floor((pv._o - o0) / oldSt) * sz : 0, a), (pv._ws = sz);
    }
    return p;
  }
  /** Wire-ready `Uint8Array` view over the underlying bytes (automatically compacts dead tail bytes if dirty). */
  get bytes(): Uint8Array {
    const def = this.#def as any;
    if (def.kind === 'union') return u8s(this._k(), this.#o, this.#bl);
    if (this.#dirty || this.#dead || (def._fv >= 0 && this.#b !== this.#o)) return this.compact();
    const d = this._k(),
      rawEnd = Math.max(this.#bl, (this.#tl ?? 0) - this.#o),
      end = !this.#m && this.#tl !== undefined ? Math.min(d.byteLength - this.#o, al(rawEnd, 8)) : rawEnd;
    if (this.#bl && def._fv >= 0) {
      const ts = al(this.#bl, 8),
        fvs = def._fvs;
      if (fvs >= 0) {
        const f = this.#b + fvs,
          p0 = d.getUint32(f, true);
        if (this.#tl !== undefined && p0 > ts) return this.compact();
        if (p0 < ts && end >= ts && !d.getUint32(f + 4, true)) d.setUint32(f, ts, true);
      } else if (def._fvr) {
        const f = this.#b + def._fv,
          p0 = d.getUint32(f, true);
        if (this.#tl !== undefined && p0 > ts) return this.compact();
        if (p0 < ts && end >= ts) fixFv(d, f, ts);
      }
    }
    return u8s(d, this.#o, end);
  }
  toJSON(): any {
    return readPlain(this as any);
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
    mem: WasmMemoryLike | WasmArena | null = null,
  ) {
    super();
    this._init(def, def.size, def.size, dv, base, off, mem);
    const ks = def._K,
      gs = def._G;
    for (let i = 0; i < ks.length; i++) Object.defineProperty(this, ks[i], gs[i]);
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
  declare _c: StructView<F> | null;
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
      const fvs = def._fvs;
      if (fvs >= 0 && fvs < sz) {
        const p0 = r.d.getUint32(r.o + fvs, true);
        if (p0 >= sz && p0 <= r.max) f = p0;
      } else if (def._fvr && def._fv < sz) {
        const pr = r.d.getUint32(r.o + def._fv + 4, true);
        if (pr & ~1) f = pr & ~1;
        else if (!pr) {
          const p0 = r.d.getUint32(r.o + def._fv, true);
          if (p0 >= sz && p0 <= r.max) f = p0;
        }
      }
      if (!f)
        for (let ro = 0; (!f || ro < f) && ro + sz <= r.max; ro += sz) {
          const p = scanTail(def, r.d, r.o + ro, sz, r.max);
          if (p && (!f || p < f)) f = p;
        }
    }
    const len = n.c ?? (f >= sz && f <= r.max ? f / sz : r.max / sz) | 0,
      tot = len * sz;
    if (len < 0 || r.o < 0 || r.max < tot) oob();
    this._init(def, tot, sz, r.d, n.b ?? r.o, r.o, r.m);
    this._tl = r.o + (!hasVar && n.c !== undefined ? tot : Math.max(tot, r.max));
    this._dead = 0;
    this._dirty = false;
    Object.assign(this, { stride: sz, length: len, _cap: len });
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
      this._bl = this.length * st;
      writeVal(this as unknown as InternalStructView, def, item, this._b, this._o + idx * st);
      if (hasVar) this._dirty = true;
    }
    return this.length;
  }

  pop(): PlainStructValues<F> | undefined {
    if (!this.length) return undefined;
    const lastIdx = --this.length,
      val = readPlain(this, this._o + lastIdx * this.stride);
    this._bl = this.length * this.stride;
    if (this.def._fv >= 0) this._dead = (this._dead ?? 0) + this.stride;
    else if (this._tl === this._o + (lastIdx + 1) * this.stride) {
      this._tl -= this.stride;
      this._cap = this.length;
    }
    return val as PlainStructValues<F>;
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
/** Lazy zero-copy view over a `slice(Union)` or `fixedArray(Union, N)` without eager JS array materialization. */
export class UnionArrayView<
  V extends UnionVariantRecord = UnionVariantRecord,
  SelfF extends FieldRecord = FieldRecord,
> extends MemView<any, UnionDefLike<V>> implements Iterable<UnionValue<V, SelfF>> {
  declare readonly stride: number;
  declare readonly length: number;
  constructor(
    def: UnionDefLike<V>,
    dv: DataView,
    off: number,
    length: number,
    base: number,
    mem: WasmMemoryLike | WasmArena | null = null,
  ) {
    super();
    this._init(def, length * def.size, def.size, dv, base, off, mem);
    Object.assign(this, { stride: def.size, length });
  }
  /** @internal */
  _i(index: number): number {
    const i = index < 0 ? this.length + index : index;
    if (i < 0 || i >= this.length) oob();
    return this._o + i * this.stride;
  }
  /** Reads the single tagged union element at `index` in O(1) (supports negative indices). */
  at(index: number): UnionValue<V, SelfF> {
    return readVal(this as unknown as InternalStructView, this.def, this._i(index), false) as UnionValue<V, SelfF>;
  }
  /** Reads only the 1-byte discriminant tag name at `index` in O(1) without allocating a union object. */
  tagAt(index: number): keyof V & string {
    const vr = this.def.variantList[this._k().getUint8(this._i(index))];
    if (!vr) oob();
    return vr.name as keyof V & string;
  }
  /** Updates the tagged union element at `index` in-place (supports negative indices). */
  set(index: number, value: UnionInput<V, SelfF>): this {
    writeVal(this as unknown as InternalStructView, this.def, value, this._b, this._i(index));
    return this;
  }
  /** Returns a zero-copy `UnionArrayView` slice over `[begin, end)` without copying bytes. */
  subarray(begin = 0, end = this.length): UnionArrayView<V, SelfF> {
    const len = this.length,
      cl = (i: number) => Math.max(0, Math.min(len, i < 0 ? len + i : i)),
      s = cl(begin),
      e = cl(end),
      sub = new UnionArrayView<V, SelfF>(this.def, this._k(), this._o + s * this.stride, Math.max(0, e - s), this._b, this._m);
    sub._a = this._a;
    return sub;
  }
  /** Alias for `subarray(begin, end)`. */
  declare slice: (begin?: number, end?: number) => UnionArrayView<V, SelfF>;
  forEach(fn: (item: UnionValue<V, SelfF>, index: number, array: this) => void): void {
    for (let i = 0; i < this.length; i++) fn(this.at(i), i, this);
  }
  map<U>(fn: (item: UnionValue<V, SelfF>, index: number, array: this) => U): U[] {
    return Array.from({ length: this.length }, (_, i) => fn(this.at(i), i, this));
  }
  find(fn: (item: UnionValue<V, SelfF>, index: number, array: this) => unknown): UnionValue<V, SelfF> | undefined {
    for (let i = 0; i < this.length; i++) {
      const v = this.at(i);
      if (fn(v, i, this)) return v;
    }
  }
  some(fn: (item: UnionValue<V, SelfF>, index: number, array: this) => unknown): boolean {
    for (let i = 0; i < this.length; i++) if (fn(this.at(i), i, this)) return true;
    return false;
  }
  every(fn: (item: UnionValue<V, SelfF>, index: number, array: this) => unknown): boolean {
    for (let i = 0; i < this.length; i++) if (!fn(this.at(i), i, this)) return false;
    return true;
  }
  /** Materializes all elements into a plain JavaScript array. */
  declare toObjects: () => PlainUnionValue<V, SelfF>[];
  /** Serializes this union array view to a plain array for `JSON.stringify()`. */
  declare toJSON: () => PlainUnionValue<V, SelfF>[];
  *[Symbol.iterator](): IterableIterator<UnionValue<V, SelfF>> {
    for (let i = 0; i < this.length; i++) yield this.at(i);
  }
}
UnionArrayView.prototype.slice = UnionArrayView.prototype.subarray;
UnionArrayView.prototype.toObjects = MemView.prototype.toJSON as any;
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
  | WasmMemoryLike
  | WasmInstanceLike
  | {
      readonly memory: WasmMemoryLike;
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
  declare readonly memory: WasmMemoryLike | null;
  declare readonly baseOffset: number;
  declare offset: number;
  /** @internal */
  declare _buf: ArrayBuffer;
  /** @internal */
  declare _d: DataView;
  /** @internal */
  declare _u8: Uint8Array;
  constructor(
    backing: WasmMemoryLike | ArrayBuffer | number = 65536,
    baseOffset = 0,
  ) {
    this.memory = (backing as any)?.buffer ? (backing as WasmMemoryLike) : null;
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
  /** @internal */
  declare readonly _fvs: number;
  /** @internal */
  declare readonly _fvr: boolean;
  /** @internal */
  declare readonly _K: readonly string[];
  /** @internal */
  declare readonly _G: readonly PropertyDescriptor[];
  constructor(name: string, schemaOrBuilder: F | ((self: SelfRef) => F)) {
    if (name) _reg[name] = this;
    const schema = typeof schemaOrBuilder === 'function' ? schemaOrBuilder((() => this) as unknown as SelfRef) : schemaOrBuilder;
    if (!schema) oob();
    let off = 0,
      maxA = 1,
      firstV = -1,
      firstVs = -1,
      fvr = false;
    const fObj: Record<string, FieldLayout> = {},
      ks: string[] = [],
      gs: PropertyDescriptor[] = [];
    for (const [k, d] of Object.entries(schema)) {
      const a = d.align;
      maxA = Math.max(maxA, a);
      const fo = (off = al(off, a));
      fObj[k] = { name: k, desc: d, offset: fo, size: d.size, align: a };
      off += d.size;
      const dk = d.kind,
        dm = d as FieldDesc & { _fv?: number; _fvs?: number; _fvr?: boolean };
      if (dm._fv !== undefined && dm._fv >= 0 && firstV < 0) {
        firstV = dk === 'struct' || dk === 'array' ? fo + dm._fv : fo;
        fvr = dk === 'ref' || ((dk === 'struct' || dk === 'array') && Boolean(dm._fvr));
      }
      if (dm._fvs !== undefined && dm._fvs >= 0 && firstVs < 0) firstVs = fo + dm._fvs;
      const end = fo + d.size;
      ks.push(k);
      gs.push({
        enumerable: true,
        configurable: true,
        get(this: StructViewBase<F>) {
          return end > this._ws ? defVal(d, false) : dk === 'primitive' ? d._g(this._k(), this._o + fo) : readVal(this, d, this._o + fo, false);
        },
        set(this: StructViewBase<F>, v: unknown) {
          if (end > this._ws) upgradeView(this);
          writeVal(this, d, v, this._b, this._o + fo);
        },
      });
    }
    const sz = al(off, maxA);
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
      _fvs: firstVs,
      _fvr: fvr,
      _K: ks,
      _G: gs,
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
    Object.defineProperty(v, '_hdr', hid(1));
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
  writeVal(null, { kind: 'array', element: def, length: n } as unknown as ArrayDesc, rows, 0, 0);
  if (n && def._fv >= 0) {
    const fvs = def._fvs;
    if (fvs >= 0) {
      if (sDv.getUint32(fvs, true) < ts && !sDv.getUint32(fvs + 4, true)) sDv.setUint32(fvs, ts, true);
    } else if (def._fvr && sDv.getUint32(def._fv, true) < ts) fixFv(sDv, def._fv, ts);
  }
  const end = al(tail, 8);
  sU8.fill(0, tail, end);
  return sU8.slice(0, end);
}
function scanTail(desc: FieldDesc, d: DataView, off: number, sz: number, max: number): number {
  const k = desc.kind;
  if (k === 'str' || k === 'optStr' || k === 'slice' || k === 'ref') {
    const p = d.getUint32(off, true);
    return p >= sz && p <= max && d.getUint32(off + 4, true) ? p : 0;
  }
  const dm = desc as FieldDesc & { _fv?: number };
  if (k === 'array' && dm._fv !== undefined && dm._fv >= 0) {
    let best = 0;
    const el = desc.element;
    for (let i = 0; i < desc.length; i++) {
      const p = scanTail(el, d, off + i * el.size, sz, max);
      if (p && (!best || p < best)) best = p;
    }
    return best;
  }
  if (k === 'union' && desc._fv >= 0) {
    const vr = desc.variantList[d.getUint8(off)];
    return vr?.desc ? scanTail(vr.desc, d, off + vr.payloadOffset, sz, max) : 0;
  }
  if (k === 'struct' && desc._fv >= 0) {
    let best = 0;
    for (const fl of desc.fieldList) {
      if (((fl.desc as { _fv?: number })._fv ?? -1) < 0) continue;
      const p = scanTail(fl.desc, d, off + fl.offset, sz, max);
      if (p && (!best || p < best)) best = p;
    }
    return best;
  }
  return 0;
}
/** Compiled tagged-union (`#[repr(C, u8)]` / `#[repr(u8)]`) schema descriptor. */
export class UnionDef<V extends UnionVariantRecord = UnionVariantRecord> implements UnionDefLike<V> {
  declare readonly kind: 'union';
  declare readonly name: string;
  declare readonly rustType: string;
  declare readonly size: number;
  declare readonly byteSize: number;
  declare readonly stride: number;
  declare readonly align: number;
  declare readonly unitOnly: boolean;
  declare readonly variants: V;
  declare readonly variantList: readonly UnionVariantLayout[];
  declare readonly byName: Record<string, UnionVariantLayout>;
  /** @internal */
  declare readonly _fv: number;
  /** @internal */
  declare readonly _fvs: number;
  constructor(name: string, variantsOrBuilder: V | ((self: SelfRef) => V)) {
    if (name) _reg[name] = this;
    const variants = typeof variantsOrBuilder === 'function' ? variantsOrBuilder((() => this) as unknown as SelfRef) : variantsOrBuilder;
    if (!variants) oob();
    const entries = Object.entries(variants);
    if (!entries.length || entries.length > 256) oob();
    let maxP = 0,
      maxA = 1,
      hasVar = false,
      unitOnly = true;
    for (let i = 0; i < entries.length; i++) {
      const vd = entries[i][1];
      if (vd !== null) {
        const d = vd as FieldDesc;
        unitOnly = false;
        maxA = Math.max(maxA, d.align);
        maxP = Math.max(maxP, d.size);
        if (((d as { _fv?: number })._fv ?? -1) >= 0) hasVar = true;
      }
    }
    const payloadOff = unitOnly ? 0 : al(1, maxA),
      sz = unitOnly ? 1 : al(payloadOff + maxP, maxA),
      list: UnionVariantLayout[] = [],
      byName: Record<string, UnionVariantLayout> = {};
    for (let i = 0; i < entries.length; i++) {
      const [vn, vd] = entries[i],
        d = vd === null ? null : (vd as FieldDesc),
        vl: UnionVariantLayout = { name: vn, tag: i, desc: d, payloadOffset: d === null ? 0 : payloadOff };
      list.push(vl);
      byName[vn] = vl;
    }
    Object.assign(this, {
      kind: 'union',
      name,
      rustType: name || 'AnonUnion',
      size: sz,
      byteSize: sz,
      stride: sz,
      align: maxA,
      unitOnly,
      variants,
      variantList: list,
      byName,
      _fv: hasVar ? 0 : -1,
      _fvs: -1,
    });
  }
  /** Returns the numeric `u8` discriminant tag for variant `name`. */
  tagOf<K extends keyof V & string>(name: K): number {
    const vr = this.byName[name];
    if (!vr) oob();
    return vr.tag;
  }
}
/** Compiles a tagged-union (`#[repr(C, u8)]` / `#[repr(u8)]`) schema usable in structs, slices, refs, and Rust/Go codegen. */
export function defineUnion<V extends UnionVariantRecord>(name: string, variants: V | ((self: SelfRef) => V)): UnionDef<V> {
  return new UnionDef(name, variants);
}
/** Alias for `defineUnion`. */
export const union = defineUnion;
/** Compiles a declarative `#[repr(C)]` struct schema with zero-copy `StructView` and `StructArrayView` accessors. */
export function defineStruct<F extends FieldRecord>(fields: F | ((self: SelfRef) => F)): StructDef<F>;
/** Compiles a named `#[repr(C)]` struct schema (used by `toRustReprC` codegen). */
export function defineStruct<F extends FieldRecord>(name: string, fields: F | ((self: SelfRef) => F)): StructDef<F>;
export function defineStruct<F extends FieldRecord>(nameOrFields: string | F | ((self: SelfRef) => F), maybeFields?: F | ((self: SelfRef) => F)): StructDef<F> {
  return typeof nameOrFields === 'string' ? new StructDef(nameOrFields, maybeFields!) : new StructDef('', nameOrFields);
}
/** Alias for `defineStruct`. */
export const struct = defineStruct;
const _fvStr = (v: unknown): string => {
  if (typeof v === 'bigint') return `${v}n`;
  if (v instanceof MemView) return 'length' in v ? `${v.def.name || 'Struct'}[${(v as unknown as { length: number }).length}]` : `${v.def.name || 'Struct'}{...}`;
  if (Array.isArray(v)) return `[${v.length}]`;
  if (ArrayBuffer.isView(v)) return `${v.constructor.name}[${(v as unknown as { length: number }).length}]`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};
const _dtf = {
  header(x: unknown) {
    if (!(x instanceof MemView)) return null;
    const n = x.def.name || 'Struct';
    if ('length' in x) return ['span', {}, `${n}[${(x as unknown as { length: number }).length}] (${x.usedByteLength} B)`];
    const ks = Object.keys(x),
      rec = x as unknown as Record<string, unknown>;
    return ['span', {}, `${n} { ${ks.slice(0, 4).map((k) => `${k}: ${_fvStr(rec[k])}`).join(', ')}${ks.length > 4 ? ', ...' : ''} }`];
  },
  hasBody: (x: unknown) => x instanceof MemView,
  body: (x: { toJSON(): unknown }) => ['div', {}, ['object', { object: x.toJSON() }]],
};
/** Registers a lazy Chrome/Edge/Firefox DevTools custom formatter (`globalThis.devtoolsFormatters`) for `StructView` and `StructArrayView`. */
export function installDevtoolsFormatter(): typeof _dtf {
  const g = globalThis as unknown as { devtoolsFormatters?: unknown[] };
  const list = (g.devtoolsFormatters ??= []);
  if (!list.includes(_dtf)) list.push(_dtf);
  return _dtf;
}
