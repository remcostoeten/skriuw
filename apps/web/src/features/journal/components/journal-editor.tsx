"use client";

import { useCallback, useState } from "react";
import { format, isToday, isYesterday, isTomorrow } from "date-fns";
import { X, Trash2, Type } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { colorWithAlpha } from "@/shared/lib/theme-colors";
import { MOOD_OPTIONS, type MoodLevel } from "@/features/journal/types";
import type { JournalEntryController } from "../hooks/use-journal-entry";
import type { JournalAiAction, JournalAiController } from "../hooks/use-journal-ai";
import dynamic from "next/dynamic";
import { PlainTextEditor } from "./plain-text-editor";
import { EditorContentSkeleton } from "@/features/editor/components/editor-content-skeleton";
import {
	AiWritingIndicator,
	type AiWritingAction,
} from "@/features/editor/components/ai-writing-indicator";
import { useNotes } from "@/features/notes/hooks/use-notes";
import { DevContextSubmenu } from "@/features/desktop/dev-context-menu";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import { copyTextToClipboard } from "@/features/desktop/context-menu-actions";
import {
	JournalAiErrorBanner,
	JournalAiRateLimitBanner,
	JournalSpellCheckRevertBanner,
} from "./journal-ai-banners";

// Lazy-load BlockNote/Mantine off the journal route's critical path (ssr:false),
// matching the notes editor's dynamic boundary in editor.tsx.
const RichTextEditor = dynamic(
	() =>
		import("@/features/editor/components/rich-text-editor").then((mod) => ({
			default: mod.RichTextEditor,
		})),
	{ ssr: false, loading: () => <EditorContentSkeleton /> },
);
import { usePreferencesStore } from "@/features/settings/store";
import { useJournalTags } from "../hooks/use-journal-tags";
import type { Person } from "@/domain/people/models";
import { useWorkspacePeople } from "@/features/people/hooks/use-people";
import { useCreatePerson } from "@/features/people/hooks/use-create-person";
import { noop } from "@/shared/lib/noop";

type JournalEditorProps = {
	selectedDate: Date;
	editorMode?: "plain" | "rich";
	entryState: JournalEntryController;
	aiState?: JournalAiController;
	onToggleEditorMode?: () => void;
	onGoToToday?: () => void;
	onBackToList?: () => void;
};

const EMPTY_PEOPLE: Person[] = [];

function formatDateHeading(date: Date): string {
	if (isToday(date)) return "Today";
	if (isYesterday(date)) return "Yesterday";
	if (isTomorrow(date)) return "Tomorrow";
	return format(date, "EEEE");
}

export function JournalEditor({
	selectedDate,
	editorMode = "rich",
	entryState,
	aiState,
	onToggleEditorMode,
	onGoToToday,
	onBackToList,
}: JournalEditorProps) {
	const editorPrefs = usePreferencesStore((s) => s.editor);
	const { data: files = [] } = useNotes();
	const {
		content,
		setContent,
		entry,
		wordCount,
		handleMoodSelect,
		handleAddTag,
		handleRemoveTag,
		handleDeleteEntry,
	} = entryState;
	const { data: allTags = [] } = useJournalTags();
	const peopleQuery = useWorkspacePeople();
	const people = peopleQuery.data ?? EMPTY_PEOPLE;
	const createPersonMutation = useCreatePerson();
	const handleCreatePerson = useCallback(
		async (name: string): Promise<Person | null> => {
			const trimmed = name.trim();
			if (!trimmed) return null;
			const existing = people.find(
				(person) => person.name.toLowerCase() === trimmed.toLowerCase(),
			);
			if (existing) return existing;
			try {
				return await createPersonMutation.mutateAsync({
					id: crypto.randomUUID(),
					name: trimmed,
				});
			} catch {
				noop();
				return null;
			}
		},
		[people, createPersonMutation],
	);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	const entryTags = entry?.tags ?? [];
	const entryMood = entry?.mood;

	const isAiAvailable = editorMode === "rich" && Boolean(aiState);
	const activeWritingAction: AiWritingAction | null = !aiState
		? null
		: ((Object.keys(aiState.aiLoading) as JournalAiAction[]).find(
				(action) => aiState.aiLoading[action],
			) ?? null);

	const getTagColor = (name: string): string => {
		const tag = allTags.find((t) => t.name === name);
		return tag?.color ?? "hsl(var(--project-blue))";
	};

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div className="flex flex-1 flex-col overflow-hidden">
					{isAiAvailable && aiState?.aiError && (
						<JournalAiErrorBanner
							error={aiState.aiError}
							onDismiss={aiState.dismissAiError}
						/>
					)}
					{isAiAvailable && aiState && aiState.spellCheckRevert !== null && (
						<JournalSpellCheckRevertBanner
							onRevert={aiState.revertSpellCheck}
							onKeep={aiState.dismissSpellCheckRevert}
						/>
					)}
					{isAiAvailable && aiState?.rateLimitPrompt && (
						<JournalAiRateLimitBanner
							prompt={aiState.rateLimitPrompt}
							availableKeysForFallback={aiState.availableKeysForFallback}
							onRetryWithKey={(keyId) =>
								aiState.runAiAction(
									aiState.rateLimitPrompt!.action,
									keyId,
									aiState.rateLimitPrompt!.exhaustedKeyIds,
								)
							}
							onDismiss={aiState.dismissRateLimit}
						/>
					)}
					<div className="flex-1 overflow-y-auto">
						<div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col px-5 pb-8 pt-9 sm:px-8 md:px-10 lg:max-w-[820px] lg:px-12 lg:pb-10 lg:pt-14">
							{/* Date heading */}
							<header className="border-b border-border/55 pb-5 md:pb-6">
								<div className="flex flex-wrap items-end justify-between gap-3">
									<div className="min-w-0">
										<h1 className="text-[34px] font-semibold leading-none tracking-tight text-foreground sm:text-[40px]">
											{formatDateHeading(selectedDate)}
										</h1>
										<p className="mt-2 text-[14px] text-muted-foreground/62">
											{format(selectedDate, "EEEE, MMMM d, yyyy")}
										</p>
									</div>

									{editorMode === "rich" && (
										<div className="flex h-8 items-center gap-2 border border-border/50 bg-background/35 px-2.5 text-[11px] text-muted-foreground/52">
											<Type className="h-3 w-3" strokeWidth={1.5} />
											<span>Rich text</span>
										</div>
									)}
								</div>

								{/* Mood selector row */}
								<div className="mt-6 grid gap-2 sm:grid-cols-[4.5rem_1fr] sm:items-center">
									<span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/42">
										Mood
									</span>
									<div className="flex flex-wrap items-center gap-1.5">
										{(
											Object.entries(MOOD_OPTIONS) as [
												MoodLevel,
												(typeof MOOD_OPTIONS)[MoodLevel],
											][]
										).map(([key, mood]) => (
											<button
												key={key}
												type="button"
												onClick={() => handleMoodSelect(key)}
												className={cn(
													"flex h-8 items-center gap-1.5 border border-transparent px-2.5 text-[12px] transition-colors",
													entryMood === key
														? "border-border bg-muted font-medium text-foreground shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)]"
														: "text-muted-foreground/54 hover:border-border hover:bg-muted/70 hover:text-muted-foreground",
												)}
												title={mood.label}
											>
												<span
													className={cn(
														"text-[13px]",
														entryMood === key && mood.color,
													)}
												>
													{mood.icon}
												</span>
												<span>{mood.label}</span>
											</button>
										))}
									</div>
								</div>

								{/* Tags row */}
								{entryTags.length > 0 && (
									<div className="mt-3 grid gap-2 sm:grid-cols-[4.5rem_1fr] sm:items-start">
										<span className="pt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/42">
											Tags
										</span>
										<div className="flex flex-wrap items-center gap-1.5">
											{entryTags.map((tagName) => (
												<span
													key={tagName}
													className="inline-flex items-center gap-1.5 border px-2.5 py-1 text-[11px] font-medium"
													style={{
														backgroundColor: colorWithAlpha(
															getTagColor(tagName),
															0.08,
														),
														color: getTagColor(tagName),
														borderColor: colorWithAlpha(
															getTagColor(tagName),
															0.21,
														),
													}}
												>
													@{tagName}
													<button
														type="button"
														onClick={() => handleRemoveTag(tagName)}
														className="border border-transparent p-0.5 transition-colors hover:border-current/20 hover:bg-foreground/10"
													>
														<X
															className="h-2.5 w-2.5"
															strokeWidth={2}
														/>
													</button>
												</span>
											))}
										</div>
									</div>
								)}
							</header>

							{/* Editor area */}
							<div className="journal-entry-editor relative min-h-[420px] flex-1 py-7 md:py-8">
								{editorMode === "plain" ? (
									<PlainTextEditor
										content={content}
										onChange={setContent}
										onInsertTag={handleAddTag}
										editorFontId={editorPrefs.defaultFont}
										editorLineHeight={editorPrefs.lineHeight}
									/>
								) : (
									<RichTextEditor
										content={content}
										files={files}
										people={people}
										onCreatePerson={handleCreatePerson}
										activeFileId={format(selectedDate, "yyyy-MM-dd")}
										editorFontId={editorPrefs.defaultFont}
										editorLineHeight={editorPrefs.lineHeight}
										onChange={(next) => setContent(next.markdown)}
										onEditorReady={aiState?.handleEditorReady}
										onAiSpellCheck={
											aiState
												? () => aiState.runAiAction("spellCheck")
												: undefined
										}
										onAiContinueWriting={
											aiState
												? () => aiState.runAiAction("continueWriting")
												: undefined
										}
										onAiAction={
											aiState
												? (action) =>
														aiState.runAiAction(
															action as JournalAiAction,
														)
												: undefined
										}
									/>
								)}
								{isAiAvailable && (
									<AiWritingIndicator action={activeWritingAction} />
								)}
							</div>

							{/* Footer */}
							<div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border/55 pt-4">
								<div className="flex items-center gap-3">
									<span className="text-[11px] text-muted-foreground/40">
										{wordCount} {wordCount === 1 ? "word" : "words"}
									</span>
									{content.trim() && (
										<span className="text-[11px] text-muted-foreground/30">
											auto-saved
										</span>
									)}
								</div>
								{entry && (
									<div className="relative">
										{showDeleteConfirm ? (
											<div className="flex items-center gap-2">
												<span className="text-[11px] text-destructive/70">
													Delete this entry?
												</span>
												<button
													type="button"
													onClick={() => {
														handleDeleteEntry();
														setShowDeleteConfirm(false);
													}}
													className="border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/20"
												>
													Delete
												</button>
												<button
													type="button"
													onClick={() => setShowDeleteConfirm(false)}
													className="border border-transparent px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-muted"
												>
													Cancel
												</button>
											</div>
										) : (
											<button
												type="button"
												onClick={() => setShowDeleteConfirm(true)}
												className="flex items-center gap-1 border border-transparent px-2 py-1 text-[11px] text-muted-foreground/40 transition-colors hover:border-border hover:bg-muted hover:text-destructive"
											>
												<Trash2 className="h-3 w-3" strokeWidth={1.5} />
												Delete
											</button>
										)}
									</div>
								)}
							</div>
						</div>
						<style>{`
						.journal-entry-editor .blocknote-wrapper {
							padding: 0;
						}

						.journal-entry-editor .blocknote-wrapper .bn-editor {
							max-width: none;
							margin: 0;
						}
					`}</style>
					</div>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent className="w-52">
				<ContextMenuItem
					onClick={() => copyTextToClipboard(format(selectedDate, "yyyy-MM-dd"))}
				>
					Copy date
				</ContextMenuItem>
				<ContextMenuItem
					disabled={!content.trim()}
					onClick={() => copyTextToClipboard(content)}
				>
					Copy entry
				</ContextMenuItem>
				{onToggleEditorMode || onGoToToday || onBackToList ? (
					<ContextMenuSeparator />
				) : null}
				{onToggleEditorMode ? (
					<ContextMenuItem onClick={onToggleEditorMode}>
						{editorMode === "plain" ? "Switch to rich text" : "Switch to plain text"}
					</ContextMenuItem>
				) : null}
				{onGoToToday ? (
					<ContextMenuItem onClick={onGoToToday}>Go to today</ContextMenuItem>
				) : null}
				{onBackToList ? (
					<ContextMenuItem onClick={onBackToList}>Show all entries</ContextMenuItem>
				) : null}
				{isAiAvailable && aiState ? (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem
							disabled={aiState.aiLoading.spellCheck}
							onClick={() => aiState.runAiAction("spellCheck")}
						>
							Spell check
						</ContextMenuItem>
						<ContextMenuItem
							disabled={aiState.aiLoading.continueWriting}
							onClick={() => aiState.runAiAction("continueWriting")}
						>
							Continue writing
						</ContextMenuItem>
						<ContextMenuItem
							disabled={aiState.aiLoading.summarize}
							onClick={() => aiState.runAiAction("summarize")}
						>
							Summarize
						</ContextMenuItem>
						<ContextMenuItem
							disabled={aiState.aiLoading.extractTasks}
							onClick={() => aiState.runAiAction("extractTasks")}
						>
							Extract tasks
						</ContextMenuItem>
					</>
				) : null}
				{entry ? (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem
							className="text-destructive focus:text-destructive"
							onClick={() => setShowDeleteConfirm(true)}
						>
							Delete entry
						</ContextMenuItem>
					</>
				) : null}
				<ContextMenuSeparator />
				<DevContextSubmenu />
			</ContextMenuContent>
		</ContextMenu>
	);
}
