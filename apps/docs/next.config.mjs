import path from "node:path";
import { createMDX } from "fumadocs-mdx/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Bun symlinks workspace packages into a store at the repository root, so
  // `next` resolves outside this app and Turbopack refuses to compile it
  // unless both roots are the repository root.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  turbopack: {
    root: path.join(import.meta.dirname, "../.."),
  },
  async redirects() {
    return [
      { source: "/", destination: "/v2", permanent: false },
      {
        source: "/:section(features|reference|infra|development|builds)/:path*",
        destination: "/v1/:section/:path*",
        permanent: true,
      },
    ];
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
