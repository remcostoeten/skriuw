import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryDirectory = fileURLToPath(new URL("../..", import.meta.url));
const sourceDirectory = fileURLToPath(new URL("./src", import.meta.url));
const deploymentBase = process.env.SKRIUW_WEB_BASE?.trim() || "./";

export default defineConfig({
  base: deploymentBase,
  plugins: [react(), tailwindcss(), stampShellWorker(), bundleExcalidrawFonts()],
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

const EXCALIDRAW_ASSET_DIRECTORY = "excalidraw-assets";
// Xiaolai is 13 MB of CJK subsets; without it CJK text in a drawing falls back to a system font.
const SKIPPED_EXCALIDRAW_FONTS = new Set(["Xiaolai"]);

async function excalidrawFontFiles(): Promise<{ root: string; files: string[] }> {
  const entry = createRequire(import.meta.url).resolve("@excalidraw/excalidraw");
  const root = join(dirname(entry), "fonts");
  const families = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    families
      .filter((family) => family.isDirectory() && !SKIPPED_EXCALIDRAW_FONTS.has(family.name))
      .map(async (family) => {
        const names = await readdir(join(root, family.name));
        return names
          .filter((name) => name.endsWith(".woff2"))
          .map((name) => join(root, family.name, name));
      }),
  );
  return { root, files: files.flat() };
}

// Excalidraw fetches fonts from EXCALIDRAW_ASSET_PATH, falling back to a CDN the desktop CSP blocks.
export function bundleExcalidrawFonts(): Plugin {
  return {
    name: "skriuw:bundle-excalidraw-fonts",
    configureServer(server) {
      const prefix = `/${EXCALIDRAW_ASSET_DIRECTORY}/fonts/`;
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?")[0] ?? "";
        if (!path.startsWith(prefix)) {
          next();
          return;
        }
        excalidrawFontFiles()
          .then(async ({ root, files }) => {
            const wanted = join(root, ...decodeURIComponent(path.slice(prefix.length)).split("/"));
            if (!files.includes(wanted)) {
              response.statusCode = 404;
              response.end();
              return;
            }
            response.setHeader("Content-Type", "font/woff2");
            response.end(await readFile(wanted));
          })
          .catch((error: unknown) => {
            server.config.logger.error(`excalidraw font: ${String(error)}`);
            response.statusCode = 500;
            response.end();
          });
      });
    },
    async generateBundle() {
      const { root, files } = await excalidrawFontFiles();
      for (const file of files) {
        this.emitFile({
          type: "asset",
          fileName: `${EXCALIDRAW_ASSET_DIRECTORY}/fonts/${relative(root, file).split(sep).join("/")}`,
          source: await readFile(file),
        });
      }
    },
  };
}
