import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { site } from "@/lib/site";

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
		title: site.name,
		url: "/",
	},
};
