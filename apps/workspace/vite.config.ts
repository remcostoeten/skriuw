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
      },
    },
  },
});

/**
 * Browsers only install a new service worker when `sw.js` changes byte for
 * byte, so each build stamps a digest of its emitted file names into the
 * worker's cache name. Hashed asset names change with their content, which
 * makes the stamp change exactly when the shipped shell does.
 *
 * The same pass writes the emitted asset list into the worker so it can
 * precache every chunk at install. Lazy surfaces (settings, import, history)
 * then open offline even when this browser never loaded them online.
 */
function stampShellWorker(): Plugin {
  let digest = "";
  let assets: string[] = [];
  return {
    name: "skriuw:stamp-shell-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const names = Object.keys(bundle).sort();
      digest = createHash("sha256").update(names.join("\n")).digest("hex").slice(0, 12);
      assets = names.filter(
        (name) => name.startsWith("assets/") && !/\.(map|ttf|woff)$/.test(name),
      );
    },
    async writeBundle(options) {
      const workerPath = join(options.dir ?? "dist", "sw.js");
      const source = await readFile(workerPath, "utf8");
      const cacheName = '"skriuw-shell-v1"';
      const precache = "const PRECACHE_ASSETS = [];";
      if (!source.includes(cacheName) || !source.includes(precache)) {
        throw new Error(`sw.js placeholders not found in ${workerPath}`);
      }
      const stamped = source
        .replace(cacheName, `"skriuw-shell-${digest}"`)
        .replace(precache, `const PRECACHE_ASSETS = ${JSON.stringify(assets)};`);
      await writeFile(workerPath, stamped);
    },
  };
}
