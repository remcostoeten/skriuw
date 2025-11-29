import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  clearScreen: false,
  server: {
    host: "::",
    port: 42069,
    strictPort: true,
    fs: { 
      allow: ["./", "./src", "./shared"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
    },
  },
  build: {
    outDir: "dist/spa",
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(workspaceRoot, "./src"),
      "@shared": path.resolve(workspaceRoot, "./shared"),
      ui: path.resolve(workspaceRoot, "./src/shared/ui"),
      utilities: path.resolve(
        workspaceRoot,
        "./src/shared/utilities/index.ts",
      ),
    },    
  },
  experimental: {
    rolldown: {
      experimentalUseAdvancedChunking: true,
    },
  } as any,
}));
