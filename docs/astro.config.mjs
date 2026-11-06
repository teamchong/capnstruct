import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: 'https://capnstruct.teamchong.net',
  integrations: [
    starlight({
      title: 'capnstruct',
      tagline:
        'Read and mutate Uint8Array and WebAssembly.Memory buffers like plain TypeScript objects',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/teamchong/capnstruct',
        },
      ],
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Start Here',
          items: [
            { label: 'Overview & Live Playground', link: '/' },
            { label: 'Real-World Pain Points & Recipes', link: '/pain-points/' },
            { label: 'Why capnstruct?', link: '/why-capnstruct/' },
            { label: 'Getting Started', link: '/getting-started/' },
          ],
        },
        {
          label: 'Core Capabilities',
          items: [
            {
              label: 'Live Mutation & Growable Views',
              link: '/mutation-and-growth/',
            },
            {
              label: 'Columnar Arrow/SIMD & Schema Evolution',
              link: '/columnar-and-evolution/',
            },
            {
              label: 'WebAssembly & Rust #[repr(C)] Codegen',
              link: '/wasm-and-rust/',
            },
          ],
        },
        {
          label: 'Reference',
          items: [
            {
              label: 'API Reference & Wire Format',
              link: '/api-reference/',
            },
          ],
        },
      ],
    }),
  ],
  vite: {
    resolve: {
      alias: {
        'capnstruct/codegen': resolve(HERE, '../dist/codegen.js'),
        capnstruct: resolve(HERE, '../dist/index.js'),
      },
    },
  },
});
