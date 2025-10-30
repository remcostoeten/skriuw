import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Avoid build failing due to eslint config mismatch in template
    ignoreDuringBuilds: true,
  },
  // For workspace monorepo path resolution with pnpm
  outputFileTracingRoot: process.cwd(),
  // Generate static export for Tauri
  output: 'export',
};

export default nextConfig;
