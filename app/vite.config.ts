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
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        splash: fileURLToPath(new URL("./splash.html", import.meta.url)),
      },
    },
  },
});
