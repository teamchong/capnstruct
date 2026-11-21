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
  /** @internal */
  readonly _h: number;
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
  /** @internal */
  readonly _h: number;
}
export interface UnknownVariant {
  readonly tag: '$unknown';
  readonly rawTag: number;
}
export function isUnknownVariant(v: unknown): v is UnknownVariant {
  return typeof v === 'object' && v !== null && (v as { tag?: unknown }).tag === '$unknown';
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

export type StructValues<F extends FieldRecord = FieldRecord> = {
  readonly [K in keyof F]: FieldValue<F[K], F>;
};

export type MutUnionPayloadValue<
  D extends FieldDesc,
  V extends UnionVariantRecord,
  SelfF extends FieldRecord = FieldRecord,
> = D extends RefDesc<SelfRef>
  ? MutUnionValue<V, SelfF> | null
  : D extends SliceDesc<SelfRef>
    ? MutUnionArrayView<V, SelfF>
    : MutFieldValue<D, SelfF>;

/** Mutable tagged-union value returned by `MutStructView` and `MutUnionArrayView.at(i)`. */
export type MutUnionValue<
  V extends UnionVariantRecord,
  SelfF extends FieldRecord = FieldRecord,
> = {
  [K in keyof V & string]: V[K] extends null
    ? { readonly tag: K }
    : V[K] extends SelfRef
      ? { readonly tag: K; readonly value: MutUnionValue<V, SelfF> }
      : V[K] extends FieldDesc
        ? { readonly tag: K; readonly value: MutUnionPayloadValue<V[K], V, SelfF> }
        : never;
}[keyof V & string];

export type MutFieldValue<
  D extends FieldDesc = FieldDesc,
  SelfF extends FieldRecord = FieldRecord,
> = D extends NullablePrimitiveDesc<infer P>
  ? PrimitiveTsType<P> | null
  : D extends PrimitiveDesc<infer P>
    ? PrimitiveTsType<P>
    : D extends StrDesc | FixedStrDesc
      ? string
      : D extends OptStrDesc
        ? string | null
        : D extends FixedBytesDesc<number>
          ? Uint8Array
          : D extends ArrayDesc<infer E, number>
            ? E extends PrimitiveDesc<infer P>
              ? TypedArrayFor<P>
              : E extends StructDefLike<infer SF>
                ? MutStructArrayView<SF>
                : E extends SelfRef
                  ? MutStructArrayView<SelfF>
                  : E extends UnionDefLike<infer UV>
                    ? MutUnionArrayView<UV, SelfF>
                    : E extends FieldDesc
                      ? MutFieldValue<E, SelfF>[]
                      : never
            : D extends SliceDesc<infer E>
              ? E extends PrimitiveDesc<infer P>
                ? TypedArrayFor<P>
                : E extends StructDefLike<infer SF>
                  ? MutStructArrayView<SF>
                  : E extends SelfRef
                    ? MutStructArrayView<SelfF>
                    : E extends UnionDefLike<infer UV>
                      ? MutUnionArrayView<UV, SelfF>
                      : E extends FieldDesc
                        ? MutFieldValue<E, SelfF>[]
                        : never
              : D extends StructDefLike<infer SF>
                ? MutStructView<SF>
                : D extends SelfRef
                  ? MutStructView<SelfF>
                  : D extends RefDesc<infer S>
                    ? S extends SelfRef
                      ? MutStructView<SelfF> | null
                      : S extends StructDefLike<infer F>
                        ? MutStructView<F> | null
                        : S extends UnionDefLike<infer UV>
                          ? MutUnionValue<UV, SelfF> | null
                          : never
                    : D extends UnionDefLike<infer UV>
                      ? MutUnionValue<UV, SelfF>
                      : never;

export type MutStructValues<F extends FieldRecord = FieldRecord> = {
  [K in keyof F]: MutFieldValue<F[K], F>;
};

declare const $draft: unique symbol;

export type UnionDraftPayload<
  D extends FieldDesc,
  V extends UnionVariantRecord,
  SelfF extends FieldRecord = FieldRecord,
> = D extends RefDesc<SelfRef>
  ? UnionDraft<V, SelfF> | null
  : D extends SliceDesc<SelfRef>
    ? UnionArrayDraft<V, SelfF>
    : FieldDraft<D, SelfF>;

/** Mutable tagged-union draft inside `produce(base, draft => ...)`. */
export type UnionDraft<
  V extends UnionVariantRecord,
  SelfF extends FieldRecord = FieldRecord,
> = {
  [K in keyof V & string]: V[K] extends null
    ? { tag: K }
    : V[K] extends SelfRef
      ? { tag: K; value: UnionDraft<V, SelfF> }
      : V[K] extends FieldDesc
        ? { tag: K; value: UnionDraftPayload<V[K], V, SelfF> }
        : never;
}[keyof V & string];

export type UnionDraftInput<
  V extends UnionVariantRecord,
  SelfF extends FieldRecord = FieldRecord,
> = UnionInput<V, SelfF> | UnionDraft<V, SelfF>;

/** Mutable array draft for `slice(Union)` and `fixedArray(Union, N)` inside `produce()`. */
export interface UnionArrayDraft<
  V extends UnionVariantRecord = UnionVariantRecord,
  SelfF extends FieldRecord = FieldRecord,
> extends Array<UnionDraft<V, SelfF>> {
  push(...items: UnionDraftInput<V, SelfF>[]): number;
  unshift(...items: UnionDraftInput<V, SelfF>[]): number;
  splice(start: number, deleteCount?: number): UnionDraft<V, SelfF>[];
  splice(start: number, deleteCount: number, ...items: UnionDraftInput<V, SelfF>[]): UnionDraft<V, SelfF>[];
}

export type StructDraftItemInput<F extends FieldRecord = FieldRecord> =
  | Partial<StructInput<F>>
  | StructView<F>
  | StructDraft<F>
  | readonly unknown[];

/** Mutable array draft for `StructArrayView<F>` and nested `slice(Struct)` inside `produce()`. */
export interface StructArrayDraft<F extends FieldRecord = FieldRecord> extends Array<StructDraft<F>> {
  readonly [$draft]?: F[];
  push(...items: StructDraftItemInput<F>[]): number;
  unshift(...items: StructDraftItemInput<F>[]): number;
  splice(start: number, deleteCount?: number): StructDraft<F>[];
  splice(start: number, deleteCount: number, ...items: StructDraftItemInput<F>[]): StructDraft<F>[];
}

/** Mutable field draft type exposed on `StructDraft<F>` inside `produce(base, draft => ...)`. */
export type FieldDraft<
  D extends FieldDesc = FieldDesc,
  SelfF extends FieldRecord = FieldRecord,
> = D extends NullablePrimitiveDesc<infer P>
  ? PrimitiveTsType<P> | null
  : D extends PrimitiveDesc<infer P>
    ? PrimitiveTsType<P>
    : D extends StrDesc | FixedStrDesc
      ? string
      : D extends OptStrDesc
        ? string | null
        : D extends FixedBytesDesc<number>
          ? Uint8Array
          : D extends ArrayDesc<infer E, number>
            ? E extends PrimitiveDesc<infer P>
              ? TypedArrayFor<P>
              : E extends StructDefLike<infer SF>
                ? StructArrayDraft<SF>
                : E extends SelfRef
                  ? StructArrayDraft<SelfF>
                  : E extends UnionDefLike<infer UV>
                    ? UnionArrayDraft<UV, SelfF>
                    : E extends FieldDesc
                      ? FieldDraft<E, SelfF>[]
                      : never
            : D extends SliceDesc<infer E>
              ? E extends PrimitiveDesc<infer P>
                ? PrimitiveTsType<P>[]
                : E extends StructDefLike<infer SF>
                  ? StructArrayDraft<SF>
                  : E extends SelfRef
                    ? StructArrayDraft<SelfF>
                    : E extends UnionDefLike<infer UV>
                      ? UnionArrayDraft<UV, SelfF>
                      : E extends FieldDesc
                        ? FieldDraft<E, SelfF>[]
                        : never
              : D extends StructDefLike<infer SF>
                ? StructDraft<SF>
                : D extends SelfRef
                  ? StructDraft<SelfF>
                  : D extends RefDesc<infer S>
                    ? S extends SelfRef
                      ? StructDraft<SelfF> | null
                      : S extends StructDefLike<infer F>
                        ? StructDraft<F> | null
                        : S extends UnionDefLike<infer UV>
                          ? UnionDraft<UV, SelfF> | null
                          : never
                    : D extends UnionDefLike<infer UV>
                      ? UnionDraft<UV, SelfF>
                      : never;

/** Mutable Immer-style draft over a struct schema `F` passed to `produce(base, draft => ...)`. */
export type StructDraft<F extends FieldRecord = FieldRecord> = {
  [K in keyof F]: FieldDraft<F[K], F>;
} & { readonly [$draft]?: F };

type DraftOf<V> = V extends StructArrayView<infer F>
  ? StructArrayDraft<F>
  : V extends StructViewBase<infer F>
    ? StructDraft<F>
    : never;

type ImmutableViewOf<V> = V extends StructArrayView<infer F>
  ? StructArrayView<F>
  : V extends StructViewBase<infer F>
    ? StructView<F>
    : never;

type ViewOfDraft<D> = D extends StructArrayDraft<infer F>
  ? StructArrayView<F>
  : D extends { readonly [$draft]?: infer F extends FieldRecord }
    ? StructView<F>
    : never;

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
export type IsInlineField<D extends FieldDesc = FieldDesc> =
  FieldDesc extends D
    ? boolean
    : D extends PrimitiveDesc<any> | NullablePrimitiveDesc<any> | FixedStrDesc<any> | FixedBytesDesc<any>
      ? true
      : D extends ArrayDesc<infer E, any>
        ? IsInlineField<E>
        : D extends UnionDefLike<infer UV>
          ? UnionVariantRecord extends UV
            ? boolean
            : { [K in keyof UV]: UV[K] extends null ? true : UV[K] extends FieldDesc ? IsInlineField<UV[K]> : false }[keyof UV] extends true
              ? true
              : false
          : D extends StructDefLike<infer SF>
            ? FieldRecord extends SF
              ? boolean
              : { [K in keyof SF]: IsInlineField<SF[K]> }[keyof SF] extends true
                ? true
                : false
            : false;
export type HeaderFieldRecord<F extends FieldRecord> = {
  [K in keyof F as IsInlineField<F[K]> extends true ? K : never]: F[K];
};
/** Zero-copy view over only the inline fixed-size header fields of `F` (safe on partial `file.slice(0, Schema.byteSize)` buffers). */
export type StructHeaderView<F extends FieldRecord = FieldRecord> =
  StructViewBase<HeaderFieldRecord<F>> & StructValues<HeaderFieldRecord<F>>;
/** Infers the zero-copy `StructView` type from a `StructDef`. */
/** Infers the read-only zero-copy `StructView` type from a `StructDef`. */
export type InferView<S extends StructDefLike<any>> =
  S extends StructDefLike<infer F> ? StructView<F> : never;
/** Infers the mutable in-place `MutStructView` type from a `StructDef`. */
export type InferMutView<S extends StructDefLike<any>> =
  S extends StructDefLike<infer F> ? MutStructView<F> : never;
/** Infers the `produce()` draft `StructDraft` type from a `StructDef`. */
export type InferDraft<S extends StructDefLike<any>> =
  S extends StructDefLike<infer F> ? StructDraft<F> : never;
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
interface _BufLike {
  utf8Slice?(start: number, end: number): string;
  toString(encoding: string, start: number, end: number): string;
}
const _LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const _BufCtor: { from(buf: ArrayBufferLike, byteOffset: number, byteLength: number): _BufLike; prototype?: _BufLike } | undefined =
  typeof (globalThis as any).Buffer?.from === 'function' ? (globalThis as any).Buffer : undefined;
const _hasUtf8Slice = Boolean(_BufCtor?.prototype?.utf8Slice);
function _mkU32(d: DataView): Uint32Array | null {
  return _LE && (d.byteOffset & 3) === 0 ? new Uint32Array(d.buffer, d.byteOffset, d.byteLength >>> 2) : null;
}
function _mkNb(d: DataView): _BufLike | null {
  return _BufCtor ? _BufCtor.from(d.buffer, d.byteOffset, d.byteLength) : null;
}
function utf8AtU(u: Uint8Array, nb: _BufLike | null, o: number, n: number): string {
  if (nb) {
    if (n < 8) {
      let s = '',
        i = 0;
      for (; i < n; i++) {
        const c = u[o + i]!;
        if (c > 127) break;
        s += String.fromCharCode(c);
      }
      if (i === n) return s;
    }
    return _hasUtf8Slice ? nb.utf8Slice!(o, o + n) : nb.toString('utf8', o, o + n);
  }
  if (n < 24) {
    let s = '',
      i = 0;
    for (; i < n; i++) {
      const c = u[o + i]!;
      if (c > 127) break;
      s += String.fromCharCode(c);
    }
    if (i === n) return s;
  }
  return utf8Dec(u.subarray(o, o + n));
}
function utf8At(d: DataView, o: number, n: number): string {
  return utf8AtU(u8s(d, o, n), _BufCtor ? _BufCtor.from(d.buffer, d.byteOffset + o, n) : null, 0, n);
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
function roErr(): never {
  throw new TypeError(
    'Cannot mutate a read-only capnstruct view; use produce(view, draft => ...) or Schema.mutView()/mutArray()',
  );
}
const ENV_MAGIC = 0x31305343;
/** Computes the deterministic 32-bit FNV-1a hash used to identify schema types in `CS01` envelopes. */
export function typeHash(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
interface WireTypeDesc {
  readonly sz: number;
  readonly po: number;
  readonly vc: number;
}
type WireEnv = Map<number, WireTypeDesc>;
function wireSz(e: WireEnv | null | undefined, d: FieldDesc): number {
  if (!e) return d.size;
  if (d.kind === 'struct' || d.kind === 'union') return e.get(d._h)?.sz ?? d.size;
  if (d.kind === 'array') return wireSz(e, d.element as FieldDesc) * d.length;
  return d.size;
}
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
    _sp: primDesc,
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
    _sp: undefined,
    type: 'f64',
    _g: (d: DataView, o: number) => {
      const r = primDesc._g(d, o) as number;
      return Object.is(r, nv) ? null : r / factor;
    },
    _s: (d: DataView, o: number, v: any) =>
      primDesc._s(d, o, v == null ? (nv ?? 0) : Math.round(+v * factor)),
  } as any;
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
const _SUB: unique symbol = Symbol();
function ptrDesc(kind: 'slice' | 'ref', target: unknown): SliceDesc<FieldDesc> | RefDesc<StructDefLike> {
  let el: FieldDesc | undefined;
  const getEl = (): FieldDesc =>
    (el ??= _reg[target as string] ?? (typeof target === 'function' ? (target as () => FieldDesc)() : (target as FieldDesc)));
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
  _ro?: boolean;
  _env?: boolean;
  _m: (WasmMemoryLike & { offset?: number }) | WasmArena | null;
  _a?: InternalStructView;
  _e?: WireEnv | null;
  _k(): DataView;
  _chkMut(): void;
  _packBytes(): Uint8Array;
  _compact(): Uint8Array;
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
  if ((desc as { _null?: unknown })._null !== undefined) return null;
  if (desc.kind === 'union') return { tag: '$unknown', rawTag: 0 };
  const d = new DataView(new ArrayBuffer(desc.size));
  const ws = desc.kind === 'struct' ? 0 : desc.size;
  return readVal({ def: desc as StructDefLike, _d: d, _b: 0, _o: 0, byteLength: desc.size, _ws: ws, _m: null, _e: null, _k: () => d } as unknown as InternalStructView, desc, 0, plain);
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
  if (v._ws < v.def.size) rootOf(v)._compact();
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
      wt = v._e?.get(desc._h),
      vr = desc.variantList[tag];
    if (!vr) {
      if (wt && tag < wt.vc) return { tag: '$unknown', rawTag: tag };
      oob();
    }
    const po = vr.desc === null ? 0 : wt ? wt.po : vr.payloadOffset;
    if (vr.desc === null) return { tag: vr.name };
    if (wt && po + wireSz(v._e, vr.desc) > wt.sz) oob();
    return { tag: vr.name, value: readVal(v, vr.desc, off + po, plain) };
  }
  if (k !== 'struct') {
    const el = (desc as { element?: FieldDesc }).element,
      sz = el ? wireSz(v._e, el) : 1,
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
      const sav = new StructArrayView(el as StructDefLike, d, off, n, v._b, sz);
      sav._m = v._m;
      sav._a = v;
      sav._e = v._e ?? null;
      sav._ro = v._ro ?? true;
      return sav;
    }
    if (!plain && el!.kind === 'union') {
      const uav = new UnionArrayView(el as UnionDefLike, d, off, n, v._b, v._m, sz);
      uav._a = v;
      uav._e = v._e ?? null;
      uav._ro = v._ro ?? true;
      return uav;
    }
    if (plain && (_budget -= n * sz) < 0) oob();
    return Array.from({ length: n }, (_, i) => readVal(v, el!, off + i * sz, plain));
  }
      const ws = v._e?.get(desc._h)?.sz ?? (desc === v.def ? v._ws : desc.size);
      if (!plain) {
        const nv = new StructViewBase(desc, d, v._b, off, v._m, ws);
        nv._a = v;
        nv._e = v._e ?? null;
        nv._ro = v._ro ?? true;
        return nv;
      }
      let sm = ws > 0 ? _rSeen?.get(desc) : undefined;
      const prev = sm?.get(off);
      if (prev) return prev;
      if ((_budget -= ws) < 0) oob();
      const out: Record<string, unknown> = {};
      if (ws > 0 && _rSeen) {
        if (!sm) _rSeen.set(desc, (sm = new Map()));
        sm.set(off, out);
      }
      const isHdr = Boolean((v as InternalStructView & { _hdr?: number })._hdr);
      for (const f of desc.fieldList) {
        if (isHdr && ((f.desc as { _fv?: number })._fv ?? -1) >= 0) continue;
        const fEnd = f.offset + wireSz(v._e, f.desc);
        out[f.name] = fEnd > ws ? defVal(f.desc, true) : readVal(v, f.desc, off + f.offset, true);
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
      const obj = typeof val === 'object' && val !== null ? (val as { tag?: string; value?: unknown; rawTag?: number }) : null,
        vr = obj?.tag !== undefined ? desc.byName[obj.tag] : undefined;
      if (!vr) {
        if (obj?.tag === '$unknown' && typeof obj.rawTag === 'number' && obj.rawTag >= 0 && obj.rawTag < 256) {
          const d = dv();
          u8s(d, off, desc.size).fill(0);
          d.setUint8(off, obj.rawTag);
          if (v && desc._fv >= 0) rootOf(v)._dirty = true;
          return;
        }
        oob();
      }
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
  #u!: Uint8Array;
  #u32: Uint32Array | null = null;
  #nb: _BufLike | null = null;
  #b!: number;
  #o!: number;
  #ws!: number;
  #tl: number | undefined;
  #dead: number | undefined;
  #dirty: boolean | undefined;
  #ro = true;
  #env = false;
  #a: InternalStructView | undefined;
  #r: MemView<any, any> | undefined;
  #e: WireEnv | null = null;
  #m!: WasmMemoryLike | WasmArena | null;
  get def(): D { return this.#def; }
  get byteLength(): number { return this.#bl; }
  /** True when this view is read-only (`view()`, `viewEnvelope()`, `array()`, `produce()`). */
  get readonly(): boolean { return this.#ro; }
  /** @internal */ set _bl(v: number) { this.#bl = v; }
  /** @internal */ get _d(): DataView { return this.#d; }
  /** @internal */ set _d(v: DataView) { this.#d = v; this.#u = u8s(v); this.#u32 = _mkU32(v); this.#nb = _mkNb(v); }
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
  /** @internal */ get _ro(): boolean { return this.#ro; }
  /** @internal */ set _ro(v: boolean) { this.#ro = v; }
  /** @internal */ get _env(): boolean { return this.#env; }
  /** @internal */ set _env(v: boolean) { this.#env = v; }
  /** @internal */ _chkMut(): void { if (this.#ro) roErr(); }
  /** @internal */ get _a(): InternalStructView | undefined { return this.#a; }
  /** @internal */ set _a(v: InternalStructView | undefined) {
    this.#a = v;
    this.#r = v instanceof MemView ? (v.#r ?? v) : undefined;
  }
  /** @internal */ get _e(): WireEnv | null { return this.#e; }
  /** @internal */ set _e(v: WireEnv | null) { this.#e = v; }
  /** @internal */ get _m(): WasmMemoryLike | WasmArena | null { return this.#m; }
  /** @internal */ set _m(v: WasmMemoryLike | WasmArena | null) { this.#m = v; }
  /** @internal */
  _init(def: D, bl: number, ws: number, d: DataView, b: number, o: number, m: WasmMemoryLike | WasmArena | null): void {
    this.#def = def;
    this.#bl = bl;
    this.#ws = ws;
    this._set(d, b, o, m);
  }
  /** @internal */
  _initSub(
    def: D, bl: number, ws: number, d: DataView, u: Uint8Array,
    b: number, o: number, parent: MemView<any, any>, root: MemView<any, any>, env: WireEnv | null,
  ): void {
    this.#def = def;
    this.#bl = bl;
    this.#ws = ws;
    this.#d = d;
    this.#u = u;
    this.#u32 = root.#u32;
    this.#nb = root.#nb;
    this.#b = b;
    this.#o = o;
    this.#m = parent.#m;
    this.#a = parent as unknown as InternalStructView;
    this.#r = root;
    this.#e = env;
    this.#ro = root.#ro;
    this.#dirty = false;
  }
  /** @internal */
  _set(d: DataView, b: number, o: number, m: WasmMemoryLike | WasmArena | null): this {
    this.#d = d;
    this.#u = u8s(d);
    this.#u32 = _mkU32(d);
    this.#nb = _mkNb(d);
    this.#b = b;
    this.#o = o;
    this.#m = m;
    return this;
  }
  /** @internal */
  _rebind(p: MemView<any, any>, o: number): this {
    const r = p.#r ?? p;
    this.#d = r.#m ? r._k() : r.#d;
    this.#u = r.#u;
    this.#u32 = r.#u32;
    this.#nb = r.#nb;
    this.#b = p.#b;
    this.#o = o;
    this.#ws = p.#ws;
    this.#m = p.#m;
    this.#a = p as unknown as InternalStructView;
    this.#r = r;
    this.#e = p.#e;
    this.#ro = r.#ro;
    return this;
  }
  /** @internal */
  _root(): MemView<any, any> { return this.#r ?? this; }
  /** @internal */
  _u(): Uint8Array { return (this.#r ?? this).#u; }
  /** @internal */
  _k(): DataView {
    if (this.#a) {
      const d = this.#a._k();
      if (d !== this.#d) {
        const r = this.#r ?? this;
        this.#d = d;
        this.#u = r.#u;
        this.#u32 = r.#u32;
        this.#nb = r.#nb;
      }
      return d;
    }
    const m = this.#m as any;
    if (m && m.buffer !== this.#d.buffer) {
      this.#d = m._d ?? new DataView(m.buffer);
      this.#u = u8s(this.#d);
      this.#u32 = _mkU32(this.#d);
      this.#nb = _mkNb(this.#d);
    }
    return this.#d;
  }
  /** @internal */
  _rP(fo: number, end: number, d: PrimitiveDesc<any>): unknown {
    if (end > this.#ws) return defVal(d, false);
    const r = this.#r ?? this;
    return d._g(r.#m ? r._k() : r.#d, this.#o + fo);
  }
  /** @internal */
  _rU32(fo: number, end: number): number {
    if (end > this.#ws) return 0;
    const r = this.#r ?? this;
    const dv = r.#m ? r._k() : r.#d;
    const pos = this.#o + fo;
    const u32 = r.#u32;
    return u32 && (pos & 3) === 0 ? u32[pos >>> 2]! : dv.getUint32(pos, true);
  }
  /** @internal */
  _rI32(fo: number, end: number): number {
    if (end > this.#ws) return 0;
    const r = this.#r ?? this;
    const dv = r.#m ? r._k() : r.#d;
    const pos = this.#o + fo;
    const u32 = r.#u32;
    return u32 && (pos & 3) === 0 ? (u32[pos >>> 2]! | 0) : dv.getInt32(pos, true);
  }
  /** @internal */
  _rU8(fo: number, end: number): number {
    if (end > this.#ws) return 0;
    const r = this.#r ?? this;
    if (r.#m) r._k();
    return r.#u[this.#o + fo]!;
  }
  /** @internal */
  _rBool(fo: number, end: number): boolean {
    if (end > this.#ws) return false;
    const r = this.#r ?? this;
    if (r.#m) r._k();
    return r.#u[this.#o + fo]! !== 0;
  }
  /** @internal */
  _rF64(fo: number, end: number): number {
    if (end > this.#ws) return 0;
    const r = this.#r ?? this;
    return (r.#m ? r._k() : r.#d).getFloat64(this.#o + fo, true);
  }
  /** @internal */
  _rSentU32(fo: number, end: number, nv: number): number | null {
    if (end > this.#ws) return null;
    const r = this.#r ?? this;
    const dv = r.#m ? r._k() : r.#d;
    const pos = this.#o + fo;
    const u32 = r.#u32;
    const x = u32 && (pos & 3) === 0 ? u32[pos >>> 2]! : dv.getUint32(pos, true);
    return x === nv ? null : x;
  }
  /** @internal */
  _rStrAt(pos: number, opt: boolean): string | null {
    const r = this.#r ?? this;
    const dv = r.#m ? r._k() : r.#d;
    const u32 = r.#u32;
    let off: number, n: number;
    if (u32 && (pos & 3) === 0) {
      const idx = pos >>> 2;
      off = u32[idx]!;
      n = u32[idx + 1]!;
    } else {
      off = dv.getUint32(pos, true);
      n = dv.getUint32(pos + 4, true);
    }
    if (!n) return opt ? (off ? '' : null) : '';
    const p = this.#b + off;
    const ts = r.#o, te = ts + r.#bl;
    if (p < this.#b || p + n > dv.byteLength || (p < te && p + n > ts) || (p < pos + 8 && p + n > pos)) oob();
    return utf8AtU(r.#u, r.#nb, p, n);
  }
  /** @internal */
  _rStr(fo: number, end: number, opt: boolean): string | null {
    if (end > this.#ws) return opt ? null : '';
    return this._rStrAt(this.#o + fo, opt);
  }
  /** @internal */
  _rSliceAt(pos: number, desc: SliceDesc<any>): unknown {
    const r = this.#r ?? this;
    const dv = r.#m ? r._k() : r.#d;
    const el = desc.element as FieldDesc;
    const e = this.#e;
    const sz = e ? wireSz(e, el) : el.size;
    const u32 = r.#u32;
    let off: number, n: number;
    if (u32 && (pos & 3) === 0) {
      const idx = pos >>> 2;
      off = u32[idx]!;
      n = u32[idx + 1]!;
    } else {
      off = dv.getUint32(pos, true);
      n = dv.getUint32(pos + 4, true);
    }
    const p = n ? this.#b + off : this.#b;
    const bl = n * sz;
    const ts = r.#o, te = ts + r.#bl;
    if (n && (p < this.#b || p + bl > dv.byteLength || (p < te && p + bl > ts) || (p < pos + 8 && p + bl > pos))) oob();
    const ek = el.kind;
    if (ek === 'primitive') {
      const ep = el as PrimitiveDesc<any>;
      const tot = dv.byteOffset + p;
      if (ep._C && ep.type !== 'bool' && tot % sz === 0) return new ep._C(dv.buffer, tot, n);
      const out = new Array(n);
      for (let i = 0; i < n; i++) out[i] = ep._g(dv, p + i * sz);
      return out;
    }
    if (ek === 'struct') return StructArrayView._sub(el as StructDefLike<any>, dv, r.#u, p, n, this.#b, sz, this, r, e);
    if (ek === 'union') return UnionArrayView._sub(el as UnionDefLike<any>, dv, r.#u, p, n, this.#b, sz, this, r, e);
    if (ek === 'str' || ek === 'optStr') {
      const opt = ek === 'optStr';
      const out = new Array(n);
      for (let i = 0; i < n; i++) out[i] = this._rStrAt(p + i * 8, opt);
      return out;
    }
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = readVal(this as unknown as InternalStructView, el, p + i * sz, false);
    return out;
  }
  /** @internal */
  _rSlice(fo: number, end: number, desc: SliceDesc<any>): unknown {
    if (end > this.#ws) return defVal(desc, false);
    return this._rSliceAt(this.#o + fo, desc);
  }
  /** @internal */
  _rRef(fo: number, end: number, desc: RefDesc<any>): unknown {
    if (end > this.#ws) return null;
    const r = this.#r ?? this;
    const dv = r.#m ? r._k() : r.#d;
    const pos = this.#o + fo;
    const u32 = r.#u32;
    let off: number, pres: number;
    if (u32 && (pos & 3) === 0) {
      const idx = pos >>> 2;
      off = u32[idx]!;
      pres = u32[idx + 1]!;
    } else {
      off = dv.getUint32(pos, true);
      pres = dv.getUint32(pos + 4, true);
    }
    if (!pres) return null;
    const el = desc.element as FieldDesc;
    const e = this.#e;
    const sz = e ? wireSz(e, el) : el.size;
    const p = this.#b + off;
    const ts = r.#o, te = ts + r.#bl;
    const rst = (r as any).stride ?? (r.#ws || (r.#def as StructDefLike<any>).size);
    const rsz = el === r.#def ? rst : sz;
    const ovTbl = p < te && p + rsz > ts;
    const okTbl = el === r.#def && p >= ts && p + rsz <= te && (p - ts) % rst === 0;
    if (p < this.#b || p + rsz > dv.byteLength || (ovTbl && !okTbl)) oob();
    if (el.kind === 'struct') {
      const ws = e ? (e.get(el._h)?.sz ?? (el === r.#def ? r.#ws : el.size)) : el.size;
      return (el as StructDef<any>)._mk(dv, r.#u, this.#b, p, ws, this, r, e);
    }
    return readVal(this as unknown as InternalStructView, el, p, false);
  }
  /** @internal */
  _rU(off: number, desc: UnionDefLike<any>): unknown {
    const r = this.#r ?? this;
    const dv = r.#m ? r._k() : r.#d;
    const tag = r.#u[off]!;
    const vr = desc.variantList[tag];
    if (!vr) oob();
    if (vr.desc === null) return { tag: vr.name };
    const vd = vr.desc;
    const po = off + vr.payloadOffset;
    const vk = vd.kind;
    if (vk === 'primitive') return { tag: vr.name, value: (vd as PrimitiveDesc<any>)._g(dv, po) };
    if (vk === 'struct') return { tag: vr.name, value: (vd as StructDef<any>)._mk(dv, r.#u, this.#b, po, vd.size, this, r, null) };
    if (vk === 'union') return { tag: vr.name, value: this._rU(po, vd as UnionDefLike<any>) };
    if (vk === 'slice') return { tag: vr.name, value: this._rSliceAt(po, vd as SliceDesc<any>) };
    if (vk === 'str' || vk === 'optStr') return { tag: vr.name, value: this._rStrAt(po, vk === 'optStr') };
    return { tag: vr.name, value: readVal(this as unknown as InternalStructView, vd, po, false) };
  }
  /** @internal */
  _rUnionF(fo: number, end: number, desc: UnionDefLike<any>): unknown {
    if (!this.#e) return end > this.#ws ? defVal(desc, false) : this._rU(this.#o + fo, desc);
    const fEnd = fo + wireSz(this.#e, desc);
    return fEnd > this.#ws ? defVal(desc, false) : readVal(this as unknown as InternalStructView, desc, this.#o + fo, false);
  }
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
  /** @internal */
  _packBytes(): Uint8Array {
    if ((this.#def as any).kind === 'union') return u8s(this._k(), this.#o, this.#bl);
    const a = this as any,
      isArr = 'length' in a;
    return pack(
      this.#def as any,
      (isArr ? a.toJSON() : [a.toJSON()]) as readonly Partial<StructInput<F>>[],
    );
  }
  /** @internal */
  _compact(): Uint8Array {
    this._chkMut();
    if ((this.#def as any).kind === 'union') return u8s(this._k(), this.#o, this.#bl);
    const a = this as any,
      isArr = 'length' in a,
      p = this._packBytes(),
      o0 = this.#o,
      oldSt = isArr ? a.stride : 0,
      sz = (this.#def as any).size;
    this.#bl = (isArr ? a.length : 1) * sz;
    this.#tl = p.byteLength;
    this.#ws = sz;
    this.#dead = 0;
    this.#dirty = false;
    this.#env = false;
    this.#a = undefined;
    this.#r = undefined;
    this._set(new DataView(p.buffer, p.byteOffset, p.byteLength), 0, 0, null);
    if (isArr) {
      a.stride = sz;
      a._cap = a.length;
      for (const pv of [a._c, ...(a._p ?? [])])
        if (pv) pv._set(this.#d, 0, oldSt ? Math.floor((pv._o - o0) / oldSt) * sz : 0, a), (pv._ws = sz);
    }
    return p;
  }
  /** Wire-ready `Uint8Array` view over the underlying bytes (automatically compacts dead tail bytes if dirty). */
  get bytes(): Uint8Array {
    const def = this.#def as any;
    if (def.kind === 'union') return u8s(this._k(), this.#o, this.#bl);
    if (this.#dirty || this.#dead || (def._fv >= 0 && (this.#b !== this.#o || this.#a)))
      return this.#ro || this.#a ? this._packBytes() : this._compact();
    const d = this._k();
    if (this.#env) {
      const envEnd = Math.max(this.#o + this.#bl, this.#tl ?? 0);
      return u8s(d, 0, Math.min(d.byteLength, al(envEnd, 8)));
    }
    const rawEnd = Math.max(this.#bl, (this.#tl ?? 0) - this.#o),
      end = !this.#m && this.#tl !== undefined ? Math.min(d.byteLength - this.#o, al(rawEnd, 8)) : rawEnd;
    if (this.#bl && def._fv >= 0) {
      const ts = al(this.#bl, 8),
        fvs = def._fvs;
      if (fvs >= 0) {
        const f = this.#b + fvs,
          p0 = d.getUint32(f, true);
        if (this.#tl !== undefined && p0 > ts) return this.#ro ? this._packBytes() : this._compact();
        if (p0 < ts && end >= ts && !d.getUint32(f + 4, true)) {
          if (this.#ro) {
            const out = u8s(d, this.#o, end).slice();
            new DataView(out.buffer).setUint32(f - this.#o, ts, true);
            return out;
          }
          d.setUint32(f, ts, true);
        }
      } else if (def._fvr) {
        const f = this.#b + def._fv,
          p0 = d.getUint32(f, true);
        if (this.#tl !== undefined && p0 > ts) return this.#ro ? this._packBytes() : this._compact();
        if (p0 < ts && end >= ts) {
          if (this.#ro) {
            const out = u8s(d, this.#o, end).slice();
            fixFv(new DataView(out.buffer), f - this.#o, ts);
            return out;
          }
          fixFv(d, f, ts);
        }
      }
    }
    return u8s(d, this.#o, end);
  }
  toJSON(): any {
    return readPlain(this as any);
  }
}
(MemView.prototype as any).compact = MemView.prototype._compact;

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
    wireSize = def.size,
    u?: Uint8Array,
    parent?: MemView<any, any>,
    root?: MemView<any, any>,
    env?: WireEnv | null,
  ) {
    super();
    if (u && parent && root) this._initSub(def, wireSize, wireSize, dv, u, base, off, parent, root, env ?? null);
    else this._init(def, wireSize, wireSize, dv, base, off, mem);
    const ks = def._K,
      gs = def._G;
    for (let i = 0; i < ks.length; i++) Object.defineProperty(this, ks[i]!, gs[i]!);
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

  /** @internal */
  _setF(fieldOrValues: unknown, value?: unknown): this {
    this._chkMut();
    if (typeof fieldOrValues === 'string') (this as any)[fieldOrValues] = value;
    else {
      if (this._ws < this.def.size) upgradeView(this as any);
      writeVal(this as any, this.def, fieldOrValues, this._b, this._o);
    }
    return this;
  }
  declare toObject: () => PlainStructValues<F>;
  /** Serializes this struct view to a plain object for `JSON.stringify()`. */
  declare toJSON: () => PlainStructValues<F>;
}
const kInspect = /* @__PURE__ */ Symbol.for('nodejs.util.inspect.custom');
StructViewBase.prototype.at = StructViewBase.prototype.seek;
(StructViewBase.prototype as any).set = StructViewBase.prototype._setF;
(MemView.prototype as any)[kInspect] = StructViewBase.prototype.toObject = MemView.prototype.toJSON as any;
/** Methods available exclusively on mutable `MutStructView<F>` instances. */
export interface MutStructMethods<F extends FieldRecord = FieldRecord> {
  /** Updates a single field in-place (accepts plain JS arrays/objects for `slice`, `fixedArray`, and nested structs). */
  set<K extends keyof F>(field: K, value: FieldInput<F[K], F>): this;
  /** Updates multiple fields in-place from a partial object or positional tuple. */
  set(values: Partial<StructInput<F>> | readonly unknown[]): this;
  /** Re-packs only live fields and tail data into a tight `Uint8Array` and rebinds this view in-place. */
  compact(): Uint8Array;
}
/** Read-only zero-copy view over a single binary struct (`Schema.view()`, `Schema.viewEnvelope()`, `produce()`). */
export type StructView<F extends FieldRecord = FieldRecord> =
  StructViewBase<F> & StructValues<F>;
/** Mutable zero-copy view over a single binary struct (`Schema.create()`, `Schema.mutView()`, `WasmArena`). */
export type MutStructView<F extends FieldRecord = FieldRecord> =
  StructViewBase<F> & MutStructValues<F> & MutStructMethods<F>;
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
  def: StructDefLike<F>,
  source: BufferSourceInput,
  byteOffset: number | ViewOptions | StructDefLike<any> = 0,
  baseOffset?: number,
  wireStride?: number,
): StructView<F> {
  const n = normOpts(byteOffset, undefined, baseOffset, wireStride),
    r = resolveSource(source, n.o),
    ws = n.s ?? (r.max < def.size ? r.max : def.size);
  if (r.o < 0 || r.max < ws) oob();
  const V = (def as unknown as StructDef<F>)._V ?? StructViewBase,
    v = new V(def, r.d, n.b ?? r.o, r.o, r.m, ws) as StructView<F>;
  v._tl = r.o + Math.max(ws, r.max);
  return v;
}
/** Wraps a binary buffer in a mutable `MutStructView<F>` for in-place zero-copy writes. */
export function mutStructView<F extends FieldRecord>(
  def: StructDefLike<F>,
  source: BufferSourceInput,
  byteOffset: number | ViewOptions | StructDefLike<any> = 0,
  baseOffset?: number,
  wireStride?: number,
): MutStructView<F> {
  const v = structView(def, source, byteOffset, baseOffset, wireStride);
  v._ro = false;
  return v as unknown as MutStructView<F>;
}
export class StructArrayView<
  F extends FieldRecord = FieldRecord,
  V extends StructViewBase<F> = StructView<F>,
> extends MemView<F> implements Iterable<V> {
  declare stride: number;
  declare length: number;
  /** @internal */
  declare _p: Array<V | undefined> | null;
  /** @internal */
  declare _c: V | null;
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
    if ((source as unknown) === _SUB) return;
    const n = normOpts(byteOffset, count, baseOffset, wireStride),
      sz = n.s ?? def.size,
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
  static _sub<F extends FieldRecord>(
    def: StructDefLike<F>, d: DataView, u: Uint8Array, off: number, len: number,
    base: number, stride: number, parent: MemView<any, any>, root: MemView<any, any>, env: WireEnv | null,
  ): StructArrayView<F> {
    const sav = new StructArrayView<F>(def, _SUB as unknown as BufferSourceInput);
    sav._initSub(def, len * stride, stride, d, u, base, off, parent, root, env);
    sav.stride = stride;
    sav.length = len;
    sav._cap = len;
    return sav;
  }
  _mv(index: number, v?: StructViewBase<F> | null): V {
    const o = this._o + index * this.stride;
    if (v) return v._rebind(this, o) as V;
    const r = this._root(),
      d = this._k();
    return (this.def as unknown as StructDef<F>)._mk(d, r._u(), this._b, o, this._ws, this, r, this._e) as unknown as V;
  }
  /** Returns a reusable flyweight cursor positioned at `index`. */
  cursor(index = 0): V {
    return (this._c = this._mv(index, this._c)) as V;
  }
  /** Returns a view at `index` (supports negative indices from the end, e.g. `rows.at(-1)`). */
  at(index: number, out?: StructViewBase<F>): V {
    if (index < 0) index += this.length;
    if (index < 0 || index >= this.length) oob();
    return out ? this._mv(index, out) : (((this._p ??= [])[index] = this._mv(index, this._p[index]) as any) as V);
  }
  /** Returns a zero-copy `StructArrayView` slice over `[begin, end)` without copying bytes. */
  subarray(begin = 0, end = this.length): StructArrayView<F, V> {
    const len = this.length,
      cl = (i: number) => Math.max(0, Math.min(len, i < 0 ? len + i : i)),
      s = cl(begin),
      e = cl(end),
      sub = new StructArrayView<F, V>(this.def, this._k(), this._o + s * this.stride, Math.max(0, e - s), this._b, this._ws);
    sub._m = this._m;
    sub._a = this;
    sub._e = this._e;
    sub._ro = this._ro;
    sub._dirty = (this.def._fv >= 0 && (s > 0 || e < len)) || Boolean(this._dirty || this._dead);
    return sub;
  }
  /** Alias for `subarray(begin, end)` returning a zero-copy `StructArrayView` slice over `[begin, end)`. */
  declare slice: (begin?: number, end?: number) => StructArrayView<F, V>;
  /** Calls `callbackfn` for each row using a flyweight cursor (`0` allocations). */
  forEach(fn: (row: V, index: number, array: this) => void): void {
    this.map(fn);
  }
  /** Projects each row in this view into a new JavaScript array (`row` is a distinct view per element). */
  map<U = V>(fn: (row: V, index: number, array: this) => U = (r) => r as any): U[] {
    return Array.from({ length: this.length }, (_, i) => fn(this._mv(i), i, this));
  }
  /** Returns the first row matching `predicate` (or `undefined`). */
  find(fn: (row: V, index: number, array: this) => unknown): V | undefined {
    return this.map().find(fn as any);
  }
  /** Returns `true` if any row matches `predicate`. */
  some(fn: (row: V, index: number, array: this) => unknown): boolean {
    return this.map().some(fn as any);
  }
  /** Returns `true` if every row matches `predicate`. */
  every(fn: (row: V, index: number, array: this) => unknown): boolean {
    return this.map().every(fn as any);
  }
  /** Filters rows with a reusable flyweight cursor and returns a new `StructArrayView` containing matching rows. */
  filter(fn: (row: V, index: number) => unknown): StructArrayView<F, V> {
    const b = this.filterBytes(fn as any),
      out = new StructArrayView<F, V>(this.def, b, 0, b.byteLength ? undefined : 0);
    out._ro = this._ro;
    return out;
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
  ): StructArrayView<F, V> {
    return this.subarray(this.lowerBound(field, min), this.upperBound(field, max));
  }
  /** Filters rows with a reusable flyweight cursor (`0` per-row JS objects) and copies matching binary rows into a `Uint8Array`. */
  filterBytes(predicate: (row: V, index: number) => boolean): Uint8Array {
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
    return rows.length ? pack(def as any, rows) : sU8.slice(0, outOff);
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

  /** Materializes all rows into an array of plain JavaScript objects. */
  declare toObjects: () => PlainStructValues<F>[];
  /** Serializes this array of rows to an array of plain objects for `JSON.stringify()`. */
  declare toJSON: () => PlainStructValues<F>[];
  /**
   * Iterates rows in this view. By default (`flyweight: true`), reuses a single flyweight cursor (`0` allocations).
   * Pass `{ flyweight: false }` when collecting `StructView` instances into an array/Set.
   */
  values(options?: { flyweight?: boolean }): IterableIterator<V> {
    return (options?.flyweight === false ? this.map() : this)[Symbol.iterator]();
  }
  /** Zero-allocation flyweight iterator (`for (const row of view)`). Use `view.map(...)` or `view.toObjects()` when collecting rows. */
  *[Symbol.iterator](): IterableIterator<V> {
    for (let i = 0, c = this.cursor(0), b = this._o, st = this.stride, n = this.length; i < n; i++) {
      c._o = b + i * st;
      yield c;
    }
  }
}
StructArrayView.prototype.slice = StructArrayView.prototype.subarray;
StructArrayView.prototype.toObjects = MemView.prototype.toJSON as any;
const _savP = StructArrayView.prototype as any;
_savP.set = function (this: StructArrayView<any>, index: number, value: unknown) {
  this._chkMut();
  (this.at(index) as any).set(value);
  return this;
};
_savP.push = function (this: StructArrayView<any>, ...items: unknown[]): number {
  this._chkMut();
  const def = this.def,
    st = this.stride,
    need = this.length + items.length,
    hasVar = def._fv >= 0;
  if (need > this._cap) {
    const curEnd = this._tl ?? this._o + this.byteLength,
      tableEnd = this._o + this._cap * st;
    if ((!hasVar || !this.length) && tableEnd === curEnd) {
      allocTail(this as any, (need - this._cap) * st, def.align);
      this._cap = need;
    } else {
      const newCap = Math.max(need, (this._cap || 2) * 2),
        newO = allocTail(this as any, al(newCap * st, 8), def.align),
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
};
_savP.pop = function (this: StructArrayView<any>) {
  this._chkMut();
  if (!this.length) return undefined;
  const lastIdx = --this.length,
    val = readPlain(this as any, this._o + lastIdx * this.stride);
  this._bl = this.length * this.stride;
  if (this.def._fv >= 0) this._dead = (this._dead ?? 0) + this.stride;
  else if (this._tl === this._o + (lastIdx + 1) * this.stride) {
    this._tl -= this.stride;
    this._cap = this.length;
  }
  return val;
};
_savP.setColumn = function (this: StructArrayView<any>, field: string, values: ArrayLike<number | bigint | boolean>) {
  this._chkMut();
  const lay = colDesc(this, field);
  if (lay.offset + lay.size > this._ws) this._compact();
  const desc = lay.desc,
    d = this._k(),
    st = this.stride,
    n = Math.min(this.length, values.length);
  for (let i = 0, off = this._o + lay.offset; i < n; i++, off += st) {
    desc._s(d, off, values[i] as number | bigint | boolean);
  }
  return this;
};
/** Mutable zero-copy array view (`Schema.mutArray()`, `Schema.alloc()`, `Schema.shared()`, `Schema.inWasm()`, `Schema.from(rows)`). */
export interface MutStructArrayView<F extends FieldRecord = FieldRecord>
  extends StructArrayView<F, MutStructView<F>> {
  /** Writes `value` into the struct at `index` (supports negative indices from the end). */
  set(index: number, value: Partial<StructInput<F>> | StructViewBase<F> | readonly unknown[]): this;
  /** Appends one or more rows to the binary array, automatically growing capacity if needed. */
  push(...items: (Partial<StructInput<F>> | StructViewBase<F> | readonly unknown[])[]): number;
  /** Removes and returns the last row as a plain object (or `undefined` when empty). */
  pop(): PlainStructValues<F> | undefined;
  /** Re-packs only live rows and tail data into a tight `Uint8Array` and rebinds this view in-place. */
  compact(): Uint8Array;
  /** Bulk-writes a primitive column from `values` into `field` across all rows. */
  setColumn<K extends PrimitiveFieldKeys<F>>(field: K, values: ArrayLike<number | bigint | boolean>): this;
  /** Returns a zero-copy mutable `MutStructArrayView` slice over `[begin, end)` without copying bytes. */
  subarray(begin?: number, end?: number): MutStructArrayView<F>;
  /** Alias for `subarray(begin, end)` returning a zero-copy mutable `MutStructArrayView` slice. */
  slice(begin?: number, end?: number): MutStructArrayView<F>;
  filter(fn: (row: MutStructView<F>, index: number) => unknown): MutStructArrayView<F>;
  rangeBy<K extends PrimitiveFieldKeys<F>>(field: K, min: number | bigint, max: number | bigint): MutStructArrayView<F>;
}
/** Lazy zero-copy view over a `slice(Union)` or `fixedArray(Union, N)` without eager JS array materialization. */
export class UnionArrayView<
  V extends UnionVariantRecord = UnionVariantRecord,
  SelfF extends FieldRecord = FieldRecord,
  U = UnionValue<V, SelfF>,
> extends MemView<any, UnionDefLike<V>> implements Iterable<U> {
  declare readonly stride: number;
  declare readonly length: number;
  constructor(
    def: UnionDefLike<V>,
    dv: DataView,
    off: number,
    length: number,
    base: number,
    mem: WasmMemoryLike | WasmArena | null = null,
    wireStride = def.size,
  ) {
    super();
    if ((dv as unknown) === _SUB) return;
    this._init(def, length * wireStride, wireStride, dv, base, off, mem);
    Object.assign(this, { stride: wireStride, length });
  }
  /** @internal */
  static _sub<V extends UnionVariantRecord, SelfF extends FieldRecord = FieldRecord>(
    def: UnionDefLike<V>, d: DataView, u: Uint8Array, off: number, len: number,
    base: number, stride: number, parent: MemView<any, any>, root: MemView<any, any>, env: WireEnv | null,
  ): UnionArrayView<V, SelfF> {
    const uav = new UnionArrayView<V, SelfF>(def, _SUB as unknown as DataView, 0, 0, 0);
    uav._initSub(def, len * stride, stride, d, u, base, off, parent, root, env);
    const w = uav as { stride: number; length: number };
    w.stride = stride;
    w.length = len;
    return uav;
  }
  /** @internal */
  _i(index: number): number {
    const i = index < 0 ? this.length + index : index;
    if (i < 0 || i >= this.length) oob();
    return this._o + i * this.stride;
  }
  /** Reads the single tagged union element at `index` in O(1) (supports negative indices). */
  at(index: number): U {
    const off = this._i(index);
    if (!this._e) return this._rU(off, this.def) as U;
    return readVal(this as unknown as InternalStructView, this.def, off, false) as U;
  }
  /** Reads only the 1-byte discriminant tag name at `index` in O(1) without allocating a union object. */
  tagAt(index: number): keyof V & string {
    const tag = this._m ? this._k().getUint8(this._i(index)) : this._u()[this._i(index)]!;
    const vr = this.def.variantList[tag];
    if (vr) return vr.name as keyof V & string;
    const wt = this._e?.get(this.def._h);
    if (wt && tag < wt.vc) return '$unknown' as keyof V & string;
    oob();
  }
  /** Returns a zero-copy `UnionArrayView` slice over `[begin, end)` without copying bytes. */
  subarray(begin = 0, end = this.length): UnionArrayView<V, SelfF, U> {
    const len = this.length,
      cl = (i: number) => Math.max(0, Math.min(len, i < 0 ? len + i : i)),
      s = cl(begin),
      e = cl(end),
      sub = new UnionArrayView<V, SelfF, U>(this.def, this._k(), this._o + s * this.stride, Math.max(0, e - s), this._b, this._m, this.stride);
    sub._a = this._a;
    sub._e = this._e;
    sub._ro = this._ro;
    return sub;
  }
  /** Alias for `subarray(begin, end)`. */
  declare slice: (begin?: number, end?: number) => UnionArrayView<V, SelfF, U>;
  forEach(fn: (item: U, index: number, array: this) => void): void {
    for (let i = 0; i < this.length; i++) fn(this.at(i), i, this);
  }
  map<R>(fn: (item: U, index: number, array: this) => R): R[] {
    return Array.from({ length: this.length }, (_, i) => fn(this.at(i), i, this));
  }
  find(fn: (item: U, index: number, array: this) => unknown): U | undefined {
    for (let i = 0; i < this.length; i++) {
      const v = this.at(i);
      if (fn(v, i, this)) return v;
    }
  }
  some(fn: (item: U, index: number, array: this) => unknown): boolean {
    for (let i = 0; i < this.length; i++) if (fn(this.at(i), i, this)) return true;
    return false;
  }
  every(fn: (item: U, index: number, array: this) => unknown): boolean {
    for (let i = 0; i < this.length; i++) if (!fn(this.at(i), i, this)) return false;
    return true;
  }
  /** Materializes all elements into a plain JavaScript array. */
  declare toObjects: () => PlainUnionValue<V, SelfF>[];
  /** Serializes this union array view to a plain array for `JSON.stringify()`. */
  declare toJSON: () => PlainUnionValue<V, SelfF>[];
  *[Symbol.iterator](): IterableIterator<U> {
    for (let i = 0; i < this.length; i++) yield this.at(i);
  }
}
UnionArrayView.prototype.slice = UnionArrayView.prototype.subarray;
UnionArrayView.prototype.toObjects = MemView.prototype.toJSON as any;
(UnionArrayView.prototype as any).set = function (this: UnionArrayView<any, any>, index: number, value: unknown) {
  this._chkMut();
  writeVal(this as unknown as InternalStructView, this.def, value, this._b, this._i(index));
  return this;
};
/** Mutable zero-copy tagged-union array view returned on `MutStructView` fields. */
export interface MutUnionArrayView<
  V extends UnionVariantRecord = UnionVariantRecord,
  SelfF extends FieldRecord = FieldRecord,
> extends UnionArrayView<V, SelfF, MutUnionValue<V, SelfF>> {
  /** Updates the tagged union element at `index` in-place (supports negative indices). */
  set(index: number, value: UnionInput<V, SelfF>): this;
  subarray(begin?: number, end?: number): MutUnionArrayView<V, SelfF>;
  slice(begin?: number, end?: number): MutUnionArrayView<V, SelfF>;
}
function colDesc(a: StructArrayView<any, any>, k: PropertyKey): FieldLayout<PrimitiveDesc<any>> {
  const lay = a.def.fields[k as string];
  if (!lay?.desc._C) oob();
  return lay as FieldLayout<PrimitiveDesc<any>>;
}
function bsearch(a: StructArrayView<any, any>, k: PropertyKey, v: number | bigint, eq: boolean): number {
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
  ): MutStructArrayView<F>;
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
  readonly view: MutStructArrayView<F>;
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
  ): MutStructArrayView<F> {
    const p = this._alloc(count * def.size, def.align, zero);
    initNulls(def, this._d, p, count);
    const v = new StructArrayView(def, this, p, count, p);
    v._tl = p + count * def.size;
    v._ro = false;
    return v as MutStructArrayView<F>;
  }
  allocOne<F extends FieldRecord>(
    def: StructDef<F>,
    init?: Partial<StructInput<F>>,
  ): MutStructView<F> {
    const p = this._alloc(def.size, def.align, true),
      v = new StructViewBase(def, this._d, p, p, this) as MutStructView<F>;
    v._ro = false;
    initNulls(def, this._d, p);
    return init !== undefined ? v.set(init) : v;
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
        v._ro = false;
        return v as MutStructArrayView<SF>;
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
  mutView<F extends FieldRecord>(
    def: StructDef<F>,
    byteOffset: number,
    baseOffset = byteOffset,
  ): MutStructView<F> {
    return mutStructView(def, this, byteOffset, baseOffset);
  }
  viewArray<F extends FieldRecord>(
    def: StructDef<F>,
    byteOffset: number,
    count: number,
    baseOffset = byteOffset,
  ): StructArrayView<F> {
    return new StructArrayView(def, this, byteOffset, count, baseOffset);
  }
  mutViewArray<F extends FieldRecord>(
    def: StructDef<F>,
    byteOffset: number,
    count: number,
    baseOffset = byteOffset,
  ): MutStructArrayView<F> {
    const v = new StructArrayView(def, this, byteOffset, count, baseOffset);
    v._ro = false;
    return v as MutStructArrayView<F>;
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
  /** Phantom type helper: `typeof MySchema.$view` resolves to read-only `StructView<F>`. */
  declare readonly $view: StructView<F>;
  /** Phantom type helper: `typeof MySchema.$mutView` resolves to mutable `MutStructView<F>`. */
  declare readonly $mutView: MutStructView<F>;
  /** Phantom type helper: `typeof MySchema.$draft` resolves to `StructDraft<F>`. */
  declare readonly $draft: StructDraft<F>;
  /** Phantom type helper: `typeof MySchema.$header` resolves to `StructHeaderView<F>`. */
  declare readonly $header: StructHeaderView<F>;
  /** Phantom type helper: `typeof MySchema.$plain` resolves to `PlainStructValues<F>`. */
  declare readonly $plain: PlainStructValues<F>;
  /** Phantom type helper: `typeof MySchema.$input` resolves to `Partial<StructInput<F>>`. */
  declare readonly $input: Partial<StructInput<F>>;
  declare readonly _fv: number;
  /** @internal */
  declare readonly _fvs: number;
  /** @internal */
  declare readonly _fvr: boolean;
  /** @internal */
  declare readonly _K: readonly string[];
  /** @internal */
  declare readonly _G: readonly PropertyDescriptor[];
  /** @internal */
  declare readonly _h: number;
  /** @internal */
  declare readonly _V: typeof StructViewBase<F>;
  /** @internal */
  _D?: (StructDefLike | UnionDefLike)[];
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
      let get: (this: StructViewBase<F>) => unknown;
      if (dk === 'primitive') {
        if (d === (u32 as unknown)) get = function (this: StructViewBase<F>) { return this._rU32(fo, end); };
        else if (d === (i32 as unknown)) get = function (this: StructViewBase<F>) { return this._rI32(fo, end); };
        else if (d === (u8 as unknown)) get = function (this: StructViewBase<F>) { return this._rU8(fo, end); };
        else if (d === (bool as unknown)) get = function (this: StructViewBase<F>) { return this._rBool(fo, end); };
        else if (d === (f64 as unknown)) get = function (this: StructViewBase<F>) { return this._rF64(fo, end); };
        else if ((d as any)._sp === u32) {
          const nv = (d as any)._null as number;
          get = function (this: StructViewBase<F>) { return this._rSentU32(fo, end, nv); };
        } else {
          get = function (this: StructViewBase<F>) { return this._rP(fo, end, d as PrimitiveDesc<any>); };
        }
      } else if (dk === 'str') {
        get = function (this: StructViewBase<F>) { return this._rStr(fo, end, false); };
      } else if (dk === 'optStr') {
        get = function (this: StructViewBase<F>) { return this._rStr(fo, end, true); };
      } else if (dk === 'slice') {
        get = function (this: StructViewBase<F>) { return this._rSlice(fo, end, d as SliceDesc<any>); };
      } else if (dk === 'ref') {
        get = function (this: StructViewBase<F>) { return this._rRef(fo, end, d as RefDesc<any>); };
      } else if (dk === 'union') {
        get = function (this: StructViewBase<F>) { return this._rUnionF(fo, end, d as UnionDefLike<any>); };
      } else {
        get = function (this: StructViewBase<F>) {
          const fEnd = fo + wireSz(this._e, d);
          return fEnd > this._ws ? defVal(d, false) : readVal(this, d, this._o + fo, false);
        };
      }
      gs.push({
        enumerable: true,
        configurable: true,
        get,
        set(this: StructViewBase<F>, v: unknown) {
          this._chkMut();
          if (end > this._ws) upgradeView(this as any);
          writeVal(this as any, d, v, this._b, this._o + fo);
        },
      });
    }
    const sz = al(off, maxA);
    const rustType = name || 'AnonStruct';
    const V = class extends StructViewBase<F> {};
    Object.assign(this, {
      kind: 'struct',
      name,
      rustType,
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
      _h: typeHash(rustType),
      _V: V,
    });
  }
  /** @internal */
  _mk(
    dv: DataView, u: Uint8Array, base: number, off: number, ws: number,
    parent: MemView<any, any>, root: MemView<any, any>, env: WireEnv | null,
  ): StructView<F> {
    return new this._V(this, dv, base, off, null, ws, u, parent, root, env) as StructView<F>;
  }
  /** @internal */
  _allDefs(): (StructDefLike | UnionDefLike)[] {
    if (this._D) return this._D;
    const seen = new Set<object>(),
      defs: (StructDefLike | UnionDefLike)[] = [];
    const visit = (d: FieldDesc | null): void => {
      if (!d || seen.has(d)) return;
      if (d.kind === 'struct') {
        seen.add(d);
        for (const fl of d.fieldList) visit(fl.desc);
        defs.push(d);
      } else if (d.kind === 'union') {
        seen.add(d);
        for (const vr of d.variantList) visit(vr.desc);
        defs.push(d);
      } else if (d.kind === 'array' || d.kind === 'slice' || d.kind === 'ref') visit(d.element as FieldDesc);
    };
    visit(this as unknown as StructDefLike);
    return (this._D = defs);
  }
  offsetOf<K extends keyof F>(field: K): number {
    return this.fields[field].offset;
  }

  /** Allocates a single mutable `MutStructView<F>` backed by a fresh buffer and optionally initializes fields. */
  create(init?: Partial<StructInput<F>> | readonly unknown[]): MutStructView<F> {
    const v = this.mutView(new ArrayBuffer(this.size));
    initNulls(this, v._d, 0);
    return init !== undefined ? v.set(init) : v;
  }
  /** Infers `Partial<StructInput<F>>` on a plain JS object literal (for building typed cyclic JS graphs without `any`). */
  item(init: Partial<StructInput<F>>): Partial<StructInput<F>> {
    return init;
  }
  /** Wraps `source` in a read-only zero-copy `StructView<F>`. */
  view(
    source: BufferSourceInput,
    byteOffset?: number | ViewOptions | StructDefLike<any>,
    baseOffset?: number,
    wireStride?: number,
  ): StructView<F> {
    return structView(this, source, byteOffset, baseOffset, wireStride);
  }
  /** Wraps `source` in a mutable zero-copy `MutStructView<F>` for in-place binary edits. */
  mutView(
    source: BufferSourceInput,
    byteOffset?: number | ViewOptions | StructDefLike<any>,
    baseOffset?: number,
    wireStride?: number,
  ): MutStructView<F> {
    return mutStructView(this, source, byteOffset, baseOffset, wireStride);
  }
  /** Packs a single root struct with a self-describing `CS01` schema-evolution envelope header. */
  packEnvelope(row: Partial<StructInput<F>> | StructViewBase<F> | readonly unknown[]): Uint8Array {
    const defs = this._allDefs();
    const hashes = new Set<number>();
    for (const d of defs) {
      if (hashes.has(d._h)) throw new Error(`capnstruct envelope type hash collision for ${d.rustType}`);
      hashes.add(d._h);
    }
    const payload = this.pack([row]),
      hdrLen = 16 + defs.length * 8,
      out = new Uint8Array(hdrLen + payload.byteLength),
      dv = new DataView(out.buffer);
    dv.setUint32(0, ENV_MAGIC, true);
    dv.setUint16(4, 1, true);
    dv.setUint16(6, defs.length, true);
    dv.setUint32(8, this._h, true);
    dv.setUint32(12, hdrLen, true);
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i]!,
        o = 16 + i * 8;
      dv.setUint32(o, d._h, true);
      dv.setUint16(o + 4, d.size, true);
      dv.setUint8(o + 6, d.kind === 'union' ? (d.unitOnly ? 0 : al(1, d.align)) : d.align);
      dv.setUint8(o + 7, d.kind === 'union' ? d.variantList.length : 0);
    }
    out.set(payload, hdrLen);
    return out;
  }
  /** Validates a `CS01` schema-evolution envelope and returns a forward/backward-compatible zero-copy `StructView<F>`. */
  viewEnvelope(source: BufferSourceInput): StructView<F> {
    const r = resolveSource(source, 0),
      d = r.d;
    if (r.max < 16 || d.getUint32(0, true) !== ENV_MAGIC || d.getUint16(4, true) !== 1) oob();
    const tc = d.getUint16(6, true),
      rh = d.getUint32(8, true),
      po = d.getUint32(12, true);
    if (rh !== this._h || po !== 16 + tc * 8 || po > r.max) oob();
    const env: WireEnv = new Map();
    for (let i = 0; i < tc; i++) {
      const o = 16 + i * 8;
      env.set(d.getUint32(o, true), { sz: d.getUint16(o + 4, true), po: d.getUint8(o + 6), vc: d.getUint8(o + 7) });
    }
    const rootWt = env.get(this._h);
    if (!rootWt || r.max - po < rootWt.sz) oob();
    const v = this.view(source, { byteOffset: po, baseOffset: po, stride: rootWt.sz });
    const defs = this._allDefs();
    let exact = true;
    for (let i = 0; i < defs.length; i++) {
      const ld = defs[i]!;
      const wt = env.get(ld._h);
      const expPo = ld.kind === 'union' ? (ld.unitOnly ? 0 : al(1, ld.align)) : ld.align;
      const expVc = ld.kind === 'union' ? ld.variantList.length : 0;
      if (!wt || wt.sz !== ld.size || wt.po !== expPo || wt.vc !== expVc) {
        exact = false;
        break;
      }
    }
    if (!exact) v._e = env;
    v._env = true;
    return v;
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
  /** Wraps `source` in a read-only zero-copy `StructArrayView<F>`. */
  array(
    source: BufferSourceInput,
    byteOffset?: number | ViewOptions | StructDefLike<any>,
    count?: number,
    baseOffset?: number,
    wireStride?: number,
  ): StructArrayView<F> {
    return new StructArrayView(this, source, byteOffset, count, baseOffset, wireStride);
  }
  /** Wraps `source` in a mutable zero-copy `MutStructArrayView<F>` for in-place binary edits. */
  mutArray(
    source: BufferSourceInput,
    byteOffset?: number | ViewOptions | StructDefLike<any>,
    count?: number,
    baseOffset?: number,
    wireStride?: number,
  ): MutStructArrayView<F> {
    const a = new StructArrayView(this, source, byteOffset, count, baseOffset, wireStride);
    a._ro = false;
    return a as MutStructArrayView<F>;
  }
  /** Allocates a growable mutable `MutStructArrayView<F>` for `count` rows (pass `0` for an empty growable array). */
  alloc(count: number, Ctor: typeof ArrayBuffer = ArrayBuffer): MutStructArrayView<F> {
    const a = this.mutArray(new Ctor(count * this.size), 0, count);
    initNulls(this, a._d, 0, count);
    return a;
  }
  from(count: number): MutStructArrayView<F>;
  from(view: MutStructArrayView<F>): MutStructArrayView<F>;
  from(view: StructArrayView<F>): StructArrayView<F>;
  from(source: BufferSourceInput): StructArrayView<F>;
  from(
    rows:
      | readonly (Partial<StructInput<F>> | readonly unknown[])[]
      | Iterable<Partial<StructInput<F>> | readonly unknown[]>,
  ): MutStructArrayView<F>;
  from(
    sourceOrRows:
      | readonly (Partial<StructInput<F>> | readonly unknown[])[]
      | Iterable<Partial<StructInput<F>> | readonly unknown[]>
      | BufferSourceInput
      | StructArrayView<F>
      | number,
  ): StructArrayView<F> | MutStructArrayView<F> {
    if (typeof sourceOrRows === 'number') return this.alloc(sourceOrRows);
    if (sourceOrRows instanceof StructArrayView) return sourceOrRows;
    if ('byteLength' in (sourceOrRows as any) || (sourceOrRows as any)?.buffer) {
      return this.array(sourceOrRows as BufferSourceInput);
    }
    return this.mutArray(this.pack([...(sourceOrRows as any)]));
  }
  shared(
    rowsOrCount:
      | readonly (Partial<StructInput<F>> | readonly unknown[])[]
      | number,
  ): MutStructArrayView<F> {
    const B: typeof ArrayBuffer =
      typeof SharedArrayBuffer !== 'undefined'
        ? (SharedArrayBuffer as any)
        : ArrayBuffer;
    if (typeof rowsOrCount === 'number') return this.alloc(rowsOrCount, B);
    const p = this.pack(rowsOrCount),
      sb = new B(p.byteLength);
    new Uint8Array(sb).set(p);
    return this.mutArray(sb);
  }
  /** Allocates or packs a mutable `MutStructArrayView<F>` directly inside `WebAssembly.Memory` (via `WasmArena` or exported `capn_alloc`/`alloc`) and returns `{ view, ptr, len, byteLength }`. */
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
      src = typeof rowsOrCount === 'number' ? null : (this.from as any)(rowsOrCount) as StructArrayView<F>,
      len = src ? src.length : (rowsOrCount as number),
      u = src?.bytes,
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
    const view = this.mutArray(mem, ptr, len, ptr);
    view._tl = end;
    u ? u8s(view._d, ptr, byteLength).set(u) : (u8s(view._d, ptr, byteLength).fill(0), initNulls(this, view._d, ptr, len));
    return { view, ptr, len, byteLength };
  }
  /** Packs an array of plain JavaScript objects, struct views, or positional tuples into an 8-byte-aligned `Uint8Array`. */
  pack(rows: readonly (Partial<StructInput<F>> | StructViewBase<F> | readonly unknown[])[]): Uint8Array {
    return pack(this, rows);
  }
  concatBytes(chunks: readonly (StructArrayView<F, any> | Uint8Array)[]): Uint8Array {
    return concatBytes(this, chunks);
  }
}


/** Concatenates multiple `StructArrayView<F>` or `Uint8Array` chunks into a single packed `Uint8Array` via bulk `memcpy` when fixed-size. */
export function concatBytes<F extends FieldRecord>(
  def: StructDefLike<F>,
  chunks: readonly (StructArrayView<F, any> | Uint8Array)[],
): Uint8Array {
  if (def._fv >= 0) return pack(def, chunks.flatMap((c) => (def as StructDef<F>).from(c as any).toObjects()) as any);
  const slices = chunks.map((c) =>
    c instanceof Uint8Array ? (c.byteLength % def.size && oob(), c) : c.stride === def.size ? c.bytes : c._packBytes(),
  );
  const out = new Uint8Array(slices.reduce((s, b) => s + b.byteLength, 0));
  let off = 0;
  for (const s of slices) (out.set(s, off), (off += s.byteLength));
  return out;
}

/** Packs an array of plain JavaScript objects into an 8-byte-aligned `Uint8Array`. */
export function pack<F extends FieldRecord>(
  def: StructDefLike<F>,
  rows: readonly (Partial<StructInput<F>> | StructViewBase<F> | readonly unknown[])[],
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
  /** @internal */
  declare readonly _h: number;
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
    const rustType = name || 'AnonUnion';
    Object.assign(this, {
      kind: 'union',
      name,
      rustType,
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
      _h: typeHash(rustType),
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
  return typeof nameOrFields === 'string' ? new StructDef<F>(nameOrFields, maybeFields!) : new StructDef<F>('', nameOrFields);
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

function _revErr(): never {
  throw new TypeError('Cannot access a revoked capnstruct draft after produce() has finished');
}
const _ARR_MUT: Record<string, true> = {
    push: true, pop: true, shift: true, unshift: true, splice: true, sort: true, reverse: true, fill: true, copyWithin: true,
  },
  _ARR_RESIZE: Record<string, true> = { push: true, pop: true, shift: true, unshift: true },
  _TA_MUT: Record<string, true> = { set: true, fill: true, copyWithin: true, sort: true, reverse: true };

function _resDesc(t: unknown): FieldDesc {
  return typeof t === 'function' ? (t as () => FieldDesc)() : (t as FieldDesc);
}
function _isVarDesc(desc: FieldDesc): boolean {
  const k = desc.kind;
  if (k === 'str' || k === 'optStr' || k === 'slice' || k === 'ref') return true;
  if (k === 'struct') return desc._fv >= 0 || Boolean(desc._fvr);
  if (k === 'union') return desc._fv >= 0;
  if (k === 'array') return _isVarDesc(_resDesc(desc.element));
  return false;
}
function _defDraftPlain(desc: FieldDesc): unknown {
  if ((desc as { _null?: unknown })._null !== undefined) return null;
  const k = desc.kind;
  if (k === 'primitive') {
    if (desc.type === 'bool') return false;
    if ('bigint' in desc && desc.bigint) return 0n;
    if (desc.type === 'fixedStr') return '';
    if (desc.type === 'fixedBytes') return new Uint8Array(desc.length);
    return 0;
  }
  if (k === 'str') return '';
  if (k === 'optStr' || k === 'ref') return null;
  if (k === 'slice') return [];
  if (k === 'array') {
    const el = _resDesc(desc.element);
    if (el.kind === 'primitive' && el._C && el.type !== 'bool') return new el._C(desc.length);
    return Array.from({ length: desc.length }, () => _defDraftPlain(el));
  }
  if (k === 'union') {
    const v0 = desc.variantList[0];
    if (!v0) return { tag: '$unknown', rawTag: 0 };
    return v0.desc === null ? { tag: v0.name } : { tag: v0.name, value: _defDraftPlain(v0.desc) };
  }
  if (k === 'struct') {
    const out: Record<string, unknown> = {};
    for (const f of desc.fieldList) out[f.name] = _defDraftPlain(f.desc);
    return out;
  }
  return undefined;
}

interface _DraftCtx {
  revoked: boolean;
  dirty: boolean;
  varDirty: boolean;
  canPatch: boolean;
  baseBuf: ArrayBufferLike | null;
  baseZero: number;
  revokes: Array<() => void>;
  byProxy: WeakMap<object, _DraftNode>;
  byOff: Map<StructDefLike, Map<number, _StructDraftNode>>;
  dirtyNodes: Set<_StructDraftNode>;
}

type _DraftNode =
  | _StructDraftNode
  | {
      kind: 'sarr';
      def: StructDefLike;
      base: StructArrayView<any> | null;
      fixed: boolean;
      readonly mat: _StructDraftNode[] | null;
      sparse: Map<number, _StructDraftNode>;
      proxy: any;
      getNode(i: number): _StructDraftNode;
      len(): number;
    }
  | { kind: 'arr'; items: any[]; proxy: any }
  | { kind: 'ta'; ta: ArrayBufferView; proxy: any }
  | { kind: 'union'; target: Record<string, any>; proxy: any };

interface _StructDraftNode {
  kind: 'struct';
  def: StructDefLike;
  base: StructViewBase<any> | null;
  rawIn: Record<string, unknown> | null;
  relOff: number;
  ov: Map<string, unknown>;
  kids: Map<string, _DraftNode>;
  dirtyFields: Set<FieldLayout>;
  proxy: any;
}

function _wrapTA(ta: any, ctx: _DraftCtx, onMut: () => void, doClone = true): _DraftNode {
  const clone = doClone ? ta.slice() : ta,
    { proxy, revoke } = Proxy.revocable(clone, {
      get(t, p) {
        if (ctx.revoked) _revErr();
        const v = Reflect.get(t, p, t);
        if (typeof v === 'function') {
          if (typeof p === 'string' && _TA_MUT[p])
            return (...args: any[]) => {
              if (ctx.revoked) _revErr();
              onMut();
              return v.apply(t, args);
            };
          if (p === 'subarray')
            return (...args: any[]) => {
              if (ctx.revoked) _revErr();
              return _wrapTA(t.subarray(...args), ctx, onMut, false).proxy;
            };
          return v.bind(t);
        }
        return v;
      },
      set(t, p, v) {
        if (ctx.revoked) _revErr();
        onMut();
        return Reflect.set(t, p, v, t);
      },
    }),
    node: _DraftNode = { kind: 'ta', ta: clone, proxy };
  ctx.revokes.push(revoke);
  ctx.byProxy.set(proxy, node);
  return node;
}

function _wrapArr(raw: Iterable<any>, elDesc: FieldDesc, fixed: boolean, ctx: _DraftCtx, onMut: () => void): _DraftNode {
  const wrapEl = (it: any) => _wrapVal(elDesc, it, -1, ctx, onMut),
    items = Array.from(raw, wrapEl),
    { proxy, revoke } = Proxy.revocable(items, {
      get(t, p, r) {
        if (ctx.revoked) _revErr();
        const v = Reflect.get(t, p, r);
        if (typeof p === 'string' && typeof v === 'function' && _ARR_MUT[p]) {
          return (...args: any[]) => {
            if (ctx.revoked) _revErr();
            if (fixed && (_ARR_RESIZE[p] || (p === 'splice' && args.length > 0))) {
              throw new TypeError('Cannot resize a fixedArray draft');
            }
            let m = args;
            if (p === 'push' || p === 'unshift') m = args.map(wrapEl);
            else if (p === 'splice' && args.length > 2) m = [args[0], args[1], ...args.slice(2).map(wrapEl)];
            else if (p === 'fill' && args.length > 0) m = [wrapEl(args[0]), ...args.slice(1)];
            onMut();
            return Array.prototype[p as any].apply(t, m);
          };
        }
        return v;
      },
      set(t, p, v, r) {
        if (ctx.revoked) _revErr();
        if (fixed && p === 'length' && Number(v) !== t.length)
          throw new TypeError('Cannot resize a fixedArray draft');
        if (typeof p === 'string' && p !== 'length') {
          const idx = Number(p);
          if (Number.isInteger(idx) && idx >= 0) {
            if (fixed && idx >= t.length) throw new TypeError('Cannot resize a fixedArray draft');
            onMut();
            return Reflect.set(t, p, wrapEl(v), r);
          }
        }
        onMut();
        return Reflect.set(t, p, v, r);
      },
      deleteProperty(t, p) {
        if (ctx.revoked) _revErr();
        onMut();
        return Reflect.deleteProperty(t, p);
      },
    }),
    node: _DraftNode = { kind: 'arr', items, proxy };
  ctx.revokes.push(revoke);
  ctx.byProxy.set(proxy, node);
  return node;
}

function _wrapUnion(udesc: UnionDefLike, rawVal: any, ctx: _DraftCtx, onMut: () => void): _DraftNode {
  const ex = rawVal && typeof rawVal === 'object' ? ctx.byProxy.get(rawVal) : undefined;
  if (ex && ex.kind === 'union') return ex;
  const vr = rawVal?.tag !== undefined ? udesc.byName[rawVal.tag] : undefined,
    onU = () => {
      ctx.dirty = true;
      if (udesc._fv >= 0) ctx.varDirty = true;
      ctx.canPatch = false;
      onMut();
    },
    target: Record<string, any> = vr
      ? vr.desc === null
        ? { tag: rawVal.tag }
        : {
            tag: rawVal.tag,
            value: _wrapVal(
              vr.desc,
              rawVal.value !== undefined ? rawVal.value : _defDraftPlain(vr.desc),
              -1,
              ctx,
              onU,
            ),
          }
      : { tag: rawVal?.tag ?? '$unknown', ...(rawVal?.rawTag !== undefined ? { rawTag: rawVal.rawTag } : {}) },
    { proxy, revoke } = Proxy.revocable(target, {
      get(t, p, r) {
        if (ctx.revoked) _revErr();
        return Reflect.get(t, p, r);
      },
      set(t, p, v, r) {
        if (ctx.revoked) _revErr();
        if (p === 'tag' && v !== t.tag)
          throw new TypeError("Cannot mutate union discriminant 'tag' in-place; assign a full { tag, value } union object");
        onU();
        const nextV = p === 'value' && vr && vr.desc !== null ? _wrapVal(vr.desc, v, -1, ctx, onU) : v;
        return Reflect.set(t, p, nextV, r);
      },
    }),
    node: _DraftNode = { kind: 'union', target, proxy };
  ctx.revokes.push(revoke);
  ctx.byProxy.set(proxy, node);
  return node;
}

function _wrapVal(desc: FieldDesc, val: any, relOff: number, ctx: _DraftCtx, onMut: () => void): any {
  if (val == null) return val;
  if (typeof val === 'object') {
    const ex = ctx.byProxy.get(val);
    if (ex) return val;
  }
  const k = desc.kind;
  if (k === 'primitive')
    return desc.type === 'fixedBytes'
      ? _wrapTA(val instanceof Uint8Array ? val : new Uint8Array(val), ctx, onMut).proxy
      : val;
  if (k === 'str' || k === 'optStr') return String(val);
  if (k === 'struct')
    return val instanceof StructViewBase
      ? _getStructDraft(desc, val, relOff, ctx, onMut).proxy
      : _plainStructDraft(desc, val, ctx, onMut).proxy;
  if (k === 'ref') {
    const el = _resDesc(desc.element);
    if (el.kind === 'struct')
      return val instanceof StructViewBase
        ? _getStructDraft(el, val, -1, ctx, onMut).proxy
        : _plainStructDraft(el, val, ctx, onMut).proxy;
    if (el.kind === 'union') return _wrapUnion(el, val, ctx, onMut).proxy;
    return val;
  }
  if (k === 'union') return _wrapUnion(desc, val, ctx, onMut).proxy;
  if (k === 'array') {
    const el = _resDesc(desc.element);
    if (el.kind === 'primitive' && el._C && el.type !== 'bool')
      return _wrapTA(val instanceof el._C ? val : new (el._C as any)(Array.from(val as Iterable<any>)), ctx, onMut).proxy;
    if (el.kind === 'struct')
      return _structArrDraft(
        el,
        val instanceof StructArrayView ? val : null,
        val instanceof StructArrayView ? null : Array.from(val as Iterable<any>),
        relOff,
        true,
        ctx,
        onMut,
      ).proxy;
    return _wrapArr(val instanceof UnionArrayView ? val : (val as Iterable<any>), el, true, ctx, onMut).proxy;
  }
  if (k === 'slice') {
    const el = _resDesc(desc.element);
    if (el.kind === 'struct') {
      const sOff =
        val instanceof StructArrayView && ctx.baseBuf !== null && val._k().buffer === ctx.baseBuf
          ? val._k().byteOffset + val._o - ctx.baseZero
          : -1;
      return _structArrDraft(
        el,
        val instanceof StructArrayView ? val : null,
        val instanceof StructArrayView ? null : Array.from(val as Iterable<any>),
        sOff,
        false,
        ctx,
        onMut,
      ).proxy;
    }
    return _wrapArr(val instanceof UnionArrayView ? val : (val as Iterable<any>), el, false, ctx, onMut).proxy;
  }
  return val;
}

function _getStructDraft(
  def: StructDefLike,
  view: StructViewBase<any>,
  relOff: number,
  ctx: _DraftCtx,
  onMut?: () => void,
): _StructDraftNode {
  const d = view._k(),
    inBase = ctx.baseBuf !== null && d.buffer === ctx.baseBuf,
    absOff = d.byteOffset + view._o;
  if (inBase) {
    let m = ctx.byOff.get(def);
    if (!m) ctx.byOff.set(def, (m = new Map()));
    const ex = m.get(absOff);
    if (ex) return ex;
    const roff = relOff >= 0 ? relOff : absOff - ctx.baseZero,
      node = _mkStructNode(def, view, null, roff, ctx, onMut);
    m.set(absOff, node);
    return node;
  }
  return _mkStructNode(def, view, null, -1, ctx, onMut);
}

function _plainStructDraft(
  def: StructDefLike,
  input: any,
  ctx: _DraftCtx,
  onMut?: () => void,
): _StructDraftNode {
  const rawIn: Record<string, unknown> = {};
  if (Array.isArray(input)) {
    for (let i = 0; i < def.fieldList.length && i < input.length; i++)
      if (input[i] !== undefined) rawIn[def.fieldList[i]!.name] = input[i];
  } else if (input && typeof input === 'object') {
    for (const f of def.fieldList) if (input[f.name] !== undefined) rawIn[f.name] = input[f.name];
  }
  return _mkStructNode(def, null, rawIn, -1, ctx, onMut);
}

function _mkStructNode(
  def: StructDefLike,
  base: StructViewBase<any> | null,
  rawIn: Record<string, unknown> | null,
  relOff: number,
  ctx: _DraftCtx,
  onParentMut?: () => void,
): _StructDraftNode {
  const ov = new Map<string, unknown>(),
    kids = new Map<string, _DraftNode>(),
    dirtyFields = new Set<FieldLayout>(),
    mark = (f: FieldLayout, hasVal: boolean, val: unknown, isRep: boolean) => {
      ctx.dirty = true;
      const isVar = _isVarDesc(f.desc);
      if (isVar) ctx.varDirty = true;
      if (relOff < 0 || !base || f.offset + f.size > base._ws) ctx.canPatch = false;
      else if (!isVar) {
        dirtyFields.add(f);
        ctx.dirtyNodes.add(node);
      }
      if (hasVal) ov.set(f.name, val);
      if (isRep) kids.delete(f.name);
      onParentMut?.();
    },
    target: Record<string, unknown> = {},
    { proxy, revoke }: { proxy: any; revoke: () => void } = Proxy.revocable(target, {
      get(t, p, r) {
        if (ctx.revoked) _revErr();
        if (p === 'toJSON' || p === 'toObject') return () => _unwrapNode(node, ctx, new Map(), new Map());
        if (typeof p !== 'string') return Reflect.get(t, p, r);
        const f = def.fields[p];
        if (!f) return Reflect.get(t, p, r);
        const kd = kids.get(p);
        if (kd) return kd.proxy;
        if (ov.has(p)) {
          const cur = ov.get(p),
            w = _wrapVal(f.desc, cur, -1, ctx, () => mark(f, true, w, false));
          if (w !== cur && w && typeof w === 'object') {
            const cn = ctx.byProxy.get(w);
            if (cn) kids.set(p, cn);
            ov.set(p, w);
          }
          return w;
        }
        const raw = base
            ? (base as any)[p]
            : rawIn && p in rawIn
              ? rawIn[p]
              : _defDraftPlain(f.desc),
          k = f.desc.kind;
        if (raw == null || k === 'str' || k === 'optStr' || (k === 'primitive' && f.desc.type !== 'fixedBytes'))
          return raw;
        const cOff =
            base && relOff >= 0 && f.offset + f.size <= base._ws && (k === 'struct' || k === 'array')
              ? relOff + f.offset
              : -1,
          isStructTree =
            k === 'struct' ||
            k === 'ref' ||
            ((k === 'slice' || k === 'array') && _resDesc((f.desc as SliceDesc).element).kind === 'struct'),
          childProxy = _wrapVal(f.desc, raw, cOff, ctx, () => {
            if (isStructTree && base) {
              ctx.dirty = true;
              onParentMut?.();
            } else {
              if (!base) ov.set(p, childProxy);
              mark(f, !base, childProxy, false);
            }
          }),
          cn = childProxy && typeof childProxy === 'object' ? ctx.byProxy.get(childProxy) : undefined;
        if (cn) kids.set(p, cn);
        if (!base) ov.set(p, childProxy);
        return childProxy;
      },
      set(t, p, v, r) {
        if (ctx.revoked) _revErr();
        if (typeof p !== 'string') return Reflect.set(t, p, v, r);
        const f = def.fields[p];
        if (!f) return Reflect.set(t, p, v, r);
        const k = f.desc.kind;
        if (k === 'str' || k === 'optStr' || (k === 'primitive' && f.desc.type !== 'fixedBytes')) {
          if (!ov.has(p) && !kids.has(p)) {
            const cur = base ? (base as any)[p] : rawIn && p in rawIn ? rawIn[p] : undefined;
            if (cur !== undefined && Object.is(cur, v)) return true;
          }
          const norm = v == null ? null : k === 'str' || k === 'optStr' ? String(v) : v;
          mark(f, true, norm, true);
          return true;
        }
        // Composite field replacement: disable inline patch to avoid stale child dirtyNodes ordering
        ctx.canPatch = false;
        if (v == null && (k === 'ref' || (f.desc as any)._null !== undefined)) {
          mark(f, true, null, true);
          return true;
        }
        const w = _wrapVal(f.desc, v, -1, ctx, () => mark(f, true, w, false)),
          cn = w && typeof w === 'object' ? ctx.byProxy.get(w) : undefined;
        mark(f, true, w, true);
        if (cn) kids.set(p, cn);
        return true;
      },
      has(t, p) {
        if (ctx.revoked) _revErr();
        return (typeof p === 'string' && p in def.fields) || Reflect.has(t, p);
      },
      ownKeys() {
        if (ctx.revoked) _revErr();
        return [...def._K];
      },
      getOwnPropertyDescriptor(t, p): PropertyDescriptor | undefined {
        if (ctx.revoked) _revErr();
        if (typeof p === 'string' && p in def.fields)
          return { value: (proxy as any)[p], writable: true, enumerable: true, configurable: true };
        return Reflect.getOwnPropertyDescriptor(t, p);
      },
    }),
    node: _StructDraftNode = { kind: 'struct', def, base, rawIn, relOff, ov, kids, dirtyFields, proxy };
  ctx.revokes.push(revoke);
  ctx.byProxy.set(proxy, node);
  return node;
}

function _structArrDraft(
  def: StructDefLike,
  baseArr: StructArrayView<any> | null,
  initItems: any[] | null,
  relOff: number,
  fixed: boolean,
  ctx: _DraftCtx,
  onParentMut?: () => void,
): Extract<_DraftNode, { kind: 'sarr' }> {
  const sparse = new Map<number, _StructDraftNode>(),
    onElemMut = () => {
      ctx.dirty = true;
      onParentMut?.();
    },
    toNode = (it: any): _StructDraftNode => {
      if (it && typeof it === 'object') {
        const ex = ctx.byProxy.get(it);
        if (ex && ex.kind === 'struct') return ex;
        if (it instanceof StructViewBase) return _getStructDraft(def, it, -1, ctx, onElemMut);
      }
      return _plainStructDraft(def, it, ctx, onElemMut);
    };
  let mat: _StructDraftNode[] | null = initItems ? initItems.map(toNode) : null;
  const curLen = () => (mat ? mat.length : baseArr!.length),
    target: any[] = [];
  target.length = curLen();
  const getNode = (idx: number): _StructDraftNode => {
      if (mat) return mat[idx]!;
      let n = sparse.get(idx);
      if (!n) {
        const erel = relOff >= 0 && baseArr!.stride === def.size ? relOff + idx * def.size : -1;
        n = _getStructDraft(def, baseArr!.at(idx), erel, ctx, onElemMut);
        sparse.set(idx, n);
      }
      return n;
    },
    materialize = (): _StructDraftNode[] => {
      if (!mat) {
        const len = baseArr!.length,
          arr = new Array<_StructDraftNode>(len);
        for (let i = 0; i < len; i++) arr[i] = getNode(i);
        mat = arr;
        sparse.clear();
      }
      return mat;
    },
    markStruct = () => {
      ctx.dirty = true;
      ctx.varDirty = true;
      ctx.canPatch = false;
      target.length = curLen();
      onParentMut?.();
    },
    { proxy, revoke } = Proxy.revocable(target, {
      get(t, p, r) {
        if (ctx.revoked) _revErr();
        if (p === 'length') return curLen();
        if (p === 'at')
          return (i: number) => {
            if (ctx.revoked) _revErr();
            const len = curLen(),
              idx = i < 0 ? len + i : i;
            return idx >= 0 && idx < len ? getNode(idx).proxy : undefined;
          };
        if (p === 'toJSON' || p === 'toObjects')
          return () => _unwrapNode(node, ctx, new Map(), new Map());
        if (typeof p === 'string') {
          const idx = Number(p);
          if (Number.isInteger(idx) && idx >= 0) return idx < curLen() ? getNode(idx).proxy : undefined;
        }
        if (typeof p === 'string' && _ARR_MUT[p]) {
          return (...args: any[]) => {
            if (ctx.revoked) _revErr();
            if (fixed && (_ARR_RESIZE[p] || (p === 'splice' && args.length > 0)))
              throw new TypeError('Cannot resize a fixedArray draft');
            const m = materialize();
            if (p === 'push' || p === 'unshift') {
              const res = Array.prototype[p].apply(m, args.map(toNode));
              markStruct();
              return res;
            }
            if (p === 'pop' || p === 'shift') {
              const popped = Array.prototype[p].call(m) as _StructDraftNode | undefined;
              markStruct();
              return popped?.proxy;
            }
            if (p === 'splice') {
              const ins = args.slice(2).map(toNode),
                rem = (
                  args.length === 0
                    ? []
                    : args.length === 1
                      ? m.splice(args[0])
                      : m.splice(args[0], args[1], ...ins)
                ) as _StructDraftNode[];
              markStruct();
              return rem.map((x) => x.proxy);
            }
            if (p === 'fill') {
              const len = m.length,
                s = args[1] === undefined ? 0 : args[1] < 0 ? Math.max(len + args[1], 0) : Math.min(args[1], len),
                e = args[2] === undefined ? len : args[2] < 0 ? Math.max(len + args[2], 0) : Math.min(args[2], len);
              for (let i = s; i < e; i++) m[i] = toNode(args[0]);
              markStruct();
              return proxy;
            }
            if (p === 'reverse') m.reverse();
            else if (p === 'copyWithin') m.copyWithin(args[0], args[1], args[2]);
            else if (p === 'sort') {
              const cmp = args[0];
              m.sort(cmp ? (a, b) => cmp(a.proxy, b.proxy) : undefined);
            }
            markStruct();
            return proxy;
          };
        }
        if (p === Symbol.iterator || p === 'values')
          return function* () {
            for (let i = 0; i < curLen(); i++) {
              if (ctx.revoked) _revErr();
              yield getNode(i).proxy;
            }
          };
        const fn = Reflect.get(Array.prototype, p, r);
        return typeof fn === 'function' ? fn : Reflect.get(t, p, r);
      },
      set(t, p, v, r) {
        if (ctx.revoked) _revErr();
        if (p === 'length') {
          const n = Number(v);
          if (fixed && n !== curLen()) throw new TypeError('Cannot resize a fixedArray draft');
          const m = materialize(),
            old = m.length;
          m.length = n;
          for (let i = old; i < n; i++) m[i] = _plainStructDraft(def, undefined, ctx, onElemMut);
          markStruct();
          return true;
        }
        if (typeof p === 'string') {
          const idx = Number(p);
          if (Number.isInteger(idx) && idx >= 0) {
            if (fixed && idx >= curLen()) throw new TypeError('Cannot resize a fixedArray draft');
            const m = materialize(),
              old = m.length;
            for (let i = old; i < idx; i++) m[i] = _plainStructDraft(def, undefined, ctx, onElemMut);
            m[idx] = toNode(v);
            markStruct();
            return true;
          }
        }
        return Reflect.set(t, p, v, r);
      },
      has(t, p) {
        if (ctx.revoked) _revErr();
        if (typeof p === 'string') {
          const idx = Number(p);
          if (Number.isInteger(idx) && idx >= 0) return idx < curLen();
        }
        return p === 'length' || p in Array.prototype || Reflect.has(t, p);
      },
      ownKeys() {
        if (ctx.revoked) _revErr();
        const len = curLen(),
          ks = new Array<string>(len + 1);
        for (let i = 0; i < len; i++) ks[i] = String(i);
        ks[len] = 'length';
        return ks;
      },
      getOwnPropertyDescriptor(t, p) {
        if (ctx.revoked) _revErr();
        if (p === 'length') return { value: curLen(), writable: true, enumerable: false, configurable: false };
        if (typeof p === 'string') {
          const idx = Number(p);
          if (Number.isInteger(idx) && idx >= 0 && idx < curLen())
            return { value: getNode(idx).proxy, writable: true, enumerable: true, configurable: true };
        }
        return Reflect.getOwnPropertyDescriptor(t, p);
      },
    }),
    node: Extract<_DraftNode, { kind: 'sarr' }> = {
      kind: 'sarr',
      def,
      base: baseArr,
      fixed,
      get mat() { return mat; },
      sparse,
      proxy,
      getNode,
      len: curLen,
    };
  ctx.revokes.push(revoke);
  ctx.byProxy.set(proxy, node);
  return node;
}

function _unwrapVal(
  val: any,
  ctx: _DraftCtx,
  seenN: Map<object, any>,
  seenO: Map<StructDefLike, Map<number, any>>,
): any {
  if (val == null || typeof val !== 'object') return val;
  const n = ctx.byProxy.get(val);
  if (n) return _unwrapNode(n, ctx, seenN, seenO);
  if (val instanceof MemView) return _unwrapMV(val, ctx, seenN, seenO);
  if (ArrayBuffer.isView(val)) return val;
  if (Array.isArray(val)) return val.map((x) => _unwrapVal(x, ctx, seenN, seenO));
  const prev = seenN.get(val);
  if (prev) return prev;
  const out: Record<string, any> = {};
  seenN.set(val, out);
  for (const [k, v] of Object.entries(val)) out[k] = _unwrapVal(v, ctx, seenN, seenO);
  return out;
}

function _unwrapMV(
  v: MemView<any, any>,
  ctx: _DraftCtx,
  seenN: Map<object, any>,
  seenO: Map<StructDefLike, Map<number, any>>,
): any {
  if (v instanceof StructArrayView || v instanceof UnionArrayView) {
    const len = v.length,
      out = new Array(len);
    for (let i = 0; i < len; i++) out[i] = _unwrapVal(v.at(i), ctx, seenN, seenO);
    return out;
  }
  const def = v.def as StructDefLike,
    d = v._k(),
    inBase = ctx.baseBuf !== null && d.buffer === ctx.baseBuf,
    absOff = d.byteOffset + v._o;
  if (inBase) {
    const drafted = ctx.byOff.get(def)?.get(absOff);
    if (drafted) return _unwrapNode(drafted, ctx, seenN, seenO);
    let m = seenO.get(def);
    if (!m) seenO.set(def, (m = new Map()));
    const prev = m.get(absOff);
    if (prev) return prev;
    const out: Record<string, any> = {};
    m.set(absOff, out);
    for (const f of def.fieldList) out[f.name] = _unwrapVal((v as any)[f.name], ctx, seenN, seenO);
    return out;
  }
  return v.toJSON();
}

function _unwrapNode(
  node: _DraftNode,
  ctx: _DraftCtx,
  seenN: Map<object, any>,
  seenO: Map<StructDefLike, Map<number, any>>,
): any {
  if (node.kind === 'ta') return node.ta;
  if (node.kind === 'arr') return node.items.map((x) => _unwrapVal(x, ctx, seenN, seenO));
  if (node.kind === 'union') {
    const t = node.target;
    return 'value' in t
      ? { tag: t.tag, value: _unwrapVal(t.value, ctx, seenN, seenO) }
      : t.rawTag !== undefined
        ? { tag: t.tag, rawTag: t.rawTag }
        : { tag: t.tag };
  }
  if (node.kind === 'sarr') {
    if (!node.mat && node.base && node.sparse.size === 0)
      return _unwrapMV(node.base, ctx, seenN, seenO);
    const len = node.len(),
      out = new Array(len);
    for (let i = 0; i < len; i++) out[i] = _unwrapNode(node.getNode(i), ctx, seenN, seenO);
    return out;
  }
  const prev = seenN.get(node);
  if (prev) return prev;
  const out: Record<string, any> = {};
  seenN.set(node, out);
  if (node.base) {
    const d = node.base._k();
    if (ctx.baseBuf !== null && d.buffer === ctx.baseBuf) {
      let m = seenO.get(node.def);
      if (!m) seenO.set(node.def, (m = new Map()));
      m.set(d.byteOffset + node.base._o, out);
    }
  }
  for (const f of node.def.fieldList) {
    const k = f.name;
    if (node.ov.has(k)) out[k] = _unwrapVal(node.ov.get(k), ctx, seenN, seenO);
    else if (node.kids.has(k)) out[k] = _unwrapNode(node.kids.get(k)!, ctx, seenN, seenO);
    else if (node.base) out[k] = _unwrapVal((node.base as any)[k], ctx, seenN, seenO);
    else if (node.rawIn && k in node.rawIn) out[k] = _unwrapVal(node.rawIn[k], ctx, seenN, seenO);
  }
  return out;
}

/**
 * Produces a new read-only `StructView<F>` or `StructArrayView<F>` by applying Immer-style
 * mutations to a revocable draft, without mutating `base`.
 *
 * - No-op recipes return `base` directly in `O(1)` when `base.readonly` is `true`.
 * - Inline fixed-size field edits clone the buffer once and patch dirty fields in `O(dirty fields)`.
 * - Variable-length or structural edits re-pack into a compact 0-dead-byte buffer preserving cyclic/shared `ref` graphs.
 * - `CS01` schema-evolution envelopes (`Schema.viewEnvelope()`) preserve their envelope header automatically.
 */
export function produce<F extends FieldRecord>(
  base: StructArrayView<F, any>,
  recipe: (
    draft: StructArrayDraft<F>,
  ) =>
    | void
    | readonly (Partial<StructInput<F>> | StructViewBase<F> | StructDraft<F> | readonly unknown[])[]
    | StructArrayView<F, any>
    | StructArrayDraft<F>,
): StructArrayView<F>;
export function produce<F extends FieldRecord>(
  base: StructViewBase<F>,
  recipe: (
    draft: StructDraft<F>,
  ) => void | Partial<StructInput<F>> | StructViewBase<F> | StructDraft<F> | readonly unknown[],
): StructView<F>;
export function produce<V extends StructViewBase<any> | StructArrayView<any, any>>(
  recipe: (draft: DraftOf<V>) => unknown,
): (base: V) => ImmutableViewOf<V>;
export function produce<D extends { readonly [$draft]?: any }>(
  recipe: (draft: D) => unknown,
): (base: ViewOfDraft<D>) => ViewOfDraft<D>;
export function produce(baseOrRecipe: any, recipe?: any): any {
  if (typeof baseOrRecipe === 'function')
    return (base: any) => produce(base, baseOrRecipe);
  if (
    !(baseOrRecipe instanceof StructViewBase || baseOrRecipe instanceof StructArrayView) ||
    typeof recipe !== 'function'
  ) {
    throw new TypeError('produce(base, recipe) requires a StructView or StructArrayView and a recipe function');
  }
  const isArr = baseOrRecipe instanceof StructArrayView,
    def = baseOrRecipe.def as StructDef<any>,
    d = baseOrRecipe._k(),
    isEnv = !isArr && baseOrRecipe._env,
    canFast =
      !baseOrRecipe._dirty &&
      !baseOrRecipe._dead &&
      !baseOrRecipe._e &&
      !(baseOrRecipe as any)._hdr &&
      !baseOrRecipe._a &&
      baseOrRecipe._b === baseOrRecipe._o &&
      (isArr ? baseOrRecipe.stride === def.size : baseOrRecipe._ws === def.size),
    ctx: _DraftCtx = {
      revoked: false,
      dirty: false,
      varDirty: false,
      canPatch: canFast,
      baseBuf: d.buffer,
      baseZero: d.byteOffset + baseOrRecipe._o,
      revokes: [],
      byProxy: new WeakMap(),
      byOff: new Map(),
      dirtyNodes: new Set(),
    },
    rootNode: _DraftNode = isArr
      ? _structArrDraft(def, baseOrRecipe, null, canFast ? 0 : -1, false, ctx)
      : _getStructDraft(def, baseOrRecipe, canFast ? 0 : -1, ctx);
  let ret: any;
  try {
    ret = recipe(rootNode.proxy);
    const hasRep = ret !== undefined && ret !== rootNode.proxy;
    if (!hasRep && !ctx.dirty) {
      if (baseOrRecipe.readonly) return baseOrRecipe;
      const snap =
        baseOrRecipe._dirty ||
        baseOrRecipe._dead ||
        (def._fv >= 0 && (baseOrRecipe._b !== baseOrRecipe._o || baseOrRecipe._a))
          ? baseOrRecipe._packBytes()
          : baseOrRecipe.bytes.slice();
      return isArr
        ? def.array(snap, 0, baseOrRecipe.length)
        : isEnv
          ? def.viewEnvelope(snap)
          : def.view(snap);
    }
    if (!hasRep && ctx.canPatch && !ctx.varDirty) {
      const cloned = baseOrRecipe.bytes.slice(),
        cdv = new DataView(cloned.buffer, cloned.byteOffset, cloned.byteLength),
        pBase = isEnv ? baseOrRecipe._o : 0,
        pv = {
          def,
          _d: cdv,
          _b: pBase,
          _o: pBase,
          byteLength: cloned.byteLength,
          _ws: def.size,
          _m: null,
          _e: null,
          _k: () => cdv,
        } as unknown as InternalStructView,
        seenN = new Map(),
        seenO = new Map();
      for (const sn of ctx.dirtyNodes) {
        for (const f of sn.dirtyFields) {
          const toff = pBase + sn.relOff + f.offset,
            raw = sn.ov.has(f.name)
              ? _unwrapVal(sn.ov.get(f.name), ctx, seenN, seenO)
              : sn.kids.has(f.name)
                ? _unwrapNode(sn.kids.get(f.name)!, ctx, seenN, seenO)
                : undefined;
          if (f.desc.kind === 'struct' || f.desc.kind === 'array' || f.desc.kind === 'union') {
            cloned.fill(0, toff, toff + f.size);
            if (f.desc.kind === 'struct') initNulls(f.desc, cdv, toff);
          }
          writeVal(pv, f.desc, raw, pBase, toff);
        }
      }
      if (isArr) return def.array(cloned, 0, baseOrRecipe.length);
      if (isEnv) {
        const v = def.view(cloned, { byteOffset: pBase, baseOffset: pBase, stride: def.size });
        v._env = true;
        return v;
      }
      return def.view(cloned);
    }
    const seenN = new Map(),
      seenO = new Map();
    if (isArr) {
      if (hasRep && (ret == null || typeof ret !== 'object' || !(Symbol.iterator in ret || 'length' in ret)))
        throw new TypeError('produce(arrayView, recipe) replacement return must be an array or iterable');
      const rows = hasRep
          ? Array.from(ret as Iterable<any>, (el) => _unwrapVal(el, ctx, seenN, seenO))
          : (_unwrapNode(rootNode, ctx, seenN, seenO) as any[]),
        packed = def.pack(rows);
      return def.array(packed, 0, rows.length);
    }
    if (hasRep && (ret == null || typeof ret !== 'object'))
      throw new TypeError('produce(structView, recipe) replacement return must be a struct object, tuple, or draft');
    const plain = hasRep
      ? _unwrapVal(ret, ctx, seenN, seenO)
      : _unwrapNode(rootNode, ctx, seenN, seenO);
    if (isEnv) return def.viewEnvelope(def.packEnvelope(plain));
    return def.view(def.pack([plain]));
  } finally {
    ctx.revoked = true;
    for (let i = 0; i < ctx.revokes.length; i++) ctx.revokes[i]!();
  }
}
