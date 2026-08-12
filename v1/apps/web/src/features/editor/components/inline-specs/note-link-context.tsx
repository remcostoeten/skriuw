"use client";

import { createContext, useContext, useDeferredValue, useMemo, type ReactNode } from "react";
import { createNoteLinkResolver, type NoteLinkResolver } from "@/domain/notes/note-links";
import type { NoteFile } from "@/types/notes";

type NoteLinkContextValue = {
	files: NoteFile[];
	activeFileId?: string;
	resolver: NoteLinkResolver;
};

const NoteLinkContext = createContext<NoteLinkContextValue>({
	files: [],
	resolver: createNoteLinkResolver([]),
});

type NoteLinkProviderProps = {
	files: NoteFile[];
	activeFileId?: string;
	children: ReactNode;
};

export function NoteLinkProvider({ files, activeFileId, children }: NoteLinkProviderProps) {
	// The resolver walks every note's content to index titles, so it is built
	// once per files identity (not per chip) and off the urgent render lane —
	// chip resolution may trail typing by a frame, which is invisible.
	const deferredFiles = useDeferredValue(files);
	const resolver = useMemo(() => createNoteLinkResolver(deferredFiles), [deferredFiles]);
	const value = useMemo(
		() => ({ files, activeFileId, resolver }),
		[files, activeFileId, resolver],
	);

	return <NoteLinkContext.Provider value={value}>{children}</NoteLinkContext.Provider>;
}

export function useNoteLinkContext() {
	return useContext(NoteLinkContext);
}
