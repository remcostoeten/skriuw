"use client";
/* eslint-disable react-doctor/no-multi-comp, react-doctor/no-giant-component, react-doctor/no-many-boolean-props */

import {
	memo,
	useRef,
	useState,
	useCallback,
	useEffect,
	useMemo,
	type PointerEvent as ReactPointerEvent,
} from "react";
import { AnimatePresence, domAnimation, LazyMotion, m, useReducedMotion } from "framer-motion";
import { AlertTriangle, GripVertical, Sparkles, Undo2, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { Editor } from "./editor";
import type { TRichTextCollab } from "./rich-text-editor";
import { EditorContentSkeleton } from "./editor-content-skeleton";
import { AiWritingIndicator } from "./ai-writing-indicator";
import { AI_WRITING_LABELS, type AiWritingAction } from "./ai-writing-constants";
import { AnnotationOverlay } from "./annotation-overlay";
import { EditorToolbar } from "./editor-toolbar";
import type { EditorSaveState, WorkspaceNavItem } from "./editor-toolbar";
import { useCollabRoom } from "@/features/collaboration/hooks/use-collab-room";
import { useNoteCollabEnabled } from "@/features/collaboration/hooks/use-note-collab-enabled";
import type { NoteFile, RichTextDocument } from "@/types/notes";
import type { NoteProperty } from "@/domain/notes/properties";
import { type AiEditorHandle, type AiAction, type AiSelectionAction } from "@/features/ai/service";
import { isTauriRuntime, tauriInvoke } from "@/core/workspace-backend";
import { useAiProviderKeys } from "@/features/ai/hooks/use-ai-provider-keys";
import { listFallbackAiKeys } from "@/features/ai/lib/resolve-ai-key";
import { usePreferencesStore } from "@/features/settings/store";
import { useAiAction } from "@/features/ai/hooks/use-ai-action";
import { isMdxNote } from "@/features/editor/lib/editor-mode";
import type { VimMode } from "@/features/editor/lib/vim-plugin";
import {
	deriveNoteNameFromHeading,
	nameTracksHeading,
	normalizeNoteTitle,
	stripMarkdownExtension,
} from "@/domain/notes/note-links";
import { AnimatedNumber } from "@/shared/ui/animated-number";
import { cn } from "@/shared/lib/utils";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import {
	copyTextToClipboard,
	getEditorContextMenuState,
} from "@/features/desktop/context-menu-actions";
import {
	NoteCoverBanner,
	NoteCoverMenuItems,
	NoteCoverUploadInput,
	useNoteCoverMenu,
	type NoteCoverBannerHandle,
} from "@/features/notes/components/note-cover";
import { useUpdateNote } from "@/features/notes/hooks/use-update-note";
import {
	useCursorStatus,
	useCursorStatusStore,
	type CursorStatusStore,
} from "@/features/editor/hooks/use-cursor-status";
import { DEFAULT_DRAWING_SCENE } from "@/shared/lib/drawing";
import type { EditorInstance } from "@/features/editor/lib/editor-instance";

type EditorContainerProps = {
	file: NoteFile | null;
	files?: NoteFile[];
	editorMode: "raw" | "block";
	isMobile: boolean;
	onContentChange: (
		id: string,
		content: string,
		options?: {
			richContent?: RichTextDocument;
			preferredEditorMode?: "raw" | "block";
			properties?: NoteProperty[];
		},
	) => void;
	onToggleSidebar: () => void;
	onToggleMetadata: () => void;
	workspaceItems?: WorkspaceNavItem[];
	onOpenSettings?: () => void;
	onNavigatePrev: () => void;
	onNavigateNext: () => void;
	canNavigatePrev: boolean;
	canNavigateNext: boolean;
	fileName: string;
	saveState?: EditorSaveState;
	onRenameFile?: (id: string, name: string) => void;
	onEditorBlur?: () => void;
	variant?: "standalone" | "pane";
	isPaneFocused?: boolean;
	onPaneActivate?: () => void;
	paneLabel?: string;
	onClosePane?: () => void;
	onPaneDragHandlePointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
	onPaneDragHandlePointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
	onPaneDragHandlePointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
	isPaneDragging?: boolean;
	initialScrollTop?: number;
	onScrollPositionChange?: (scrollTop: number) => void;
	splitEnabled?: boolean;
	onToggleSplit?: () => void;
	canToggleSplit?: boolean;
	onToggleEditorMode?: () => void;
	onCreateFile?: () => void;
	isContentLoading?: boolean;
};

const EMPTY_FILES: NoteFile[] = [];

const NOTE_AI_ACTIONS: readonly AiAction[] = [
	"generateTitle",
	"spellCheck",
	"continueWriting",
	"summarize",
	"extractTasks",
	"suggestTags",
	"fixSelection",
	"rewriteSelection",
	"shortenSelection",
	"expandSelection",
	"translateSelection",
	"customPrompt",
];

const SELECTION_AI_ACTIONS: readonly AiSelectionAction[] = [
	"fixSelection",
	"rewriteSelection",
	"shortenSelection",
	"expandSelection",
	"translateSelection",
];

function readSelectionContent(handle: AiEditorHandle): string {
	return handle.getSelectionText?.() ?? "";
}

function parseSuggestedTags(result: string): string[] {
	return Array.from(
		new Set(
			result
				.split(/[,\n]/)
				.map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
				.filter((tag) => tag.length > 0 && tag.length <= 40 && !tag.includes(" ")),
		),
	).slice(0, 8);
}

function SuggestedTagsBanner({
	tags,
	onInsert,
	onDismiss,
}: {
	tags: string[];
	onInsert: (tags: string[]) => void;
	onDismiss: () => void;
}) {
	const [selected, setSelected] = useState<Set<string>>(() => new Set(tags));

	const toggle = (tag: string) => {
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(tag)) {
				next.delete(tag);
			} else {
				next.add(tag);
			}
			return next;
		});
	};

	return (
		<div className="border-b border-border bg-muted/40 px-4 py-3 text-xs">
			<div className="flex items-start gap-3">
				<Sparkles
					className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
					strokeWidth={1.5}
				/>
				<div className="flex min-w-0 flex-1 flex-col gap-2">
					<span className="font-medium text-foreground">Suggested tags</span>
					<div className="flex flex-wrap items-center gap-1.5">
						{tags.map((tag) => (
							<button
								key={tag}
								type="button"
								onClick={() => toggle(tag)}
								aria-pressed={selected.has(tag)}
								className={cn(
									"border px-2 py-0.5 font-mono transition-colors",
									selected.has(tag)
										? "border-foreground/30 bg-foreground/10 text-foreground"
										: "border-border text-muted-foreground hover:text-foreground",
								)}
							>
								#{tag}
							</button>
						))}
						<button
							type="button"
							disabled={selected.size === 0}
							onClick={() => onInsert(tags.filter((tag) => selected.has(tag)))}
							className="ml-1 border border-border bg-background px-2 py-0.5 font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
						>
							Add to note
						</button>
					</div>
				</div>
				<button
					type="button"
					onClick={onDismiss}
					className="shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
					aria-label="Dismiss tag suggestions"
				>
					<X className="h-3.5 w-3.5" strokeWidth={1.5} />
				</button>
			</div>
		</div>
	);
}

function getWordCount(content: string): number {
	const trimmed = content.trim();
	if (!trimmed) return 0;
	return trimmed.split(/\s+/).filter(Boolean).length;
}

function BottomStatusText({
	children,
	isSelection,
}: {
	children: React.ReactNode;
	isSelection: boolean;
}) {
	const prefersReducedMotion = useReducedMotion();
	const direction = isSelection ? 1 : -1;

	return (
		<LazyMotion features={domAnimation} strict>
			<span
				className="relative inline-grid min-h-4 min-w-[9.5rem] items-center overflow-hidden"
				style={{ perspective: 360 }}
			>
				<AnimatePresence initial={false} mode="popLayout" custom={direction}>
					<m.span
						key={isSelection ? "selection" : "position"}
						custom={direction}
						initial={
							prefersReducedMotion
								? { opacity: 0 }
								: {
										opacity: 0,
										y: direction > 0 ? 6 : -6,
										rotateX: direction > 0 ? -12 : 12,
										scale: 0.985,
									}
						}
						animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
						exit={
							prefersReducedMotion
								? { opacity: 0 }
								: {
										opacity: 0,
										y: direction > 0 ? -6 : 6,
										rotateX: direction > 0 ? 12 : -12,
										scale: 0.985,
									}
						}
						transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
						className="col-start-1 row-start-1 whitespace-nowrap tabular-nums"
						style={{ transformOrigin: "50% 50%" }}
					>
						{children}
					</m.span>
				</AnimatePresence>
			</span>
		</LazyMotion>
	);
}

function EditorCursorStatusText({
	store,
	rawMode,
	animateNumbers,
}: {
	store: CursorStatusStore;
	rawMode: boolean;
	animateNumbers: boolean;
}) {
	const cursorPosition = useCursorStatus(store);

	return (
		<BottomStatusText isSelection={Boolean(cursorPosition.selection)}>
			{cursorPosition.selection ? (
				<>
					<AnimatedNumber
						value={cursorPosition.selection.words}
						animate={animateNumbers}
					/>{" "}
					selected {cursorPosition.selection.words === 1 ? "word" : "words"} ·{" "}
					<AnimatedNumber
						value={cursorPosition.selection.characters}
						animate={animateNumbers}
					/>{" "}
					{cursorPosition.selection.characters === 1 ? "char" : "chars"}
				</>
			) : rawMode ? (
				<>
					Ln <AnimatedNumber value={cursorPosition.line} animate={animateNumbers} />, Col{" "}
					<AnimatedNumber value={cursorPosition.column} animate={animateNumbers} />
				</>
			) : (
				<>Block editor</>
			)}
		</BottomStatusText>
	);
}

function ActivityDots({
	saveState,
	aiLoading,
}: {
	saveState?: EditorSaveState;
	aiLoading: Partial<Record<AiAction, boolean>>;
}) {
	const prefersReducedMotion = useReducedMotion();
	const isSaving = saveState === "saving";
	const activeAiAction = (Object.keys(aiLoading) as AiAction[]).find(
		(action) => aiLoading[action],
	);
	const isActive = isSaving || Boolean(activeAiAction);

	const tooltipLabel = isSaving
		? "Saving note…"
		: activeAiAction
			? `AI — ${AI_WRITING_LABELS[activeAiAction]}…`
			: "";

	return (
		<LazyMotion features={domAnimation} strict>
			<AnimatePresence>
				{isActive && (
					<m.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.25, ease: "easeInOut" }}
					>
						<Tooltip>
							<TooltipTrigger asChild>
								<div className="flex cursor-default items-center gap-[3px] px-1">
									{[0, 1, 2].map((i) => (
										<m.span
											key={i}
											className="block h-[3px] w-[3px] rounded-full bg-muted-foreground/45"
											animate={
												prefersReducedMotion
													? { opacity: 0.45 }
													: { opacity: [0.2, 0.9, 0.2] }
											}
											transition={{
												duration: 1.1,
												repeat: Infinity,
												delay: i * 0.18,
												ease: "easeInOut",
											}}
										/>
									))}
								</div>
							</TooltipTrigger>
							<TooltipContent side="top" className="text-xs">
								{tooltipLabel}
							</TooltipContent>
						</Tooltip>
					</m.div>
				)}
			</AnimatePresence>
		</LazyMotion>
	);
}

/**
 * Persistent, non-modal banner shown while the active note's last save failed.
 * A save error is durable state (not a transient toast): the note stays in
 * `error` until a retry succeeds, and the draft can be copied out so nothing is
 * lost. `onRetry` re-enqueues the current content through the debounced save
 * path; `getUnsavedText` returns the live draft for the clipboard.
 */
function SaveErrorBanner({
	onRetry,
	getUnsavedText,
}: {
	onRetry: () => void;
	getUnsavedText: () => string;
}) {
	const [copied, setCopied] = useState(false);
	return (
		<div
			role="alert"
			className="flex items-center gap-3 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive"
		>
			<span className="font-medium">This note couldn&apos;t be saved.</span>
			<span className="text-destructive/80">
				Your text is still here — retry or copy it out.
			</span>
			<div className="ml-auto flex gap-2">
				<button
					type="button"
					onClick={onRetry}
					className="rounded border border-destructive/50 px-2 py-1 font-medium hover:bg-destructive/15"
				>
					Retry save
				</button>
				<button
					type="button"
					onClick={() => {
						void navigator.clipboard
							?.writeText(getUnsavedText())
							.then(() => setCopied(true))
							.catch(() => setCopied(false));
					}}
					className="rounded border border-destructive/50 px-2 py-1 font-medium hover:bg-destructive/15"
				>
					{copied ? "Copied" : "Copy unsaved text"}
				</button>
			</div>
		</div>
	);
}

function EditorContainerImpl({
	file,
	files = EMPTY_FILES,
	editorMode,
	isMobile,
	onContentChange,
	onToggleSidebar,
	onToggleMetadata,
	workspaceItems,
	onOpenSettings,
	onNavigatePrev,
	onNavigateNext,
	canNavigatePrev,
	canNavigateNext,
	fileName,
	saveState,
	onRenameFile,
	onEditorBlur,
	variant = "standalone",
	isPaneFocused,
	onPaneActivate,
	paneLabel,
	onClosePane,
	onPaneDragHandlePointerDown,
	onPaneDragHandlePointerMove,
	onPaneDragHandlePointerUp,
	isPaneDragging,
	initialScrollTop,
	onScrollPositionChange,
	splitEnabled,
	onToggleSplit,
	canToggleSplit,
	onToggleEditorMode,
	onCreateFile,
	isContentLoading = false,
}: EditorContainerProps) {
	const isRenamingFromH1Ref = useRef(false);
	const { mutate: mutateNote } = useUpdateNote();
	const lastFileNameRef = useRef(fileName);
	// Whether the filename is still auto-following the first heading. True while
	// the name is Untitled or matches the current heading; a manual rename
	// permanently opts out. Re-evaluated when a different note is opened.
	const headingTracksRef = useRef(true);
	const cursorStatusStore = useCursorStatusStore();
	const [vimMode, setVimMode] = useState<VimMode | null>(null);
	const [spellCheckRevert, setSpellCheckRevert] = useState<string | null>(null);
	const [customPromptRevert, setCustomPromptRevert] = useState<string[] | null>(null);
	const [suggestedTags, setSuggestedTags] = useState<string[] | null>(null);
	const [aiNotice, setAiNotice] = useState<string | null>(null);
	const [annotating, setAnnotating] = useState(false);
	const blockEditorRef = useRef<EditorInstance | null>(null);

	const fileId = file?.id ?? null;
	const coverBannerRef = useRef<NoteCoverBannerHandle>(null);
	const handleCoverChange = useCallback(
		(cover: string) => {
			if (fileId) mutateNote({ id: fileId, cover });
		},
		[fileId, mutateNote],
	);
	const handleIconChange = useCallback(
		(icon: string) => {
			if (fileId) mutateNote({ id: fileId, icon });
		},
		[fileId, mutateNote],
	);
	const coverUpload = useNoteCoverMenu(handleCoverChange);
	const canEditCover =
		!!file &&
		(file.access === undefined || file.access === "owner" || file.access === "editor");
	const handleInsertDrawing = useCallback(() => {
		const blockEditor = blockEditorRef.current;
		if (!blockEditor) return;
		// Dynamic import so this @blocknote helper — the only static reference to
		// the editor package outside the already-lazy RichTextEditor subtree —
		// does not pull the whole ~486 KB gzip editor chunk into shell startup.
		// This is a user-triggered slash-menu action, so the one-time async load
		// is imperceptible.
		void import("@blocknote/core/extensions").then(({ insertOrUpdateBlockForSlashMenu }) => {
			insertOrUpdateBlockForSlashMenu(blockEditor, {
				type: "drawing",
				props: { scene: DEFAULT_DRAWING_SCENE },
				// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
			} as any);
		});
	}, []);
	const [prevFileId, setPrevFileId] = useState(fileId);
	if (fileId !== prevFileId) {
		setPrevFileId(fileId);
		setSpellCheckRevert(null);
		setCustomPromptRevert(null);
		setSuggestedTags(null);
		setAiNotice(null);
		setAnnotating(false);
	}

	// Reset in an effect, not the render-phase block above: notifying the
	// store's status-bar subscriber mid-render would update a component while
	// another is rendering.
	useEffect(() => {
		cursorStatusStore.reset();
	}, [cursorStatusStore, fileId]);

	const aiPrefs = usePreferencesStore((s) => s.ai);
	const editorPrefs = usePreferencesStore((s) => s.editor);
	const showLineNumbers = usePreferencesStore((s) => s.appearance.showLineNumbers);
	const { data: serverKeys = [] } = useAiProviderKeys();

	const applyAiResult = useMemo(() => {
		const applySelection = (result: string, editorHandle: AiEditorHandle) => {
			editorHandle.replaceSelection?.(result.trim());
		};
		return {
			generateTitle: (result: string, editorHandle: AiEditorHandle) => {
				const title = result.trim();
				if (!title) return;
				editorHandle.setTitle(title);
				if (file && onRenameFile) onRenameFile(file.id, title);
			},
			spellCheck: (result: string, editorHandle: AiEditorHandle) => {
				// Snapshot the pre-correction markdown so the user can revert the
				// whole-document replace from the banner below.
				void (async () => {
					const previous = await editorHandle.getMarkdown();
					editorHandle.replaceContent(result);
					setSpellCheckRevert(previous);
				})();
			},
			continueWriting: (result: string, editorHandle: AiEditorHandle) => {
				editorHandle.continueWriting(result);
			},
			summarize: (result: string, editorHandle: AiEditorHandle) => {
				const trimmed = result.trim();
				if (!trimmed) return;
				editorHandle.appendMarkdown?.(`## Summary\n\n${trimmed}`);
			},
			extractTasks: (result: string, editorHandle: AiEditorHandle) => {
				const trimmed = result.trim();
				if (!trimmed || trimmed.toUpperCase() === "NONE") {
					setAiNotice("No action items were found in this note.");
					return;
				}
				editorHandle.appendMarkdown?.(`## Action items\n\n${trimmed}`);
			},
			suggestTags: (result: string) => {
				const tags = parseSuggestedTags(result);
				if (tags.length === 0) {
					setAiNotice("No usable tag suggestions came back.");
					return;
				}
				setSuggestedTags(tags);
			},
			fixSelection: applySelection,
			rewriteSelection: applySelection,
			shortenSelection: applySelection,
			expandSelection: applySelection,
			translateSelection: applySelection,
		};
	}, [file, onRenameFile]);

	const aiContentSource = useMemo(
		() => ({
			...(Object.fromEntries(
				SELECTION_AI_ACTIONS.map((action) => [action, readSelectionContent]),
			) as Partial<Record<AiAction, (handle: AiEditorHandle) => string>>),
			customPrompt: async (handle: AiEditorHandle) => {
				const selection = handle.getSelectionText?.() ?? "";
				return selection.trim() ? selection : await handle.getMarkdown();
			},
		}),
		[],
	);

	const {
		aiLoading,
		aiError,
		rateLimitPrompt,
		handleEditorReady,
		editorHandleRef: aiHandleRef,
		runAiAction,
		cancelAiAction,
		dismissAiError,
		dismissRateLimit,
	} = useAiAction<AiAction>({
		actions: NOTE_AI_ACTIONS,
		applyResult: applyAiResult,
		contentSource: aiContentSource,
		model: aiPrefs.model,
		resourceType: file ? "note" : undefined,
		resourceId: file?.id,
		resourceUrl: file ? `/app?note=${encodeURIComponent(file.id)}` : undefined,
		resetKey: file?.id,
		loadingEntityLabel: "note body",
		errorTitleOverrides: { content_too_large: "Note is too large" },
		onStreamComplete: (action, insertedIds) => {
			if (action === "customPrompt" && insertedIds.length > 0) {
				setCustomPromptRevert(insertedIds);
			}
		},
	});

	const canExportNote = isTauriRuntime();
	const handleExportNote = useCallback(
		async (format: "md" | "html") => {
			if (!fileId) return;
			try {
				await tauriInvoke<string | null>("export_note", { id: fileId, format });
			} catch (err) {
				console.error("[export_note]", err);
			}
		},
		[fileId],
	);
	const handleAiGenerateTitle = useCallback(() => runAiAction("generateTitle"), [runAiAction]);
	const handleAiSpellCheck = useCallback(() => runAiAction("spellCheck"), [runAiAction]);
	const handleAiContinueWriting = useCallback(
		() => runAiAction("continueWriting"),
		[runAiAction],
	);
	const handleAiCustomPrompt = useCallback(
		(instruction: string) => runAiAction("customPrompt", undefined, [], instruction),
		[runAiAction],
	);
	const handleToggleAnnotate = useCallback(() => {
		setAnnotating((current) => !current);
	}, []);
	const handleAnnotateDone = useCallback(() => {
		setAnnotating(false);
	}, []);

	// The editor calls this once the heading block is "done" — the caret left it
	// (blur / Enter / navigate away). That's the only point the sidebar filename
	// follows the heading; while typing inside the heading the name stays put.
	const handleTitleCommit = useCallback(
		(title: string) => {
			if (!file || !onRenameFile) return;
			if (!headingTracksRef.current) return;
			const trimmed = title.trim();
			if (!trimmed) return;
			const newName = deriveNoteNameFromHeading(`# ${trimmed}`);
			if (!newName) return;
			if (normalizeNoteTitle(newName) === normalizeNoteTitle(file.name)) return;
			isRenamingFromH1Ref.current = true;
			onRenameFile(file.id, newName);
		},
		[file, onRenameFile],
	);

	// Opening a different note re-evaluates whether its name still tracks the
	// heading, and re-baselines `lastFileNameRef` so the rename effect below
	// doesn't mistake the note switch for a manual rename.
	useEffect(() => {
		headingTracksRef.current = file ? nameTracksHeading(file.name, file.content) : true;
		lastFileNameRef.current = fileName;
		// Keyed on `fileId` only — re-runs when the open note changes, not on every
		// content keystroke (which would reset tracking mid-edit).
		// react-doctor-disable-next-line react-doctor/exhaustive-deps -- fileId is the only value that should retrigger this note-switch reset.
	}, [fileId]);

	useEffect(() => {
		if (fileName === lastFileNameRef.current) return;
		lastFileNameRef.current = fileName;
		if (isRenamingFromH1Ref.current) {
			isRenamingFromH1Ref.current = false;
			return;
		}
		// Sidebar rename: the user picked a name themselves, so stop following the
		// heading, and push the display name into the editor H1.
		headingTracksRef.current = false;
		const displayTitle = stripMarkdownExtension(fileName).replace(/-/g, " ");
		aiHandleRef.current?.setTitle(displayTitle);
		// react-doctor-disable-next-line react-doctor/exhaustive-deps -- fileName is the only signal that should update the H1 title from the sidebar rename flow.
	}, [fileName]);

	const isMdx = isMdxNote(file);
	const effectiveEditorMode = isMdx ? "raw" : editorMode;
	const menuState = getEditorContextMenuState({
		mode: effectiveEditorMode,
		hasFile: Boolean(file),
	});
	const isAiAvailable = effectiveEditorMode === "block";
	const canUseAi = isAiAvailable;
	const wordCount = useMemo(() => getWordCount(file?.content ?? ""), [file?.content]);

	const activeWritingAction: AiWritingAction | null =
		(Object.keys(aiLoading) as AiAction[]).find((action) => aiLoading[action]) ?? null;

	// Real-time collaboration: only shared notes in block mode open a Yjs room.
	// MDX/raw notes use a plain textarea with no CRDT binding, so collab stays off.
	const collabEligible = effectiveEditorMode === "block";
	const collabEnabled = useNoteCollabEnabled(file?.id, file?.access) && collabEligible;
	const collabRoom = useCollabRoom(file?.id ?? null, collabEnabled);
	const collab: TRichTextCollab | undefined =
		collabRoom.synced && collabRoom.fragment && collabRoom.doc
			? {
					doc: collabRoom.doc,
					fragment: collabRoom.fragment,
					awareness: collabRoom.awareness,
					user: collabRoom.user ?? { name: "Anonymous", color: "#888" },
					// Any writer seeds an empty room — not just the owner. Otherwise a
					// collaborator who opens a never-seeded note first is stuck staring
					// at a blank doc until the owner happens to join. The seed itself is
					// guarded to only run on a genuinely-empty fragment, so this can't
					// clobber existing content.
					shouldSeed: collabRoom.role === "owner" || collabRoom.role === "editor",
				}
			: undefined;
	const collabConnecting =
		collabEnabled &&
		(collabRoom.status === "connecting" ||
			(!collabRoom.synced && collabRoom.status === "connected"));
	// While the room syncs, show the cached note read-only instead of a skeleton —
	// real content beats fake bars. `useCreateBlockNote` reads `collab` once at
	// creation, so the editor is keyed to remount when the CRDT binding attaches;
	// read-only during the window means no local edits can diverge from the room.
	const showEditorSkeleton = isContentLoading || (collabConnecting && !file);
	const editorCollabKey = collab ? `collab:${file?.id}` : "solo";

	const availableKeysForFallback = rateLimitPrompt
		? listFallbackAiKeys({
				localKeys: aiPrefs.keys,
				serverKeys,
				exhaustedIds: rateLimitPrompt.exhaustedKeyIds,
			})
		: [];

	const isPane = variant === "pane";

	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			{!isPane ? (
				<EditorToolbar
					fileName={fileName}
					fileIcon={file?.icon}
					saveState={saveState}
					isMobile={isMobile}
					workspaceItems={workspaceItems}
					onToggleSidebar={onToggleSidebar}
					onToggleMetadata={onToggleMetadata}
					onOpenSettings={onOpenSettings}
					onNavigatePrev={onNavigatePrev}
					onNavigateNext={onNavigateNext}
					canNavigatePrev={canNavigatePrev}
					canNavigateNext={canNavigateNext}
					aiLoading={aiLoading}
					onAiGenerateTitle={canUseAi && onRenameFile ? handleAiGenerateTitle : undefined}
					onAiSpellCheck={canUseAi ? handleAiSpellCheck : undefined}
					onAiContinueWriting={canUseAi ? handleAiContinueWriting : undefined}
					onAiAction={canUseAi ? runAiAction : undefined}
					onExportNote={canExportNote && fileId ? handleExportNote : undefined}
					splitEnabled={splitEnabled}
					onToggleSplit={onToggleSplit}
					canToggleSplit={canToggleSplit}
					annotating={annotating}
					onToggleAnnotate={
						file && effectiveEditorMode === "block" ? handleToggleAnnotate : undefined
					}
					onInsertDrawing={
						canEditCover && effectiveEditorMode === "block"
							? handleInsertDrawing
							: undefined
					}
					presenceAwareness={collabRoom.awareness}
				/>
			) : paneLabel ? (
				<div
					className={cn(
						"flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-background px-2 text-xs",
						isPaneFocused && "bg-muted/35",
						isPaneDragging && "bg-muted/50 shadow-sm",
					)}
				>
					{onPaneDragHandlePointerDown ? (
						<button
							type="button"
							onPointerDown={onPaneDragHandlePointerDown}
							onPointerMove={onPaneDragHandlePointerMove}
							onPointerUp={onPaneDragHandlePointerUp}
							onPointerCancel={onPaneDragHandlePointerUp}
							className={cn(
								"pressable flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing",
								isPaneDragging && "cursor-grabbing bg-muted text-foreground",
							)}
							aria-label="Drag to reorder split pane"
						>
							<GripVertical className="h-3.5 w-3.5" strokeWidth={1.5} />
						</button>
					) : null}
					<span className="min-w-0 flex-1 truncate font-medium text-foreground/80">
						{file?.icon && (
							<span className="mr-1.5" aria-hidden>
								{file.icon}
							</span>
						)}
						{paneLabel}
					</span>
					{onClosePane ? (
						<button
							type="button"
							onClick={onClosePane}
							className="pressable flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							aria-label="Close split pane"
						>
							<X className="h-3.5 w-3.5" strokeWidth={1.5} />
						</button>
					) : null}
				</div>
			) : null}

			{!isPane && aiError && (
				<div className="border-b border-destructive/25 bg-[linear-gradient(135deg,hsl(var(--destructive)/0.12),hsl(var(--background)/0.94))] px-4 py-3 text-xs">
					<div className="flex items-start gap-3">
						<AlertTriangle
							className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
							strokeWidth={1.5}
						/>
						<div className="min-w-0 flex-1 space-y-1">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium text-destructive">
									{aiError.title}
								</span>
								<span className="border border-destructive/25 bg-destructive/10 px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-destructive/80">
									{aiError.action}
								</span>
								{aiError.code && (
									<span className="font-mono text-[10px] text-destructive/55">
										{aiError.code}
									</span>
								)}
							</div>
							<p className="text-destructive/90">{aiError.message}</p>
							{aiError.details && (
								<p className="text-destructive/65">{aiError.details}</p>
							)}
							{aiError.eventId && (
								<p className="font-mono text-[10px] text-destructive/45">
									Diagnostic event: {aiError.eventId}
								</p>
							)}
						</div>
						<button
							type="button"
							onClick={dismissAiError}
							className="shrink-0 text-destructive/50 transition-colors hover:text-destructive"
							aria-label="Dismiss AI error"
						>
							<X className="h-3.5 w-3.5" strokeWidth={1.5} />
						</button>
					</div>
				</div>
			)}

			{!isPane && rateLimitPrompt && (
				<div className="border-b border-warning/25 bg-[linear-gradient(135deg,hsl(var(--warning)/0.14),hsl(var(--background)/0.94))] px-4 py-3 text-xs">
					<div className="flex items-start gap-3">
						<AlertTriangle
							className="mt-0.5 h-4 w-4 shrink-0 text-warning"
							strokeWidth={1.5}
						/>
						<div className="flex min-w-0 flex-1 flex-col gap-2">
							<div className="space-y-1">
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-medium text-warning-foreground">
										AI key rate limited
									</span>
									<span className="border border-warning/30 bg-warning/10 px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-warning-foreground/80">
										{rateLimitPrompt.action}
									</span>
								</div>
								<p className="text-warning-foreground/80">
									{rateLimitPrompt.message}
									{rateLimitPrompt.exhaustedKeyIds.length > 0 && (
										<>
											{" "}
											Last key:{" "}
											<span className="font-medium text-warning-foreground">
												{listFallbackAiKeys({
													localKeys: aiPrefs.keys,
													serverKeys,
												}).find(
													(key) =>
														key.id ===
														rateLimitPrompt.exhaustedKeyIds.at(-1),
												)?.label ?? "Unknown"}
											</span>
										</>
									)}
								</p>
								{rateLimitPrompt.details && (
									<p className="text-warning-foreground/55">
										{rateLimitPrompt.details}
									</p>
								)}
								{rateLimitPrompt.eventId && (
									<p className="font-mono text-[10px] text-warning-foreground/40">
										Diagnostic event: {rateLimitPrompt.eventId}
									</p>
								)}
							</div>
							{availableKeysForFallback.length > 0 ? (
								<div className="flex flex-wrap items-center gap-1.5">
									<span className="text-warning-foreground/55">
										Retry with another saved key:
									</span>
									{availableKeysForFallback.map((k) => (
										<button
											key={k.id}
											type="button"
											onClick={() =>
												runAiAction(
													rateLimitPrompt.action,
													k.id,
													rateLimitPrompt.exhaustedKeyIds,
												)
											}
											className="border border-warning/40 bg-warning/10 px-2 py-0.5 text-warning-foreground transition-colors hover:bg-warning/20"
										>
											{k.label}
										</button>
									))}
								</div>
							) : (
								<span className="text-warning-foreground/55">
									{rateLimitPrompt.exhaustedKeyIds.length > 0
										? "All saved keys have been rate limited."
										: "The server AI key is rate limited or out of quota."}
								</span>
							)}
						</div>
						<button
							type="button"
							onClick={dismissRateLimit}
							className="mt-0.5 shrink-0 text-warning/50 transition-colors hover:text-warning"
							aria-label="Dismiss rate limit warning"
						>
							<X className="h-3.5 w-3.5" strokeWidth={1.5} />
						</button>
					</div>
				</div>
			)}

			{!isPane && aiNotice && (
				<div className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs">
					<div className="flex items-center gap-3">
						<Sparkles
							className="h-4 w-4 shrink-0 text-muted-foreground"
							strokeWidth={1.5}
						/>
						<span className="min-w-0 flex-1 text-muted-foreground">{aiNotice}</span>
						<button
							type="button"
							onClick={() => setAiNotice(null)}
							className="shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
							aria-label="Dismiss AI notice"
						>
							<X className="h-3.5 w-3.5" strokeWidth={1.5} />
						</button>
					</div>
				</div>
			)}

			{!isPane && spellCheckRevert !== null && (
				<div className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs">
					<div className="flex items-center gap-3">
						<Sparkles
							className="h-4 w-4 shrink-0 text-muted-foreground"
							strokeWidth={1.5}
						/>
						<span className="min-w-0 flex-1 text-muted-foreground">
							AI spell check replaced the note content.
						</span>
						<button
							type="button"
							onClick={() => {
								aiHandleRef.current?.replaceContent(spellCheckRevert);
								setSpellCheckRevert(null);
							}}
							className="flex shrink-0 items-center gap-1.5 border border-border bg-background px-2 py-0.5 font-medium text-foreground transition-colors hover:bg-muted"
						>
							<Undo2 className="h-3 w-3" strokeWidth={1.6} />
							Revert
						</button>
						<button
							type="button"
							onClick={() => setSpellCheckRevert(null)}
							className="shrink-0 border border-transparent px-2 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
						>
							Keep
						</button>
					</div>
				</div>
			)}

			{!isPane && customPromptRevert !== null && (
				<div className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs">
					<div className="flex items-center gap-3">
						<Sparkles
							className="h-4 w-4 shrink-0 text-muted-foreground"
							strokeWidth={1.5}
						/>
						<span className="min-w-0 flex-1 text-muted-foreground">
							AI inserted content from your instruction.
						</span>
						<button
							type="button"
							onClick={() => {
								aiHandleRef.current?.deleteBlocks?.(customPromptRevert);
								setCustomPromptRevert(null);
							}}
							className="flex shrink-0 items-center gap-1.5 border border-border bg-background px-2 py-0.5 font-medium text-foreground transition-colors hover:bg-muted"
						>
							<Undo2 className="h-3 w-3" strokeWidth={1.6} />
							Revert
						</button>
						<button
							type="button"
							onClick={() => setCustomPromptRevert(null)}
							className="shrink-0 border border-transparent px-2 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
						>
							Keep
						</button>
					</div>
				</div>
			)}

			{!isPane && suggestedTags && (
				<SuggestedTagsBanner
					tags={suggestedTags}
					onInsert={(tags) => {
						const markdown = `Tags: ${tags.map((tag) => `#${tag}`).join(" ")}`;
						const inserted =
							aiHandleRef.current?.insertMarkdownBelowHeading?.(markdown);
						if (!inserted) {
							aiHandleRef.current?.appendMarkdown?.(markdown);
						}
						setSuggestedTags(null);
					}}
					onDismiss={() => setSuggestedTags(null)}
				/>
			)}

			{file?.cover && (
				<NoteCoverBanner
					ref={coverBannerRef}
					cover={file.cover}
					onCoverChange={canEditCover ? handleCoverChange : undefined}
				/>
			)}
			{canEditCover && <NoteCoverUploadInput upload={coverUpload} />}

			{saveState === "error" && file ? (
				<SaveErrorBanner
					onRetry={() =>
						onContentChange(file.id, file.content, {
							richContent: file.richContent,
							preferredEditorMode: file.preferredEditorMode,
						})
					}
					getUnsavedText={() => file.content}
				/>
			) : null}

			<div className="relative flex min-h-0 flex-1 flex-col">
				{showEditorSkeleton ? (
					<div
						className="flex-1 overflow-y-auto overscroll-contain bg-card"
						aria-busy="true"
					>
						<EditorContentSkeleton />
					</div>
				) : (
					<ContextMenu>
						<ContextMenuTrigger asChild>
							<div className="flex min-h-0 flex-1 flex-col">
								<Editor
									key={editorCollabKey}
									file={file}
									files={files}
									collab={collab}
									// Fail closed: only the owner (access === undefined, their own note)
									// or an explicit "editor" gets a writable surface. Any other role
									// (viewer today, future roles) is read-only so keystrokes aren't
									// optimistically "saved" and then silently dropped server-side.
									// Also read-only while the collab room syncs, so interim edits
									// can't diverge from the CRDT document about to take over.
									readOnly={
										collabConnecting ||
										(!!file &&
											file.access !== undefined &&
											file.access !== "owner" &&
											file.access !== "editor")
									}
									editorMode={effectiveEditorMode}
									editorFontId={editorPrefs.defaultFont}
									editorLineHeight={editorPrefs.lineHeight}
									showLineNumbers={showLineNumbers}
									isMobile={isMobile}
									onContentChange={onContentChange}
									onIconChange={canEditCover ? handleIconChange : undefined}
									onCoverChange={canEditCover ? handleCoverChange : undefined}
									onEditorReady={handleEditorReady}
									onBlockEditorReady={(blockEditor) => {
										blockEditorRef.current = blockEditor;
									}}
									onAiSpellCheck={canUseAi ? handleAiSpellCheck : undefined}
									onAiContinueWriting={
										canUseAi ? handleAiContinueWriting : undefined
									}
									onAiAction={canUseAi ? runAiAction : undefined}
									onAiCustomPrompt={canUseAi ? handleAiCustomPrompt : undefined}
									onTitleCommit={handleTitleCommit}
									onBlur={onEditorBlur}
									onCursorChange={
										isPane && !isPaneFocused ? undefined : cursorStatusStore.set
									}
									onVimModeChange={setVimMode}
									initialScrollTop={initialScrollTop}
									onScrollPositionChange={onScrollPositionChange}
									onPaneActivate={onPaneActivate}
									isPaneFocused={isPaneFocused}
									onCreateFile={onCreateFile}
								/>
							</div>
						</ContextMenuTrigger>
						<ContextMenuContent className="w-56">
							<ContextMenuItem
								disabled={!menuState.canCopyTitle}
								onClick={() => copyTextToClipboard(fileName)}
							>
								Copy note title
							</ContextMenuItem>
							<ContextMenuItem
								disabled={!file?.content.trim()}
								onClick={() => copyTextToClipboard(file?.content ?? "")}
							>
								Copy markdown
							</ContextMenuItem>
							{canEditCover ? (
								<>
									<ContextMenuSeparator />
									<NoteCoverMenuItems
										cover={file?.cover ?? ""}
										onCoverChange={handleCoverChange}
										upload={coverUpload}
										onViewFullSize={() =>
											coverBannerRef.current?.openLightbox()
										}
										onReposition={() =>
											coverBannerRef.current?.beginReposition()
										}
									/>
								</>
							) : null}
							{onToggleEditorMode || onToggleSplit || onClosePane ? (
								<ContextMenuSeparator />
							) : null}
							{onToggleEditorMode ? (
								<ContextMenuItem disabled={isMdx} onClick={onToggleEditorMode}>
									{menuState.modeLabel}
								</ContextMenuItem>
							) : null}
							{onToggleSplit ? (
								<ContextMenuItem disabled={!canToggleSplit} onClick={onToggleSplit}>
									{splitEnabled ? "Close split editor" : "Open split editor"}
								</ContextMenuItem>
							) : null}
							{onClosePane ? (
								<ContextMenuItem onClick={onClosePane}>Close pane</ContextMenuItem>
							) : null}
							{canUseAi || canExportNote ? <ContextMenuSeparator /> : null}
							{canUseAi && onRenameFile ? (
								<ContextMenuItem
									disabled={aiLoading.generateTitle}
									onClick={() => runAiAction("generateTitle")}
								>
									Generate title
								</ContextMenuItem>
							) : null}
							{canUseAi ? (
								<>
									<ContextMenuItem
										disabled={aiLoading.spellCheck}
										onClick={() => runAiAction("spellCheck")}
									>
										Spell check
									</ContextMenuItem>
									<ContextMenuItem
										disabled={aiLoading.continueWriting}
										onClick={() => runAiAction("continueWriting")}
									>
										Continue writing
									</ContextMenuItem>
									<ContextMenuItem
										disabled={aiLoading.summarize}
										onClick={() => runAiAction("summarize")}
									>
										Summarize
									</ContextMenuItem>
									<ContextMenuItem
										disabled={aiLoading.extractTasks}
										onClick={() => runAiAction("extractTasks")}
									>
										Extract tasks
									</ContextMenuItem>
									<ContextMenuItem
										disabled={aiLoading.suggestTags}
										onClick={() => runAiAction("suggestTags")}
									>
										Suggest tags
									</ContextMenuItem>
								</>
							) : null}
							{canExportNote ? (
								<>
									<ContextMenuSeparator />
									<ContextMenuItem
										disabled={!menuState.canExportMarkdown}
										onClick={() => handleExportNote("md")}
									>
										Export Markdown
									</ContextMenuItem>
									<ContextMenuItem
										disabled={!file}
										onClick={() => handleExportNote("html")}
									>
										Export HTML
									</ContextMenuItem>
								</>
							) : null}
						</ContextMenuContent>
					</ContextMenu>
				)}
				{file && effectiveEditorMode === "block" && !showEditorSkeleton ? (
					<AnnotationOverlay
						key={file.id}
						noteId={file.id}
						scene={file.annotationScene}
						active={annotating}
						readOnly={
							file.access !== undefined &&
							file.access !== "owner" &&
							file.access !== "editor"
						}
						onDone={handleAnnotateDone}
					/>
				) : null}
				{!showEditorSkeleton && (
					<AiWritingIndicator
						action={activeWritingAction}
						onCancel={
							activeWritingAction === "continueWriting" ||
							activeWritingAction === "customPrompt"
								? cancelAiAction
								: undefined
						}
					/>
				)}
			</div>

			{!isMobile && (!isPane || isPaneFocused) && (
				<div className="flex h-8 shrink-0 items-center border-t border-border bg-card px-4 text-[11px] text-muted-foreground">
					<div className="flex min-w-0 flex-1 items-center gap-3">
						<span className="tabular-nums inline-flex items-baseline">
							<AnimatedNumber value={wordCount} animate={false} />
							<span className="ml-1">{wordCount === 1 ? "word" : "words"}</span>
						</span>
						<span className="h-4 w-px bg-border" aria-hidden="true" />
						<EditorCursorStatusText
							store={cursorStatusStore}
							rawMode={effectiveEditorMode === "raw"}
							animateNumbers={editorPrefs.animateNumbers}
						/>
					</div>
					{!isMobile &&
					editorPrefs.vimMode &&
					effectiveEditorMode === "block" &&
					vimMode ? (
						<span
							className="mr-3 select-none rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
							aria-live="polite"
							aria-label="Vim mode"
						>
							{vimMode}
						</span>
					) : null}
					<ActivityDots saveState={saveState} aiLoading={aiLoading} />
				</div>
			)}
		</div>
	);
}

export const EditorContainer = memo(EditorContainerImpl);
