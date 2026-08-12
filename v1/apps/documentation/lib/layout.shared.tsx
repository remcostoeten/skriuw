import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Logo } from "@/components/logo";
import { site } from "@/lib/site";

export const docsVersions = [
	{
		description: "The current shipping app",
		title: "Skriuw",
		url: "/",
	},
	{
		description: "The Rust-first rewrite",
		title: "Skriuw v2",
		url: "/v2",
	},
];

export const baseOptions: BaseLayoutProps = {
	githubUrl: "https://github.com/remcostoeten/skriuw",
	links: [
		{
			active: "nested-url",
			text: "Documentation",
			url: "/",
		},
		{
			text: "Skriuw",
			url: "https://skriuw.com",
		},
	],
	nav: {
		title: (
			<span className="inline-flex items-center gap-2 font-semibold">
				<Logo className="text-[var(--fd-primary)]" />
				{site.name}
			</span>
		),
		url: "/",
	},
};
