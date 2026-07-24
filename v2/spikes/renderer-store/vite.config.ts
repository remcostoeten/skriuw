import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: react(),
  resolve: {
    alias: mode === "profiling" ? [{ find: "react-dom/client", replacement: "react-dom/profiling" }] : [],
  },
  define: {
    __PROFILE_BUILD__: JSON.stringify(mode === "profiling"),
  },
  preview: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  build: {
    target: "es2023",
  },
}));
