import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
	reactStrictMode: true,
	output: process.env.DOCKER_BUILD ? "standalone" : undefined,
	// This app lives in a bun workspace, so pin the standalone file-tracing root
	// to the monorepo root. Without it Next only warns and infers the root, which
	// can misplace the standalone server the Docker image copies from
	// apps/web/.next/standalone/apps/web/server.js.
	outputFileTracingRoot: process.env.DOCKER_BUILD
		? path.join(import.meta.dirname, "../..")
		: undefined,
	experimental: {
		// Trim barrel re-export overhead for large named-import libs. framer-motion
		// is imported across the layout shell, sidebar, and every animated icon, so
		// rewriting its barrel to direct paths cuts the dev compile module count on
		// the /app route (and shrinks the prod bundle).
		optimizePackageImports: [
			"lucide-react",
			"date-fns",
			"framer-motion",
			"@blocknote/core",
			"@blocknote/react",
			"@blocknote/shadcn",
		],
		staleTimes: {
			// Next 16 gives dynamic page segments a 0s client cache by default.
			// The app workspace is private, stateful UI; short-lived router reuse
			// avoids replaying loading.tsx when moving between visited app views.
			dynamic: 300,
			static: 300,
		},
	},
	serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					{
						// Vercel's default HSTS lacks includeSubDomains/preload.
						key: "Strict-Transport-Security",
						value: "max-age=63072000; includeSubDomains; preload",
					},
				],
			},
		];
	},
	transpilePackages: ["@blocknote/core", "@blocknote/react", "@blocknote/shadcn"],
};

export default config;
