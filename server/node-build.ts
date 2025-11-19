import path from "path";
import { readFileSync } from "fs";
import { createServer } from "./index";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

const port = process.env.PORT || 3000;

// Initialize server asynchronously
(async () => {
  const app = await createServer();

  // In production, serve the built SPA files
  const __dirname = import.meta.dirname;
  const distPath = path.join(__dirname, "../spa");

  // Serve static files
  app.use("/*", serveStatic({ root: distPath }));

  // Handle React Router - serve index.html for all non-API routes
  app.get("*", async (c) => {
    // Don't serve index.html for API routes
    if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/health")) {
      return c.json({ error: "API endpoint not found" }, 404);
    }

    const indexPath = path.join(distPath, "index.html");
    const indexHtml = readFileSync(indexPath, "utf-8");
    return c.html(indexHtml);
  });

  serve({
    fetch: app.fetch,
    port,
  }, (info) => {
    console.log(`🚀 Fusion Starter server running on port ${info.port}`);
    console.log(`📱 Frontend: http://localhost:${info.port}`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("🛑 Received SIGTERM, shutting down gracefully");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("🛑 Received SIGINT, shutting down gracefully");
    process.exit(0);
  });
})();
