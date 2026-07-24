import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2023",
    minify: "oxc",
    sourcemap: false,
  },
});
