"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useSeedEditorStore } from "../store";
import { SeedTree } from "./seed-tree";
import { SeedToolbar } from "./seed-toolbar";
import type { SeedBundlePayload } from "@/domain/seed/types";

// BlockNote pulls in ~1.3 MiB (Mantine + ProseMirror). Load it on demand so the
// admin seed page's initial payload doesn't carry the full editor bundle —
// matching how the user-facing editor is mounted (dynamic, ssr: false).
const SeedNoteEditor = dynamic(
	() => import("./seed-note-editor").then((mod) => ({ default: mod.SeedNoteEditor })),
	{
		ssr: false,
		loading: () => (
			<div className="flex items-center justify-center h-full text-sm text-muted-foreground/60">
				Loading editor…
			</div>
		),
	},
);

type Props = {
	bundleId: string;
	bundleName: string;
	payload: SeedBundlePayload;
};

export function SeedEditorPage({ bundleId, bundleName, payload }: Props) {
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
