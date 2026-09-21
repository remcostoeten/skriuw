import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const v2Directory = fileURLToPath(new URL("..", import.meta.url));
const sourceDirectory = fileURLToPath(new URL("./src", import.meta.url));
const deploymentBase = process.env.SKRIUW_WEB_BASE?.trim() || "./";

export default defineConfig({
  base: deploymentBase,
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": sourceDirectory,
    },
  },
  server: {
    port: 5183,
    strictPort: true,
    fs: {
      allow: [v2Directory],
    },
  },
  build: {
    target: "es2023",
    rollupOptions: {
      output: {
        // React 19 is still CommonJS, so rolldown wraps it in a `require_react`
        // interop shim. Left to its own chunking it will place that shim in one
        // chunk and a top-level `require_react()` caller in another, and the
        // caller can execute before the shim's chunk initialises, yielding a
        // null React namespace ("Cannot read properties of null (reading
        // 'useMemo')") and a blank app. The split is not stable across builds,
        // so it reproduces only intermittently in CI/production. Pinning React
        // and its `shared/renderer-core` consumers into one chunk keeps the
        // shim co-located with every top-level caller.
        advancedChunks: {
          groups: [
            {
              name: "react-vendor",
              test: /[\\/](react|react-dom|scheduler)[\\/]|[\\/]shared[\\/]renderer-core[\\/]/,
              priority: 100,
            },
          ],
        },
      },
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        splash: fileURLToPath(new URL("./splash.html", import.meta.url)),
      },
    },
  },
});
