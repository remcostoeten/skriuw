import {
	convertObsidianWikilinks,
	inferImportFolders,
	parseMarkdownEntries,
	skipObsidianPath,
} from "@/domain/data-transfer/adapters/markdown-import-shared";

export { inferImportFolders as inferObsidianFolders };

export function parseObsidianVaultEntries(entries: Record<string, string>) {
	return parseMarkdownEntries(
		entries,
		"obsidian",
		{
			skipPath: skipObsidianPath,
			transformBody: (body) => convertObsidianWikilinks(body),
		},
		[
			"Imported from Obsidian vault. Folder structure was inferred from file paths.",
			"Wikilinks were converted to Markdown links.",
			"Attachments, canvas files, and version history were not included.",
		],
	);
}
