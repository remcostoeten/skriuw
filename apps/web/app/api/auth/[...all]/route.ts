import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = auth
    ? toNextJsHandler(auth)
    : {
        GET: async () => new Response("Auth Connectors Missing", { status: 503 }),
        POST: async () => new Response("Auth Connectors Missing", { status: 503 })
    };

export const { GET, POST } = handlers;
