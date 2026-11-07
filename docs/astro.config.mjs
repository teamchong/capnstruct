import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: 'https://capnstruct.teamchong.net',
  markdown: {
    gfm: true,
  },
  integrations: [
    starlight({
      title: 'capnstruct',
      tableOfContents: false,
      favicon: '/favicon.svg',
      logo: {
        src: './src/assets/logo.svg',
        alt: 'capnstruct #[repr(C)] icon',
      },
      head: [
        {
          tag: 'link',
          attrs: { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
        },
      ],
      tagline:
        'Zero-copy #[repr(C)] binary structs, views, and queryable tables for TypeScript, WebAssembly, Web Workers, and WebGPU',
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
          label: 'Overview',
          items: [
            { label: 'Introduction & Playground', link: '/' },
            { label: 'Getting Started', link: '/getting-started/' },
            { label: 'Use Cases & Recipes', link: '/pain-points/' },
            { label: 'Design & Tradeoffs', link: '/why-capnstruct/' },
          ],
        },
        {
          label: 'Guides',
          items: [
            {
              label: 'In-Place Mutation & Tail Arena',
              link: '/mutation-and-growth/',
            },
            {
              label: 'Columnar Views & Schema Evolution',
              link: '/columnar-and-evolution/',
            },
            {
              label: 'WASM, Rust #[repr(C)] & Go/TinyGo',
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
