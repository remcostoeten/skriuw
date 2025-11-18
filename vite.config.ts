import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { createServer } from "./server";

export default defineConfig({
  server: {
    host: "::",
    port: 42069,
    fs: {
      allow: ["./", "./client", "./shared"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
    },
  },
  build: {
    outDir: "dist/spa",
  },
  plugins: [react(), expressPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
      "@ui": path.resolve(__dirname, "./client/shared/ui/index.ts"),
      "@ui/": path.resolve(__dirname, "./client/shared/ui"),
    },
  },
  experimental: {
    // Remove 'rolldown' property and put only supported fields for experimental, or remove experimental completely
    // The following line is a placeholder, as 'rolldown' is not a documented option as of Vite 5
  },
});

function expressPlugin(): Plugin {
  return {
    name: "express-plugin",
    apply: "serve", // Only apply during development (serve mode)
    configureServer(server) {
      const app = createServer();

      // Add Express app as middleware to Vite dev server
      server.middlewares.use(app);
    },
  };
}
