import {
	extractBearTags,
	inferImportFolders,
	parseMarkdownEntries,
} from "@/domain/data-transfer/adapters/markdown-import-shared";

export { inferImportFolders as inferBearFolders };

export function parseBearExportEntries(entries: Record<string, string>) {
	return parseMarkdownEntries(
		entries,
		"bear",
		{
			transformBody: (body) => extractBearTags(body).content,
			extraTags: (body) => extractBearTags(body).tags,
		},
		[
			"Imported from Bear export. Folder structure was inferred from file paths.",
			"Bear `#tag` header lines were mapped to note tags.",
			"Attachments and version history were not included.",
		],
	);
}
