"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { useNotesCacheScope } from "@/features/notes/hooks/use-notes-cache-scope";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { showUserToast } from "@/shared/lib/user-toast";
import { findCleanupCandidates, type CleanupScanResult } from "@/domain/notes/cleanup";
import type { NoteFile } from "@/domain/notes/models";

export type NoteCleanupScanPhase = "idle" | "scanning" | "scanned" | "error";

const NOTE_FETCH_CHUNK_SIZE = 25;

// A small workspace round-trips through Prisma/IPC fast enough that the
// "Scanning…" frame would otherwise flip back to idle within a single paint,
// reading as if the button never responded. Floor the phase at this long so
// it's actually perceivable.
const MIN_SCANNING_MS = 450;

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Drives the note-cleanup scan button. Fetches every note body through the
 * active backend, classifies them, and hands back a result once ready — the
 * caller opens its review dialog off `result` rather than scanning inside it.
 */
export function useNoteCleanupScan() {
	const backend = useWorkspaceBackend();
	const queryClient = useQueryClient();
	const scope = useNotesCacheScope();

	const [phase, setPhase] = useState<NoteCleanupScanPhase>("idle");
	const [result, setResult] = useState<CleanupScanResult | null>(null);

	async function scan() {
		setPhase("scanning");
		const startedAt = performance.now();
		const settle = () => {
			const remaining = MIN_SCANNING_MS - (performance.now() - startedAt);
			return remaining > 0 ? wait(remaining) : Promise.resolve();
		};

		try {
			const filesKey = notesKeys.files(scope);
			const metadata = backend.listNotes
				? await backend.listNotes()
				: (queryClient.getQueryData<NoteFile[]>(filesKey) ?? []);
			const ids = metadata.map((note) => note.id);

			const idChunks = chunk(ids, NOTE_FETCH_CHUNK_SIZE);
			const chunkRows = await Promise.all(
				idChunks.map((idChunk) => backend.getNotes(idChunk)),
			);
			const notes: NoteFile[] = chunkRows.flat();

			const scanResult = findCleanupCandidates(notes);
			await settle();
			// Stays "scanned" (not "idle") so the button keeps showing a completed
			// state instead of silently reverting to its pre-scan label — it only
			// resets on the next scan() call or when the settings section remounts.
			setPhase("scanned");
			if (scanResult.candidates.length === 0) {
				showUserToast(
					`Scanned ${scanResult.scanned} notes — nothing to clean up`,
					"success",
				);
				return;
			}
			setResult(scanResult);
		} catch (scanError) {
			await settle();
			setPhase("error");
			showUserToast(scanError instanceof Error ? scanError.message : "Scan failed.", "error");
		}
	}

	function reset() {
		setResult(null);
	}

	return { phase, result, scan, reset };
}
