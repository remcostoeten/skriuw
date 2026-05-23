"use client";

import { useEffect } from "react";
import { useSeedEditorStore } from "../store";
import { SeedTree } from "./seed-tree";
import { SeedNoteEditor } from "./seed-note-editor";
import { SeedToolbar } from "./seed-toolbar";
import type { SeedBundlePayload } from "@/domain/seed/types";

interface SeedEditorPageProps {
	bundleId: string;
	bundleName: string;
	payload: SeedBundlePayload;
}

export function SeedEditorPage({ bundleId, bundleName, payload }: SeedEditorPageProps) {
	const { hydrate, selectedRef, notes } = useSeedEditorStore();

	useEffect(() => {
		hydrate({
			bundleId,
			bundleName,
			folders: payload.folders,
			notes: payload.notes,
		});
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [bundleId]);

	const selectedNote = notes.find((n) => n.ref === selectedRef) ?? null;

	return (
		<div className="flex flex-col h-full">
			<SeedToolbar />
			<div className="flex flex-1 min-h-0">
				<aside className="w-56 shrink-0 border-r border-border/40 overflow-hidden">
					<SeedTree />
				</aside>
				<main className="flex-1 min-w-0">
					{selectedNote ? (
						<SeedNoteEditor key={selectedNote.ref} note={selectedNote} />
					) : (
						<div className="flex items-center justify-center h-full text-sm text-muted-foreground/60">
							Select a note or create one in the sidebar.
						</div>
					)}
				</main>
			</div>
		</div>
	);
}
