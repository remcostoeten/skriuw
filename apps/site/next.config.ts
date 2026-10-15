import type { NextConfig } from "next";

const canonicalHost = "https://skriuw.com";
const aliasHosts = ["skriuw.vercel.app", "www.skriuw.com", "docs.skriuw.com"];
const immutable = "public, max-age=31536000, immutable";

function onHost(value: string) {
  return [{ type: "host" as const, value }];
}

const config: NextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  cacheComponents: true,
  outputFileTracingIncludes: {
    "/docs/**": ["../../docs/adr/*.md"],
    "/docs": ["../../docs/adr/*.md"],
    "/sitemap.xml": ["../../docs/adr/*.md"],
  },
  async redirects() {
    return [
      ...aliasHosts.map((host) => ({
        source: "/:file(.*\\..+)",
        has: onHost(host),
        destination: `${canonicalHost}/:file`,
        permanent: true,
      })),
      ...aliasHosts.map((host) => ({
        source: "/:path*",
        has: onHost(host),
        destination: `${canonicalHost}/:path*/`,
        permanent: true,
      })),
      { source: "/docs/changelog", destination: "/changelog/", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        has: onHost("skriuw.vercel.app"),
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
      {
        source: "/s/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/:file(favicon.ico|app-icon.png|og-image.png|demo.gif|preview.png)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
      { source: "/app/assets/:path*", headers: [{ key: "Cache-Control", value: immutable }] },
      { source: "/app/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
  async rewrites() {
    return { beforeFiles: [{ source: "/app/", destination: "/app/index.html" }] };
  },
};

export default config;
