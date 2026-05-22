import type { NextConfig } from "next";

const config: NextConfig = {
	reactStrictMode: true,
	serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],
};

export default config;
