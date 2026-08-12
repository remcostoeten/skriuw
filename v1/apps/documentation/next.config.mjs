import path from "node:path";
import { createMDX } from "fumadocs-mdx/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
	poweredByHeader: false,
	reactStrictMode: true,
	// Vercel pins the trace root to this app, but bun symlinks packages into a
	// store at the monorepo root, so `next` resolves outside that root and
	// Turbopack refuses to compile it. Both roots must be the workspace root.
	outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
	turbopack: {
		root: path.join(import.meta.dirname, "../.."),
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
