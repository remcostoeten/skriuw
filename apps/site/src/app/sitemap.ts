import type { MetadataRoute } from "next";
import { listAdrs } from "@/modules/docs/adr";
import { docHref, docPages } from "@/modules/docs/pages";

const routes = [
  "/",
  "/download/",
  "/local-first-notes/",
  "/markdown-notes/",
  "/import/",
  "/changelog/",
  "/docs/",
  ...docPages.flatMap((page) => (page.detail ? [page, page.detail] : [page]).map(docHref)),
  "/docs/adr/",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const records = await listAdrs();
  const all = [...routes, ...records.map((record) => `/docs/${record.slug}/`)];

  return all.map((route) => ({ url: `https://skriuw.com${route}` }));
}
