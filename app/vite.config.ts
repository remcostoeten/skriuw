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
    /**
     * One renderer chunk, by contract. `docs/performance-contract.md` forbids
     * route or editor chunk loading after startup, so a `lazy()` boundary can
     * only ever move work off the startup path and onto an interaction path
     * that is required to be instant. Splitting also cost eleven eagerly
     * preloaded requests, because every module shared between the entry and a
     * dynamic import was hoisted into a chunk of its own.
     *
     * The trade is ~90 kB gzip of on-demand surfaces (AI, templates, sign-in)
     * moved into startup, paid once from local disk on desktop.
     */
    rolldownOptions: {
      output: {
        codeSplitting: false,
      },
    },
    chunkSizeWarningLimit: 2500,
  },
});
