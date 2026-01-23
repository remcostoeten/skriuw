import Integrations from "@/modules/landing-page/components/integrations"
import Pricing from "@/modules/landing-page/components/pricing"
import Faq from "@/modules/landing-page/components/faq"

export default function LandingPage() {
	return (
		<main className="min-h-screen bg-neutral-950">
			<Integrations />
			<Pricing />
			<Faq />
		</main>
	)
}
