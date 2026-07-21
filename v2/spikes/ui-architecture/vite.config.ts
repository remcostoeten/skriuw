import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  preview: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  build: {
    target: "es2023",
  },
});
