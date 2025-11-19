import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { initDatabase } from "./db";
import notesRouter from "./routes/notes";

/**
 * @name createServer
 * @description Inits a Hono server with middleware and routes
 */

export async function createServer() {
  const app = new Hono();

  await initDatabase();

  /**
   * @module middleware
   * @description Adds middleware to the Hono server
   */
  app.use("*", cors());
  app.use("*", async (c, next) => {
    await next();
  });
}
