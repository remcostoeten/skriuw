import {
	extractBearTags,
	parseMarkdownEntries,
} from "@/domain/data-transfer/adapters/markdown-import-shared";

export function parseBearExportEntries(entries: Record<string, string>) {
	return parseMarkdownEntries(
		entries,
		"bear",
		{
			prepareBody: (body) => {
				const parsed = extractBearTags(body);
				return { content: parsed.content, extraTags: parsed.tags };
			},
		},
		[
			"Imported from Bear export. Folder structure was inferred from file paths.",
			"Bear `#tag` header lines were mapped to note tags.",
			"Attachments and version history were not included.",
		],
	);
}
