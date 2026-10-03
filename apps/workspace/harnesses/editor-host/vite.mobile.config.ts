import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { standaloneEditorBridge } from "./standalone-editor-bridge";

const appDirectory = resolve(import.meta.dirname, "../..");
const mobilePublicDirectory = resolve(appDirectory, "../mobile/public");
const scriptUrl = "__SKRIUW_EDITOR_SCRIPT_URL__";

// Release builds load DOM pages from file://, where module scripts and crossorigin fetches are refused.
function classicScripts(): Plugin {
  return {
    name: "skriuw-editor-page-classic-scripts",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler: (html) =>
        html
          .replaceAll('<script type="module" crossorigin', "<script defer")
          .replaceAll(" crossorigin", ""),
    },
  };
}

export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  publicDir: false,
  plugins: [standaloneEditorBridge(), react(), tailwindcss(), classicScripts()],
  define: { "import.meta.url": scriptUrl },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: { "@": resolve(appDirectory, "src") },
  },
  build: {
    target: "es2023",
    outDir: resolve(mobilePublicDirectory, "editor"),
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4096,
    rolldownOptions: {
      input: { index: resolve(import.meta.dirname, "editor.html") },
      output: {
        format: "iife",
        codeSplitting: false,
        intro: `var ${scriptUrl} = document.currentScript.src;`,
      },
    },
  },
});
