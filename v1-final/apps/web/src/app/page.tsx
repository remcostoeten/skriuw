import type { Metadata } from "next";
import Link from "next/link";
import { Newsreader } from "next/font/google";
import { ArrowRight } from "lucide-react";
import { LiveNoteDemo, Mark } from "@/features/marketing/components/live-note-demo";
import { MarkPlayground } from "@/features/marketing/components/mark-playground";
import { MarketingThemeToggle } from "@/features/marketing/components/marketing-theme-toggle";
import { seoPageList } from "@/features/marketing/seo-pages";
import { serializeJsonForScript } from "@/shared/lib/json-script";

const newsreader = Newsreader({
	subsets: ["latin"],
	style: ["normal", "italic"],
	weight: ["400", "500"],
});

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

const themeInitScript = `(function(){try{var t=localStorage.getItem("skriuw-mk");if(t!=="dark"&&t!=="light"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-mk",t)}catch(e){}})()`;

function chipVar(token: string) {
	return { "--chip": `var(${token})` } as React.CSSProperties;
}

const steps = [
	{
		title: "Start in a quiet space",
		body: "The full workspace opens right in your browser — no account, nothing to configure. Just a blank page that waits for you.",
		stage: (
			<div className="mini-window">
				<div className="mini-window-bar">
					<span />
					<span />
					<span />
				</div>
				<div className="mini-window-body">
					<span className="mini-caret" />
				</div>
			</div>
		),
	},
	{
		title: "Write, and it lights up",
		body: "Dates, people, amounts, and tags are noticed as you type and stay connected across every note and journal entry.",
		stage: (
			<p className="px-6 text-center font-mono text-xs leading-6">
				lunch with{" "}
				<span className="lite-mark" style={chipVar("--project-purple")}>
					$noor
				</span>{" "}
				<span
					className="lite-mark [animation-delay:0.5s]"
					style={chipVar("--project-blue")}
				>
					tuesday 12:30
				</span>{" "}
				<span className="lite-mark [animation-delay:1s]" style={chipVar("--project-green")}>
					€18
				</span>{" "}
				<span
					className="lite-mark [animation-delay:1.5s]"
					style={chipVar("--project-amber")}
				>
					#social
				</span>
			</p>
		),
	},
	{
		title: "Keep it, everywhere",
		body: "Create an account when you're ready and your notes follow you — web, desktop, and mobile stay in sync.",
		stage: (
			<div className="sync-stage" aria-hidden="true">
				<span className="sync-node sync-node-desktop" />
				<span className="sync-wire">
					<span className="sync-dot" />
				</span>
				<span className="sync-node sync-node-phone" />
				<span className="sync-wire">
					<span className="sync-dot [animation-delay:1.4s]" />
				</span>
				<span className="sync-node sync-node-web" />
			</div>
		),
	},
];

const workflowStages: Record<string, React.ReactNode> = {
	notes: (
		<span className="flex items-center gap-2 font-mono text-xs">
			<span className="mark-lite" style={chipVar("--project-teal")}>
				[[weekly-review]]
			</span>
			<ArrowRight className="h-3 w-3 text-[var(--mk-faint)]" strokeWidth={2} />
			<span className="mark-lite" style={chipVar("--project-amber")}>
				#reading
			</span>
		</span>
	),
	journal: (
		<span className="flex items-center gap-1.5 font-mono text-xs text-[var(--mk-faint)]">
			<span className="rounded-md border border-[var(--mk-border-c)] px-2 py-0.5">mon</span>
			<span className="rounded-md border border-[var(--mk-border-c)] px-2 py-0.5">tue</span>
			<span className="mark-lite" style={chipVar("--project-blue")}>
				today
			</span>
		</span>
	),
	"writing-app": (
		<span className="flex items-center gap-3 font-mono text-xs text-[var(--mk-faint)]">
			<span>412 words</span>
			<span>·</span>
			<span>12 min read</span>
			<span>·</span>
			<span style={{ color: "hsl(var(--project-green))" }}>saved</span>
		</span>
	),
	"markdown-notes": (
		<span className="flex items-baseline gap-2 text-xs">
			<span className="font-mono text-[var(--mk-faint)]"># big idea</span>
			<ArrowRight className="h-3 w-3 self-center text-[var(--mk-faint)]" strokeWidth={2} />
			<span className={`${newsreader.className} text-base`}>Big idea</span>
		</span>
	),
};

function workflowStage(slug: string) {
	return workflowStages[slug] ?? workflowStages.notes;
}

const freeChecklist = [
	"Everything in free, forever",
	"Notes, journal, tags, and graph",
	"Web, desktop, and mobile apps",
	"Open source on GitHub",
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
		<main className="mk-root min-h-dvh bg-[var(--mk-bg)] text-[var(--mk-ink)] transition-colors duration-300">
			<script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: serializeJsonForScript(jsonLd) }}
			/>

			<style>{`
				.mk-root {
					--mk-bg: #f5f3fa;
					--mk-ink: #1b1830;
					--mk-sub: #4b4763;
					--mk-faint: #8a86a3;
					--mk-card: #ffffff;
					--mk-border-c: #e4e0f0;
					--mk-accent-c: #f0edf9;
					--mk-band: rgba(255, 255, 255, 0.6);
					--mk-lilac: #dcd6f8;
					--mk-pill: #1b1830;
					--mk-pill-hover: #332d55;
					--mk-pill-text: #ffffff;
					--mk-grid: rgba(27, 24, 48, 0.05);
					--mk-shadow: rgba(27, 24, 48, 0.2);

					--background: 252 40% 97%;
					--foreground: 250 32% 14%;
					--card: 0 0% 100%;
					--border: 250 22% 89%;
					--accent: 250 32% 94%;
					--muted-foreground: 250 10% 46%;
					--project-blue: 228 70% 52%;
					--project-green: 158 62% 32%;
					--project-purple: 260 55% 50%;
					--project-amber: 34 90% 38%;
					--project-teal: 174 70% 30%;
					--project-orange: 24 88% 44%;

					--color-background: var(--mk-bg);
					--color-foreground: var(--mk-ink);
					--color-card: var(--mk-card);
					--color-border: hsl(var(--border));
					--color-accent: var(--mk-accent-c);
					--color-muted-foreground: var(--mk-sub);
				}
				html[data-mk="dark"] .mk-root {
					--mk-bg: #201c30;
					--mk-ink: #f0edf9;
					--mk-sub: #b6b1cc;
					--mk-faint: #7d7896;
					--mk-card: #2c2740;
					--mk-border-c: #3a3452;
					--mk-accent-c: #363050;
					--mk-band: rgba(255, 255, 255, 0.03);
					--mk-lilac: #453d6b;
					--mk-pill: #f0edf9;
					--mk-pill-hover: #d9d2f0;
					--mk-pill-text: #1b1830;
					--mk-grid: rgba(240, 237, 249, 0.045);
					--mk-shadow: rgba(10, 8, 20, 0.55);

					--background: 249 26% 15%;
					--foreground: 250 30% 95%;
					--card: 251 24% 20%;
					--border: 250 21% 26%;
					--accent: 250 21% 26%;
					--muted-foreground: 250 15% 75%;
					--project-blue: 228 90% 74%;
					--project-green: 158 55% 60%;
					--project-purple: 260 80% 78%;
					--project-amber: 38 90% 64%;
					--project-teal: 173 65% 56%;
					--project-orange: 24 92% 66%;
				}
				.card-stage {
					display: flex;
					align-items: center;
					justify-content: center;
					border-radius: 1.25rem;
					background: var(--mk-accent-c);
					overflow: hidden;
					transition: background-color 300ms;
				}
				.mark-lite,
				.lite-mark {
					padding: 1px 6px;
					border-radius: 6px;
				}
				.mark-lite {
					background: hsl(var(--chip) / 0.16);
					color: hsl(var(--chip));
				}
				.mini-window {
					width: 132px;
					border-radius: 10px;
					border: 1px solid var(--mk-border-c);
					background: var(--mk-card);
					overflow: hidden;
					transition: background-color 300ms, border-color 300ms;
				}
				.mini-window-bar {
					display: flex;
					gap: 4px;
					padding: 6px 8px;
					border-bottom: 1px solid var(--mk-border-c);
				}
				.mini-window-bar span {
					width: 6px;
					height: 6px;
					border-radius: 50%;
					background: var(--mk-border-c);
				}
				.mini-window-body {
					height: 52px;
					padding: 8px 10px;
					background-image: linear-gradient(hsl(var(--border) / 0.5) 1px, transparent 1px);
					background-size: 100% 14px;
				}
				.mini-caret {
					display: inline-block;
					width: 2px;
					height: 12px;
					background: var(--mk-ink);
				}
				.sync-stage {
					display: flex;
					align-items: center;
				}
				.sync-node {
					display: block;
					border: 1.5px solid var(--mk-sub);
					border-radius: 4px;
				}
				.sync-node-desktop { width: 26px; height: 18px; }
				.sync-node-phone { width: 12px; height: 20px; border-radius: 3px; }
				.sync-node-web { width: 20px; height: 20px; border-radius: 50%; }
				.sync-wire {
					position: relative;
					width: 44px;
					height: 1.5px;
					background: var(--mk-border-c);
				}
				.sync-dot {
					position: absolute;
					top: -2.25px;
					left: 0;
					width: 6px;
					height: 6px;
					border-radius: 50%;
					background: #f0c65a;
					opacity: 0;
				}
				@media (prefers-reduced-motion: no-preference) {
					.lite-mark {
						animation: mk-light 4.5s ease-in-out infinite;
					}
					.mini-caret {
						animation: mk-blink 1.1s steps(2) infinite;
					}
					.sync-dot {
						animation: mk-travel 2.8s ease-in-out infinite;
					}
					@keyframes mk-light {
						0%, 12% { background: transparent; color: inherit; }
						28%, 78% { background: hsl(var(--chip) / 0.18); color: hsl(var(--chip)); }
						94%, 100% { background: transparent; color: inherit; }
					}
					@keyframes mk-blink {
						0%, 49% { opacity: 1; }
						50%, 100% { opacity: 0; }
					}
					@keyframes mk-travel {
						0% { left: 0; opacity: 0; }
						15%, 85% { opacity: 1; }
						100% { left: calc(100% - 6px); opacity: 0; }
					}
				}
				@media (prefers-reduced-motion: reduce) {
					.lite-mark {
						background: hsl(var(--chip) / 0.18);
						color: hsl(var(--chip));
					}
					.sync-dot { opacity: 1; left: 50%; }
				}
				.paper-grid {
					background-image:
						linear-gradient(to right, var(--mk-grid) 1px, transparent 1px),
						linear-gradient(to bottom, var(--mk-grid) 1px, transparent 1px);
					background-size: 72px 72px;
				}
				.hero-wash {
					background:
						radial-gradient(55% 60% at 18% 12%, rgba(169, 157, 240, 0.5), transparent 70%),
						radial-gradient(50% 55% at 85% 25%, rgba(240, 214, 150, 0.45), transparent 70%),
						radial-gradient(60% 50% at 50% 100%, rgba(255, 255, 255, 0.9), transparent 70%);
					transition: background 300ms;
				}
				html[data-mk="dark"] .hero-wash {
					background:
						radial-gradient(55% 60% at 18% 12%, rgba(122, 106, 220, 0.28), transparent 70%),
						radial-gradient(50% 55% at 85% 25%, rgba(220, 180, 90, 0.12), transparent 70%),
						radial-gradient(60% 50% at 50% 100%, rgba(44, 39, 64, 0.9), transparent 70%);
				}
				.float-card {
					transition: transform 300ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 300ms, background-color 300ms;
					box-shadow: 0 24px 50px -24px var(--mk-shadow);
				}
				.float-card:hover {
					transform: rotate(0deg) translateY(-6px) !important;
					box-shadow: 0 30px 60px -24px var(--mk-shadow);
				}
				.mk-card-surface {
					transition: background-color 300ms, box-shadow 300ms, transform 300ms;
					box-shadow: 0 18px 40px -24px var(--mk-shadow);
				}
				@media (prefers-reduced-motion: no-preference) {
					.float-card {
						animation: mk-bob 7s ease-in-out infinite;
					}
					.float-card:nth-child(1) { animation-delay: -2.3s; }
					.float-card:nth-child(3) { animation-delay: -4.6s; }
					.float-card:hover { animation-play-state: paused; }
					@keyframes mk-bob {
						0%, 100% { translate: 0 0; }
						50% { translate: 0 -9px; }
					}
					@supports (animation-timeline: view()) {
						.reveal {
							animation: mk-reveal linear both;
							animation-timeline: view();
							animation-range: entry 0% entry 35%;
						}
						@keyframes mk-reveal {
							from {
								opacity: 0;
								transform: translateY(18px);
							}
							to {
								opacity: 1;
								transform: translateY(0);
							}
						}
					}
				}
			`}</style>

			<div className="hero-wash">
				<div className="paper-grid">
					<nav
						className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:px-8"
						aria-label="Primary"
					>
						<Link
							href="/"
							className={`${newsreader.className} text-2xl font-medium tracking-tight`}
						>
							Skriuw
						</Link>
						<div className="hidden items-center gap-8 text-sm font-medium text-[var(--mk-sub)] md:flex">
							<Link
								href="#how"
								className="transition-colors hover:text-[var(--mk-ink)]"
							>
								How it works
							</Link>
							<Link
								href="#workflows"
								className="transition-colors hover:text-[var(--mk-ink)]"
							>
								Workflows
							</Link>
							<Link
								href="https://github.com/remcostoeten/skriuw"
								className="transition-colors hover:text-[var(--mk-ink)]"
							>
								GitHub
							</Link>
						</div>
						<div className="flex items-center gap-3">
							<MarketingThemeToggle />
							<Link
								href="/app?auth=sign-in"
								className="inline-flex h-11 items-center text-sm font-medium text-[var(--mk-sub)] transition-colors hover:text-[var(--mk-ink)]"
							>
								Log in
							</Link>
							<Link
								href="/app"
								className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--mk-pill)] px-5 text-sm font-medium text-[var(--mk-pill-text)] transition-[background-color,transform] duration-200 hover:bg-[var(--mk-pill-hover)] active:scale-[0.97]"
							>
								Get started
							</Link>
						</div>
					</nav>

					<section className="mx-auto w-full max-w-5xl px-5 pb-24 pt-16 text-center md:px-8 md:pt-24">
						<h1
							className={`${newsreader.className} mx-auto max-w-3xl text-5xl font-normal leading-[1.06] tracking-tight md:text-7xl`}
						>
							Your thoughts deserve
							<br />a place that feels calm
						</h1>
						<p className="mx-auto mt-6 max-w-xl text-base leading-7 text-[var(--mk-sub)] md:text-lg">
							Write your notes and daily journal in one quiet space — dates, people,
							and amounts light up as you type, all judgment-free.
						</p>
						<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
							<Link
								href="/app"
								className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--mk-pill)] px-7 text-sm font-medium text-[var(--mk-pill-text)] transition-[background-color,transform] duration-200 hover:bg-[var(--mk-pill-hover)] active:scale-[0.97]"
							>
								Start here
								<span className="cta-arrow-swap h-4 w-4" aria-hidden="true">
									<ArrowRight className="h-4 w-4" strokeWidth={2} />
									<ArrowRight className="h-4 w-4" strokeWidth={2} />
								</span>
							</Link>
							<Link
								href="#how"
								className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--mk-card)] px-7 text-sm font-medium text-[var(--mk-ink)] shadow-[0_10px_30px_-12px_var(--mk-shadow)] transition-[background-color,transform] duration-200 hover:bg-[var(--mk-accent-c)] active:scale-[0.97]"
							>
								Explore
							</Link>
						</div>

						<div className="relative mt-16 flex items-start justify-center">
							<div className="float-card z-0 hidden w-72 -rotate-6 rounded-3xl bg-[var(--mk-card)] p-6 text-left lg:mr-[-2.5rem] lg:mt-10 lg:block">
								<p className="text-sm leading-7">
									Coffee with <Mark kind="person">$linde</Mark>{" "}
									<Mark kind="date">tomorrow 09:30</Mark> — keep it under{" "}
									<Mark kind="amount">€40</Mark>.
								</p>
								<p className="mt-4 font-mono text-xs text-[var(--mk-faint)]">
									12 words · saved locally
								</p>
							</div>

							<div className="float-card z-10 w-full max-w-md rotate-0 overflow-hidden rounded-3xl">
								<LiveNoteDemo />
							</div>

							<div className="float-card z-0 hidden w-72 rotate-6 rounded-3xl bg-[var(--mk-card)] p-6 text-left lg:ml-[-2.5rem] lg:mt-14 lg:block">
								<p className="text-sm leading-7">
									<Mark kind="count">3 bugs</Mark> left before{" "}
									<Mark kind="date">friday</Mark> — notes in{" "}
									<Mark kind="link">[[release-notes]]</Mark>{" "}
									<Mark kind="tag">#dev</Mark>
								</p>
								<p className="mt-4 font-mono text-xs text-[var(--mk-faint)]">
									11 words · synced
								</p>
							</div>
						</div>
					</section>
				</div>
			</div>

			<section id="how" className="mx-auto w-full max-w-6xl px-5 py-24 md:px-8">
				<h2
					className={`${newsreader.className} reveal text-center text-4xl font-normal tracking-tight md:text-5xl`}
				>
					How Skriuw supports you
				</h2>
				<p className="reveal mx-auto mt-4 max-w-md text-center text-sm leading-6 text-[var(--mk-sub)] md:text-base">
					Step by step — a gentle flow designed to meet you where you are.
				</p>

				<div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
					{steps.map((step) => (
						<div
							key={step.title}
							className="step-card mk-card-surface reveal rounded-3xl bg-[var(--mk-card)] p-8 duration-300 hover:-translate-y-1.5"
						>
							<div className="card-stage h-28">{step.stage}</div>
							<h3
								className={`${newsreader.className} mt-6 text-2xl font-normal tracking-tight`}
							>
								{step.title}
							</h3>
							<p className="mt-3 text-sm leading-7 text-[var(--mk-sub)]">
								{step.body}
							</p>
						</div>
					))}
				</div>

				<div className="reveal mx-auto mt-6 max-w-2xl overflow-hidden rounded-3xl shadow-[0_18px_40px_-24px_var(--mk-shadow)]">
					<MarkPlayground />
				</div>
			</section>

			<section id="workflows" className="bg-[var(--mk-band)] transition-colors duration-300">
				<div className="mx-auto w-full max-w-6xl px-5 py-24 md:px-8">
					<h2
						className={`${newsreader.className} reveal text-center text-4xl font-normal tracking-tight md:text-5xl`}
					>
						Start where it feels right
					</h2>
					<p className="reveal mx-auto mt-4 max-w-md text-center text-sm leading-6 text-[var(--mk-sub)] md:text-base">
						Pick the part of the workspace that matches how you want to write.
					</p>
					<div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2">
						{seoPageList.map((page) => (
							<Link
								key={page.slug}
								href={`/${page.slug}`}
								className="group mk-card-surface reveal rounded-3xl bg-[var(--mk-card)] p-8 duration-300 hover:-translate-y-1.5"
							>
								<div className="card-stage mb-6 h-16">
									{workflowStage(page.slug)}
								</div>
								<h3
									className={`${newsreader.className} text-2xl font-normal tracking-tight`}
								>
									{page.title}
									<ArrowRight
										className="ml-2 inline h-4 w-4 -translate-x-1 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100"
										strokeWidth={2}
									/>
								</h3>
								<p className="mt-3 text-sm leading-7 text-[var(--mk-sub)]">
									{page.description}
								</p>
							</Link>
						))}
					</div>
				</div>
			</section>

			<section className="mx-auto w-full max-w-6xl px-5 py-24 md:px-8">
				<div className="reveal mx-auto grid max-w-4xl grid-cols-1 items-center gap-10 rounded-[2.5rem] bg-[var(--mk-lilac)] p-10 transition-colors duration-300 md:grid-cols-2 md:p-14">
					<div>
						<h2
							className={`${newsreader.className} text-4xl font-normal tracking-tight md:text-5xl`}
						>
							Pay what feels right
						</h2>
						<p className="mt-4 text-sm leading-7 text-[var(--mk-sub)] md:text-base">
							Skriuw is free and open source. If it helps you think, a star on GitHub
							is all the support it asks for.
						</p>
						<Link
							href="https://github.com/remcostoeten/skriuw"
							className="mt-7 inline-flex h-12 items-center justify-center rounded-full bg-[var(--mk-pill)] px-7 text-sm font-medium text-[var(--mk-pill-text)] transition-[background-color,transform] duration-200 hover:bg-[var(--mk-pill-hover)] active:scale-[0.97]"
						>
							Star on GitHub
						</Link>
					</div>
					<ul className="space-y-4">
						{freeChecklist.map((item) => (
							<li key={item} className="flex items-center gap-3 text-sm font-medium">
								<span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#f0c65a]" />
								{item}
							</li>
						))}
					</ul>
				</div>
			</section>

			<footer className="border-t border-[var(--mk-border-c)]">
				<div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-[var(--mk-faint)] md:px-8">
					<span className={`${newsreader.className} text-lg text-[var(--mk-ink)]`}>
						Skriuw
					</span>
					<span className="flex items-center gap-6">
						<Link
							href="https://github.com/remcostoeten/skriuw"
							className="transition-colors hover:text-[var(--mk-ink)]"
						>
							GitHub
						</Link>
						<Link
							href="https://docs.skriuw.com"
							className="transition-colors hover:text-[var(--mk-ink)]"
						>
							Docs
						</Link>
						<Link href="/app" className="transition-colors hover:text-[var(--mk-ink)]">
							Open app
						</Link>
					</span>
				</div>
			</footer>
		</main>
	);
}
