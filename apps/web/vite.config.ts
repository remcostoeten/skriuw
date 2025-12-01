import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(workspaceRoot, '../../');

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  clearScreen: false,
  server: {
    host: "::",
    port: 42069,
    strictPort: true,
    fs: {
      allow: [monorepoRoot, workspaceRoot, "./src"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
    },
    proxy: {
      '/api': {
        target: process.env.VERCEL_DEV_URL || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../../dist/spa",
    rollupOptions: {
      external: [
        'postgres',
        'drizzle-orm',
        'drizzle-orm/pg-core',
        'perf_hooks',
        'fs',
        'net',
        'tls',
        'crypto',
        'stream',
        'os',
        'path',
        'util',
        'url',
        'events',
        'buffer',
        'child_process'
      ],
      output: {
        globals: {
          // Map external modules to globals when possible
        }
      }
    }
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(workspaceRoot, "./src"),
      "@skriuw/db": path.resolve(monorepoRoot, "packages/db/src"),
      "@skriuw/storage": path.resolve(monorepoRoot, "packages/storage/src"),
      ui: path.resolve(workspaceRoot, "./src/shared/ui"),
      utilities: path.resolve(
        workspaceRoot,
        "./src/shared/utilities/index.ts",
      ),
    },
  },
  optimizeDeps: {
    exclude: ['postgres', 'drizzle-orm', 'drizzle-orm/pg-core'],
  },
  define: {
    global: 'globalThis',
  },
  ssr: {
    external: [
      'postgres',
      'drizzle-orm',
      'drizzle-orm/pg-core',
      'perf_hooks',
      'fs',
      'net',
      'tls',
      'crypto',
      'stream',
      'os',
      'path',
      'util',
      'url',
      'events',
      'buffer',
      'child_process'
    ],
    noExternal: [],
  },
  experimental: {
    rolldown: {
      experimentalUseAdvancedChunking: true,
    },
  } as any,
}));
