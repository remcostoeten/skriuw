import type { NextConfig } from "next";

const config: NextConfig = {
	reactStrictMode: true,
	experimental: {
		// Trim barrel re-export overhead for large named-import libs.
		optimizePackageImports: ["lucide-react", "date-fns"],
		staleTimes: {
			// Next 16 gives dynamic page segments a 0s client cache by default.
			// The app workspace is private, stateful UI; short-lived router reuse
			// avoids replaying loading.tsx when moving between visited app views.
			dynamic: 300,
			static: 300,
		},
	},
	serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],
	transpilePackages: [
		"@blocknote/core",
		"@blocknote/react",
		"@blocknote/shadcn",
	],
};

export default config;
