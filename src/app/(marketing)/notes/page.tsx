import { getSeoMetadata, MarketingSeoPage, seoPages } from "@/features/marketing/seo-pages";

const page = seoPages.notes;

export const metadata = getSeoMetadata(page);

export default function NotesMarketingPage() {
	return <MarketingSeoPage page={page} />;
}
