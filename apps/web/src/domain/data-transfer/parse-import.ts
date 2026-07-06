import { parseAppleNotesEntries } from "@/domain/data-transfer/adapters/apple-notes";
import { parseBearExportEntries } from "@/domain/data-transfer/adapters/bear";
import { parseMarkdownVaultEntries } from "@/domain/data-transfer/adapters/markdown-vault";
import { parseNotionExportEntries } from "@/domain/data-transfer/adapters/notion";
import { parseObsidianVaultEntries } from "@/domain/data-transfer/adapters/obsidian";
import {
	isSimplenoteArchive,
	parseSimplenoteEntries,
} from "@/domain/data-transfer/adapters/simplenote";
import { findExportRootPrefix } from "@/domain/data-transfer/paths";
import {
	decodeArchiveEntries,
	parseSkriuwArchiveEntries,
} from "@/domain/data-transfer/parse-archive";
import type { ImportProfile, ParsedArchive } from "@/domain/data-transfer/types";

function countByExtension(entries: Record<string, string>, ext: string): number {
	return Object.keys(entries).filter((path) => path.toLowerCase().endsWith(ext)).length;
}

export function detectImportProfile(entries: Record<string, string>): ImportProfile {
	if (findExportRootPrefix(Object.keys(entries))) {
		return "skriuw";
	}

	if (isSimplenoteArchive(entries)) {
		return "simplenote";
	}

	const paths = Object.keys(entries);
	const htmlCount = countByExtension(entries, ".html") + countByExtension(entries, ".htm");
	const markdownCount = countByExtension(entries, ".md");

	if (htmlCount > 0 && htmlCount >= markdownCount) {
		return "apple-notes";
	}

	if (
		paths.some(
			(path) =>
				path.toLowerCase().includes(".obsidian/") ||
				path.toLowerCase().startsWith(".obsidian/"),
		)
	) {
		return "obsidian";
	}

	if (
		paths.some(
			(path) =>
				path.includes("ExportBlock") ||
				/ [a-f0-9]{32} /.test(` ${path} `) ||
				path.includes("Private & Shared"),
		)
	) {
		return "notion";
	}

	if (paths.some((path) => path.toLowerCase().endsWith(".bearnote"))) {
		return "bear";
	}

	if (markdownCount > 0) {
		return "markdown-vault";
	}

	throw new Error("Unsupported archive format.");
}

function parseThirdPartyArchive(
	profile: ImportProfile,
	entries: Record<string, string>,
): ParsedArchive {
	switch (profile) {
		case "obsidian":
			return parseObsidianVaultEntries(entries);
		case "apple-notes":
			return parseAppleNotesEntries(entries);
		case "bear":
			return parseBearExportEntries(entries);
		case "notion":
			return parseNotionExportEntries(entries);
		case "simplenote":
			return parseSimplenoteEntries(entries);
		case "markdown-vault":
		default:
			return parseMarkdownVaultEntries(entries);
	}
}

export function parseImportBuffer(buffer: Uint8Array, profileHint?: ImportProfile): ParsedArchive {
	const entries = decodeArchiveEntries(buffer);
	const profile = profileHint ?? detectImportProfile(entries);

	if (profile === "skriuw") {
		return parseSkriuwArchiveEntries(entries);
	}

	return parseThirdPartyArchive(profile, entries);
}
