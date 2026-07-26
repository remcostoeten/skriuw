import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { baseOptions, docsVersions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

export default function DocumentationLayout({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<DocsLayout sidebar={{ tabs: docsVersions }} tree={source.getPageTree()} {...baseOptions}>
			{children}
		</DocsLayout>
	);
}
