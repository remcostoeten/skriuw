import path from "node:path";
import { createMDX } from "fumadocs-mdx/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
	poweredByHeader: false,
	reactStrictMode: true,
	// Vercel pins the trace root to this app, but bun symlinks packages into a
	// store at the monorepo root, so `next` resolves outside that root and
	// Turbopack refuses to compile it. Both roots must be the repository root
	// (three levels up since the v1/ move) — Vercel resolves the build output
	// relative to this root, so v1/ here would make it look for the app at
	// apps/documentation and fail with a missing build-manifest.json.
	outputFileTracingRoot: path.join(import.meta.dirname, "../../.."),
	turbopack: {
		root: path.join(import.meta.dirname, "../../.."),
	},
	async rewrites() {
		return [
			{
				source: "/ph-ingest/static/:path*",
				destination: "https://us-assets.i.posthog.com/static/:path*",
			},
			{
				source: "/ph-ingest/:path*",
				destination: "https://us.i.posthog.com/:path*",
			},
		];
	},
};

export default createMDX()(nextConfig);
