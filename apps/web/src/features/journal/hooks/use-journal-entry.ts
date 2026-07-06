"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
type SaveStatus = "idle" | "saving" | "saved" | "error";
import {
	useCreateJournalEntry,
	useDeleteJournalEntry,
	useJournalEntries,
	useUpdateJournalEntry,
} from "./use-journal-entries";
import { useCreateJournalTag, useJournalTags } from "./use-journal-tags";
import { useLazyRef } from "@/shared/lib/use-lazy-ref";
import { TAG_COLORS, type JournalEntry, type MoodLevel } from "../types";

const CONTENT_SAVE_DEBOUNCE_MS = 650;
const SAVED_BADGE_DURATION_MS = 1600;

type JournalEntrySnapshot = {
	dateKey: string;
	entryId: string | null;
	content: string;
};

function normalizeTagName(tagName: string): string {
	return tagName.trim().toLowerCase();
}

function uniqueTags(tagNames: string[]): string[] {
	return [...new Set(tagNames.map(normalizeTagName))];
}

export function shouldAdoptJournalEntrySnapshot(
	previous: JournalEntrySnapshot | null,
	next: JournalEntrySnapshot,
	hasPendingLocalDraft: boolean,
): boolean {
	if (!previous || previous.dateKey !== next.dateKey) {
		return true;
	}

	return !hasPendingLocalDraft;
}

export function isCurrentJournalDraftAcknowledgement(
	activeDateKey: string,
	saveDateKey: string,
	saveRevision: number,
	currentRevision: number,
): boolean {
	return activeDateKey === saveDateKey && saveRevision === currentRevision;
}

export type JournalEntryController = {
	content: string;
	setContent: (newContent: string) => void;
	entry: JournalEntry | undefined;
	tags: ReturnType<typeof useJournalTags>["data"];
	wordCount: number;
	saveState: SaveStatus;
	handleMoodSelect: (mood: MoodLevel) => void;
	handleAddTag: (tagName: string, color?: string) => void;
	handleRemoveTag: (tagName: string) => void;
	handleDeleteEntry: () => void;
};

export function useJournalEntry(selectedDate: Date): JournalEntryController {
	const dateKey = format(selectedDate, "yyyy-MM-dd");
	const { data: entries = [] } = useJournalEntries();
	const tagsQuery = useJournalTags();
	const createEntryMutation = useCreateJournalEntry();
	const updateEntryMutation = useUpdateJournalEntry();
	const deleteEntryMutation = useDeleteJournalEntry();
	const createTagMutation = useCreateJournalTag();

	const entry = useMemo(
		() => entries.find((item) => item.dateKey === dateKey),
		[dateKey, entries],
	);

	const [content, setContent] = useState(entry?.content ?? "");
	const [saveState, setSaveState] = useState<SaveStatus>("idle");
	const activeDateKeyRef = useRef(dateKey);
	const entrySnapshotRef = useRef<JournalEntrySnapshot | null>(null);
	const draftRevisionRef = useRef(0);
	const acknowledgedRevisionRef = useRef(0);
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const saveStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingEntryIdRef = useRef<string | null>(null);
	const persistQueueRef = useLazyRef<Promise<void>>(() => Promise.resolve());

	const setDraftContent = useCallback((nextContent: string) => {
		setContent(nextContent);
	}, []);

	const hasPendingLocalDraft = useCallback(
		() => draftRevisionRef.current !== acknowledgedRevisionRef.current,
		[],
	);

	const clearPendingSave = useCallback(() => {
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
			saveTimeoutRef.current = null;
		}
	}, []);

	const clearSaveStatusReset = useCallback(() => {
		if (saveStatusTimeoutRef.current) {
			clearTimeout(saveStatusTimeoutRef.current);
			saveStatusTimeoutRef.current = null;
		}
	}, []);

	const markSaving = useCallback(() => {
		clearSaveStatusReset();
		setSaveState("saving");
	}, [clearSaveStatusReset]);

	const markSaved = useCallback(() => {
		clearSaveStatusReset();
		setSaveState("saved");
		saveStatusTimeoutRef.current = setTimeout(() => {
			setSaveState("idle");
			saveStatusTimeoutRef.current = null;
		}, SAVED_BADGE_DURATION_MS);
	}, [clearSaveStatusReset]);

	const markError = useCallback(() => {
		clearSaveStatusReset();
		setSaveState("error");
	}, [clearSaveStatusReset]);

	useEffect(() => {
		const nextSnapshot = {
			dateKey,
			entryId: entry?.id ?? null,
			content: entry?.content ?? "",
		};
		const dateChanged = activeDateKeyRef.current !== dateKey;

		if (dateChanged) {
			activeDateKeyRef.current = dateKey;
			entrySnapshotRef.current = nextSnapshot;
			pendingEntryIdRef.current = entry?.id ?? null;
			draftRevisionRef.current = 0;
			acknowledgedRevisionRef.current = 0;
			setDraftContent(nextSnapshot.content);
			clearPendingSave();
			clearSaveStatusReset();
			setSaveState("idle");
			return;
		}

		if (entry?.id) {
			pendingEntryIdRef.current = entry.id;
		}

		if (
			shouldAdoptJournalEntrySnapshot(
				entrySnapshotRef.current,
				nextSnapshot,
				hasPendingLocalDraft(),
			)
		) {
			setDraftContent(nextSnapshot.content);
		}

		entrySnapshotRef.current = nextSnapshot;
	}, [
		clearPendingSave,
		clearSaveStatusReset,
		dateKey,
		entry?.content,
		entry?.id,
		hasPendingLocalDraft,
		setDraftContent,
	]);

	useEffect(
		() => () => {
			clearPendingSave();
			clearSaveStatusReset();
		},
		[clearPendingSave, clearSaveStatusReset],
	);

	const ensureTag = useCallback(
		async (tagName: string, color?: string) => {
			const normalizedTag = normalizeTagName(tagName);
			const existingTag = (tagsQuery.data ?? []).find((tag) => tag.name === normalizedTag);

			if (!existingTag) {
				await createTagMutation.mutateAsync({
					name: normalizedTag,
					color: color ?? TAG_COLORS[0],
				});
			}

			return normalizedTag;
		},
		[createTagMutation, tagsQuery.data],
	);

	const persistEntry = useCallback(
		(draft: {
			content: string;
			tags?: string[];
			mood?: MoodLevel | null;
			revision?: number;
		}) => {
			const saveDateKey = dateKey;
			const saveRevision = draft.revision ?? draftRevisionRef.current;
			const currentEntry = entry;

			const task = persistQueueRef.current
				.catch((err) => {
					console.error("[persistJournalEntry] Previous persist failed:", err);
				})
				.then(async () => {
					const nextTags = uniqueTags(draft.tags ?? currentEntry?.tags ?? []);
					const nextMood =
						draft.mood === undefined
							? (currentEntry?.mood ?? undefined)
							: (draft.mood ?? null);
					const shouldPersist =
						Boolean(currentEntry) ||
						draft.content.trim().length > 0 ||
						nextTags.length > 0 ||
						nextMood !== null;

					if (!shouldPersist) {
						if (
							isCurrentJournalDraftAcknowledgement(
								activeDateKeyRef.current,
								saveDateKey,
								saveRevision,
								draftRevisionRef.current,
							)
						) {
							acknowledgedRevisionRef.current = saveRevision;
							setSaveState("idle");
						}
						return;
					}

					markSaving();

					try {
						if (currentEntry?.id) {
							await updateEntryMutation.mutateAsync({
								id: currentEntry.id,
								content: draft.content,
								tags: nextTags,
								mood: nextMood,
							});
						} else {
							const optimisticId = pendingEntryIdRef.current ?? crypto.randomUUID();
							pendingEntryIdRef.current = optimisticId;

							await createEntryMutation.mutateAsync({
								id: optimisticId,
								dateKey,
								content: draft.content,
								tags: nextTags,
								mood: nextMood ?? undefined,
							});
						}

						if (
							isCurrentJournalDraftAcknowledgement(
								activeDateKeyRef.current,
								saveDateKey,
								saveRevision,
								draftRevisionRef.current,
							)
						) {
							acknowledgedRevisionRef.current = saveRevision;
							markSaved();
						}
					} catch {
						if (
							isCurrentJournalDraftAcknowledgement(
								activeDateKeyRef.current,
								saveDateKey,
								saveRevision,
								draftRevisionRef.current,
							)
						) {
							markError();
						}
					}
				});

			persistQueueRef.current = task.catch((err) => {
				console.error("[persistJournalEntry] Task failed:", err);
			});
			return task;
		},
		[
			createEntryMutation,
			dateKey,
			entry,
			markError,
			markSaved,
			markSaving,
			updateEntryMutation,
		],
	);

	const schedulePersist = useCallback(
		(nextContent: string, revision: number) => {
			clearPendingSave();
			saveTimeoutRef.current = setTimeout(() => {
				void persistEntry({ content: nextContent, revision });
			}, CONTENT_SAVE_DEBOUNCE_MS);
		},
		[clearPendingSave, persistEntry],
	);

	const handleContentChange = useCallback(
		(newContent: string) => {
			const nextRevision = draftRevisionRef.current + 1;
			draftRevisionRef.current = nextRevision;
			setDraftContent(newContent);
			schedulePersist(newContent, nextRevision);
		},
		[schedulePersist, setDraftContent],
	);

	const handleMoodSelect = useCallback(
		(mood: MoodLevel) => {
			clearPendingSave();
			const nextMood = entry?.mood === mood ? null : mood;
			void persistEntry({ content, mood: nextMood });
		},
		[clearPendingSave, content, entry?.mood, persistEntry],
	);

	const handleAddTag = useCallback(
		(tagName: string, color?: string) => {
			clearPendingSave();

			void (async () => {
				const normalizedTag = await ensureTag(tagName, color);
				const nextTags = uniqueTags([...(entry?.tags ?? []), normalizedTag]);
				await persistEntry({ content, tags: nextTags });
			})();
		},
		[clearPendingSave, content, ensureTag, entry?.tags, persistEntry],
	);

	const handleRemoveTag = useCallback(
		(tagName: string) => {
			clearPendingSave();
			const normalizedTag = normalizeTagName(tagName);
			const nextTags = (entry?.tags ?? []).filter(
				(currentTag) => currentTag !== normalizedTag,
			);
			void persistEntry({ content, tags: nextTags });
		},
		[clearPendingSave, content, entry?.tags, persistEntry],
	);

	const handleDeleteEntry = useCallback(() => {
		clearPendingSave();
		clearSaveStatusReset();

		if (!entry?.id) {
			draftRevisionRef.current = 0;
			acknowledgedRevisionRef.current = 0;
			setDraftContent("");
			setSaveState("idle");
			return;
		}

		setSaveState("saving");
		void deleteEntryMutation
			.mutateAsync(entry.id)
			.then(() => {
				draftRevisionRef.current = 0;
				acknowledgedRevisionRef.current = 0;
				setDraftContent("");
				pendingEntryIdRef.current = null;
				setSaveState("idle");
			})
			.catch(() => {
				setSaveState("error");
			});
	}, [clearPendingSave, clearSaveStatusReset, deleteEntryMutation, entry?.id, setDraftContent]);

	const wordCount = useMemo(
		() => (content.trim() ? content.trim().split(/\s+/).length : 0),
		[content],
	);

	return {
		content,
		setContent: handleContentChange,
		entry,
		tags: tagsQuery.data,
		wordCount,
		saveState,
		handleMoodSelect,
		handleAddTag,
		handleRemoveTag,
		handleDeleteEntry,
	};
}
