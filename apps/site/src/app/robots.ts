import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/s/" },
    sitemap: "https://skriuw.com/sitemap.xml",
  };
}
