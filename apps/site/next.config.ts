import type { NextConfig } from "next";

const config: NextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  cacheComponents: true,
  async rewrites() {
    return { beforeFiles: [{ source: "/app/", destination: "/app/index.html" }] };
  },
};

export default config;
