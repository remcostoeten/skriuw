import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import type { TOCItemType } from "fumadocs-core/toc";
import type { MDXContent } from "mdx/types";
import { getMDXComponents } from "@/components/mdx";
import { absoluteUrl } from "@/lib/site";
import { source } from "@/lib/source";

interface PageProps {
	params: Promise<{ slug?: string[] }>;
}

type DocumentationPage = NonNullable<ReturnType<typeof source.getPage>> & {
	data: {
		body: MDXContent;
		toc: TOCItemType[];
	};
};

export default async function Page({ params }: PageProps) {
	const { slug } = await params;
	const page = source.getPage(slug);
	if (!page) notFound();

	const document = page as DocumentationPage;
	const Mdx = document.data.body;
	const canonical = absoluteUrl(page.url);
	return (
		<DocsPage toc={document.data.toc}>
			<script
				dangerouslySetInnerHTML={{
					__html: JSON.stringify({
						"@context": "https://schema.org",
						"@type": "TechArticle",
						description: page.data.description,
						headline: page.data.title,
						mainEntityOfPage: canonical,
						publisher: {
							"@type": "Organization",
							name: "Skriuw",
							url: "https://skriuw.com",
						},
					}),
				}}
				type="application/ld+json"
			/>
			<DocsTitle>{page.data.title}</DocsTitle>
			<DocsDescription>{page.data.description}</DocsDescription>
			<DocsBody>
				<Mdx components={getMDXComponents()} />
			</DocsBody>
		</DocsPage>
	);
}

export function generateStaticParams() {
	return source.generateParams();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const page = source.getPage(slug);
	if (!page) return {};

	const canonical = absoluteUrl(page.url);
	return {
		alternates: { canonical },
		description: page.data.description,
		openGraph: {
			description: page.data.description,
			images: [{ url: "/opengraph-preview.png" }],
			title: page.data.title,
			type: "article",
			url: canonical,
		},
		title: page.data.title,
		twitter: {
			card: "summary_large_image",
			description: page.data.description,
			images: ["/opengraph-preview.png"],
			title: page.data.title,
		},
	};
}
