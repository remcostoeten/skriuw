import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { seoPageList } from "@/features/marketing/seo-pages";

const title = "Skriuw - Notes, journal, and focused writing";
const description =
	"Skriuw is a calm notes and journal workspace for writing, organizing ideas, and syncing your work across devices.";

export const metadata: Metadata = {
	title,
	description,
	alternates: {
		canonical: "/",
	},
	openGraph: {
		title,
		description,
		url: "/",
		images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Skriuw" }],
	},
	twitter: {
		card: "summary_large_image",
		title,
		description,
		images: ["/opengraph-image"],
	},
};

const features = [
	{
		title: "Notes that stay out of the way",
		description:
			"Write, link, organize, and revisit ideas in a workspace built for daily use rather than decoration.",
	},
	{
		title: "Journal beside your knowledge base",
		description:
			"Keep daily entries close to your notes so reflection and reference live in the same place.",
	},
	{
		title: "Start as a guest, sync with an account",
		description:
			"Try the workspace instantly in your browser, then create an account when you want cloud-backed sync.",
	},
];

const jsonLd = {
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "Organization",
			"@id": "https://skriuw.com/#organization",
			name: "Skriuw",
			url: "https://skriuw.com",
			sameAs: ["https://github.com/remcostoeten/skriuw"],
		},
		{
			"@type": "WebSite",
			"@id": "https://skriuw.com/#website",
			name: "Skriuw",
			url: "https://skriuw.com",
			publisher: {
				"@id": "https://skriuw.com/#organization",
			},
		},
		{
			"@type": "SoftwareApplication",
			name: "Skriuw",
			applicationCategory: "ProductivityApplication",
			operatingSystem: "Web",
			description,
			url: "https://skriuw.com",
			sameAs: ["https://github.com/remcostoeten/skriuw"],
			offers: {
				"@type": "Offer",
				price: "0",
				priceCurrency: "USD",
			},
		},
	],
};

export default function Page() {
	return (
		<main className="min-h-dvh bg-background text-foreground">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
			/>

			<section className="mx-auto grid min-h-[92dvh] w-full max-w-6xl grid-cols-1 gap-10 px-5 py-6 md:grid-cols-[0.9fr_1.1fr] md:px-8 md:py-8">
				<div className="flex flex-col justify-between gap-12">
					<nav className="flex items-center justify-between gap-4" aria-label="Primary">
						<Link href="/" className="text-sm font-semibold tracking-normal">
							Skriuw
						</Link>
						<div className="flex items-center gap-2">
							<Link
								href="/app?auth=sign-in"
								className="inline-flex h-9 items-center justify-center px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
							>
								Sign in
							</Link>
							<Link
								href="/app"
								className="inline-flex h-9 items-center justify-center bg-foreground px-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
							>
								Open app
							</Link>
							<Link
								href="https://github.com/remcostoeten/skriuw"
								className="hidden h-9 items-center justify-center px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
							>
								GitHub
							</Link>
						</div>
					</nav>

					<div className="max-w-xl space-y-6">
						<p className="text-sm font-medium text-muted-foreground">
							Notes, journal, and focused writing
						</p>
						<h1 className="text-5xl font-semibold leading-[0.98] tracking-normal text-foreground md:text-6xl">
							A quiet workspace for thinking in writing.
						</h1>
						<p className="max-w-lg text-base leading-7 text-muted-foreground md:text-lg">
							Skriuw gives you a fast notes workspace, a daily journal, and a path
							from local guest mode to account-backed sync when you are ready.
						</p>
						<div className="flex flex-wrap items-center gap-3">
							<Link
								href="/app"
								className="group inline-flex h-11 items-center justify-center gap-2 bg-foreground px-5 text-sm font-medium text-background transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.98]"
							>
								Try the workspace
								<span className="cta-arrow-swap h-4 w-4" aria-hidden="true">
									<ArrowRight className="h-4 w-4" strokeWidth={2} />
									<ArrowRight className="h-4 w-4" strokeWidth={2} />
								</span>
							</Link>
							<Link
								href="/app?auth=sign-up"
								className="inline-flex h-11 items-center justify-center border border-border px-5 text-sm font-medium transition-colors hover:bg-accent"
							>
								Create account
							</Link>
						</div>
					</div>

					<div className="grid gap-4 sm:grid-cols-3 md:grid-cols-1">
						{features.map((feature) => (
							<section key={feature.title} className="border-t border-border pt-4">
								<h2 className="text-sm font-semibold text-foreground">
									{feature.title}
								</h2>
								<p className="mt-2 text-sm leading-6 text-muted-foreground">
									{feature.description}
								</p>
							</section>
						))}
					</div>
				</div>

				<div className="flex min-h-0 items-center md:items-end">
					<div className="relative w-full overflow-hidden border border-border bg-card">
						<Image
							src="/readme/app-main.png"
							alt="Skriuw notes workspace with sidebar, editor, and note tree"
							width={1600}
							height={1000}
							priority
							sizes="(max-width: 768px) 100vw, 58vw"
							className="h-auto w-full"
						/>
					</div>
				</div>
			</section>

			<section className="border-t border-border">
				<div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-0 px-5 py-10 md:grid-cols-[0.34fr_0.66fr] md:px-8">
					<div>
						<h2 className="text-xl font-semibold">Explore Skriuw by workflow</h2>
						<p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
							Start from the part of the workspace that matches how you want to write.
						</p>
					</div>
					<div className="mt-6 border-t border-border md:mt-0">
						{seoPageList.map((page) => (
							<Link
								key={page.slug}
								href={`/${page.slug}`}
								className="grid gap-1 border-b border-border py-5 hover:bg-accent/40 md:grid-cols-[0.34fr_0.66fr]"
							>
								<span className="text-sm font-medium text-foreground">
									{page.title}
								</span>
								<span className="text-sm leading-6 text-muted-foreground">
									{page.description}
								</span>
							</Link>
						))}
					</div>
				</div>
			</section>
		</main>
	);
}
