import type { NextConfig } from "next";

const config: NextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  cacheComponents: true,
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,
  outputFileTracingIncludes: {
    "/docs/[slug]": ["../../docs/*.md", "../../CHANGELOG.md"],
  },
  async rewrites() {
    return [{ source: "/app/", destination: "/app/index.html" }];
  },
};

export default config;
