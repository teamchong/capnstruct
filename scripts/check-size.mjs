import { gzipSync } from 'node:zlib';
import { buildSync } from 'esbuild';

const entries = [
  {
    name: 'Declarative Schema API (Core Runtime)',
    maxGzipBytes: 9000, // 8.79 KiB
    code: `export { u8, i8, u16, i16, u32, i32, u64, i64, f16, f32, f64, bool, str, optStr, fixedStr, fixedBytes, sentinel, nullable, scaled, fixedArray, array, slice, list, ref, defineStruct, struct, defineUnion, union, pack, concatBytes, structView, StructArrayView, UnionArrayView } from "./dist/index.js";`,
  },
  {
    name: 'Full Runtime (+ WasmArena)',
    maxGzipBytes: 9500, // 9.28 KiB
    code: `export { u8, i8, u16, i16, u32, i32, u64, i64, f16, f32, f64, bool, str, optStr, fixedStr, fixedBytes, sentinel, nullable, scaled, fixedArray, array, slice, list, ref, defineStruct, struct, defineUnion, union, pack, concatBytes, structView, StructArrayView, UnionArrayView, WasmArena, Arena } from "./dist/index.js";`,
  },
  {
    name: 'Rust #[repr(C)] & Go/TinyGo WASM Codegen (capnstruct/codegen)',
    maxGzipBytes: 5500, // 5.37 KiB
    code: `export { toRustReprC, generateRust, toGoStruct, generateGo } from "./dist/codegen.js";`,
  },
];

console.log('=== capnstruct Bundle Size Report ===');
let failed = false;

for (const entry of entries) {
  const res = buildSync({
    stdin: {
      contents: entry.code,
      resolveDir: process.cwd(),
      loader: 'js',
    },
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
  });

  const minBytes = res.outputFiles[0].contents;
  const gzipBytes = gzipSync(minBytes, { level: 9 });
  const kb = (gzipBytes.byteLength / 1024).toFixed(2);
  const limitKb = (entry.maxGzipBytes / 1024).toFixed(2);
  const status = gzipBytes.byteLength <= entry.maxGzipBytes ? 'PASS' : 'FAIL';

  console.log(
    `[${status}] ${entry.name}: ${minBytes.byteLength} B min | ${gzipBytes.byteLength} B min+gzip (${kb} KiB / limit ${limitKb} KiB)`,
  );

  if (gzipBytes.byteLength > entry.maxGzipBytes) {
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
