import "server-only";

import { QueryClient } from "@tanstack/react-query";
import { io } from "next/cache";

/**
 * TanStack Query timestamps cache writes and dehydrated payloads with
 * `Date.now()`. With Cache Components enabled, that synchronous value must sit
 * behind an IO boundary or it prevents the route from being prefetched as an
 * instant navigation.
 *
 * `io()` is intentionally used instead of `connection()`: it suspends during
 * prerender validation while still allowing Next.js route prefetches to resolve
 * and cache the complete RSC payload.
 */
export async function createServerQueryClient(): Promise<QueryClient> {
	await io();
	return new QueryClient();
}
