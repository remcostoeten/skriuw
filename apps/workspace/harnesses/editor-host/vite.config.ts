import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { standaloneEditorBridge } from "./standalone-editor-bridge";

const appDirectory = resolve(import.meta.dirname, "../..");

export default defineConfig({
  root: appDirectory,
  base: "./",
  plugins: [standaloneEditorBridge(), react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: { "@": resolve(appDirectory, "src") },
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
