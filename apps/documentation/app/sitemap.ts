import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";
import { source } from "@/lib/source";

export default function sitemap(): MetadataRoute.Sitemap {
	return source.getPages().map((page) => ({
		changeFrequency: "weekly",
		lastModified: new Date(),
		priority: page.url === "/" ? 1 : 0.7,
		url: absoluteUrl(page.url),
	}));
}
