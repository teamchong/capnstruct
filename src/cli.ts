#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type SchemaCollection, toRustReprC } from './codegen.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      [
        'Usage: capnstruct <schema-module.js> [-o <output.rs>] [--no-assertions]',
        '',
        'Generates #[repr(C)] Rust struct definitions and compile-time layout assertions',
        'from a JS/TS module exporting capnstruct StructDef schemas.',
        '',
      ].join('\n'),
    );
    return;
  }

  let inputPath = '';
  let outputPath = '';
  let assertions = true;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-o' || a === '--out') {
      outputPath = args[++i] ?? '';
    } else if (a === '--no-assertions') {
      assertions = false;
    } else if (!a.startsWith('-')) {
      inputPath = a;
    }
  }

  if (!inputPath) {
    throw new Error('Missing <schema-module.js> argument');
  }

  // Runtime-selected user schema module path passed via CLI argument
  const modUrl = pathToFileURL(resolve(process.cwd(), inputPath)).href;
  const mod: SchemaCollection = await import(modUrl);
  const rustCode = toRustReprC(mod, { assertions });

  if (outputPath) {
    writeFileSync(resolve(process.cwd(), outputPath), rustCode, 'utf8');
  } else {
    process.stdout.write(rustCode);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`capnstruct error: ${msg}\n`);
  process.exitCode = 1;
});
