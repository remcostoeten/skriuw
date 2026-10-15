import type { MetadataRoute } from "next";
import { listAdrs } from "@/modules/docs/adr";
import { docPages } from "@/modules/docs/pages";

const routes = [
  "/",
  "/download/",
  "/local-first-notes/",
  "/markdown-notes/",
  "/import/",
  "/changelog/",
  "/docs/",
  ...docPages.map((page) => `/docs/${page.slug}/`),
  "/docs/adr/",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const records = await listAdrs();
  const all = [...routes, ...records.map((record) => `/docs/${record.slug}/`)];

  return all.map((route) => ({ url: `https://skriuw.com${route}` }));
}
