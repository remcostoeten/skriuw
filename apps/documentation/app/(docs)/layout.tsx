import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

export default function DocumentationLayout({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<DocsLayout tree={source.getPageTree()} {...baseOptions}>
			{children}
		</DocsLayout>
	);
}
