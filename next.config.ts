import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Avoid build failing due to eslint config mismatch in template
    ignoreDuringBuilds: true,
  },
  // For workspace monorepo path resolution with pnpm
  outputFileTracingRoot: process.cwd(),
  // Disable static export for now - the app uses client-side hooks that break static generation
  // output: 'export',
  // Disable all static generation
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
