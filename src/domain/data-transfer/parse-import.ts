import { parseMarkdownVaultEntries } from "@/domain/data-transfer/adapters/markdown-vault";
import { findExportRootPrefix } from "@/domain/data-transfer/paths";
import {
	decodeArchiveEntries,
	parseSkriuwArchiveEntries,
} from "@/domain/data-transfer/parse-archive";
import type { ImportProfile, ParsedArchive } from "@/domain/data-transfer/types";

export function detectImportProfile(entries: Record<string, string>): ImportProfile {
	if (findExportRootPrefix(Object.keys(entries))) {
		return "skriuw";
	}

	const markdownCount = Object.keys(entries).filter(
		(path) => path.endsWith(".md") && !path.endsWith(".rich.json") && !path.includes("/."),
	).length;

	if (markdownCount > 0) {
		return "markdown-vault";
	}

	throw new Error("Unsupported archive format.");
}

export function parseImportBuffer(
	buffer: Uint8Array,
	profileHint?: ImportProfile,
): ParsedArchive {
	const entries = decodeArchiveEntries(buffer);
	const profile = profileHint ?? detectImportProfile(entries);

	if (profile === "markdown-vault") {
		return parseMarkdownVaultEntries(entries);
	}

	return parseSkriuwArchiveEntries(entries);
}
