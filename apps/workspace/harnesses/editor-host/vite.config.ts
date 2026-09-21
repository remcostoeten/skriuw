import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const appDirectory = resolve(import.meta.dirname, "../..");
const sourceDirectory = resolve(appDirectory, "src");
const standaloneDirectory = resolve(sourceDirectory, "features/editor-standalone");

/**
 * The standalone editor reuses the editor feature unforked, so the port is
 * injected at the module boundary instead of through the editor's props: the
 * two bridge modules every editor command funnels through are replaced with
 * protocol-backed stand-ins. Matching on the resolved file covers both the
 * `@/bridge/...` alias and the relative imports inside `bridge/`.
 */
function standaloneEditorBridge(): Plugin {
  const swaps = new Map([
    [
      resolve(sourceDirectory, "bridge/runtime.ts"),
      resolve(standaloneDirectory, "port-runtime.ts"),
    ],
    [
      resolve(sourceDirectory, "bridge/external-links.ts"),
      resolve(standaloneDirectory, "port-external-links.ts"),
    ],
  ]);
  return {
    name: "skriuw-standalone-editor-bridge",
    enforce: "pre",
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return (resolved && swaps.get(resolved.id)) ?? null;
    },
  };
}

export default defineConfig({
  root: appDirectory,
  base: "./",
  plugins: [standaloneEditorBridge(), react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: { "@": sourceDirectory },
  },
  server: {
    fs: { allow: [resolve(appDirectory, "..")] },
  },
  build: {
    target: "es2023",
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        editor: resolve(import.meta.dirname, "editor.html"),
        host: resolve(import.meta.dirname, "host.html"),
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    strictPort: true,
  },
});
