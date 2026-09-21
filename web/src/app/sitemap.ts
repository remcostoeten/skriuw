import type { MetadataRoute } from "next";
import { docPages } from "@/data/docs";

export const dynamic = "force-static";

const routes = [
  "/",
  "/download/",
  "/local-first-notes/",
  "/markdown-notes/",
  "/import/",
  "/docs/",
  ...docPages.map((page) => `/docs/${page.slug}/`),
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `https://skriuw.com${route}`,
    lastModified: new Date(),
  }));
}
