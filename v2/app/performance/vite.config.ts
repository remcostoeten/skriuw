import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(import.meta.dirname, ".."),
  base: "./",
  publicDir: resolve(import.meta.dirname, "public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@", replacement: resolve(import.meta.dirname, "../src") },
      { find: "react-dom/client", replacement: "react-dom/profiling" },
      { find: "@tauri-apps/api/core", replacement: resolve(import.meta.dirname, "bridge-mock.ts") },
      { find: "@tauri-apps/api/window", replacement: resolve(import.meta.dirname, "window-mock.ts") },
    ],
  },
  build: {
    target: "es2023",
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(import.meta.dirname, "index.html"),
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4191,
    strictPort: true,
  },
});
