#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type SchemaCollection,
  toCHeader,
  toRustReprC,
  toWgsl,
} from './codegen.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      [
        'Usage: capnstruct <schema-module.js> [-o <output.rs|.h|.wgsl>] [--rust | --c | --wgsl] [--no-assertions]',
        '',
        'Generates Rust #[repr(C)], C11/C++/Zig header, or WebGPU WGSL struct definitions',
        'and compile-time layout assertions from a JS/TS module exporting capnstruct StructDef schemas.',
        '',
      ].join('\n'),
    );
    return;
  }

  let inputPath = '';
  let outputPath = '';
  let assertions = true;
  let target: 'rust' | 'c' | 'wgsl' | '' = '';

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-o' || a === '--out') {
      outputPath = args[++i] ?? '';
    } else if (a === '--no-assertions') {
      assertions = false;
    } else if (a === '--rust') {
      target = 'rust';
    } else if (a === '--c' || a === '--header') {
      target = 'c';
    } else if (a === '--wgsl') {
      target = 'wgsl';
    } else if (!a.startsWith('-')) {
      inputPath = a;
    }
  }

  if (!inputPath) {
    throw new Error('Missing <schema-module.js> argument');
  }

  if (!target) {
    if (outputPath.endsWith('.h') || outputPath.endsWith('.hpp')) target = 'c';
    else if (outputPath.endsWith('.wgsl')) target = 'wgsl';
    else target = 'rust';
  }

  // Runtime-selected user schema module path passed via CLI argument
  const modUrl = pathToFileURL(resolve(process.cwd(), inputPath)).href;
  const mod: SchemaCollection = await import(modUrl);
  const code =
    target === 'c'
      ? toCHeader(mod, { assertions })
      : target === 'wgsl'
        ? toWgsl(mod)
        : toRustReprC(mod, { assertions });

  if (outputPath) {
    writeFileSync(resolve(process.cwd(), outputPath), code, 'utf8');
  } else {
    process.stdout.write(code);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`capnstruct error: ${msg}\n`);
  process.exitCode = 1;
});
