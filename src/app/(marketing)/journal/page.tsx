import { getSeoMetadata, MarketingSeoPage, seoPages } from "@/features/marketing/seo-pages";

const page = seoPages.journal;

export const metadata = getSeoMetadata(page);

export default function JournalMarketingPage() {
	return <MarketingSeoPage page={page} />;
}
