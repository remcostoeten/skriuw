import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  // Don't bundle dependencies - they should be external
  external: [
    'react',
    'react-dom',
    'framer-motion',
    '@radix-ui/*',
    '@internationalized/*',
    'react-aria-components',
    'react-day-picker',
    'react-hook-form',
    'class-variance-authority',
    'clsx',
    'tailwind-merge',
    'cmdk',
    'lucide-react',
    'vaul',
    '@skriuw/shared',
    '@skriuw/shared',
  ],
  // Mark esbuild as external to avoid require.resolve issues
  noExternal: [],
})
