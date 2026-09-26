import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryDirectory = fileURLToPath(new URL("../..", import.meta.url));
const sourceDirectory = fileURLToPath(new URL("./src", import.meta.url));
const deploymentBase = process.env.SKRIUW_WEB_BASE?.trim() || "./";

export default defineConfig({
  base: deploymentBase,
  plugins: [react(), tailwindcss(), stampShellWorker()],
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
      allow: [repositoryDirectory],
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
              test: /[\\/](react|react-dom|scheduler)[\\/]|[\\/]packages[\\/]renderer-core[\\/]/,
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

/**
 * Browsers only install a new service worker when `sw.js` changes byte for
 * byte, so each build stamps a digest of its emitted file names into the
 * worker's cache name. Hashed asset names change with their content, which
 * makes the stamp change exactly when the shipped shell does.
 */
function stampShellWorker(): Plugin {
  let digest = "";
  return {
    name: "skriuw:stamp-shell-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const names = Object.keys(bundle).sort().join("\n");
      digest = createHash("sha256").update(names).digest("hex").slice(0, 12);
    },
    async writeBundle(options) {
      const workerPath = join(options.dir ?? "dist", "sw.js");
      const source = await readFile(workerPath, "utf8");
      const stamped = source.replace('"skriuw-shell-v1"', `"skriuw-shell-${digest}"`);
      if (stamped === source) {
        throw new Error(`sw.js cache name placeholder not found in ${workerPath}`);
      }
      await writeFile(workerPath, stamped);
    },
  };
}
