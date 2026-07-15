"use client";

/* eslint-disable react-doctor/no-giant-component, react-doctor/exhaustive-deps, react-doctor/no-static-element-interactions */
/* eslint-disable */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { AnimatePresence, domAnimation, LazyMotion, m, useReducedMotion } from "framer-motion";
import {
	LinkToolbarController,
	SuggestionMenuController,
	useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { Clipboard, Copy, Scissors } from "lucide-react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import { noop } from "@/shared/lib/noop";
import { useLazyRef } from "@/shared/lib/use-lazy-ref";
import { FAST_SWAP_TRANSITION, pickTransition } from "@/shared/lib/motion";
import { getEditorFontFamily, type EditorFontId } from "@/shared/lib/editor-fonts";
import {
	getEditorLineHeightValue,
	type EditorLineHeight,
} from "@/features/editor/lib/editor-line-height";
import type { NoteFile, RichTextDocument } from "@/types/notes";
import type { NoteProperty } from "@/domain/notes/properties";
import { getWorkspaceTagNames } from "@/domain/tags/workspace-tags";
import { useJournalEntries } from "@/features/journal/hooks/use-journal-entries";
import { useNoteLinkActions } from "@/features/editor/hooks/use-note-link-actions";
import {
	cloneRichDocument,
	resolveRichDocument,
	richDocumentKey,
	upgradeRichDocumentChips,
} from "@/domain/notes/rich-document";
import type { AiAction, AiEditorHandle } from "@/features/ai/service";
import { usePreferencesStore } from "@/features/settings/store";
import { markCollabActivity } from "@/features/collaboration/lib/collab-activity";
import { useAnchoredMarks } from "@/features/collaboration/anchored-marks/react/use-anchored-marks";
import type { VimMode } from "@/features/editor/lib/vim-plugin";
import { useEditorDom, type EditorInstance } from "@/features/editor/lib/editor-instance";
import { blocksToMarkdown } from "@/features/editor/lib/editor-serialization";
import {
	getCustomSlashMenuItems,
	getNoteMentionMenuItems,
	getPersonMentionMenuItems,
	getTagMenuItems,
} from "@/features/editor/lib/suggestion-items";
import { useAiEditorHandle } from "@/features/editor/hooks/use-ai-editor-handle";
import { useEditorPlugins } from "@/features/editor/hooks/use-editor-plugins";
import { useResolveVaultAssetImages } from "@/features/editor/hooks/use-resolve-vault-asset-images";
import { compressCoverImage } from "@/features/notes/lib/note-cover-image";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { useEditorSearch } from "@/features/editor/hooks/use-editor-search";
import { useSelectionReporter } from "@/features/editor/hooks/use-selection-reporter";
import { useTitleCommit } from "@/features/editor/hooks/use-title-commit";
import { SearchWidget } from "./search-widget";
import { NotePropertiesShelf } from "./note-properties/note-properties-shelf";
import { editorSchema } from "./inline-specs/schema";
import { EDITOR_STYLES } from "./editor-styles";
import { NoteLinkProvider } from "./inline-specs/note-link-context";
import { PeopleProvider } from "./inline-specs/people-context";
import { KeyboardAccessibleSlashMenu } from "./keyboard-accessible-slash-menu";
import { CustomLinkToolbar } from "./custom-link-toolbar";
import { CustomPromptWidget, SelectionBubbleMenu } from "./selection-bubble-menu";
import type { Person } from "@/domain/people/models";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";

// Real-time collaboration wiring. When present, the Yjs document is the source
// of truth: the editor binds to the shared fragment instead of `initialContent`,
// the prop-driven content-sync effect is disabled, and (for the owner only) the
// empty room is seeded once from the note's pre-collaboration content.
export type TRichTextCollab = {
	doc: Y.Doc;
	fragment: Y.XmlFragment;
	awareness: Awareness | null;
	user: { name: string; color: string };
	/** Only the owner seeds, so two clients never both populate the room. */
	shouldSeed: boolean;
};

type RichTextEditorProps = {
	content: string;
	richContent?: RichTextDocument;
	files?: NoteFile[];
	people?: Person[];
	onCreatePerson?: (name: string) => Promise<Person | null>;
	activeFileId?: string;
	editorFontId: EditorFontId;
	editorLineHeight: EditorLineHeight;
	properties?: NoteProperty[];
	icon?: string;
	cover?: string;
	readOnly?: boolean;
	onChange: (next: { markdown: string; richContent: RichTextDocument }) => void;
	onPropertiesChange?: (properties: NoteProperty[]) => void;
	onIconChange?: (icon: string) => void;
	onCoverChange?: (cover: string) => void;
	onEditorReady?: (handle: AiEditorHandle) => void;
	onBlockEditorReady?: (editor: EditorInstance | null) => void;
	onAiSpellCheck?: () => void;
	onAiContinueWriting?: () => void;
	onAiAction?: (action: AiAction) => void;
	onAiCustomPrompt?: (instruction: string) => void;
	onTitleCommit?: (title: string) => void;
	onBlur?: () => void;
	onCursorChange?: (position: {
		line: number;
		column: number;
		selection?: { words: number; characters: number };
	}) => void;
	onVimModeChange?: (mode: VimMode | null) => void;
	isMobile?: boolean;
	collab?: TRichTextCollab;
};

const EMPTY_FILES: NoteFile[] = [];
const EMPTY_PEOPLE: Person[] = [];
const EMPTY_PROPERTIES: NoteProperty[] = [];

function RichTextEditorImpl({
	content,
	richContent,
	files = EMPTY_FILES,
	people = EMPTY_PEOPLE,
	onCreatePerson,
	activeFileId,
	editorFontId,
	editorLineHeight,
	properties = EMPTY_PROPERTIES,
	icon,
	cover,
	readOnly = false,
	onChange,
	onPropertiesChange,
	onIconChange,
	onCoverChange,
	onEditorReady,
	onBlockEditorReady,
	onAiSpellCheck,
	onAiContinueWriting,
	onAiAction,
	onAiCustomPrompt,
	onTitleCommit,
	onBlur,
	onCursorChange,
	onVimModeChange,
	isMobile = false,
	collab,
}: RichTextEditorProps) {
	const appTheme = usePreferencesStore((state) => state.appearance.theme);
	const blockNoteTheme =
		appTheme === "paper" || appTheme === "rose-pine-dawn" || appTheme === "catppuccin-latte"
			? "light"
			: "dark";
	const lastContentRef = useRef(content);
	const lastRichContentRef = useLazyRef<string>(() => richDocumentKey(richContent));
	const pendingMarkdownRef = useRef(content);
	const pendingRichContentRef = useLazyRef<RichTextDocument>(() =>
		upgradeRichDocumentChips(resolveRichDocument(content, richContent)),
	);
	const isInternalChangeRef = useRef(false);
	// True while the caret is inside this editor. When the same note is open in a
	// second split pane, typing in one pane rewrites the shared detail cache,
	// which pushes a new `content` prop into the *other* pane — without this guard
	// its prop-sync effect would `replaceBlocks` and yank the caret/selection out
	// from under an actively-editing user. A focused editor's live document is
	// authoritative; external content updates apply only while it's unfocused.
	const isFocusedRef = useRef(false);
	const hasNormalizedInitialContentRef = useRef(false);
	const activeFileIdRef = useRef(activeFileId);
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const serializeRunIdRef = useRef(0);
	const wrapperRef = useRef<HTMLDivElement>(null);

	const initialBlocks = useMemo(() => {
		const base = resolveRichDocument(content, richContent);
		return upgradeRichDocumentChips(base);
	}, []);

	const backend = useWorkspaceBackend();
	// Read once at creation, same as the rest of this options object — BlockNote
	// never re-reads `uploadFile` after the editor is built. Absent (guest mode,
	// no durable storage) disables drag/drop + clipboard-paste image uploads;
	// users can still embed images by URL.
	const uploadFile = backend.uploadCoverImage
		? async (file: File) => {
				const compressed = await compressCoverImage(file);
				return backend.uploadCoverImage!(compressed);
			}
		: undefined;

	// When collaborating, content comes from the shared Yjs fragment — passing
	// `initialContent` alongside `collaboration` is invalid and would duplicate
	// the document. `collab` is fixed for this editor's lifetime (the parent keys
	// the editor by collab presence + note id, remounting when the room binding
	// attaches or detaches), so reading it once at creation is correct.
	const editor = useCreateBlockNote(
		collab
			? {
					schema: editorSchema,
					uploadFile,
					collaboration: {
						fragment: collab.fragment,
						user: collab.user,
						provider: { awareness: collab.awareness ?? undefined },
						showCursorLabels: "always",
					},
				}
			: {
					schema: editorSchema,
					uploadFile,
					initialContent: initialBlocks,
				},
	);
	useEffect(() => {
		onBlockEditorReady?.(editor);
		return () => onBlockEditorReady?.(null);
	}, [editor, onBlockEditorReady]);
	// Only syncs checklist items already promoted to a task (block.props.taskId
	// set via the checklist item's "Convert to task" action). Promotion itself
	// is opt-in — every checkbox in a note is not a task by default.
	const reconcileChecklistTasks = useCallback(
		async (document: RichTextDocument) => {
			if (!backend.capabilities.tasks || !backend.updateTask) return;
			const blocks: any[] = [];
			const visit = (items: any[]) => {
				for (const block of items) {
					if (block.type === "checkListItem" && block.props?.taskId) blocks.push(block);
					if (Array.isArray(block.children)) visit(block.children);
				}
			};
			visit(document as any[]);
			await Promise.all(
				blocks.map((block) => {
					const title = Array.isArray(block.content)
						? block.content
								.map((node: any) => node.text ?? "")
								.join("")
								.trim()
						: "";
					if (!title) return;
					return backend.updateTask?.({
						id: block.props.taskId,
						title,
						status: block.props.checked ? "done" : "todo",
					});
				}),
			);
		},
		[backend],
	);
	const editorDom = useEditorDom(editor);
	useResolveVaultAssetImages(editorDom);
	const vimModeEnabled = usePreferencesStore((state) => state.editor.vimMode);
	const effectiveVimModeEnabled = vimModeEnabled && !isMobile;
	const [vimCommand, setVimCommand] = useState<string | null>(null);
	const [customPromptOpen, setCustomPromptOpen] = useState(false);
	const prefersReducedMotion = useReducedMotion() ?? false;
	const searchWidgetTransition = pickTransition(prefersReducedMotion, FAST_SWAP_TRANSITION);
	const { data: journalEntries } = useJournalEntries();
	const workspaceTags = useMemo(
		() => getWorkspaceTagNames(files, journalEntries ?? []),
		[files, journalEntries],
	);
	const { createAndOpenNote, openNote } = useNoteLinkActions(files);

	// Anchored comments live alongside the document in the same Yjs room; the
	// engine only attaches on collaborative notes and tears down otherwise.
	const { addComment } = useAnchoredMarks(editor, collab ?? null);

	const search = useEditorSearch(editor);

	const router = useRouter();
	const handleOpenPerson = useCallback(
		(id: string) => {
			router.push(`/app/people/${id}`);
		},
		[router],
	);
	const handleOpenTag = useCallback(
		(name: string) => {
			router.push(`/app/tags/${encodeURIComponent(name)}`);
		},
		[router],
	);

	useEditorPlugins({
		editor,
		readOnly,
		vimModeEnabled: effectiveVimModeEnabled,
		onVimModeChange,
		setVimCommand,
		onOpenNoteLink: createAndOpenNote,
		onOpenPerson: handleOpenPerson,
		onOpenTag: handleOpenTag,
	});

	const handleCreateNoteFromMention = useCallback(
		(title: string) => {
			createAndOpenNote(title);
		},
		[createAndOpenNote],
	);
	const slashMenuItems = useMemo(
		() =>
			getCustomSlashMenuItems(
				editor,
				onAiSpellCheck,
				onAiContinueWriting,
				onAiAction,
				onAiCustomPrompt ? () => setCustomPromptOpen(true) : undefined,
			),
		[editor, onAiSpellCheck, onAiContinueWriting, onAiAction, onAiCustomPrompt],
	);
	const getSlashMenuItems = useCallback(
		async (query: string) => filterSuggestionItems(slashMenuItems, query),
		[slashMenuItems],
	);

	useEffect(() => {
		const domElement = editorDom;
		if (!domElement) return;

		const handleInternalLinkClick = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) return;

			const anchor = target.closest<HTMLAnchorElement>('a[href^="note://"]');
			if (!anchor) return;

			const noteId = anchor.getAttribute("href")?.replace(/^note:\/\//, "");
			if (!noteId) return;

			event.preventDefault();
			event.stopPropagation();
			openNote(noteId);
		};

		domElement.addEventListener("click", handleInternalLinkClick);
		return () => domElement.removeEventListener("click", handleInternalLinkClick);
	}, [editorDom, openNote]);

	useTitleCommit({ editor, editorDom, onTitleCommit });
	useSelectionReporter({ editorDom, wrapperRef, onCursorChange });
	useAiEditorHandle({ editor, onEditorReady, wrapperRef });

	// Radix's context menu moves focus into its portal, which collapses the
	// browser selection the native Cut/Copy/Paste commands need. Snapshot the
	// range when the menu opens (still synchronous with the contextmenu event)
	// and restore it onto the editor right before issuing the command.
	const savedSelectionRangeRef = useRef<Range | null>(null);
	const [hasSelectionForContextMenu, setHasSelectionForContextMenu] = useState(false);

	const handleContextMenuOpenChange = useCallback((open: boolean) => {
		if (!open) return;
		const selection = window.getSelection();
		if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
			savedSelectionRangeRef.current = selection.getRangeAt(0).cloneRange();
			setHasSelectionForContextMenu(true);
		} else {
			savedSelectionRangeRef.current = null;
			setHasSelectionForContextMenu(false);
		}
	}, []);

	const restoreEditorSelection = useCallback(() => {
		const editableElement = wrapperRef.current?.querySelector<HTMLElement>(
			'[contenteditable="true"]',
		);
		if (!editableElement) return false;
		editableElement.focus();
		const range = savedSelectionRangeRef.current;
		if (range) {
			const selection = window.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
		}
		return true;
	}, []);

	const handleCopySelection = useCallback(() => {
		if (!restoreEditorSelection()) return;
		document.execCommand("copy");
	}, [restoreEditorSelection]);

	const handleCutSelection = useCallback(() => {
		if (readOnly || !restoreEditorSelection()) return;
		document.execCommand("cut");
	}, [readOnly, restoreEditorSelection]);

	const handlePasteSelection = useCallback(() => {
		if (readOnly) return;
		restoreEditorSelection();
		if (document.execCommand("paste")) return;
		navigator.clipboard
			?.readText()
			.then((text) => {
				document.execCommand("insertText", false, text);
			})
			.catch(noop);
	}, [readOnly, restoreEditorSelection]);

	// Serializes the live editor document and commits it via onChange when it
	// actually differs from the last committed snapshot. The expensive work
	// (markdown serialization + deep clone + JSON.stringify) runs here only —
	// once per debounce settle / flush — never on every keystroke.
	const serializeAndCommit = useCallback(async () => {
		if (!editor) return;
		// Viewers never persist: their edits are blocked client-side (read-only)
		// and server-side; saving would only generate rejected writes on every
		// remote collaboration update they receive.
		if (readOnly) return;

		const runId = ++serializeRunIdRef.current;
		const markdown = await blocksToMarkdown(editor);
		if (runId !== serializeRunIdRef.current) {
			return;
		}

		const nextRichContent = cloneRichDocument(editor.document);
		const nextRichContentKey = richDocumentKey(nextRichContent);

		pendingMarkdownRef.current = markdown;
		pendingRichContentRef.current = nextRichContent;

		// First change after mount / note switch only normalizes the snapshot
		// so we don't echo the parsed-on-load document straight back as an edit.
		if (!hasNormalizedInitialContentRef.current) {
			hasNormalizedInitialContentRef.current = true;
			lastContentRef.current = markdown;
			lastRichContentRef.current = nextRichContentKey;
			return;
		}

		if (
			markdown === lastContentRef.current &&
			nextRichContentKey === lastRichContentRef.current
		) {
			return;
		}

		isInternalChangeRef.current = true;
		lastContentRef.current = markdown;
		lastRichContentRef.current = nextRichContentKey;
		onChange({ markdown, richContent: nextRichContent });
		void reconcileChecklistTasks(nextRichContent);

		window.setTimeout(() => {
			isInternalChangeRef.current = false;
		}, 80);
	}, [editor, onChange, readOnly, reconcileChecklistTasks]);

	// Per-keystroke handler: cheap. It only re-arms the debounce timer; no
	// serialization, cloning, or stringify happens here.
	const handleEditorChange = useCallback(() => {
		if (!editor) return;

		// Broadcast live "typing" presence to other peers, then fall back to a
		// plain active stamp once keystrokes pause. Cheap awareness writes; the
		// expensive serialization stays behind the save debounce below.
		if (collab?.awareness) {
			markCollabActivity(collab.awareness, true);
			if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
			typingTimeoutRef.current = setTimeout(() => {
				typingTimeoutRef.current = null;
				markCollabActivity(collab.awareness, false);
			}, 1800);
		}

		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
		}

		saveTimeoutRef.current = setTimeout(() => {
			saveTimeoutRef.current = null;
			void serializeAndCommit();
		}, 180);
	}, [editor, serializeAndCommit, collab]);

	const flushPendingEditorChange = useCallback(() => {
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
			saveTimeoutRef.current = null;
		}

		void serializeAndCommit();
	}, [serializeAndCommit]);

	// Seed a freshly-collaborative note exactly once, from the first writer's
	// client, using the content it had before collaboration was enabled. Runs
	// only after the room has synced (the parent gates `collab` on `synced`), so
	// `fragment.length` reflects the room's real state.
	//
	// Two guards make this safe to run from any writer (not just the owner):
	//   - `meta.seeded` — set once in the shared doc; survives persistence.
	//   - `fragment.length > 0` — the room already has content (typed by a peer,
	//     or restored from server persistence). The CRDT is authoritative; we
	//     must never `replaceBlocks` over it or we'd wipe live edits.
	// The residual race — two writers seeding within one sync tick — merges
	// rather than loses content, acceptable for a first share.
	useEffect(() => {
		if (!collab || !collab.shouldSeed) return;
		const meta = collab.doc.getMap<boolean>("meta");
		if (meta.get("seeded") || collab.fragment.length > 0) return;
		if (initialBlocks.length === 0) return;
		collab.doc.transact(() => {
			meta.set("seeded", true);
		});
		// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
		editor.replaceBlocks(editor.document, initialBlocks as any);
	}, [collab, editor, initialBlocks]);

	useEffect(() => {
		// In collaboration mode the Yjs fragment is authoritative; pushing the
		// `content` prop back into the editor would fight the CRDT and clobber
		// remote edits. The shared doc handles all content updates.
		if (collab) return;
		if (!editor || isInternalChangeRef.current || isFocusedRef.current) return;
		const baseRichContent = resolveRichDocument(content, richContent);
		const nextRichContent = upgradeRichDocumentChips(baseRichContent);
		const nextRichContentKey = richDocumentKey(nextRichContent);
		if (
			content !== lastContentRef.current ||
			nextRichContentKey !== lastRichContentRef.current
		) {
			if (activeFileIdRef.current !== activeFileId) {
				hasNormalizedInitialContentRef.current = false;
				activeFileIdRef.current = activeFileId;
			}
			// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
			editor.replaceBlocks(editor.document, nextRichContent as any);
			lastContentRef.current = content;
			lastRichContentRef.current = nextRichContentKey;
			pendingMarkdownRef.current = content;
			pendingRichContentRef.current = nextRichContent;
		}
	}, [activeFileId, content, editor, richContent, collab]);

	useEffect(() => {
		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
			if (typingTimeoutRef.current) {
				clearTimeout(typingTimeoutRef.current);
			}
		};
	}, []);

	return (
		<LazyMotion features={domAnimation} strict>
			<ContextMenu onOpenChange={handleContextMenuOpenChange}>
				<ContextMenuTrigger asChild>
					<div
						ref={wrapperRef}
						onFocus={() => {
							isFocusedRef.current = true;
						}}
						onMouseDown={(event) => {
							const target = event.target;
							if (!(target instanceof HTMLElement)) return;
							if (!target.closest(".bn-toolbar")) return;
							// Text inputs (link URL field, comment textarea) must receive focus,
							// so don't swallow their mousedown.
							if (target.closest("input, textarea, [contenteditable='true']")) return;
							// Mantine's toolbar buttons don't preventDefault on mousedown, so a
							// real mouse press on a control collapses the editor's text selection —
							// the formatting command then applies to nothing and the
							// selection-anchored toolbar dismisses.
							event.preventDefault();
						}}
						onBlur={(event) => {
							const nextFocusedElement = event.relatedTarget;
							if (
								nextFocusedElement instanceof Node &&
								event.currentTarget.contains(nextFocusedElement)
							) {
								return;
							}
							isFocusedRef.current = false;
							flushPendingEditorChange();
							onBlur?.();
						}}
						className="blocknote-wrapper relative h-full min-h-full px-6 py-3"
						style={
							{
								"--bn-font-family": getEditorFontFamily(editorFontId),
								"--skriuw-editor-line-height":
									getEditorLineHeightValue(editorLineHeight),
							} as CSSProperties
						}
					>
						<AnimatePresence>
							{search.searchOpen ? (
								<m.div
									className="absolute top-3 right-4 z-40 origin-top-right"
									initial={
										prefersReducedMotion
											? { opacity: 0 }
											: { opacity: 0, y: -6, scale: 0.98 }
									}
									animate={
										prefersReducedMotion
											? { opacity: 1 }
											: { opacity: 1, y: 0, scale: 1 }
									}
									exit={
										prefersReducedMotion
											? { opacity: 0 }
											: { opacity: 0, y: -4, scale: 0.98 }
									}
									transition={searchWidgetTransition}
								>
									<SearchWidget
										ref={search.findInputRef}
										query={search.searchQuery}
										onQueryChange={search.setSearchQuery}
										replaceValue={search.replaceValue}
										onReplaceChange={search.setReplaceValue}
										showReplace={search.showReplace}
										onToggleReplace={() =>
											search.setShowReplace((value) => !value)
										}
										options={search.searchOptions}
										onToggleOption={search.toggleSearchOption}
										current={search.matchInfo.current}
										total={search.matchInfo.total}
										regexError={search.regexError}
										onNext={search.handleNextMatch}
										onPrevious={search.handlePreviousMatch}
										onClose={search.closeSearch}
										onReplaceCurrent={search.handleReplaceCurrent}
										onReplaceAll={search.handleReplaceAll}
									/>
								</m.div>
							) : null}
						</AnimatePresence>
						{onPropertiesChange ? (
							<NotePropertiesShelf
								properties={properties}
								readOnly={readOnly}
								onChange={onPropertiesChange}
								icon={icon}
								cover={cover}
								isMobile={isMobile}
								onIconChange={onIconChange}
								onCoverChange={onCoverChange}
							/>
						) : null}
						<NoteLinkProvider files={files} activeFileId={activeFileId}>
							<PeopleProvider people={people}>
								<BlockNoteView
									editor={editor}
									editable={!readOnly}
									onChange={handleEditorChange}
									theme={blockNoteTheme}
									className="h-full"
									formattingToolbar={false}
									linkToolbar={false}
									slashMenu={false}
								>
									<LinkToolbarController
										linkToolbar={(props) => (
											<CustomLinkToolbar
												{...props}
												files={files}
												activeFileId={activeFileId}
											/>
										)}
									/>
									<SuggestionMenuController
										triggerCharacter="/"
										suggestionMenuComponent={KeyboardAccessibleSlashMenu}
										getItems={getSlashMenuItems}
									/>
									<SuggestionMenuController
										triggerCharacter="@"
										suggestionMenuComponent={KeyboardAccessibleSlashMenu}
										getItems={async (query) =>
											getNoteMentionMenuItems(
												editor,
												files,
												activeFileId,
												query,
												handleCreateNoteFromMention,
											)
										}
									/>
									<SuggestionMenuController
										triggerCharacter="#"
										suggestionMenuComponent={KeyboardAccessibleSlashMenu}
										getItems={async (query) =>
											getTagMenuItems(editor, workspaceTags, query)
										}
									/>
									<SuggestionMenuController
										triggerCharacter="$"
										suggestionMenuComponent={KeyboardAccessibleSlashMenu}
										getItems={async (query) =>
											getPersonMentionMenuItems(
												editor,
												people,
												query,
												onCreatePerson,
											)
										}
									/>
									<SelectionBubbleMenu
										editor={editor}
										files={files}
										activeFileId={activeFileId}
										onAddComment={collab ? addComment : undefined}
										onAiSpellCheck={onAiSpellCheck}
										onAiContinueWriting={onAiContinueWriting}
										onAiAction={onAiAction}
										onOpenCustomPrompt={
											onAiCustomPrompt
												? () => setCustomPromptOpen(true)
												: undefined
										}
									/>
								</BlockNoteView>
							</PeopleProvider>
						</NoteLinkProvider>
						<AnimatePresence>
							{customPromptOpen ? (
								<m.div
									className="absolute inset-x-0 top-3 z-40 flex justify-center"
									initial={
										prefersReducedMotion
											? { opacity: 0 }
											: { opacity: 0, y: -6, scale: 0.98 }
									}
									animate={
										prefersReducedMotion
											? { opacity: 1 }
											: { opacity: 1, y: 0, scale: 1 }
									}
									exit={
										prefersReducedMotion
											? { opacity: 0 }
											: { opacity: 0, y: -4, scale: 0.98 }
									}
									transition={searchWidgetTransition}
								>
									<CustomPromptWidget
										onSubmit={(instruction) => onAiCustomPrompt?.(instruction)}
										onClose={() => setCustomPromptOpen(false)}
									/>
								</m.div>
							) : null}
						</AnimatePresence>
						{!isMobile && vimCommand !== null ? (
							<div
								className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex items-center gap-0 border-t border-border bg-background/95 px-3 py-1 font-mono text-xs text-foreground"
								role="status"
								aria-live="polite"
								aria-label="Vim command line"
							>
								<span>:{vimCommand}</span>
								<span
									aria-hidden="true"
									className="ml-px inline-block h-3.5 w-[7px] animate-pulse bg-foreground/80"
								/>
							</div>
						) : null}
						<style>{EDITOR_STYLES}</style>
					</div>
				</ContextMenuTrigger>
				<ContextMenuContent className="w-44">
					<ContextMenuItem
						onClick={handleCutSelection}
						disabled={readOnly || !hasSelectionForContextMenu}
						className="gap-2"
					>
						<Scissors className="w-4 h-4" />
						Cut
						{isMobile ? null : <ContextMenuShortcut>⌘X</ContextMenuShortcut>}
					</ContextMenuItem>
					<ContextMenuItem
						onClick={handleCopySelection}
						disabled={!hasSelectionForContextMenu}
						className="gap-2"
					>
						<Copy className="w-4 h-4" />
						Copy
						{isMobile ? null : <ContextMenuShortcut>⌘C</ContextMenuShortcut>}
					</ContextMenuItem>
					<ContextMenuItem
						onClick={handlePasteSelection}
						disabled={readOnly}
						className="gap-2"
					>
						<Clipboard className="w-4 h-4" />
						Paste
						{isMobile ? null : <ContextMenuShortcut>⌘V</ContextMenuShortcut>}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		</LazyMotion>
	);
}

export const RichTextEditor = memo(RichTextEditorImpl);
