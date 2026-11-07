#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type SchemaCollection, toGoStruct, toRustReprC } from './codegen.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      [
        'Usage: capnstruct <schema-module.js> [-o <output.rs|output.go>] [--rust|--go] [--pkg <name>] [--no-assertions]',
        '',
        'Generates #[repr(C)] Rust or zero-copy Go struct definitions and compile-time layout assertions',
        'from a JS/TS module exporting capnstruct StructDef schemas.',
        '',
      ].join('\n'),
    );
    return;
  }

  let inputPath = '';
  let outputPath = '';
  let target: 'rust' | 'go' | '' = '';
  let pkg = 'capnschema';
  let assertions = true;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-o' || a === '--out') {
      outputPath = args[++i] ?? '';
    } else if (a === '--go') {
      target = 'go';
    } else if (a === '--rust') {
      target = 'rust';
    } else if (a === '--pkg' || a === '--package') {
      pkg = args[++i] ?? 'capnschema';
    } else if (a === '--no-assertions') {
      assertions = false;
    } else if (!a.startsWith('-')) {
      inputPath = a;
    }
  }

  if (!inputPath) {
    throw new Error('Missing <schema-module.js> argument');
  }

  if (!target) {
    target = outputPath.endsWith('.go') ? 'go' : 'rust';
  }

  const modUrl = pathToFileURL(resolve(process.cwd(), inputPath)).href;
  const mod: SchemaCollection = await import(modUrl);
  const code =
    target === 'go' ? toGoStruct(mod, { pkg, assertions }) : toRustReprC(mod, { assertions });

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
