import type { MetadataRoute } from "next";

const routes = [
  "/",
  "/download/",
  "/local-first-notes/",
  "/markdown-notes/",
  "/import/",
  "/changelog/",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `https://skriuw.com${route}`,
    lastModified: new Date(),
  }));
}
