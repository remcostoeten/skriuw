import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'react/index': 'src/react/index.ts',
    'next/index': 'src/next/index.ts',
    'adapters/drizzle/index': 'src/adapters/drizzle/index.ts',
    'adapters/local-storage/index': 'src/adapters/local-storage/index.ts',
    'adapters/indexeddb/index': 'src/adapters/indexeddb/index.ts',
    'adapters/instantdb/index': 'src/adapters/instantdb/index.ts',
    'adapters/memory/index': 'src/adapters/memory/index.ts'
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'es2019',
  treeshake: true,
  minify: false,
  shims: false
});
