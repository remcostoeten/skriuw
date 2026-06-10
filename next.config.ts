import type { NextConfig } from "next";

const config: NextConfig = {
	reactStrictMode: true,
	experimental: {
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
		"@blocknote/mantine",
		"@blocknote/react",
		"@mantine/core",
		"@mantine/hooks",
	],
	turbopack: {
		// Turbopack only accepts project-relative alias targets (not absolute paths).
		resolveAlias: {
			"@mantine/core": "./node_modules/@mantine/core",
			"@mantine/hooks": "./node_modules/@mantine/hooks",
		},
	},
};

export default config;
