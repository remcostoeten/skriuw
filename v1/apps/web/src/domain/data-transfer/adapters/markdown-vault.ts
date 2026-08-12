import {
	inferImportFolders,
	parseMarkdownEntries,
} from "@/domain/data-transfer/adapters/markdown-import-shared";

// inferImportFolders as inferMarkdownVaultFolders is not exported (unused)

export function parseMarkdownVaultEntries(entries: Record<string, string>) {
	return parseMarkdownEntries(entries, "markdown-vault", {}, [
		"Imported from Markdown folder. Folder structure was inferred from file paths.",
		"Journal entries and version history were not included.",
	]);
}
