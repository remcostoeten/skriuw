import type { NextConfig } from "next";

const config: NextConfig = {
	reactStrictMode: true,
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
