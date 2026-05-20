"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Editor } from "./editor";
import { EditorToolbar } from "./editor-toolbar";
import type { NoteFile, RichTextDocument } from "@/types/notes";
import {
	callAi,
	AiRateLimitError,
	AiRequestError,
	type AiEditorHandle,
	type AiAction,
	type AiErrorCode,
} from "@/features/ai/service";
import { usePreferencesStore } from "@/features/settings/store";
import { isMdxNote } from "@/features/editor/lib/editor-mode";
import { normalizeNoteTitle, stripMarkdownExtension } from "@/features/notes/lib/note-links";

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
	onToggleEditorMode: () => void;
	onOpenSettings?: () => void;
	onNavigatePrev: () => void;
	onNavigateNext: () => void;
	canNavigatePrev: boolean;
	canNavigateNext: boolean;
	fileName: string;
	onRenameFile?: (id: string, name: string) => void;
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

function titleToFileName(title: string): string {
	return title.trim().replace(/\s+/g, "-");
}

export function EditorContainer({
	file,
	files = [],
	editorMode,
	isMobile,
	onContentChange,
	onToggleSidebar,
	onToggleMetadata,
	onToggleEditorMode,
	onOpenSettings,
	onNavigatePrev,
	onNavigateNext,
	canNavigatePrev,
	canNavigateNext,
	fileName,
	onRenameFile,
}: EditorContainerProps) {
	const aiHandleRef = useRef<AiEditorHandle | null>(null);
	const isRenamingFromH1Ref = useRef(false);
	const lastFileNameRef = useRef(fileName);
	const [aiLoading, setAiLoading] = useState({
		generateTitle: false,
		spellCheck: false,
		continueWriting: false,
	});
	const [rateLimitPrompt, setRateLimitPrompt] = useState<RateLimitPrompt | null>(null);
	const [aiError, setAiError] = useState<AiUiError | null>(null);

	const aiPrefs = usePreferencesStore((s) => s.ai);
	const editorPrefs = usePreferencesStore((s) => s.editor);

	const aiOptions = useMemo(
		() => ({
			apiKey: aiPrefs.activeKeyId
				? (aiPrefs.keys.find((k) => k.id === aiPrefs.activeKeyId)?.apiKey ?? null)
				: null,
			model: aiPrefs.model,
			resourceType: file ? "note" : undefined,
			resourceId: file?.id,
			resourceUrl: file ? `/app?note=${encodeURIComponent(file.id)}` : undefined,
		}),
		[aiPrefs.activeKeyId, aiPrefs.keys, aiPrefs.model, file],
	);

	// Clear transient state when switching files
	useEffect(() => {
		setRateLimitPrompt(null);
		setAiError(null);
	}, [file?.id]);

	const getActiveKey = useCallback(
		(excludeIds: string[] = []) => {
			const available = aiPrefs.keys.filter((k) => !excludeIds.includes(k.id));
			if (available.length === 0) return null;
			const preferred = available.find((k) => k.id === aiPrefs.activeKeyId);
			return preferred ?? available[0];
		},
		[aiPrefs.keys, aiPrefs.activeKeyId],
	);

	const runAiAction = useCallback(
		async (action: AiAction, keyId?: string, exhaustedIds: string[] = []) => {
			if (!aiHandleRef.current) return;

			const keyEntry = keyId
				? aiPrefs.keys.find((k) => k.id === keyId)
				: getActiveKey(exhaustedIds);

			const callOptions = keyEntry
				? {
						apiKey: keyEntry.apiKey,
						model: aiPrefs.model,
						resourceType: file ? "note" : undefined,
						resourceId: file?.id,
						resourceUrl: file ? `/app?note=${encodeURIComponent(file.id)}` : undefined,
					}
				: aiOptions;

			setAiLoading((s) => ({ ...s, [action]: true }));
			setRateLimitPrompt(null);
			setAiError(null);

			try {
				const markdown = await aiHandleRef.current.getMarkdown();
				if (!markdown.trim()) return;

				const result = await callAi(action, markdown, callOptions);
				if (!result) return;

				if (action === "generateTitle") {
					if (file && onRenameFile) onRenameFile(file.id, result);
				} else if (action === "spellCheck") {
					aiHandleRef.current.replaceContent(result);
				} else {
					aiHandleRef.current.appendContent(result);
				}
			} catch (err) {
				if (err instanceof AiRateLimitError) {
					const newExhausted = keyEntry ? [...exhaustedIds, keyEntry.id] : exhaustedIds;
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
		[aiPrefs.keys, aiPrefs.model, file, onRenameFile, getActiveKey, aiOptions],
	);

	const handleEditorReady = useCallback((handle: AiEditorHandle) => {
		aiHandleRef.current = handle;
	}, []);

	const handleTitleCommit = useCallback(
		(title: string) => {
			if (!file || !onRenameFile) return;
			const trimmed = title.trim();
			if (!trimmed) return;
			const newName = titleToFileName(trimmed);
			if (normalizeNoteTitle(newName) === normalizeNoteTitle(file.name)) return;
			isRenamingFromH1Ref.current = true;
			onRenameFile(file.id, newName);
		},
		[file, onRenameFile],
	);

	useEffect(() => {
		if (fileName === lastFileNameRef.current) return;
		lastFileNameRef.current = fileName;
		if (isRenamingFromH1Ref.current) {
			isRenamingFromH1Ref.current = false;
			return;
		}
		// Sidebar rename: push display name into editor H1
		const displayTitle = stripMarkdownExtension(fileName).replace(/-/g, " ");
		aiHandleRef.current?.setTitle(displayTitle);
	}, [fileName]);

	const isMdx = isMdxNote(file);
	const effectiveEditorMode = isMdx ? "raw" : editorMode;
	const isAiAvailable = effectiveEditorMode === "block";
	const canUseAi = isAiAvailable;

	const availableKeysForFallback = rateLimitPrompt
		? aiPrefs.keys.filter((k) => !rateLimitPrompt.exhaustedKeyIds.includes(k.id))
		: [];

	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<EditorToolbar
				fileName={fileName}
				editorMode={effectiveEditorMode}
				isMobile={isMobile}
				onToggleSidebar={onToggleSidebar}
				onToggleMetadata={onToggleMetadata}
				onToggleEditorMode={onToggleEditorMode}
				canToggleEditorMode={!isMdx}
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
				onAiContinueWriting={canUseAi ? () => runAiAction("continueWriting") : undefined}
			/>

			{aiError && (
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

			{rateLimitPrompt && (
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
												{aiPrefs.keys.find(
													(k) =>
														k.id ===
														rateLimitPrompt.exhaustedKeyIds.at(-1),
												)?.name ?? "Unknown"}
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
											{k.name}
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

			<div className="flex min-h-0 flex-1 overflow-hidden">
				<Editor
					file={file}
					files={files}
					editorMode={effectiveEditorMode}
					editorFontId={editorPrefs.defaultFont}
					editorLineHeight={editorPrefs.lineHeight}
					isMobile={isMobile}
					onContentChange={onContentChange}
					onEditorReady={handleEditorReady}
					onAiSpellCheck={canUseAi ? () => runAiAction("spellCheck") : undefined}
					onAiContinueWriting={
						canUseAi ? () => runAiAction("continueWriting") : undefined
					}
					onTitleCommit={handleTitleCommit}
				/>
			</div>
		</div>
	);
}
