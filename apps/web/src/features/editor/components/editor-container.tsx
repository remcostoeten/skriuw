"use client";

import { useRef, useState, useCallback, useEffect, useMemo, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, GripVertical, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { Editor } from "./editor";
import type { TRichTextCollab } from "./rich-text-editor";
import { EditorContentSkeleton } from "./editor-content-skeleton";
import { EditorToolbar } from "./editor-toolbar";
import type { EditorSaveState, WorkspaceNavItem } from "./editor-toolbar";
import { useCollabRoom } from "@/features/collaboration/hooks/use-collab-room";
import { useNoteCollabEnabled } from "@/features/collaboration/hooks/use-note-collab-enabled";
import type { NoteFile, RichTextDocument } from "@/types/notes";
import {
	callAi,
	AiRateLimitError,
	AiRequestError,
	type AiEditorHandle,
	type AiAction,
	type AiErrorCode,
} from "@/features/ai/service";
import { isTauriRuntime, tauriInvoke } from "@/core/workspace-backend";
import { useAiProviderKeys } from "@/features/ai/hooks/use-ai-provider-keys";
import { listFallbackAiKeys, resolveAiKey } from "@/features/ai/lib/resolve-ai-key";
import { usePreferencesStore } from "@/features/settings/store";
import { isMdxNote } from "@/features/editor/lib/editor-mode";
import {
	deriveNoteNameFromHeading,
	nameTracksHeading,
	normalizeNoteTitle,
	stripMarkdownExtension,
} from "@/domain/notes/note-links";
import { AnimatedNumber } from "@/shared/ui/animated-number";
import { cn } from "@/shared/lib/utils";

interface EditorContainerProps {
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
	isContentLoading?: boolean;
}

type RateLimitPrompt = {
	action: AiAction;
	exhaustedKeyIds: string[];
	message: string;
	details?: string;
	eventId?: string;
};

type AiUiError = {
	title: string;
	message: string;
	details?: string;
	code?: AiErrorCode | "unknown";
	eventId?: string;
	action: AiAction;
};

type EditorCursorStatus = {
	line: number;
	column: number;
	selection?: {
		words: number;
		characters: number;
	};
};

const AI_ERROR_TITLES: Partial<Record<AiErrorCode, string>> = {
	authentication_required: "Authentication required",
	invalid_model: "Unsupported model",
	content_too_large: "Note is too large",
	server_not_configured: "Server AI is not configured",
	invalid_key: "AI key failed",
	forbidden: "AI access denied",
	model_not_found: "AI model unavailable",
	provider_error: "AI provider error",
	network_error: "Network error",
	rate_limited: "AI key rate limited",
};

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
		<span
			className="relative inline-grid min-h-4 min-w-[9.5rem] items-center overflow-hidden"
			style={{ perspective: 360 }}
		>
			<AnimatePresence initial={false} mode="popLayout" custom={direction}>
				<motion.span
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
				</motion.span>
			</AnimatePresence>
		</span>
	);
}

function ActivityDots({
	saveState,
	aiLoading,
}: {
	saveState?: EditorSaveState;
	aiLoading: { generateTitle: boolean; spellCheck: boolean; continueWriting: boolean };
}) {
	const prefersReducedMotion = useReducedMotion();
	const isSaving = saveState === "saving";
	const isAiBusy = aiLoading.generateTitle || aiLoading.spellCheck || aiLoading.continueWriting;
	const isActive = isSaving || isAiBusy;

	const tooltipLabel = isSaving
		? "Saving note…"
		: aiLoading.generateTitle
			? "AI — Generating title…"
			: aiLoading.spellCheck
				? "AI — Checking spelling…"
				: aiLoading.continueWriting
					? "AI — Continuing writing…"
					: "";

	return (
		<AnimatePresence>
			{isActive && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.25, ease: "easeInOut" }}
				>
					<Tooltip>
						<TooltipTrigger asChild>
							<div className="flex cursor-default items-center gap-[3px] px-1">
								{[0, 1, 2].map((i) => (
									<motion.span
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
				</motion.div>
			)}
		</AnimatePresence>
	);
}

export function EditorContainer({
	file,
	files = [],
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
	isContentLoading = false,
}: EditorContainerProps) {
	const aiHandleRef = useRef<AiEditorHandle | null>(null);
	const isRenamingFromH1Ref = useRef(false);
	const lastFileNameRef = useRef(fileName);
	// Whether the filename is still auto-following the first heading. True while
	// the name is Untitled or matches the current heading; a manual rename
	// permanently opts out. Re-evaluated when a different note is opened.
	const headingTracksRef = useRef(true);
	const [aiLoading, setAiLoading] = useState({
		generateTitle: false,
		spellCheck: false,
		continueWriting: false,
	});
	const [rateLimitPrompt, setRateLimitPrompt] = useState<RateLimitPrompt | null>(null);
	const [aiError, setAiError] = useState<AiUiError | null>(null);
	const [cursorPosition, setCursorPosition] = useState<EditorCursorStatus>({
		line: 1,
		column: 1,
	});

	const aiPrefs = usePreferencesStore((s) => s.ai);
	const editorPrefs = usePreferencesStore((s) => s.editor);
	const showLineNumbers = usePreferencesStore((s) => s.appearance.showLineNumbers);
	const { data: serverKeys = [] } = useAiProviderKeys();

	const aiResourceOptions = useMemo(
		() => ({
			model: aiPrefs.model,
			resourceType: file ? "note" : undefined,
			resourceId: file?.id,
			resourceUrl: file ? `/app?note=${encodeURIComponent(file.id)}` : undefined,
		}),
		[aiPrefs.model, file],
	);

	// Clear transient state when switching files
	useEffect(() => {
		setRateLimitPrompt(null);
		setAiError(null);
		setCursorPosition({ line: 1, column: 1 });
	}, [file?.id]);

	const runAiAction = useCallback(
		async (action: AiAction, keyId?: string, exhaustedIds: string[] = []) => {
			const editorHandle = aiHandleRef.current;
			if (!editorHandle) {
				setAiError({
					action,
					code: "unknown",
					title: "Editor is still loading",
					message: "The AI action could not start because the editor is not ready yet.",
					details: "Wait for the note body to finish loading, then try again.",
				});
				return;
			}

			const resolvedKey = resolveAiKey({
				model: aiPrefs.model,
				localKeys: aiPrefs.keys,
				activeLocalKeyId: aiPrefs.activeKeyId,
				serverKeys,
				overrideKeyId: keyId,
				exhaustedIds,
			});

			const callOptions = resolvedKey
				? {
						...aiResourceOptions,
						...(resolvedKey.source === "local"
							? { apiKey: resolvedKey.apiKey }
							: { keyId: resolvedKey.keyId }),
					}
				: aiResourceOptions;

			setAiLoading((s) => ({ ...s, [action]: true }));
			setRateLimitPrompt(null);
			setAiError(null);

			try {
				const markdown = await editorHandle.getMarkdown();
				if (!markdown.trim()) {
					setAiError({
						action,
						code: "no_content",
						title: "Nothing to send to AI",
						message: "Write some content first, then run the AI action again.",
					});
					return;
				}

				const result = await callAi(action, markdown, callOptions);
				if (!result) return;

				if (action === "generateTitle") {
					if (file && onRenameFile) onRenameFile(file.id, result);
				} else if (action === "spellCheck") {
					editorHandle.replaceContent(result);
				} else {
					editorHandle.appendContent(result);
				}
			} catch (err) {
				if (err instanceof AiRateLimitError) {
					const newExhausted = resolvedKey
						? [...exhaustedIds, resolvedKey.id]
						: exhaustedIds;
					setRateLimitPrompt({
						action,
						exhaustedKeyIds: newExhausted,
						message: err.message,
						details: err.details,
						eventId: err.eventId,
					});
				} else {
					console.error(`[AI/${action}]`, err);
					if (err instanceof AiRequestError) {
						setAiError({
							action,
							code: err.code,
							eventId: err.eventId,
							title: AI_ERROR_TITLES[err.code] ?? "AI request failed",
							message: err.message,
							details: err.details,
						});
					} else {
						setAiError({
							action,
							code: "unknown",
							title: "AI request failed",
							message:
								err instanceof Error
									? err.message
									: "An unknown AI error occurred.",
							details:
								"No structured server diagnostic was returned for this failure.",
						});
					}
				}
			} finally {
				setAiLoading((s) => ({ ...s, [action]: false }));
			}
		},
		[
			aiPrefs.keys,
			aiPrefs.activeKeyId,
			aiPrefs.model,
			aiResourceOptions,
			file,
			onRenameFile,
			serverKeys,
		],
	);

	const handleEditorReady = useCallback((handle: AiEditorHandle) => {
		aiHandleRef.current = handle;
	}, []);

	const canExportNote = isTauriRuntime();
	const handleExportNote = useCallback(
		async (format: "md" | "html") => {
			if (!file) return;
			try {
				await tauriInvoke<string | null>("export_note", { id: file.id, format });
			} catch (err) {
				console.error("[export_note]", err);
			}
		},
		[file],
	);

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
	const fileId = file?.id ?? null;
	useEffect(() => {
		headingTracksRef.current = file
			? nameTracksHeading(file.name, file.content)
			: true;
		lastFileNameRef.current = fileName;
		// Keyed on `fileId` only — re-runs when the open note changes, not on every
		// content keystroke (which would reset tracking mid-edit).
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
	}, [fileName]);

	const isMdx = isMdxNote(file);
	const effectiveEditorMode = isMdx ? "raw" : editorMode;
	const isAiAvailable = effectiveEditorMode === "block";
	const canUseAi = isAiAvailable;
	const wordCount = useMemo(() => getWordCount(file?.content ?? ""), [file?.content]);

	// Real-time collaboration: only shared notes in block mode open a Yjs room.
	// MDX/raw notes use a plain textarea with no CRDT binding, so collab stays off.
	const collabEligible = effectiveEditorMode === "block";
	const collabEnabled =
		useNoteCollabEnabled(file?.id, file?.access) && collabEligible;
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
	// Hold the editor behind the skeleton while the room is still syncing, so we
	// never briefly mount a plain (non-collaborative) editor and then swap it.
	const collabConnecting =
		collabEnabled &&
		(collabRoom.status === "connecting" || (!collabRoom.synced && collabRoom.status === "connected"));

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
					onAiGenerateTitle={
						canUseAi && onRenameFile ? () => runAiAction("generateTitle") : undefined
					}
					onAiSpellCheck={canUseAi ? () => runAiAction("spellCheck") : undefined}
					onAiContinueWriting={
						canUseAi ? () => runAiAction("continueWriting") : undefined
					}
					onExportNote={canExportNote && file ? handleExportNote : undefined}
					splitEnabled={splitEnabled}
					onToggleSplit={onToggleSplit}
					canToggleSplit={canToggleSplit}
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
							onClick={() => setAiError(null)}
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
							onClick={() => setRateLimitPrompt(null)}
							className="mt-0.5 shrink-0 text-warning/50 transition-colors hover:text-warning"
							aria-label="Dismiss rate limit warning"
						>
							<X className="h-3.5 w-3.5" strokeWidth={1.5} />
						</button>
					</div>
				</div>
			)}

			<div className="flex min-h-0 flex-1 flex-col">
				{isContentLoading || collabConnecting ? (
					<div className="flex-1 overflow-y-auto bg-card" aria-busy="true">
						<EditorContentSkeleton />
					</div>
				) : (
				<Editor
					file={file}
					files={files}
					collab={collab}
					// Fail closed: only the owner (access === undefined, their own note)
					// or an explicit "editor" gets a writable surface. Any other role
					// (viewer today, future roles) is read-only so keystrokes aren't
					// optimistically "saved" and then silently dropped server-side.
					readOnly={
						!!file &&
						file.access !== undefined &&
						file.access !== "owner" &&
						file.access !== "editor"
					}
					editorMode={effectiveEditorMode}
					editorFontId={editorPrefs.defaultFont}
					editorLineHeight={editorPrefs.lineHeight}
					showLineNumbers={showLineNumbers}
					isMobile={isMobile}
					onContentChange={onContentChange}
					onEditorReady={handleEditorReady}
					onAiSpellCheck={canUseAi ? () => runAiAction("spellCheck") : undefined}
					onAiContinueWriting={
						canUseAi ? () => runAiAction("continueWriting") : undefined
					}
					onTitleCommit={handleTitleCommit}
					onBlur={onEditorBlur}
					onCursorChange={isPane && !isPaneFocused ? undefined : setCursorPosition}
					initialScrollTop={initialScrollTop}
					onScrollPositionChange={onScrollPositionChange}
					onPaneActivate={onPaneActivate}
					isPaneFocused={isPaneFocused}
				/>
				)}
			</div>

			{(!isPane || isPaneFocused) && (
			<div className="flex h-8 shrink-0 items-center border-t border-border bg-card px-4 text-[11px] text-muted-foreground">
				<div className="flex min-w-0 flex-1 items-center gap-3">
					<span className="tabular-nums inline-flex items-baseline">
						<AnimatedNumber value={wordCount} animate={editorPrefs.animateNumbers} />
						<span className="ml-1">{wordCount === 1 ? "word" : "words"}</span>
					</span>
					<span className="h-4 w-px bg-border" aria-hidden="true" />
					<BottomStatusText isSelection={Boolean(cursorPosition.selection)}>
						{cursorPosition.selection ? (
							<>
								<AnimatedNumber
									value={cursorPosition.selection.words}
									animate={editorPrefs.animateNumbers}
								/>{" "}
								selected{" "}
								{cursorPosition.selection.words === 1 ? "word" : "words"} ·{" "}
								<AnimatedNumber
									value={cursorPosition.selection.characters}
									animate={editorPrefs.animateNumbers}
								/>{" "}
								{cursorPosition.selection.characters === 1 ? "char" : "chars"}
							</>
						) : effectiveEditorMode === "raw" ? (
							<>
								Ln <AnimatedNumber value={cursorPosition.line} />, Col{" "}
								<AnimatedNumber
									value={cursorPosition.column}
									animate={editorPrefs.animateNumbers}
								/>
							</>
						) : (
							<>Block editor</>
						)}
					</BottomStatusText>
				</div>
				<ActivityDots saveState={saveState} aiLoading={aiLoading} />
			</div>
			)}
		</div>
	);
}
