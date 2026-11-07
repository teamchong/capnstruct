import { gzipSync } from 'node:zlib';
import { buildSync } from 'esbuild';

const entries = [
  {
    name: 'Declarative Schema API (Core Runtime)',
    maxGzipBytes: 6042, // 5.9 KiB
    code: `export { u8, i8, u16, i16, u32, i32, u64, i64, f16, f32, f64, bool, str, fixedStr, fixedBytes, sentinel, nullable, scaled, fixedArray, array, slice, list, defineStruct, struct, pack, concatBytes, structView, StructArrayView } from "./dist/index.js";`,
  },
  {
    name: 'Full Runtime (+ WasmArena)',
    maxGzipBytes: 6554, // 6.4 KiB
    code: `export { u8, i8, u16, i16, u32, i32, u64, i64, f16, f32, f64, bool, str, fixedStr, fixedBytes, sentinel, nullable, scaled, fixedArray, array, slice, list, defineStruct, struct, pack, concatBytes, structView, StructArrayView, WasmArena, Arena } from "./dist/index.js";`,
  },
  {
    name: 'Multi-Target Codegen (Rust + C11 + WGSL)',
    maxGzipBytes: 2867, // 2.8 KiB
    code: `export { toRustReprC, generateRust, toCHeader, generateC, toWgsl, generateWgsl } from "./dist/codegen.js";`,
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
