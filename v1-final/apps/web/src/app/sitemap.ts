import type { MetadataRoute } from "next";
import { seoPageList } from "@/features/marketing/seo-pages";

const baseUrl = "https://skriuw.com";

export default function sitemap(): MetadataRoute.Sitemap {
	const now = new Date();

	return [
		{
			url: baseUrl,
			lastModified: now,
			changeFrequency: "weekly",
			priority: 1,
		},
		{
			url: `${baseUrl}/app`,
			lastModified: now,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		...seoPageList.map((page) => ({
			url: `${baseUrl}/${page.slug}`,
			lastModified: now,
			changeFrequency: "weekly" as const,
			priority: 0.7,
		})),
	];
}
