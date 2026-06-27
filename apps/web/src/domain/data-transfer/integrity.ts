import { createHash } from "node:crypto";
import type { SkriuwExportManifestV3 } from "@/domain/data-transfer/types";

export function sha256Hex(data: string | Uint8Array): string {
	return createHash("sha256").update(data).digest("hex");
}

export function archivePathRelativeToRoot(rootPrefix: string, archivePath: string): string {
	return archivePath.startsWith(`${rootPrefix}/`)
		? archivePath.slice(rootPrefix.length + 1)
		: archivePath;
}

export function buildArchiveChecksums(
	rootPrefix: string,
	entries: Record<string, string>,
): Record<string, string> {
	const checksums: Record<string, string> = {};
	for (const [path, raw] of Object.entries(entries)) {
		if (path === `${rootPrefix}/skriuw-export.json`) continue;
		checksums[archivePathRelativeToRoot(rootPrefix, path)] = sha256Hex(raw);
	}
	return checksums;
}

export function validateArchiveIntegrity(
	rootPrefix: string,
	entries: Record<string, string>,
	manifest: SkriuwExportManifestV3,
): string[] {
	const warnings: string[] = [];
	const expected = manifest.checksums ?? {};

	for (const [relativePath, expectedHash] of Object.entries(expected)) {
		const absolutePath = `${rootPrefix}/${relativePath}`;
		const raw = entries[absolutePath];
		if (raw === undefined) {
			warnings.push(`Missing file listed in manifest checksums: ${relativePath}`);
			continue;
		}
		const actualHash = sha256Hex(raw);
		if (actualHash !== expectedHash) {
			warnings.push(`Checksum mismatch for ${relativePath}`);
		}
	}

	const parsedNotes = entries
		? Object.keys(entries).filter(
				(path) =>
					path.startsWith(`${rootPrefix}/notes/`) &&
					path.endsWith(".md") &&
					!path.includes("/.versions/"),
			).length
		: 0;
	if (manifest.counts.notes !== parsedNotes) {
		warnings.push(
			`Manifest lists ${manifest.counts.notes} notes but archive contains ${parsedNotes} note files.`,
		);
	}

	const parsedJournal = Object.keys(entries).filter(
		(path) => path.startsWith(`${rootPrefix}/journal/`) && path.endsWith(".md"),
	).length;
	if (manifest.counts.journalEntries !== parsedJournal) {
		warnings.push(
			`Manifest lists ${manifest.counts.journalEntries} journal entries but archive contains ${parsedJournal} journal files.`,
		);
	}

	return warnings;
}
