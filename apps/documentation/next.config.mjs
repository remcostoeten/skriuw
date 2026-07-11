import { createMDX } from "fumadocs-mdx/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
	poweredByHeader: false,
	reactStrictMode: true,
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
