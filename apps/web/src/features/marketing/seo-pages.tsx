import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { serializeJsonForScript } from "@/shared/lib/json-script";

export type SeoPageCopy = {
	slug: string;
	title: string;
	metadataTitle: string;
	description: string;
	label: string;
	headline: string;
	intro: string;
	image: string;
	imageAlt: string;
	primaryCta: string;
	points: string[];
	sections: Array<{
		heading: string;
		body: string;
	}>;
	related: Array<{
		href: string;
		label: string;
		description: string;
	}>;
};

export const seoPages = {
	notes: {
		slug: "notes",
		title: "Notes app",
		metadataTitle: "Notes App for Focused Writing and Organization",
		description:
			"Skriuw is a calm notes app for writing, organizing, linking ideas, and keeping a focused workspace across devices.",
		label: "Notes app",
		headline: "A notes app that keeps the writing surface first.",
		intro: "Skriuw is built around the note itself: a fast editor, a clear tree, and enough structure to organize ideas without turning every thought into a project.",
		image: "/readme/app-main.png",
		imageAlt: "Skriuw notes workspace with a note tree and writing editor",
		primaryCta: "Try the notes workspace",
		points: [
			"Nested notes and folders",
			"Linked writing workspace",
			"Guest mode before sign-up",
		],
		sections: [
			{
				heading: "Write before you organize",
				body: "The app opens directly into the workspace, so capturing a note does not start with a marketing page, dashboard, or setup wizard.",
			},
			{
				heading: "Keep structure visible",
				body: "Folders, metadata, and note relationships stay close to the editor, making it easier to move between draft, reference, and archive.",
			},
			{
				heading: "Use it locally, then sync",
				body: "Visitors can try a guest workspace in the browser and create an account when they want cloud-backed persistence.",
			},
		],
		related: [
			{
				href: "/journal",
				label: "Journal app",
				description: "Use daily entries beside long-lived notes.",
			},
			{
				href: "/markdown-notes",
				label: "Markdown notes",
				description: "Import, export, and keep notes portable.",
			},
		],
	},
	journal: {
		slug: "journal",
		title: "Journal app",
		metadataTitle: "Journal App Beside Your Notes",
		description:
			"Skriuw combines a daily journal with a notes workspace so reflection and reference can live together.",
		label: "Journal app",
		headline: "A journal that belongs next to your notes.",
		intro: "Daily writing often becomes useful reference later. Skriuw keeps journal entries close to your notes so reflection, planning, and recall are not split across separate tools.",
		image: "/readme/journal-main.png",
		imageAlt: "Skriuw journal view with daily entries and workspace navigation",
		primaryCta: "Try the journal workspace",
		points: [
			"Daily writing flow",
			"Tags for recurring themes",
			"Same account-backed workspace",
		],
		sections: [
			{
				heading: "Make reflection searchable",
				body: "Journal entries stay part of the same workspace instead of disappearing into a separate daily-log product.",
			},
			{
				heading: "Track themes without ceremony",
				body: "Tags help recurring topics surface naturally while keeping the writing interface quiet.",
			},
			{
				heading: "Move from today to reference",
				body: "Keep the daily layer close enough to support notes, planning, and longer-form thinking.",
			},
		],
		related: [
			{
				href: "/notes",
				label: "Notes app",
				description: "Organize long-lived writing and reference.",
			},
			{
				href: "/writing-app",
				label: "Writing app",
				description: "Use Skriuw as a focused writing workspace.",
			},
		],
	},
	"writing-app": {
		slug: "writing-app",
		title: "Writing app",
		metadataTitle: "Focused Writing App for Notes and Journals",
		description:
			"Skriuw is a focused writing app for notes, journal entries, linked ideas, and account-backed sync.",
		label: "Writing app",
		headline: "A focused writing app for work that keeps changing.",
		intro: "Some writing is not a document yet. Skriuw gives drafts, notes, daily entries, and reference material a shared workspace.",
		image: "/readme/app-main.png",
		imageAlt: "Skriuw app workspace with editor, note tree, and navigation rail",
		primaryCta: "Open the writing app",
		points: ["Quiet editor", "Notes and journal together", "Keyboard-friendly workspace"],
		sections: [
			{
				heading: "For drafts and fragments",
				body: "Use Skriuw when a thought is too large for a todo item and too early for a finished document.",
			},
			{
				heading: "Built around return visits",
				body: "The layout is designed for repeated daily use: open the app, find the note, keep writing.",
			},
			{
				heading: "Portable by design",
				body: "Import and export workflows keep your workspace from becoming a dead end.",
			},
		],
		related: [
			{
				href: "/notes",
				label: "Notes app",
				description: "Capture and organize ideas while writing.",
			},
			{
				href: "/journal",
				label: "Journal app",
				description: "Keep daily writing beside your notes.",
			},
		],
	},
	"markdown-notes": {
		slug: "markdown-notes",
		title: "Markdown notes",
		metadataTitle: "Markdown Notes Workspace with Import and Export",
		description:
			"Skriuw supports portable note workflows with markdown-oriented import, export, and a focused browser workspace.",
		label: "Markdown notes",
		headline: "A notes workspace that respects portability.",
		intro: "Skriuw is not a trap for your writing. It is built around a workspace you can use in the browser and move out of when you need to.",
		image: "/readme/app-main.png",
		imageAlt: "Skriuw workspace showing notes and editor for portable writing",
		primaryCta: "Try portable notes",
		points: [
			"Import and export workflows",
			"Browser guest workspace",
			"Account sync when needed",
		],
		sections: [
			{
				heading: "Bring notes in",
				body: "Import workflows make it possible to start from existing material rather than a blank account.",
			},
			{
				heading: "Take notes out",
				body: "Export exists because long-lived writing should not depend on a single interface forever.",
			},
			{
				heading: "Keep the editor practical",
				body: "The interface favors direct writing, readable structure, and files you can reason about.",
			},
		],
		related: [
			{
				href: "/notes",
				label: "Notes app",
				description: "Use Skriuw as your everyday note workspace.",
			},
			{
				href: "/writing-app",
				label: "Writing app",
				description: "Write drafts, notes, and reference material.",
			},
		],
	},
} satisfies Record<string, SeoPageCopy>;

export const seoPageList = Object.values(seoPages);

export function getSeoMetadata(page: SeoPageCopy): Metadata {
	return {
		title: page.metadataTitle,
		description: page.description,
		alternates: {
			canonical: `/${page.slug}`,
		},
		openGraph: {
			title: page.metadataTitle,
			description: page.description,
			url: `/${page.slug}`,
			images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Skriuw" }],
		},
		twitter: {
			card: "summary_large_image",
			title: page.metadataTitle,
			description: page.description,
			images: ["/opengraph-image"],
		},
	};
}

export function getSeoJsonLd(page: SeoPageCopy) {
	return {
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "SoftwareApplication",
				name: "Skriuw",
				applicationCategory: "ProductivityApplication",
				operatingSystem: "Web",
				description: page.description,
				url: `https://skriuw.com/${page.slug}`,
				sameAs: ["https://github.com/remcostoeten/skriuw"],
				offers: {
					"@type": "Offer",
					price: "0",
					priceCurrency: "USD",
				},
			},
			{
				"@type": "BreadcrumbList",
				itemListElement: [
					{
						"@type": "ListItem",
						position: 1,
						name: "Skriuw",
						item: "https://skriuw.com",
					},
					{
						"@type": "ListItem",
						position: 2,
						name: page.title,
						item: `https://skriuw.com/${page.slug}`,
					},
				],
			},
		],
	};
}

export function MarketingSeoPage({ page }: { page: SeoPageCopy }) {
	return (
		<main className="min-h-dvh bg-background text-foreground">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: serializeJsonForScript(getSeoJsonLd(page)) }}
			/>
			<header className="border-b border-border">
				<nav
					className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 md:px-8"
					aria-label="Primary"
				>
					<Link href="/" className="text-sm font-semibold">
						Skriuw
					</Link>
					<div className="flex items-center gap-5 text-sm">
						<Link href="/notes" className="text-muted-foreground hover:text-foreground">
							Notes
						</Link>
						<Link
							href="/journal"
							className="text-muted-foreground hover:text-foreground"
						>
							Journal
						</Link>
						<Link href="/app" className="font-medium text-foreground">
							Open app
						</Link>
					</div>
				</nav>
			</header>

			<section className="border-b border-border">
				<div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-5 py-12 md:grid-cols-[0.86fr_1.14fr] md:px-8 md:py-16">
					<div className="flex flex-col justify-between gap-10">
						<div className="space-y-5">
							<p className="text-sm font-medium text-muted-foreground">
								{page.label}
							</p>
							<h1 className="text-4xl font-semibold leading-tight tracking-normal md:text-6xl">
								{page.headline}
							</h1>
							<p className="max-w-xl text-base leading-7 text-muted-foreground md:text-lg">
								{page.intro}
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-4">
							<Link
								href="/app"
								className="inline-flex h-11 items-center justify-center bg-foreground px-5 text-sm font-medium text-background hover:opacity-90"
							>
								{page.primaryCta}
							</Link>
							<Link
								href="/app?auth=sign-up"
								className="inline-flex h-11 items-center justify-center border border-border px-5 text-sm font-medium hover:bg-accent"
							>
								Create account
							</Link>
						</div>
					</div>

					<div className="border border-border bg-card">
						<Image
							src={page.image}
							alt={page.imageAlt}
							width={1600}
							height={1200}
							priority
							sizes="(max-width: 768px) 100vw, 58vw"
							className="h-auto w-full"
						/>
					</div>
				</div>
			</section>

			<section className="border-b border-border">
				<div className="mx-auto grid w-full max-w-6xl grid-cols-1 divide-y divide-border px-5 md:grid-cols-3 md:divide-x md:divide-y-0 md:px-8">
					{page.points.map((point) => (
						<p key={point} className="py-5 text-sm font-medium text-foreground md:px-5">
							{point}
						</p>
					))}
				</div>
			</section>

			<section className="mx-auto w-full max-w-6xl px-5 py-4 md:px-8">
				{page.sections.map((section) => (
					<div
						key={section.heading}
						className="grid grid-cols-1 gap-4 border-b border-border py-8 md:grid-cols-[0.35fr_0.65fr]"
					>
						<h2 className="text-lg font-semibold text-foreground">{section.heading}</h2>
						<p className="max-w-2xl text-base leading-7 text-muted-foreground">
							{section.body}
						</p>
					</div>
				))}
			</section>

			<section className="border-t border-border">
				<div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-0 px-5 py-10 md:grid-cols-[0.4fr_0.6fr] md:px-8">
					<div>
						<h2 className="text-xl font-semibold">Related Skriuw pages</h2>
						<p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
							Move between the writing, note-taking, and journaling parts of the
							workspace.
						</p>
					</div>
					<div className="mt-6 grid gap-0 border-t border-border md:mt-0">
						{page.related.map((item) => (
							<Link
								key={item.href}
								href={item.href}
								className="grid gap-1 border-b border-border py-5 hover:bg-accent/40 md:grid-cols-[0.34fr_0.66fr]"
							>
								<span className="text-sm font-medium text-foreground">
									{item.label}
								</span>
								<span className="text-sm leading-6 text-muted-foreground">
									{item.description}
								</span>
							</Link>
						))}
					</div>
				</div>
			</section>
		</main>
	);
}
