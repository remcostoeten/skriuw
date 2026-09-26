import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const repositoryDirectory = fileURLToPath(new URL("../..", import.meta.url));
const workspaceSource = fileURLToPath(new URL("../workspace/src", import.meta.url));
const storybookSource = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@storybook": storybookSource,
      "@": workspaceSource,
    },
  },
  server: {
    port: 5184,
    strictPort: true,
    fs: { allow: [repositoryDirectory] },
  },
});
