import { getSeoMetadata, MarketingSeoPage, seoPages } from "@/features/marketing/seo-pages";

const page = seoPages["writing-app"];

export const metadata = getSeoMetadata(page);

export default function WritingAppMarketingPage() {
	return <MarketingSeoPage page={page} />;
}
