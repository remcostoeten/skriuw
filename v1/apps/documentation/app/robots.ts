import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
	return {
		host: site.url,
		rules: {
			allow: "/",
			userAgent: "*",
		},
		sitemap: `${site.url}/sitemap.xml`,
	};
}
