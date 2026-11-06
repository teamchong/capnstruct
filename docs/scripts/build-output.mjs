import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(DOCS_ROOT, '..');
const DIST_DIR = resolve(DOCS_ROOT, 'dist');

const rootConfig = {
  accountId: '36498dc359676cbbcf8c3616e6c07e94',
  buildContext: {
    isPreview: false,
  },
};

const workerConfig = {
  name: 'capnstruct',
  compatibilityDate: '2026-04-01',
  domains: ['capnstruct.teamchong.net'],
  assets: {
    notFoundHandling: '404-page',
  },
  observability: {
    enabled: true,
  },
};

for (const targetRoot of [DOCS_ROOT, REPO_ROOT]) {
  const outRoot = resolve(targetRoot, '.cloudflare/output');
  rmSync(outRoot, { recursive: true, force: true });
  const v0Root = resolve(outRoot, 'v0');
  const workerDir = resolve(v0Root, 'workers/default');
  const assetsDir = resolve(workerDir, 'assets');
  mkdirSync(assetsDir, { recursive: true });
  writeFileSync(resolve(v0Root, 'config.json'), JSON.stringify(rootConfig, null, 2));
  writeFileSync(resolve(workerDir, 'worker.config.json'), JSON.stringify(workerConfig, null, 2));
  cpSync(DIST_DIR, assetsDir, { recursive: true, dereference: true });
}

console.log('Generated Cloudflare Build Output Specification v0 in .cloudflare/output/v0');
