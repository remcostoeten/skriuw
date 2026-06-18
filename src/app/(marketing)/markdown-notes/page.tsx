import { getSeoMetadata, MarketingSeoPage, seoPages } from "@/features/marketing/seo-pages";

const page = seoPages["markdown-notes"];

export const metadata = getSeoMetadata(page);

export default function MarkdownNotesMarketingPage() {
	return <MarketingSeoPage page={page} />;
}
