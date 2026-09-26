"use client";

import { create } from "zustand";
import type { SeedFolder, SeedNote } from "@/domain/seed/types";

type State = {
	bundleId: string;
	bundleName: string;
	folders: SeedFolder[];
	notes: SeedNote[];
	selectedRef: string | null;
	openFolderRefs: Set<string>;
	dirty: boolean;
};

type Actions = {
	hydrate: (data: {
		bundleId: string;
		bundleName: string;
		folders: SeedFolder[];
		notes: SeedNote[];
	}) => void;
	selectNote: (ref: string) => void;
	toggleFolder: (ref: string) => void;
	updateNoteContent: (ref: string, richContent: unknown[]) => void;
	addNote: (name: string, parentRef: string | null) => void;
	addFolder: (name: string, parentRef: string | null) => void;
	renameNote: (ref: string, name: string) => void;
	renameFolder: (ref: string, name: string) => void;
	deleteNote: (ref: string) => void;
	deleteFolder: (ref: string) => void;
	setBundleName: (name: string) => void;
	markSaved: () => void;
};

export type SeedEditorStore = State & Actions;

function nextRef(prefix: string): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function siblingOrder(
	items: Array<{ parentRef: string | null }>,
	parentRef: string | null,
): number {
	return items.filter((i) => i.parentRef === parentRef).length;
}

export const useSeedEditorStore = create<SeedEditorStore>()((set) => ({
	bundleId: "",
	bundleName: "",
	folders: [],
	notes: [],
	selectedRef: null,
	openFolderRefs: new Set(),
	dirty: false,

	hydrate: ({ bundleId, bundleName, folders, notes }) => {
		const topFolders = folders.filter((f) => f.parentRef === null).map((f) => f.ref);
		set({
			bundleId,
			bundleName,
			folders,
			notes,
			selectedRef: notes[0]?.ref ?? null,
			openFolderRefs: new Set(topFolders),
			dirty: false,
		});
	},

	selectNote: (ref) => set({ selectedRef: ref }),

	toggleFolder: (ref) =>
		set((s) => {
			const next = new Set(s.openFolderRefs);
			if (next.has(ref)) {
				next.delete(ref);
			} else {
				next.add(ref);
			}
			return { openFolderRefs: next };
		}),

	updateNoteContent: (ref, richContent) =>
		set((s) => ({
			notes: s.notes.map((n) => (n.ref === ref ? { ...n, richContent } : n)),
			dirty: true,
		})),

	addNote: (name, parentRef) => {
		const ref = nextRef("note");
		set((s) => ({
			notes: [
				...s.notes,
				{ ref, name, parentRef, order: siblingOrder(s.notes, parentRef), richContent: [] },
			],
			selectedRef: ref,
			dirty: true,
		}));
	},

	addFolder: (name, parentRef) => {
		const ref = nextRef("folder");
		set((s) => ({
			folders: [
				...s.folders,
				{ ref, name, parentRef, order: siblingOrder(s.folders, parentRef) },
			],
			openFolderRefs: new Set([...s.openFolderRefs, ref]),
			dirty: true,
		}));
	},

	renameNote: (ref, name) =>
		set((s) => ({
			notes: s.notes.map((n) => (n.ref === ref ? { ...n, name } : n)),
			dirty: true,
		})),

	renameFolder: (ref, name) =>
		set((s) => ({
			folders: s.folders.map((f) => (f.ref === ref ? { ...f, name } : f)),
			dirty: true,
		})),

	deleteNote: (ref) =>
		set((s) => {
			const remaining = s.notes.filter((n) => n.ref !== ref);
			return {
				notes: remaining,
				selectedRef: s.selectedRef === ref ? (remaining[0]?.ref ?? null) : s.selectedRef,
				dirty: true,
			};
		}),

	deleteFolder: (ref) =>
		set((s) => {
			const orphanedNoteRefs = new Set(
				s.notes.filter((n) => n.parentRef === ref).map((n) => n.ref),
			);
			const remaining = s.notes.filter((n) => n.parentRef !== ref);
			return {
				folders: s.folders.filter((f) => f.ref !== ref),
				notes: remaining,
				selectedRef: orphanedNoteRefs.has(s.selectedRef ?? "")
					? (remaining[0]?.ref ?? null)
					: s.selectedRef,
				dirty: true,
			};
		}),

	setBundleName: (bundleName) => set({ bundleName, dirty: true }),

	markSaved: () => set({ dirty: false }),
}));
