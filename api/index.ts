/**
 * @name API entry point
 * @description This is the entry point for the API. It creates a new server instance if it doesn't exist and returns the app instance running on Hono.
 */

import { Hono } from "hono";
import { createServer } from "../server";

let appInstance: Hono | null = null;

export default async function handler(req: Request): Promise<Response> {
  if (!appInstance) {
    const server = await createServer();
    appInstance = server ?? null;
  }

  return appInstance?.fetch(req) ?? new Response("Server not initialized", { status: 500 });
}
