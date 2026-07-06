"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateNote } from "@/features/notes/hooks/use-create-note";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { buildNoteUrl } from "@/features/notes/hooks/use-notes-navigation";
import { generateNoteContent } from "@/features/notes/lib/generate-note-content";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import type { CreateNoteInput } from "@/domain/notes/note-write-core";
import type { NoteFile } from "@/types/notes";
import { SCOPES } from "./scopes";
import { useShortcutScope } from "./provider";

/**
 * Handlers for shortcuts in {@link SCOPES.global} — the only scope active
 * regardless of route, so it's the right home for behaviors a global OS
 * shortcut needs to reach (the {@link useShortcutScope} call below also
 * mirrors them into the live-handler registry the desktop global-shortcut
 * bridge dispatches to; see `provider.tsx`). Rendered once near the app
 * root, inside `<ShortcutProvider>`, so it's always mounted.
 */
export function GlobalShortcutHandlers(): null {
	const router = useRouter();
	const queryClient = useQueryClient();
	const createNoteMutation = useCreateNote();

	const handleQuickCapture = React.useCallback(() => {
		const newId = crypto.randomUUID();
		const content = generateNoteContent("Untitled");
		const richContent = markdownToRichDocument(content);
		const newFile: CreateNoteInput = {
			id: newId,
			name: "Untitled.md",
			content,
			richContent,
			preferredEditorMode: "block",
			parentId: null,
		};

		// Seed the detail cache before navigating, same reasoning as the
		// notes-feature create flow: otherwise the editor mounts against an id
		// the server hasn't committed yet and gets stuck on a loading skeleton.
		queryClient.setQueryData<NoteFile>(notesKeys.detail(newId), {
			id: newId,
			name: newFile.name,
			content,
			richContent,
			preferredEditorMode: "block",
			createdAt: new Date(),
			modifiedAt: new Date(),
			parentId: null,
			tags: [],
			properties: [],
		});

		// The seeded detail cache lives outside the mutation's own rollback, so
		// on a failed create we drop it and return to /app — otherwise the user
		// is stranded on a note route backed only by the phantom entry.
		createNoteMutation.mutate(newFile, {
			onError: () => {
				queryClient.removeQueries({ queryKey: notesKeys.detail(newId) });
				router.push(`${window.location.origin}/app`);
			},
		});
		router.push(buildNoteUrl(newId, `${window.location.origin}/app`));
	}, [createNoteMutation, queryClient, router]);

	useShortcutScope(SCOPES.global, {
		"global.quickCapture": handleQuickCapture,
	});

	return null;
}
