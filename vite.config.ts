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
  plugins: [react(), honoPlugin()],
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

function honoPlugin(): Plugin {
  return {
    name: "hono-plugin",
    apply: "serve", // Only apply during development (serve mode)
    async configureServer(server) {
      const app = await createServer();

      // Add Hono app as middleware to Vite dev server
      // Only intercept API routes, let Vite handle everything else
      server.middlewares.use(async (req, res, next) => {
        // Only handle API routes
        if (!req.url?.startsWith("/api/")) {
          return next();
        }

        // Convert Node.js request to Web API Request
        const protocol = req.headers["x-forwarded-proto"] || (req.connection as any)?.encrypted ? "https" : "http";
        const host = req.headers.host || "localhost";
        const url = `${protocol}://${host}${req.url}`;
        
        const headers = new Headers();
        Object.entries(req.headers).forEach(([key, value]) => {
          if (value) {
            headers.set(key, Array.isArray(value) ? value.join(", ") : value);
          }
        });

        // Read request body if present
        let body: string | undefined;
        if (req.method !== "GET" && req.method !== "HEAD") {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          body = Buffer.concat(chunks).toString();
        }

        const request = new Request(url, {
          method: req.method,
          headers,
          body: body,
        });

        try {
          const response = await app.fetch(request);
          
          // Convert Web API Response to Node.js response
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          
          const responseBody = await response.text();
          res.end(responseBody);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
