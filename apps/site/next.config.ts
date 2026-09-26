import type { NextConfig } from "next";

const config: NextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  cacheComponents: true,
  async redirects() {
    return [
      { source: "/docs/changelog/", destination: "/changelog/", permanent: true },
      { source: "/docs/", destination: "https://docs.skriuw.com/v2", permanent: true },
      { source: "/docs/:slug/", destination: "https://docs.skriuw.com/v2/:slug", permanent: true },
    ];
  },
  async rewrites() {
    return { beforeFiles: [{ source: "/app/", destination: "/app/index.html" }] };
  },
};

export default config;
