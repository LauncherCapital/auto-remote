import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/cli/index.ts' },
  outDir: 'dist/cli',
  format: ['esm'],
  target: 'node20',
  external: [
    // Heavy packages with native binaries / browser downloads
    'playwright',
    '@slack/web-api',
  ],
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
})
