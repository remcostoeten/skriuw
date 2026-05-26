import {
	inferImportFolders,
	parseMarkdownEntries,
	skipNotionPath,
} from "@/domain/data-transfer/adapters/markdown-import-shared";

export { inferImportFolders as inferNotionFolders };

export function parseNotionExportEntries(entries: Record<string, string>) {
	return parseMarkdownEntries(
		entries,
		"notion",
		{
			skipPath: skipNotionPath,
		},
		[
			"Imported from Notion export. Folder structure was inferred from export paths.",
			"Databases, attachments, and non-Markdown files were skipped.",
			"Journal entries and version history were not included.",
		],
	);
}
