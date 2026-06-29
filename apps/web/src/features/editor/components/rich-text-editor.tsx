"use client";

import {
	useEffect,
	useMemo,
	useCallback,
	useId,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import {
	filterSuggestionItems,
	insertOrUpdateBlockForSlashMenu,
	SuggestionMenu as SuggestionMenuExtension,
} from "@blocknote/core/extensions";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useShortcutMap } from "@remcostoeten/use-shortcut/react";
import { LinkToolbarExtension } from "@blocknote/core/extensions";
import {
	DeleteLinkButton,
	EditLinkButton,
	getDefaultReactSlashMenuItems,
	LinkToolbarController,
	OpenLinkButton,
	SuggestionMenuController,
	type DefaultReactSuggestionItem,
	type LinkToolbarProps,
	type SuggestionMenuProps,
	useComponentsContext,
	useCreateBlockNote,
	useEditorState,
	useExtension,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	Bold,
	ChevronDown,
	Code,
	FileText,
	FolderTree,
	Heading1,
	Heading2,
	Heading3,
	Italic,
	Link2,
	List,
	ListChecks,
	ListOrdered,
	MessageSquarePlus,
	PenTool,
	Pilcrow,
	Quote,
	Sparkles,
	SpellCheck,
	Strikethrough,
	Tag,
	Underline,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { FAST_SWAP_TRANSITION, pickTransition } from "@/shared/lib/motion";
import { noop } from "@/shared/lib/noop";
import { perf } from "@/shared/perf/track";
import { DEFAULT_FILE_TREE_SOURCE } from "@/shared/lib/file-tree";
import { getEditorFontFamily, type EditorFontId } from "@/shared/lib/editor-fonts";
import {
	getEditorLineHeightValue,
	type EditorLineHeight,
} from "@/features/editor/lib/editor-line-height";
import type { NoteFile, RichTextDocument } from "@/types/notes";
import type { NoteProperty } from "@/domain/notes/properties";
import {
	extractNoteTags,
	getNoteTitle,
	getNoteSearchableContent,
	getWorkspaceTags,
	getWorkspaceUsers,
} from "@/domain/notes/note-links";
import { useNotesStore } from "@/features/notes/store";
import { useNoteLinkActions } from "@/features/editor/hooks/use-note-link-actions";
import {
	cloneRichDocument,
	flattenInlineChips,
	markdownToRichDocument,
	resolveRichDocument,
	upgradeRichDocumentChips,
} from "@/domain/notes/rich-document";
import type { AiEditorHandle } from "@/features/ai/service";
import {
	type AiDiffHighlightHandle,
	diffChangedIndices,
	selectCorrectedIndices,
	showAiDiffHighlight,
} from "@/features/editor/lib/ai-diff-highlight";
import { usePreferencesStore } from "@/features/settings/store";
import { markCollabActivity } from "@/features/collaboration/lib/collab-activity";
import { useAnchoredMarks } from "@/features/collaboration/anchored-marks/react/use-anchored-marks";
import {
	buildRegex,
	clearSearch,
	createSearchPlugin,
	defaultSearchOptions,
	getSearchState,
	nextMatch,
	previousMatch,
	replaceAll,
	replaceCurrent,
	setSearch,
	searchPluginKey,
	type SearchOptions,
} from "@/features/editor/lib/search-plugin";
import { createVimPlugin, vimPluginKey, type VimMode } from "@/features/editor/lib/vim-plugin";
import { shouldClearSelectionBubbleRect } from "@/features/editor/lib/selection-bubble";
import { SearchWidget } from "./search-widget";
import { NotePropertiesShelf } from "./note-properties/note-properties-shelf";
import { editorSchema } from "./inline-specs/schema";
import { NoteLinkProvider } from "./inline-specs/note-link-context";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";

// biome-ignore lint/suspicious/noExplicitAny: editor type with custom schema requires deep inference
type EditorInstance = any;

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
	activeFileId?: string;
	editorFontId: EditorFontId;
	editorLineHeight: EditorLineHeight;
	properties?: NoteProperty[];
	readOnly?: boolean;
	onChange: (next: { markdown: string; richContent: RichTextDocument }) => void;
	onPropertiesChange?: (properties: NoteProperty[]) => void;
	onEditorReady?: (handle: AiEditorHandle) => void;
	onAiSpellCheck?: () => void;
	onAiContinueWriting?: () => void;
	onTitleCommit?: (title: string) => void;
	onBlur?: () => void;
	onCursorChange?: (position: {
		line: number;
		column: number;
		selection?: { words: number; characters: number };
	}) => void;
	onVimModeChange?: (mode: VimMode | null) => void;
	collab?: TRichTextCollab;
};

async function blocksToMarkdown(editor: EditorInstance): Promise<string> {
	try {
		await Promise.resolve();
		const flattened = flattenInlineChips(editor.document);
		// biome-ignore lint/suspicious/noExplicitAny: blocksToMarkdownLossy accepts schema-shaped blocks
		const markdown = await editor.blocksToMarkdownLossy(flattened as any);
		return markdown;
	} catch {
		return "";
	}
}

function inlineContentToPlainText(content: unknown): string {
	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.map((node) => {
			if (!node || typeof node !== "object") {
				return "";
			}

			const inlineNode = node as {
				text?: unknown;
				content?: unknown;
				props?: { title?: unknown; name?: unknown };
			};

			if (typeof inlineNode.text === "string") {
				return inlineNode.text;
			}

			const nestedText = inlineContentToPlainText(inlineNode.content);
			if (nestedText) {
				return nestedText;
			}

			if (typeof inlineNode.props?.title === "string") {
				return inlineNode.props.title;
			}

			if (typeof inlineNode.props?.name === "string") {
				return inlineNode.props.name;
			}

			return "";
		})
		.join("");
}

function blockToPlainText(block: unknown): string {
	if (!block || typeof block !== "object") return "";
	const node = block as { content?: unknown; children?: unknown };
	const own = inlineContentToPlainText(node.content);
	const childText = Array.isArray(node.children)
		? node.children.map(blockToPlainText).join("\n")
		: "";
	return `${own}\n${childText}`.replace(/\s+/g, " ").trim();
}

function getFirstHeadingTitle(editor: EditorInstance): string {
	const firstHeading = editor.document?.find(
		(block: { type?: unknown }) => block?.type === "heading",
	);
	if (!firstHeading) {
		return "";
	}

	return inlineContentToPlainText((firstHeading as { content?: unknown }).content)
		.trim()
		.replace(/\s+/g, " ");
}

function KeyboardAccessibleSlashMenu({
	items,
	loadingState,
	selectedIndex,
	onItemClick,
}: SuggestionMenuProps<DefaultReactSuggestionItem>) {
	const menuId = useId();
	const [activeIndex, setActiveIndex] = useState(selectedIndex ?? 0);

	useEffect(() => {
		setActiveIndex(selectedIndex ?? 0);
	}, [selectedIndex, items.length]);

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			const suggestionMenu = document.getElementById(menuId);
			if (!suggestionMenu || items.length === 0) {
				return;
			}

			const target = event.target;
			if (!(target instanceof HTMLElement) || !target.closest(".blocknote-wrapper")) {
				return;
			}

			if (event.key === "ArrowDown") {
				event.preventDefault();
				event.stopPropagation();
				setActiveIndex((prev) => (prev + 1) % items.length);
				return;
			}

			if (event.key === "ArrowUp") {
				event.preventDefault();
				event.stopPropagation();
				setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
				return;
			}

			if (event.key === "PageDown") {
				event.preventDefault();
				event.stopPropagation();
				setActiveIndex(items.length - 1);
				return;
			}

			if (event.key === "PageUp") {
				event.preventDefault();
				event.stopPropagation();
				setActiveIndex(0);
				return;
			}

			if (event.key === "Enter" || event.key === "Tab") {
				const item = items[activeIndex];
				if (!item) {
					return;
				}

				event.preventDefault();
				event.stopPropagation();
				onItemClick?.(item);
			}
		}

		document.addEventListener("keydown", handleKeyDown, true);
		return () => document.removeEventListener("keydown", handleKeyDown, true);
	}, [activeIndex, items, menuId, onItemClick]);

	useEffect(() => {
		const activeItem = document.getElementById(`${menuId}-item-${activeIndex}`);
		activeItem?.scrollIntoView({ block: "nearest" });
	}, [activeIndex, menuId]);

	if (loadingState === "loading-initial" || loadingState === "loading") {
		return null;
	}

	return (
		<div
			id={menuId}
			role="listbox"
			aria-label="Editor suggestions"
			aria-activedescendant={`${menuId}-item-${activeIndex}`}
			className="bn-suggestion-menu skriuw-editor-suggestion-menu z-[100] max-h-[min(24rem,50vh)] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl shadow-black/40"
		>
			{items.map((item, index) => (
				<button
					key={`${item.title}-${index}`}
					id={`${menuId}-item-${index}`}
					type="button"
					role="option"
					aria-selected={index === activeIndex}
					onMouseDown={(event) => event.preventDefault()}
					onMouseEnter={() => setActiveIndex(index)}
					onClick={() => onItemClick?.(item)}
					className={cn(
						"flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring/50",
						index === activeIndex
							? "bg-accent text-foreground"
							: "text-muted-foreground hover:bg-accent/70 hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground",
					)}
				>
					{item.icon ? (
						<span className="mt-0.5 shrink-0 text-muted-foreground">{item.icon}</span>
					) : null}
					<span className="min-w-0 flex-1">
						<span className="block truncate text-xs font-medium">{item.title}</span>
						{item.subtext ? (
							<span className="mt-0.5 block truncate text-xs text-muted-foreground">
								{item.subtext}
							</span>
						) : null}
					</span>
					{item.badge ? (
						<span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
							{item.badge}
						</span>
					) : null}
				</button>
			))}
		</div>
	);
}

function NoteLinkMenuList({
	files,
	activeFileId,
	onSelect,
}: {
	files: NoteFile[];
	activeFileId?: string;
	onSelect: (file: NoteFile) => void;
}) {
	const noteItems = files.filter((file) => file.id !== activeFileId).slice(0, 12);

	if (noteItems.length === 0) {
		return <p className="px-3 py-2 text-xs text-muted-foreground">No other notes available.</p>;
	}

	return (
		<div className="max-h-64 min-w-56 overflow-y-auto p-1">
			{noteItems.map((file) => (
				<button
					key={file.id}
					type="button"
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => onSelect(file)}
					className="flex min-h-8 w-full items-center gap-2 rounded-[4px] px-2 text-left text-xs text-foreground/82 transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:outline-none"
				>
					<FileText
						className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
						strokeWidth={1.6}
					/>
					<span className="min-w-0 flex-1 truncate">{getNoteTitle(file)}</span>
				</button>
			))}
		</div>
	);
}

type TAddComment = (range: { from: number; to: number }, body: string) => void;

// The bubble menu is a hand-rolled toolbar of plain <button>s wired straight to
// the editor commands. It deliberately avoids BlockNote's bundled toolbar UI
// (Mantine buttons / Radix overlays): those rely on portals + open/close
// transitions that do not reliably respond to clicks inside this app, while the
// underlying editor commands (toggleStyles / updateBlock / createLink) work
// perfectly. Every control therefore calls a command directly.

type TBlockTypeOption = {
	id: string;
	label: string;
	icon: ReactNode;
	type: string;
	props: Record<string, unknown>;
};

const BLOCK_TYPE_OPTIONS: TBlockTypeOption[] = [
	{
		id: "paragraph",
		label: "Paragraph",
		icon: <Pilcrow size={15} />,
		type: "paragraph",
		props: {},
	},
	{
		id: "heading-1",
		label: "Heading 1",
		icon: <Heading1 size={15} />,
		type: "heading",
		props: { level: 1 },
	},
	{
		id: "heading-2",
		label: "Heading 2",
		icon: <Heading2 size={15} />,
		type: "heading",
		props: { level: 2 },
	},
	{
		id: "heading-3",
		label: "Heading 3",
		icon: <Heading3 size={15} />,
		type: "heading",
		props: { level: 3 },
	},
	{
		id: "bullet",
		label: "Bullet List",
		icon: <List size={15} />,
		type: "bulletListItem",
		props: {},
	},
	{
		id: "numbered",
		label: "Numbered List",
		icon: <ListOrdered size={15} />,
		type: "numberedListItem",
		props: {},
	},
	{
		id: "check",
		label: "Check List",
		icon: <ListChecks size={15} />,
		type: "checkListItem",
		props: {},
	},
	{ id: "quote", label: "Quote", icon: <Quote size={15} />, type: "quote", props: {} },
];

function getTargetBlocks(editor: EditorInstance): { id: string }[] {
	const selection = editor.getSelection?.();
	if (selection?.blocks?.length) {
		return selection.blocks;
	}
	try {
		return [editor.getTextCursorPosition().block];
	} catch {
		noop();
		return [];
	}
}

function applyBlockType(editor: EditorInstance, type: string, props: Record<string, unknown>) {
	for (const block of getTargetBlocks(editor)) {
		editor.updateBlock(block, { type, props });
	}
	editor.focus();
}

function applyAlignment(editor: EditorInstance, textAlignment: string) {
	for (const block of getTargetBlocks(editor)) {
		editor.updateBlock(block, { props: { textAlignment } });
	}
	editor.focus();
}

type TFmtIconButtonProps = {
	label: string;
	icon: ReactNode;
	active: boolean;
	onRun: () => void;
};

function FmtIconButton({ label, icon, active, onRun }: TFmtIconButtonProps) {
	return (
		<button
			type="button"
			className="skriuw-fmt-btn"
			data-active={active ? "true" : undefined}
			aria-label={label}
			aria-pressed={active}
			title={label}
			onMouseDown={(event) => event.preventDefault()}
			onClick={onRun}
		>
			{icon}
		</button>
	);
}

// BlockNote's FormattingToolbarController unmounts and remounts the toolbar on
// editor interaction (a real click on a control triggers it), which would reset
// any in-component dropdown state and instantly close a menu the user just
// opened. So "which menu is open" lives in a module-level store: a remounted
// toolbar reads it back and re-opens the same menu, so dropdowns survive the
// remount. A short debounce distinguishes a remount (toolbar reappears within a
// few frames) from a genuine hide (selection cleared) and resets in the latter.
let openFmtMenuId: string | null = null;
const fmtMenuListeners = new Set<() => void>();
let fmtToolbarMountCount = 0;
let fmtResetTimer: ReturnType<typeof setTimeout> | null = null;

function setOpenFmtMenu(id: string | null) {
	if (openFmtMenuId === id) return;
	openFmtMenuId = id;
	for (const listener of fmtMenuListeners) listener();
}

function useOpenFmtMenu(): string | null {
	return useSyncExternalStore(
		(listener) => {
			fmtMenuListeners.add(listener);
			return () => fmtMenuListeners.delete(listener);
		},
		() => openFmtMenuId,
		() => openFmtMenuId,
	);
}

function registerFmtToolbarMenu(): () => void {
	fmtToolbarMountCount += 1;
	if (fmtResetTimer) {
		clearTimeout(fmtResetTimer);
		fmtResetTimer = null;
	}
	return () => {
		fmtToolbarMountCount -= 1;
		if (fmtToolbarMountCount === 0) {
			fmtResetTimer = setTimeout(() => {
				fmtResetTimer = null;
				if (fmtToolbarMountCount === 0) setOpenFmtMenu(null);
			}, 200);
		}
	};
}

type TFmtMenuProps = {
	id: string;
	trigger: (api: { open: boolean; toggle: () => void }) => ReactNode;
	children: (close: () => void) => ReactNode;
	onOpen?: () => void;
	width?: string;
};

function FmtMenu({ id, trigger, children, onOpen, width }: TFmtMenuProps) {
	const open = useOpenFmtMenu() === id;
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => registerFmtToolbarMenu(), []);

	useEffect(() => {
		if (!open) return;
		const handleOutside = (event: MouseEvent) => {
			if (ref.current && !ref.current.contains(event.target as Node)) {
				setOpenFmtMenu(null);
			}
		};
		document.addEventListener("mousedown", handleOutside, true);
		return () => document.removeEventListener("mousedown", handleOutside, true);
	}, [open]);

	const toggle = () => {
		if (open) {
			setOpenFmtMenu(null);
		} else {
			onOpen?.();
			setOpenFmtMenu(id);
		}
	};

	return (
		<div className="skriuw-fmt-menu" ref={ref}>
			{trigger({ open, toggle })}
			{open ? (
				<div
					className="skriuw-fmt-dropdown"
					role="menu"
					style={width ? ({ minWidth: width } as CSSProperties) : undefined}
				>
					{children(() => setOpenFmtMenu(null))}
				</div>
			) : null}
		</div>
	);
}

type TBlockTypeMenuProps = {
	editor: EditorInstance;
	blockType: string;
	level?: number;
};

function BlockTypeMenu({ editor, blockType, level }: TBlockTypeMenuProps) {
	const current =
		BLOCK_TYPE_OPTIONS.find(
			(option) =>
				option.type === blockType &&
				(option.type !== "heading" || option.props.level === level),
		) ?? BLOCK_TYPE_OPTIONS[0];

	return (
		<FmtMenu
			id="block-type"
			width="12rem"
			trigger={({ open, toggle }) => (
				<button
					type="button"
					className="skriuw-fmt-trigger"
					aria-label="Block type"
					aria-haspopup="menu"
					aria-expanded={open}
					onMouseDown={(event) => event.preventDefault()}
					onClick={toggle}
				>
					<span className="skriuw-fmt-item-icon">{current.icon}</span>
					<span className="skriuw-fmt-trigger-label">{current.label}</span>
					<ChevronDown size={13} className="skriuw-fmt-caret" />
				</button>
			)}
		>
			{(close) =>
				BLOCK_TYPE_OPTIONS.map((option) => (
					<button
						key={option.id}
						type="button"
						className="skriuw-fmt-item"
						data-active={option.id === current.id ? "true" : undefined}
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => {
							applyBlockType(editor, option.type, option.props);
							close();
						}}
					>
						<span className="skriuw-fmt-item-icon">{option.icon}</span>
						<span>{option.label}</span>
					</button>
				))
			}
		</FmtMenu>
	);
}

function LinkPopover({ editor }: { editor: EditorInstance }) {
	const selectedTextRef = useRef("");
	const [url, setUrl] = useState("");

	return (
		<FmtMenu
			id="link"
			width="16rem"
			onOpen={() => {
				selectedTextRef.current = editor.getSelectedText?.() ?? "";
				setUrl("");
			}}
			trigger={({ open, toggle }) => (
				<button
					type="button"
					className="skriuw-fmt-btn"
					aria-label="Create link"
					aria-expanded={open}
					title="Create link"
					onMouseDown={(event) => event.preventDefault()}
					onClick={toggle}
				>
					<Link2 size={15} />
				</button>
			)}
		>
			{(close) => {
				const submit = () => {
					const trimmed = url.trim();
					if (trimmed) {
						editor.focus();
						editor.createLink(trimmed, selectedTextRef.current.trim() || undefined);
					}
					close();
				};
				return (
					<div className="skriuw-fmt-form">
						<input
							autoFocus
							value={url}
							onChange={(event) => setUrl(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									submit();
								}
								if (event.key === "Escape") close();
							}}
							placeholder="Paste a link…"
							className="skriuw-fmt-input"
						/>
						<button
							type="button"
							className="skriuw-fmt-apply"
							onMouseDown={(event) => event.preventDefault()}
							onClick={submit}
						>
							Add
						</button>
					</div>
				);
			}}
		</FmtMenu>
	);
}

type TInternalNoteLinkMenuProps = {
	editor: EditorInstance;
	files: NoteFile[];
	activeFileId?: string;
};

function InternalNoteLinkMenu({ editor, files, activeFileId }: TInternalNoteLinkMenuProps) {
	const selectedTextRef = useRef("");

	return (
		<FmtMenu
			id="note-link"
			width="14rem"
			onOpen={() => {
				selectedTextRef.current = editor.getSelectedText?.() ?? "";
			}}
			trigger={({ open, toggle }) => (
				<button
					type="button"
					className="skriuw-fmt-btn"
					aria-label="Link to a note"
					aria-expanded={open}
					title="Link selected text to another note"
					onMouseDown={(event) => event.preventDefault()}
					onClick={toggle}
				>
					<FileText size={15} />
				</button>
			)}
		>
			{(close) => (
				<NoteLinkMenuList
					files={files}
					activeFileId={activeFileId}
					onSelect={(targetFile) => {
						const title = getNoteTitle(targetFile);
						editor.focus();
						editor.createLink(
							`note://${targetFile.id}`,
							selectedTextRef.current.trim() || title,
						);
						close();
					}}
				/>
			)}
		</FmtMenu>
	);
}

function CommentPopover({
	editor,
	onAddComment,
}: {
	editor: EditorInstance;
	onAddComment: TAddComment;
}) {
	const rangeRef = useRef<{ from: number; to: number } | null>(null);
	const [body, setBody] = useState("");

	return (
		<FmtMenu
			id="comment"
			width="17rem"
			onOpen={() => {
				const selection = editor.prosemirrorView?.state.selection;
				rangeRef.current = selection ? { from: selection.from, to: selection.to } : null;
				setBody("");
			}}
			trigger={({ open, toggle }) => (
				<button
					type="button"
					className="skriuw-fmt-btn"
					aria-label="Comment on selection"
					aria-expanded={open}
					title="Comment on selection"
					onMouseDown={(event) => event.preventDefault()}
					onClick={toggle}
				>
					<MessageSquarePlus size={15} />
				</button>
			)}
		>
			{(close) => {
				const submit = () => {
					const range = rangeRef.current;
					const text = body.trim();
					if (range && text) onAddComment(range, text);
					close();
				};
				return (
					<div className="skriuw-fmt-comment">
						<textarea
							autoFocus
							value={body}
							onChange={(event) => setBody(event.target.value)}
							onKeyDown={(event) => {
								if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
									submit();
								if (event.key === "Escape") close();
							}}
							placeholder="Add a comment…"
							className="skriuw-fmt-textarea"
						/>
						<div className="skriuw-fmt-comment-actions">
							<button
								type="button"
								className="skriuw-fmt-ghost"
								onMouseDown={(event) => event.preventDefault()}
								onClick={close}
							>
								Cancel
							</button>
							<button
								type="button"
								className="skriuw-fmt-apply"
								disabled={!body.trim()}
								onMouseDown={(event) => event.preventDefault()}
								onClick={submit}
							>
								Comment
							</button>
						</div>
					</div>
				);
			}}
		</FmtMenu>
	);
}

type TSelectionBubbleMenuProps = {
	editor: EditorInstance;
	files: NoteFile[];
	activeFileId?: string;
	onAddComment?: TAddComment;
	onAiSpellCheck?: () => void;
	onAiContinueWriting?: () => void;
};

type TVisualViewportState = {
	isMobile: boolean;
	left: number;
	top: number;
	width: number;
	height: number;
};

function getVisualViewportState(): TVisualViewportState {
	const viewport = window.visualViewport;
	const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
	const narrowViewport = window.matchMedia?.("(max-width: 767px)").matches ?? false;

	return {
		isMobile: coarsePointer || narrowViewport,
		left: viewport?.offsetLeft ?? 0,
		top: viewport?.offsetTop ?? 0,
		width: viewport?.width ?? window.innerWidth,
		height: viewport?.height ?? window.innerHeight,
	};
}

function useVisualViewportState(): TVisualViewportState | null {
	const [viewport, setViewport] = useState<TVisualViewportState | null>(null);

	useEffect(() => {
		let frame: number | null = null;
		const update = () => {
			if (frame !== null) cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				frame = null;
				setViewport(getVisualViewportState());
			});
		};
		const visualViewport = window.visualViewport;

		update();
		window.addEventListener("resize", update);
		visualViewport?.addEventListener("resize", update);
		visualViewport?.addEventListener("scroll", update);
		return () => {
			if (frame !== null) cancelAnimationFrame(frame);
			window.removeEventListener("resize", update);
			visualViewport?.removeEventListener("resize", update);
			visualViewport?.removeEventListener("scroll", update);
		};
	}, []);

	return viewport;
}

// Self-contained bubble menu. Watches the editor's selection and renders the
// formatting toolbar above it, fixed-positioned. This replaces BlockNote's
// FormattingToolbarController, which remounts the toolbar on every editor
// transaction and so wiped the open state of any dropdown the user opened. Here
// the toolbar is one stable element that only repositions.
const FOCUSABLE_ITEMS =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Top-level toolbar controls only — excludes focusables inside an open dropdown
// so roving navigation steps between toolbar buttons, not menu entries.
function getToolbarItems(toolbar: HTMLElement): HTMLElement[] {
	return Array.from(toolbar.querySelectorAll<HTMLElement>(FOCUSABLE_ITEMS)).filter(
		(el) => !el.closest(".skriuw-fmt-dropdown"),
	);
}

type TAiMenuProps = {
	onSpellCheck?: () => void;
	onContinueWriting?: () => void;
};

function AiMenu({ onSpellCheck, onContinueWriting }: TAiMenuProps) {
	if (!onSpellCheck && !onContinueWriting) return null;

	return (
		<FmtMenu
			id="ai"
			width="13rem"
			trigger={({ open, toggle }) => (
				<button
					type="button"
					className="skriuw-fmt-btn"
					aria-label="AI actions"
					aria-haspopup="menu"
					aria-expanded={open}
					title="AI"
					onMouseDown={(event) => event.preventDefault()}
					onClick={toggle}
				>
					<Sparkles size={15} />
				</button>
			)}
		>
			{(close) => (
				<>
					{onSpellCheck ? (
						<button
							type="button"
							className="skriuw-fmt-item"
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => {
								onSpellCheck();
								close();
							}}
						>
							<span className="skriuw-fmt-item-icon">
								<SpellCheck size={15} />
							</span>
							<span>Spell check</span>
						</button>
					) : null}
					{onContinueWriting ? (
						<button
							type="button"
							className="skriuw-fmt-item"
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => {
								onContinueWriting();
								close();
							}}
						>
							<span className="skriuw-fmt-item-icon">
								<PenTool size={15} />
							</span>
							<span>Continue writing</span>
						</button>
					) : null}
				</>
			)}
		</FmtMenu>
	);
}

function SelectionBubbleMenu({
	editor,
	files,
	activeFileId,
	onAddComment,
	onAiSpellCheck,
	onAiContinueWriting,
}: TSelectionBubbleMenuProps) {
	const [rect, setRect] = useState<{
		top: number;
		bottom: number;
		left: number;
		width: number;
	} | null>(null);
	const openFmtMenu = useOpenFmtMenu();
	const toolbarRef = useRef<HTMLDivElement>(null);
	const focusRingRef = useRef<HTMLSpanElement>(null);
	const visualViewport = useVisualViewportState();
	const [toolbarHeight, setToolbarHeight] = useState(40);

	// Slides a single highlight pill to sit behind whichever control holds focus.
	// Because it animates from its current box to the target box, the motion is
	// inherently direction-aware (left when moving left, right when moving right).
	const moveFocusRing = useCallback((target: EventTarget | null) => {
		const toolbar = toolbarRef.current;
		const ring = focusRingRef.current;
		if (!toolbar || !ring) return;
		const el =
			target instanceof HTMLElement && !target.closest(".skriuw-fmt-dropdown")
				? target
				: null;
		if (!el || !toolbar.contains(el)) {
			ring.style.opacity = "0";
			return;
		}
		const toolbarBox = toolbar.getBoundingClientRect();
		const box = el.getBoundingClientRect();
		ring.style.opacity = "1";
		ring.style.width = `${box.width}px`;
		ring.style.height = `${box.height}px`;
		ring.style.transform = `translate(${box.left - toolbarBox.left}px, ${box.top - toolbarBox.top}px)`;
	}, []);

	useEffect(() => {
		let frame: number | null = null;

		const compute = () => {
			frame = null;
			// Keyboard focus moved into the toolbar blurs the editor, which would
			// otherwise clear the selection rect and unmount the toolbar mid-use.
			if (toolbarRef.current?.contains(document.activeElement)) {
				return;
			}
			const editorDom = editor.domElement;
			if (!editorDom) {
				setRect(null);
				return;
			}
			const selection = window.getSelection();
			const hasSelection = Boolean(selection && selection.rangeCount > 0);
			const isCollapsed = Boolean(selection?.isCollapsed);
			const range = hasSelection && !isCollapsed ? (selection?.getRangeAt(0) ?? null) : null;
			const isInsideEditor = Boolean(
				range && editorDom.contains(range.commonAncestorContainer),
			);
			const hasSelectedText = Boolean(editor.getSelectedText?.()?.trim());
			if (
				shouldClearSelectionBubbleRect({
					hasOpenMenu: openFmtMenu !== null,
					hasSelection,
					isCollapsed,
					isInsideEditor,
					hasSelectedText,
				})
			) {
				setRect(null);
				return;
			}
			if (!range || !isInsideEditor || !hasSelectedText) {
				return;
			}
			const bounds = range.getBoundingClientRect();
			setRect({
				top: bounds.top,
				bottom: bounds.bottom,
				left: bounds.left,
				width: bounds.width,
			});
		};

		const schedule = () => {
			if (frame !== null) cancelAnimationFrame(frame);
			frame = requestAnimationFrame(compute);
		};

		document.addEventListener("selectionchange", schedule);
		window.addEventListener("scroll", schedule, true);
		window.addEventListener("resize", schedule);
		window.visualViewport?.addEventListener("resize", schedule);
		window.visualViewport?.addEventListener("scroll", schedule);
		return () => {
			if (frame !== null) cancelAnimationFrame(frame);
			document.removeEventListener("selectionchange", schedule);
			window.removeEventListener("scroll", schedule, true);
			window.removeEventListener("resize", schedule);
			window.visualViewport?.removeEventListener("resize", schedule);
			window.visualViewport?.removeEventListener("scroll", schedule);
		};
	}, [editor, openFmtMenu]);

	useEffect(() => {
		if (!rect) return;

		function handleGlobalTab(e: KeyboardEvent) {
			if (e.key !== "Tab" || e.shiftKey) return;
			const toolbar = toolbarRef.current;
			if (!toolbar) return;
			if (toolbar.contains(document.activeElement)) return;
			if (!editor.domElement?.contains(document.activeElement)) return;
			e.preventDefault();
			e.stopPropagation();
			getToolbarItems(toolbar)[0]?.focus();
		}

		document.addEventListener("keydown", handleGlobalTab, true);
		return () => document.removeEventListener("keydown", handleGlobalTab, true);
	}, [rect, editor]);

	useEffect(() => {
		if (!rect) return;
		const toolbar = toolbarRef.current;
		if (!toolbar) return;
		const nextHeight = Math.ceil(toolbar.getBoundingClientRect().height);
		if (nextHeight > 0 && nextHeight !== toolbarHeight) {
			setToolbarHeight(nextHeight);
		}
	}, [rect, toolbarHeight, visualViewport?.width]);

	const state = useEditorState({
		editor,
		selector: ({ editor }) => {
			let blockType = "paragraph";
			let level: number | undefined;
			let align = "left";
			try {
				const block = editor.getTextCursorPosition().block;
				blockType = block.type;
				level = block.props?.level;
				align = block.props?.textAlignment ?? "left";
			} catch {
				noop();
			}
			let styles: Record<string, unknown> = {};
			try {
				styles = editor.getActiveStyles() ?? {};
			} catch {
				noop();
			}
			return {
				bold: Boolean(styles.bold),
				italic: Boolean(styles.italic),
				underline: Boolean(styles.underline),
				strike: Boolean(styles.strike),
				code: Boolean(styles.code),
				blockType,
				level,
				align,
			};
		},
	});

	if (!rect) return null;

	const mobileViewport = visualViewport?.isMobile ? visualViewport : null;
	const positionStyle: CSSProperties = mobileViewport
		? {
				position: "fixed",
				left: mobileViewport.left + 8,
				top: Math.max(
					mobileViewport.top + 8,
					mobileViewport.top + mobileViewport.height - toolbarHeight - 10,
				),
				width: Math.max(0, mobileViewport.width - 16),
				zIndex: 60,
			}
		: (() => {
				const placeBelow = rect.top < 96;
				const centerX = rect.left + rect.width / 2;
				const left = Math.min(Math.max(centerX, 170), window.innerWidth - 170);
				return {
					position: "fixed",
					left,
					zIndex: 60,
					...(placeBelow
						? { top: rect.bottom + 8, transform: "translateX(-50%)" }
						: { top: rect.top - 8, transform: "translate(-50%, -100%)" }),
				};
			})();

	return (
		<div
			ref={toolbarRef}
			className="bn-toolbar bn-formatting-toolbar skriuw-fmt-toolbar"
			data-mobile={mobileViewport ? "true" : undefined}
			role="toolbar"
			aria-label="Text formatting"
			style={positionStyle}
			onMouseDown={(event) => {
				const target = event.target;
				if (target instanceof HTMLElement && target.closest("input, textarea")) return;
				event.preventDefault();
			}}
			onFocusCapture={(e) => moveFocusRing(e.target)}
			onBlurCapture={(e) => {
				const toolbar = toolbarRef.current;
				if (!toolbar || !toolbar.contains(e.relatedTarget as Node | null)) {
					moveFocusRing(null);
				}
			}}
			onKeyDown={(e) => {
				const toolbar = toolbarRef.current;
				if (!toolbar) return;

				if (e.key === "Escape") {
					e.preventDefault();
					editor.focus();
					return;
				}

				const items = getToolbarItems(toolbar);
				if (items.length === 0) return;
				const active = document.activeElement as HTMLElement | null;
				const index = active ? items.indexOf(active) : -1;

				if (e.key === "Tab") {
					if (e.shiftKey && index === 0) {
						e.preventDefault();
						editor.focus();
					} else if (!e.shiftKey && index === items.length - 1) {
						e.preventDefault();
						editor.focus();
					}
					return;
				}

				// Roving arrow navigation between top-level controls, wrapping at the ends.
				if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
					if (index === -1) return;
					e.preventDefault();
					const dir = e.key === "ArrowRight" ? 1 : -1;
					items[(index + dir + items.length) % items.length]?.focus();
					return;
				}

				// Down opens the focused menu trigger (block type / AI), matching toolbar conventions.
				if (e.key === "ArrowDown" && active?.getAttribute("aria-haspopup") === "menu") {
					if (active.getAttribute("aria-expanded") !== "true") {
						e.preventDefault();
						active.click();
					}
				}
			}}
		>
			<span ref={focusRingRef} className="skriuw-fmt-focus-ring" aria-hidden="true" />
			<BlockTypeMenu editor={editor} blockType={state.blockType} level={state.level} />
			<span className="skriuw-fmt-sep" />
			<FmtIconButton
				label="Bold"
				active={state.bold}
				icon={<Bold size={15} />}
				onRun={() => editor.toggleStyles({ bold: true })}
			/>
			<FmtIconButton
				label="Italic"
				active={state.italic}
				icon={<Italic size={15} />}
				onRun={() => editor.toggleStyles({ italic: true })}
			/>
			<FmtIconButton
				label="Underline"
				active={state.underline}
				icon={<Underline size={15} />}
				onRun={() => editor.toggleStyles({ underline: true })}
			/>
			<FmtIconButton
				label="Strikethrough"
				active={state.strike}
				icon={<Strikethrough size={15} />}
				onRun={() => editor.toggleStyles({ strike: true })}
			/>
			<FmtIconButton
				label="Inline code"
				active={state.code}
				icon={<Code size={15} />}
				onRun={() => editor.toggleStyles({ code: true })}
			/>
			<span className="skriuw-fmt-sep" />
			<FmtIconButton
				label="Align left"
				active={state.align === "left"}
				icon={<AlignLeft size={15} />}
				onRun={() => applyAlignment(editor, "left")}
			/>
			<FmtIconButton
				label="Align center"
				active={state.align === "center"}
				icon={<AlignCenter size={15} />}
				onRun={() => applyAlignment(editor, "center")}
			/>
			<FmtIconButton
				label="Align right"
				active={state.align === "right"}
				icon={<AlignRight size={15} />}
				onRun={() => applyAlignment(editor, "right")}
			/>
			<span className="skriuw-fmt-sep" />
			<LinkPopover editor={editor} />
			<InternalNoteLinkMenu editor={editor} files={files} activeFileId={activeFileId} />
			{onAddComment ? <CommentPopover editor={editor} onAddComment={onAddComment} /> : null}
			{onAiSpellCheck || onAiContinueWriting ? (
				<>
					<span className="skriuw-fmt-sep" />
					<AiMenu onSpellCheck={onAiSpellCheck} onContinueWriting={onAiContinueWriting} />
				</>
			) : null}
		</div>
	);
}

function LinkKindBadge({ url }: { url: string }) {
	const isInternal = url.startsWith("note://");
	return (
		<span className="mx-1 inline-flex h-7 items-center rounded-[4px] border border-border/80 px-2 text-[11px] font-medium text-muted-foreground">
			{isInternal ? "Internal" : "External"}
		</span>
	);
}

function ConvertLinkToNoteButton({
	files,
	activeFileId,
	text,
	range,
	setToolbarOpen,
}: Pick<LinkToolbarProps, "text" | "range" | "setToolbarOpen"> & {
	files: NoteFile[];
	activeFileId?: string;
}) {
	const Components = useComponentsContext()!;
	const { editLink } = useExtension(LinkToolbarExtension);
	const [open, setOpen] = useState(false);

	return (
		<Components.Generic.Popover.Root open={open} onOpenChange={setOpen}>
			<Components.Generic.Popover.Trigger>
				<Components.LinkToolbar.Button
					className="bn-button"
					label="Link note"
					mainTooltip="Point this link at another note"
					icon={<FileText />}
					isSelected={false}
				/>
			</Components.Generic.Popover.Trigger>
			<Components.Generic.Popover.Content
				className="bn-popover-content"
				variant="form-popover"
			>
				<NoteLinkMenuList
					files={files}
					activeFileId={activeFileId}
					onSelect={(targetFile) => {
						editLink(
							`note://${targetFile.id}`,
							text.trim() || getNoteTitle(targetFile),
							range.from,
						);
						setOpen(false);
						setToolbarOpen?.(false);
					}}
				/>
			</Components.Generic.Popover.Content>
		</Components.Generic.Popover.Root>
	);
}

function CustomLinkToolbar(
	props: LinkToolbarProps & {
		files: NoteFile[];
		activeFileId?: string;
	},
) {
	const Components = useComponentsContext()!;
	const setActiveFileId = useNotesStore((state) => state.setActiveFileId);
	const internalNoteId = props.url.startsWith("note://")
		? props.url.replace(/^note:\/\//, "")
		: null;

	return (
		<Components.LinkToolbar.Root className="bn-toolbar bn-link-toolbar">
			<LinkKindBadge url={props.url} />
			<EditLinkButton
				url={props.url}
				text={props.text}
				range={props.range}
				setToolbarOpen={props.setToolbarOpen}
				setToolbarPositionFrozen={props.setToolbarPositionFrozen}
			/>
			<ConvertLinkToNoteButton
				files={props.files}
				activeFileId={props.activeFileId}
				text={props.text}
				range={props.range}
				setToolbarOpen={props.setToolbarOpen}
			/>
			{internalNoteId ? (
				<Components.LinkToolbar.Button
					className="bn-button"
					label="Open note"
					mainTooltip="Open linked note"
					icon={<FileText />}
					isSelected={false}
					onClick={() => {
						setActiveFileId(internalNoteId);
						const url = new URL(window.location.href);
						url.searchParams.set("note", internalNoteId);
						window.history.pushState({}, "", url.toString());
						props.setToolbarOpen?.(false);
					}}
				/>
			) : (
				<OpenLinkButton url={props.url} />
			)}
			<DeleteLinkButton range={props.range} setToolbarOpen={props.setToolbarOpen} />
		</Components.LinkToolbar.Root>
	);
}

function insertTagChip(editor: EditorInstance, name: string) {
	const trimmed = name.trim().replace(/^#/, "");
	if (!trimmed) return;
	// biome-ignore lint/suspicious/noExplicitAny: custom inline content type
	editor.insertInlineContent([{ type: "tag", props: { name: trimmed } } as any, " "]);
}

function insertNoteLinkChip(editor: EditorInstance, title: string) {
	const trimmed = title.trim();
	if (!trimmed) return;
	// biome-ignore lint/suspicious/noExplicitAny: custom inline content type
	editor.insertInlineContent([{ type: "noteLink", props: { title: trimmed } } as any, " "]);
}

function insertUserChip(editor: EditorInstance, name: string) {
	const trimmed = name
		.trim()
		.replace(/^\$/, "")
		.replace(/[^a-zA-Z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!trimmed) return;
	// biome-ignore lint/suspicious/noExplicitAny: custom inline content type
	editor.insertInlineContent([{ type: "user", props: { name: trimmed } } as any, " "]);
}

function openNoteMentionMenu(editor: EditorInstance) {
	const suggestionMenu = editor.getExtension?.(SuggestionMenuExtension);
	if (!suggestionMenu) {
		editor.insertInlineContent("@", { updateSelection: true });
		return;
	}

	suggestionMenu.openSuggestionMenu("@", {
		deleteTriggerCharacter: true,
		ignoreQueryLength: true,
	});
}

function getTagMenuItems(
	editor: EditorInstance,
	tags: string[],
	query: string,
): DefaultReactSuggestionItem[] {
	const normalizedQuery = query.trim().replace(/^#/, "").toLowerCase();
	const existingItems: DefaultReactSuggestionItem[] = tags.map((tag) => ({
		title: tag,
		subtext: "Tag",
		group: "Tags",
		onItemClick: () => {
			insertTagChip(editor, tag);
		},
	}));

	const shouldOfferCreate =
		normalizedQuery.length > 0 && !tags.some((tag) => tag.toLowerCase() === normalizedQuery);

	return [
		...(shouldOfferCreate
			? [
					{
						title: normalizedQuery,
						subtext: "Create tag",
						group: "Tags",
						onItemClick: () => {
							insertTagChip(editor, normalizedQuery);
						},
					},
				]
			: []),
		...filterSuggestionItems(existingItems, normalizedQuery),
	];
}

function getUserMentionMenuItems(
	editor: EditorInstance,
	users: string[],
	query: string,
): DefaultReactSuggestionItem[] {
	const normalizedQuery = query.trim().replace(/^\$/, "");
	const slugQuery = normalizedQuery.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
	const existingItems: DefaultReactSuggestionItem[] = users.map((user) => ({
		title: user,
		subtext: "User",
		group: "Users",
		onItemClick: () => {
			insertUserChip(editor, user);
		},
	}));

	const shouldOfferCreate =
		slugQuery.length > 0 &&
		!users.some((user) => user.toLowerCase() === slugQuery.toLowerCase());

	return [
		...(shouldOfferCreate
			? [
					{
						title: slugQuery,
						subtext: "Mention user",
						group: "Users",
						onItemClick: () => {
							insertUserChip(editor, slugQuery);
						},
					},
				]
			: []),
		...filterSuggestionItems(existingItems, normalizedQuery),
	];
}

function getNoteMentionMenuItems(
	editor: EditorInstance,
	files: NoteFile[],
	activeFileId: string | undefined,
	query: string,
	onCreate: (title: string) => void,
): DefaultReactSuggestionItem[] {
	const existingItems: DefaultReactSuggestionItem[] = files
		.filter((file) => file.id !== activeFileId)
		.map((file) => {
			const title = getNoteTitle(file);
			const tags = extractNoteTags(getNoteSearchableContent(file));
			return {
				title,
				subtext: tags.length ? `#${tags.slice(0, 2).join(" #")}` : "Note",
				group: "Notes",
				onItemClick: () => {
					insertNoteLinkChip(editor, title);
				},
			};
		});

	const filtered = filterSuggestionItems(existingItems, query);
	const trimmedQuery = query.trim();
	const hasExactMatch =
		trimmedQuery.length > 0 &&
		existingItems.some((item) => item.title.toLowerCase() === trimmedQuery.toLowerCase());

	if (trimmedQuery.length > 0 && !hasExactMatch) {
		return [
			...filtered,
			{
				title: trimmedQuery,
				subtext: "Create new note and link",
				group: "Create",
				onItemClick: () => {
					onCreate(trimmedQuery);
					insertNoteLinkChip(editor, trimmedQuery);
				},
			},
		];
	}

	return filtered;
}

function getCustomSlashMenuItems(
	editor: EditorInstance,
	onAiSpellCheck?: () => void,
	onAiContinueWriting?: () => void,
): DefaultReactSuggestionItem[] {
	const aiItems: DefaultReactSuggestionItem[] =
		onAiSpellCheck && onAiContinueWriting
			? [
					{
						title: "Spell Check",
						aliases: ["ai", "spell", "fix", "grammar"],
						group: "AI",
						icon: <SpellCheck size={16} />,
						subtext: "Fix spelling and grammar with AI",
						onItemClick: onAiSpellCheck,
					},
					{
						title: "Continue Writing",
						aliases: ["ai", "continue", "expand", "write"],
						group: "AI",
						icon: <PenTool size={16} />,
						subtext: "Expand content with AI",
						onItemClick: onAiContinueWriting,
					},
				]
			: [];

	return [
		...getDefaultReactSlashMenuItems(editor),
		{
			title: "File tree",
			aliases: ["tree", "folder", "files", "map", "directory"],
			group: "Structure",
			icon: <FolderTree size={16} />,
			subtext: "Insert a readable file map",
			onItemClick: () => {
				insertOrUpdateBlockForSlashMenu(editor, {
					type: "fileTree",
					props: { source: DEFAULT_FILE_TREE_SOURCE },
					// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
				} as any);
			},
		},
		{
			title: "Tag",
			aliases: ["tag", "label", "hash"],
			icon: <Tag size={16} />,
			group: "Connect",
			subtext: "Insert a tag marker",
			onItemClick: () => {
				editor.insertInlineContent("#", { updateSelection: true });
			},
		},
		{
			title: "Link note",
			aliases: ["mention", "backlink", "wiki"],
			icon: <Link2 size={16} />,
			group: "Connect",
			subtext: "Mention another note",
			onItemClick: () => {
				openNoteMentionMenu(editor);
			},
		},
		...aiItems,
	];
}

export function RichTextEditor({
	content,
	richContent,
	files = [],
	activeFileId,
	editorFontId,
	editorLineHeight,
	properties = [],
	readOnly = false,
	onChange,
	onPropertiesChange,
	onEditorReady,
	onAiSpellCheck,
	onAiContinueWriting,
	onTitleCommit,
	onBlur,
	onCursorChange,
	onVimModeChange,
	collab,
}: RichTextEditorProps) {
	const appTheme = usePreferencesStore((state) => state.appearance.theme);
	const blockNoteTheme = appTheme === "paper" ? "light" : "dark";
	const lastContentRef = useRef(content);
	const lastRichContentRef = useRef<string>(JSON.stringify(richContent ?? []));
	const pendingMarkdownRef = useRef(content);
	const pendingRichContentRef = useRef<RichTextDocument>(
		upgradeRichDocumentChips(resolveRichDocument(content, richContent)),
	);
	const isInternalChangeRef = useRef(false);
	const hasNormalizedInitialContentRef = useRef(false);
	const activeFileIdRef = useRef(activeFileId);
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const serializeRunIdRef = useRef(0);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const aiDiffHighlightRef = useRef<AiDiffHighlightHandle | null>(null);

	const initialBlocks = useMemo(() => {
		const base = resolveRichDocument(content, richContent);
		return upgradeRichDocumentChips(base);
	}, []);

	// When collaborating, content comes from the shared Yjs fragment — passing
	// `initialContent` alongside `collaboration` is invalid and would duplicate
	// the document. `collab` is fixed for this editor's lifetime (the parent only
	// mounts the collaborative editor once the room is synced, and keys it by
	// note), so reading it once at creation is correct.
	const editor = useCreateBlockNote(
		collab
			? {
					schema: editorSchema,
					collaboration: {
						fragment: collab.fragment,
						user: collab.user,
						provider: { awareness: collab.awareness ?? undefined },
						// Always show the name label on remote carets so it's clear
						// whose selection/cursor is whose, not just on movement.
						showCursorLabels: "always",
					},
				}
			: {
					schema: editorSchema,
					initialContent: initialBlocks,
				},
	);
	const searchPlugin = useMemo(() => createSearchPlugin(), []);
	const vimModeEnabled = usePreferencesStore((state) => state.editor.vimMode);
	const onVimModeChangeRef = useRef(onVimModeChange);
	onVimModeChangeRef.current = onVimModeChange;
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [replaceValue, setReplaceValue] = useState("");
	const [showReplace, setShowReplace] = useState(false);
	const [searchOptions, setSearchOptions] = useState<SearchOptions>({
		...defaultSearchOptions,
	});
	const [matchInfo, setMatchInfo] = useState({ current: 0, total: 0 });
	const findInputRef = useRef<HTMLInputElement>(null);
	const prefersReducedMotion = useReducedMotion() ?? false;
	const searchWidgetTransition = pickTransition(prefersReducedMotion, FAST_SWAP_TRANSITION);
	const workspaceTags = useMemo(() => getWorkspaceTags(files), [files]);
	const workspaceUsers = useMemo(() => getWorkspaceUsers(files), [files]);
	const { createAndOpenNote, openNote } = useNoteLinkActions(files);

	// Anchored comments live alongside the document in the same Yjs room; the
	// engine only attaches on collaborative notes and tears down otherwise.
	const { addComment } = useAnchoredMarks(editor, collab ?? null);

	const regexError = useMemo(() => {
		if (!searchOptions.regex || searchQuery.length === 0) return false;
		return buildRegex(searchQuery, searchOptions) === null;
	}, [searchOptions, searchQuery]);

	const syncMatchInfo = useCallback(() => {
		const view = editor.prosemirrorView;
		const state = view ? getSearchState(view) : undefined;
		setMatchInfo({ current: state?.current ?? 0, total: state?.matches.length ?? 0 });
	}, [editor]);

	const focusSearchInput = useCallback(() => {
		requestAnimationFrame(() => {
			findInputRef.current?.focus();
			findInputRef.current?.select();
		});
	}, []);

	const openSearch = useCallback(() => {
		setSearchOpen(true);
		focusSearchInput();
	}, [focusSearchInput]);

	const closeSearch = useCallback(() => {
		setSearchOpen(false);
		const view = editor.prosemirrorView;
		if (view) {
			clearSearch(view);
			view.focus();
		}
	}, [editor]);

	const toggleSearch = useCallback(() => {
		if (searchOpen) {
			closeSearch();
			return;
		}
		openSearch();
	}, [closeSearch, openSearch, searchOpen]);

	const toggleSearchOption = useCallback((key: keyof SearchOptions) => {
		setSearchOptions((prev) => ({ ...prev, [key]: !prev[key] }));
	}, []);

	const handleNextMatch = useCallback(() => {
		const view = editor.prosemirrorView;
		if (!view) return;
		nextMatch(view);
		syncMatchInfo();
	}, [editor, syncMatchInfo]);

	const handlePreviousMatch = useCallback(() => {
		const view = editor.prosemirrorView;
		if (!view) return;
		previousMatch(view);
		syncMatchInfo();
	}, [editor, syncMatchInfo]);

	const handleReplaceCurrent = useCallback(() => {
		const view = editor.prosemirrorView;
		if (!view) return;
		replaceCurrent(view, replaceValue);
		syncMatchInfo();
	}, [editor, replaceValue, syncMatchInfo]);

	const handleReplaceAll = useCallback(() => {
		const view = editor.prosemirrorView;
		if (!view) return;
		replaceAll(view, replaceValue);
		syncMatchInfo();
	}, [editor, replaceValue, syncMatchInfo]);

	useEffect(() => {
		const tiptap = editor._tiptapEditor;
		if (!tiptap) return;
		tiptap.registerPlugin(searchPlugin);
		return () => {
			tiptap.unregisterPlugin(searchPluginKey);
		};
	}, [editor, searchPlugin]);

	useEffect(() => {
		const tiptap = editor._tiptapEditor;
		if (!tiptap || !vimModeEnabled || readOnly) return;
		const plugin = createVimPlugin((mode) => onVimModeChangeRef.current?.(mode));
		tiptap.registerPlugin(plugin);
		onVimModeChangeRef.current?.("normal");
		return () => {
			tiptap.unregisterPlugin(vimPluginKey);
			editor.prosemirrorView?.dom.classList.remove("vim-normal", "vim-insert");
			onVimModeChangeRef.current?.(null);
		};
	}, [editor, vimModeEnabled, readOnly]);

	useEffect(() => {
		const view = editor.prosemirrorView;
		if (!view) return;
		setSearch(view, searchQuery, searchOptions);
		syncMatchInfo();
	}, [editor, searchOptions, searchQuery, syncMatchInfo]);

	useShortcutMap(
		{
			findInNote: {
				keys: "mod+f",
				handler: toggleSearch,
				options: {
					description: "Find in note",
					preventDefault: true,
					stopOnMatch: true,
				},
			},
		},
		{
			ignoreInputs: false,
		},
	);

	useShortcutMap(
		{
			matchCase: {
				keys: "alt+c",
				handler: () => toggleSearchOption("caseSensitive"),
				options: {
					description: "Toggle match case",
					preventDefault: true,
				},
			},
			wholeWord: {
				keys: "alt+w",
				handler: () => toggleSearchOption("wholeWord"),
				options: {
					description: "Toggle whole word",
					preventDefault: true,
				},
			},
			regex: {
				keys: "alt+r",
				handler: () => toggleSearchOption("regex"),
				options: {
					description: "Toggle regular expression",
					preventDefault: true,
				},
			},
		},
		{
			disabled: !searchOpen,
			ignoreInputs: false,
		},
	);

	const handleCreateNoteFromMention = useCallback(
		(title: string) => {
			createAndOpenNote(title);
		},
		[createAndOpenNote],
	);

	useEffect(() => {
		const domElement = editor.domElement;
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
	}, [editor.domElement, openNote]);

	useEffect(() => {
		if (!onTitleCommit) return;

		const domElement = editor.domElement;
		if (!domElement) return;

		const isFirstHeadingElement = (target: EventTarget | null) => {
			if (!(target instanceof HTMLElement)) {
				return false;
			}

			const heading = target.closest('[data-content-type="heading"]');
			if (!heading || !domElement.contains(heading)) {
				return false;
			}

			return heading === domElement.querySelector('[data-content-type="heading"]');
		};

		const handleTitleFocusOut = (event: FocusEvent) => {
			if (!isFirstHeadingElement(event.target)) {
				return;
			}

			const relatedTarget = event.relatedTarget;
			if (relatedTarget instanceof Node && domElement.contains(relatedTarget)) {
				const nextHeading =
					relatedTarget instanceof HTMLElement
						? relatedTarget.closest('[data-content-type="heading"]')
						: null;
				if (
					nextHeading &&
					nextHeading === domElement.querySelector('[data-content-type="heading"]')
				) {
					return;
				}
			}

			const title = getFirstHeadingTitle(editor);
			if (title) {
				onTitleCommit(title);
			}
		};

		domElement.addEventListener("focusout", handleTitleFocusOut);
		return () => domElement.removeEventListener("focusout", handleTitleFocusOut);
	}, [editor, editor.domElement, onTitleCommit]);

	// Commit the title the moment the caret leaves the first heading block —
	// pressing Enter, Tab, or navigating into another block. `focusout` above only
	// fires when focus leaves the editor entirely, so without this the filename
	// wouldn't follow the heading until the editor blurred. Caret moves between
	// blocks don't blur the (single) contenteditable, so we watch the selection.
	useEffect(() => {
		if (!onTitleCommit) return;
		const domElement = editor.domElement;
		if (!domElement) return;

		let wasInFirstHeading = false;

		const getFirstHeadingBlockId = (): string | null => {
			const first = editor.document?.find(
				(block: { type?: unknown }) => block?.type === "heading",
			);
			return (first as { id?: string } | undefined)?.id ?? null;
		};

		const checkHeadingExit = () => {
			const firstHeadingId = getFirstHeadingBlockId();
			let currentBlockId: string | null = null;
			try {
				currentBlockId = editor.getTextCursorPosition?.().block?.id ?? null;
			} catch {
				// Throws when the editor isn't focused — treat as "not in heading".
				currentBlockId = null;
			}
			const inFirstHeading = firstHeadingId !== null && currentBlockId === firstHeadingId;
			if (wasInFirstHeading && !inFirstHeading) {
				const title = getFirstHeadingTitle(editor);
				if (title) {
					onTitleCommit(title);
				}
			}
			wasInFirstHeading = inFirstHeading;
		};

		// Defer to the next frame so the editor's cursor position reflects the move.
		const handler = () => window.requestAnimationFrame(checkHeadingExit);

		document.addEventListener("selectionchange", handler);
		window.requestAnimationFrame(checkHeadingExit);
		return () => document.removeEventListener("selectionchange", handler);
	}, [editor, editor.domElement, onTitleCommit]);

	useEffect(() => {
		if (!onCursorChange) return;
		const root = wrapperRef.current ?? editor.domElement;
		if (!root) return;

		let animationFrame: number | null = null;

		const clearSelectionStatus = () => {
			onCursorChange({ line: 1, column: 1 });
		};

		const reportSelection = () => {
			const selection = document.getSelection();
			if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
				clearSelectionStatus();
				return;
			}

			const range = selection.getRangeAt(0);
			if (!root.contains(range.commonAncestorContainer)) {
				clearSelectionStatus();
				return;
			}

			const selectedText = selection.toString();
			if (!selectedText) {
				clearSelectionStatus();
				return;
			}

			const trimmed = selectedText.trim();
			onCursorChange({
				line: 1,
				column: 1,
				selection: {
					words: trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0,
					characters: selectedText.length,
				},
			});
		};

		const queueSelectionReport = () => {
			if (animationFrame !== null) {
				window.cancelAnimationFrame(animationFrame);
			}

			animationFrame = window.requestAnimationFrame(() => {
				animationFrame = null;
				reportSelection();
			});
		};

		document.addEventListener("selectionchange", queueSelectionReport);
		document.addEventListener("pointerup", queueSelectionReport);
		root.addEventListener("blur", queueSelectionReport, true);
		root.addEventListener("focusout", queueSelectionReport);
		root.addEventListener("keyup", queueSelectionReport);
		root.addEventListener("pointerdown", queueSelectionReport);
		root.addEventListener("pointerup", queueSelectionReport);
		return () => {
			if (animationFrame !== null) {
				window.cancelAnimationFrame(animationFrame);
			}

			document.removeEventListener("selectionchange", queueSelectionReport);
			document.removeEventListener("pointerup", queueSelectionReport);
			root.removeEventListener("blur", queueSelectionReport, true);
			root.removeEventListener("focusout", queueSelectionReport);
			root.removeEventListener("keyup", queueSelectionReport);
			root.removeEventListener("pointerdown", queueSelectionReport);
			root.removeEventListener("pointerup", queueSelectionReport);
		};
	}, [editor.domElement, onCursorChange]);

	useEffect(() => {
		if (!onEditorReady) return;

		function highlightBlocks(ids: string[]) {
			if (ids.length === 0) return;
			aiDiffHighlightRef.current?.cancel();
			let attempts = 0;
			const resolve = () => {
				const root = wrapperRef.current ?? editor.domElement;
				const els = root
					? ids
							.map((id) =>
								root.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`),
							)
							.filter((el): el is HTMLElement => el !== null)
					: [];
				if (els.length > 0) {
					aiDiffHighlightRef.current = showAiDiffHighlight(els);
					return;
				}
				attempts += 1;
				if (attempts < 40) requestAnimationFrame(resolve);
			};
			requestAnimationFrame(resolve);
		}

		onEditorReady({
			getMarkdown: () => blocksToMarkdown(editor),
			replaceContent: (markdown) => {
				const beforeTexts = editor.document.map(blockToPlainText);
				const parsed = markdownToRichDocument(markdown);
				const parsedTexts = parsed.map(blockToPlainText);
				const corrected =
					parsed.length > beforeTexts.length
						? selectCorrectedIndices(beforeTexts, parsedTexts).map((k) => parsed[k])
						: parsed;
				// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
				editor.replaceBlocks(editor.document, corrected as any);
				const afterBlocks = editor.document;
				const afterTexts = afterBlocks.map(blockToPlainText);
				const changedIds = diffChangedIndices(beforeTexts, afterTexts)
					.filter((index) => afterTexts[index].length > 0)
					.map((index) => afterBlocks[index].id);
				highlightBlocks(changedIds);
			},
			continueWriting: (markdown) => {
				const blocks = markdownToRichDocument(markdown);
				if (blocks.length === 0) return;
				const doc = editor.document;
				let anchorIndex = doc.length - 1;
				while (anchorIndex >= 0 && blockToPlainText(doc[anchorIndex]).length === 0) {
					anchorIndex -= 1;
				}
				const anchor = anchorIndex >= 0 ? doc[anchorIndex] : null;
				const anchorType = (anchor as { type?: string } | null)?.type;
				if (anchor && (anchorType === "paragraph" || anchorType === "quote")) {
					// The model restates the cut-off final paragraph as its first
					// block (completing the dangling word/sentence), then continues.
					// Replacing the anchor merges that completion in place instead of
					// orphaning a half-finished line above brand-new text.
					const { insertedBlocks } = editor.replaceBlocks(
						[anchor],
						// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
						blocks as any,
					);
					highlightBlocks(insertedBlocks.map((b) => b.id));
					return;
				}
				const reference = anchor ?? doc[doc.length - 1];
				const inserted = editor.insertBlocks(
					// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
					blocks as any,
					reference,
					"after",
				);
				highlightBlocks(inserted.map((b) => b.id));
			},
			setTitle: (title: string) => {
				const firstBlock = editor.document[0];
				if (!firstBlock) return;
				// biome-ignore lint/suspicious/noExplicitAny: custom schema block shape
				const content = [{ type: "text", text: title, styles: {} }] as any;
				if ((firstBlock as { type?: string }).type === "heading") {
					editor.updateBlock(firstBlock, { content });
				} else {
					// biome-ignore lint/suspicious/noExplicitAny: custom schema block shape
					editor.insertBlocks(
						[{ type: "heading", props: { level: 1 }, content }] as any,
						firstBlock,
						"before",
					);
				}
			},
		});
		return () => {
			aiDiffHighlightRef.current?.cancel();
			aiDiffHighlightRef.current = null;
		};
	}, [editor, onEditorReady]);

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

		const serializeStart = performance.now();
		// biome-ignore lint/suspicious/noExplicitAny: schema-flexible blocks
		const nextRichContent = cloneRichDocument(editor.document as any);
		const nextRichContentKey = JSON.stringify(nextRichContent);
		perf.serialize(performance.now() - serializeStart);

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

		window.setTimeout(() => {
			isInternalChangeRef.current = false;
		}, 80);
	}, [editor, onChange]);

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
		if (!editor || isInternalChangeRef.current) return;
		const baseRichContent = resolveRichDocument(content, richContent);
		const nextRichContent = upgradeRichDocumentChips(baseRichContent);
		const nextRichContentKey = JSON.stringify(nextRichContent);
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
		<div
			ref={wrapperRef}
			onMouseDown={(event) => {
				const target = event.target;
				if (!(target instanceof HTMLElement)) return;
				if (!target.closest(".bn-toolbar")) return;
				// Text inputs (link URL field, comment textarea) must receive
				// focus, so don't swallow their mousedown.
				if (target.closest("input, textarea, [contenteditable='true']")) return;
				// Mantine's toolbar buttons don't preventDefault on mousedown, so a
				// real mouse press on a control collapses the editor's text
				// selection — the formatting command then applies to nothing and the
				// selection-anchored toolbar dismisses. Menus and popovers toggle on
				// click, so preventing the mousedown default preserves the selection
				// without blocking them from opening.
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
				flushPendingEditorChange();
				onBlur?.();
			}}
			className="blocknote-wrapper relative h-full min-h-full px-6 py-3"
			style={
				{
					"--bn-font-family": getEditorFontFamily(editorFontId),
					"--skriuw-editor-line-height": getEditorLineHeightValue(editorLineHeight),
				} as CSSProperties
			}
		>
			<AnimatePresence>
				{searchOpen ? (
					<motion.div
						className="absolute top-3 right-4 z-40 origin-top-right"
						initial={
							prefersReducedMotion
								? { opacity: 0 }
								: { opacity: 0, y: -6, scale: 0.98 }
						}
						animate={
							prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
						}
						exit={
							prefersReducedMotion
								? { opacity: 0 }
								: { opacity: 0, y: -4, scale: 0.98 }
						}
						transition={searchWidgetTransition}
					>
						<SearchWidget
							ref={findInputRef}
							query={searchQuery}
							onQueryChange={setSearchQuery}
							replaceValue={replaceValue}
							onReplaceChange={setReplaceValue}
							showReplace={showReplace}
							onToggleReplace={() => setShowReplace((value) => !value)}
							options={searchOptions}
							onToggleOption={toggleSearchOption}
							current={matchInfo.current}
							total={matchInfo.total}
							regexError={regexError}
							onNext={handleNextMatch}
							onPrevious={handlePreviousMatch}
							onClose={closeSearch}
							onReplaceCurrent={handleReplaceCurrent}
							onReplaceAll={handleReplaceAll}
						/>
					</motion.div>
				) : null}
			</AnimatePresence>
			{onPropertiesChange ? (
				<NotePropertiesShelf
					properties={properties}
					readOnly={readOnly}
					onChange={onPropertiesChange}
				/>
			) : null}
			<NoteLinkProvider files={files} activeFileId={activeFileId}>
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
						getItems={async (query) =>
							filterSuggestionItems(
								getCustomSlashMenuItems(
									editor,
									onAiSpellCheck,
									onAiContinueWriting,
								),
								query,
							)
						}
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
						getItems={async (query) => getTagMenuItems(editor, workspaceTags, query)}
					/>
					<SuggestionMenuController
						triggerCharacter="$"
						suggestionMenuComponent={KeyboardAccessibleSlashMenu}
						getItems={async (query) =>
							getUserMentionMenuItems(editor, workspaceUsers, query)
						}
					/>
					<SelectionBubbleMenu
						editor={editor}
						files={files}
						activeFileId={activeFileId}
						onAddComment={collab ? addComment : undefined}
						onAiSpellCheck={onAiSpellCheck}
						onAiContinueWriting={onAiContinueWriting}
					/>
				</BlockNoteView>
			</NoteLinkProvider>
			<style jsx global>{`
				.blocknote-wrapper .bn-editor .vim-normal {
					caret-color: hsl(var(--primary));
				}
				.blocknote-wrapper {
					--bn-colors-editor-background: hsl(var(--card));
					--bn-colors-editor-text: hsl(var(--card-foreground));
					--bn-colors-menu-background: hsl(var(--popover));
					--bn-colors-menu-text: hsl(var(--popover-foreground));
					--bn-colors-tooltip-background: hsl(var(--popover));
					--bn-colors-tooltip-text: hsl(var(--popover-foreground));
					--bn-colors-hovered-background: hsl(var(--accent));
					--bn-colors-selected-background: hsl(var(--editor-selection));
					--bn-colors-disabled-background: hsl(var(--muted));
					--bn-colors-disabled-text: hsl(var(--muted-foreground));
					--bn-colors-border: hsl(var(--border));
					--bn-colors-side-menu: hsl(var(--muted-foreground));
					height: 100%;
					min-height: 100%;
					background: hsl(var(--card));
				}
				.blocknote-wrapper .bn-container,
				.blocknote-wrapper .bn-container [data-theming-css-variables-demo],
				.blocknote-wrapper .bn-scroller,
				.blocknote-wrapper .bn-editor-container {
					background: transparent !important;
				}
				.blocknote-wrapper .bn-editor {
					box-sizing: border-box;
					padding-left: 0;
					padding-right: 0;
					padding-top: 0;
					padding-bottom: 0;
					width: 100%;
					max-width: 42rem;
					margin: 0 auto;
					min-height: 100%;
					background: hsl(var(--card)) !important;
				}
				.blocknote-wrapper .bn-editor:focus,
				.blocknote-wrapper .bn-editor:focus-visible,
				.blocknote-wrapper .bn-editor [contenteditable="true"]:focus,
				.blocknote-wrapper .bn-editor [contenteditable="true"]:focus-visible {
					outline: none !important;
					box-shadow: none !important;
				}
				.blocknote-wrapper .bn-editor,
				.blocknote-wrapper .bn-block-content,
				.blocknote-wrapper .bn-inline-content {
					font-family: var(--bn-font-family);
				}
				.blocknote-wrapper .bn-block-content {
					font-size: 1rem;
					line-height: var(--skriuw-editor-line-height);
				}
				.blocknote-wrapper [data-content-type="heading"] {
					line-height: 1.15;
					margin-top: 0.5rem;
					margin-bottom: 0.35rem;
				}
				.blocknote-wrapper .bn-block-group:first-child [data-content-type="heading"],
				.blocknote-wrapper .bn-block-group:first-child .bn-block-content[data-content-type="heading"] {
					margin-top: 0;
				}
				.blocknote-wrapper .bn-inline-content code {
					background: hsl(var(--popover));
					border: 1px solid hsl(var(--border));
					color: hsl(var(--popover-foreground));
					padding: 0.1rem 0.375rem;
					border-radius: 0.25rem;
					font-size: 0.875em;
				}
				.blocknote-wrapper .bn-inline-content a {
					color: hsl(var(--editor-link));
					text-decoration-line: underline;
					text-decoration-color: hsl(var(--editor-link) / 0.42);
					text-decoration-thickness: 1px;
					text-underline-offset: 0.26em;
					transition:
						color 120ms ease,
						text-decoration-color 120ms ease;
				}
				.blocknote-wrapper .bn-inline-content a:hover {
					color: hsl(var(--editor-link-hover));
					text-decoration-color: hsl(var(--editor-link-hover) / 0.72);
				}
				.blocknote-wrapper .bn-inline-content a:focus-visible {
					border-radius: 0.2rem;
					outline: 1px solid hsl(var(--ring));
					outline-offset: 2px;
				}
				.blocknote-wrapper .bn-inline-content a[href^="note://"] {
					color: hsl(var(--editor-note-link));
					text-decoration-color: hsl(var(--editor-note-link) / 0.36);
				}
				.blocknote-wrapper .bn-inline-content a[href^="note://"]:hover {
					color: hsl(var(--editor-note-link-hover));
					text-decoration-color: hsl(var(--editor-note-link-hover) / 0.72);
				}
				.blocknote-wrapper .bn-inline-content a[href^="note://"]::before {
					content: "";
					display: inline-block;
					width: 0.42em;
					height: 0.42em;
					margin-right: 0.28em;
					border-radius: 999px;
					background: currentColor;
					opacity: 0.76;
					vertical-align: 0.08em;
				}
				.blocknote-wrapper .bn-inline-content a[href^="http://"]::after,
				.blocknote-wrapper .bn-inline-content a[href^="https://"]::after {
					content: "";
					display: inline-block;
					width: 0.42em;
					height: 0.42em;
					margin-left: 0.24em;
					border-top: 1px solid currentColor;
					border-right: 1px solid currentColor;
					opacity: 0.7;
					transform: translateY(-0.14em) rotate(45deg);
				}
				.blocknote-wrapper [data-note-link],
				.blocknote-wrapper [data-note-tag] {
					cursor: pointer;
					user-select: none;
					white-space: nowrap;
				}
				.blocknote-wrapper [data-note-tag] {
					display: inline-flex;
					max-width: 16ch;
					vertical-align: baseline;
					overflow: hidden;
					text-overflow: ellipsis;
				}
				.blocknote-wrapper .bn-suggestion-decorator {
					border-radius: 0.2rem;
					background: hsl(var(--editor-selection));
					box-shadow: 0 0 0 1px hsl(var(--ring) / 0.7);
				}
				/* Real-time collaboration: remote carets, name labels, selections. */
				.blocknote-wrapper .bn-collaboration-cursor__caret {
					border-radius: 1px;
					/* Notch the caret away from the glyph edges so it reads as a
						   distinct cursor, not part of the text. */
					border-left: 1px solid hsl(var(--card));
					border-right: 1px solid hsl(var(--card));
				}
				.blocknote-wrapper .bn-collaboration-cursor__base[data-active] .bn-collaboration-cursor__label {
					top: -1.3rem;
					max-height: 1.2rem;
					border-radius: 4px 4px 4px 1px;
					padding: 0.06rem 0.34rem;
					font-size: 10.5px;
					font-weight: 600;
					letter-spacing: 0.01em;
					line-height: 1.2;
					box-shadow: 0 2px 8px hsl(var(--editor-shadow) / 0.38);
				}
				/* Remote text selection tint. y-prosemirror sets the per-user color
					   inline (with alpha); we only soften the corners + keep it from
					   bleeding past line boxes. */
				.blocknote-wrapper .ProseMirror-yjs-selection {
					border-radius: 2px;
					padding: 0.02em 0;
				}
				/* Anchored comments: author-tinted highlight via the engine's
					   --anchored-comment-color custom property. Falls back to the
					   ring color so it's never invisible. */
				.blocknote-wrapper .anchored-comment {
					background: hsl(var(--anchored-comment-color, var(--ring)) / 0.16);
					border-bottom: 2px solid hsl(var(--anchored-comment-color, var(--ring)) / 0.7);
					border-radius: 2px;
					cursor: pointer;
					transition: background 120ms ease;
				}
				.blocknote-wrapper .anchored-comment:hover {
					background: hsl(var(--anchored-comment-color, var(--ring)) / 0.26);
				}
				.blocknote-wrapper .anchored-comment--resolved {
					background: transparent;
					border-bottom-style: dotted;
					opacity: 0.55;
				}
				/* AI diff highlight: a transient, view-only tint that showcases
					   the content an AI action just inserted. Applied to a block's
					   [data-id] node; never touches the document, so it is not saved
					   or synced. Fade timing is driven from ai-diff-highlight.ts. */
				.blocknote-wrapper [data-id].skriuw-ai-diff {
					border-radius: 5px;
					background: hsl(var(--success) / 0.16);
					box-shadow:
						inset 4px 0 0 hsl(var(--success)),
						0 0 0 1px hsl(var(--success) / 0.3);
					transition:
						background 600ms ease,
						box-shadow 600ms ease;
					animation: skriuw-ai-diff-in 440ms ease;
				}
				.blocknote-wrapper [data-id].skriuw-ai-diff.skriuw-ai-diff--leaving {
					background: hsl(var(--success) / 0);
					box-shadow:
						inset 4px 0 0 hsl(var(--success) / 0),
						0 0 0 1px hsl(var(--success) / 0);
				}
				@keyframes skriuw-ai-diff-in {
					from {
						background: hsl(var(--success) / 0.34);
					}
					to {
						background: hsl(var(--success) / 0.16);
					}
				}
				@media (prefers-reduced-motion: reduce) {
					.blocknote-wrapper [data-id].skriuw-ai-diff {
						animation: none;
						transition: none;
					}
				}
				.blocknote-wrapper .skriuw-fmt-focus-ring {
					position: absolute;
					top: 0;
					left: 0;
					z-index: 0;
					opacity: 0;
					border-radius: calc(var(--radius) - 2px);
					background: hsl(var(--accent));
					box-shadow: inset 0 0 0 1px hsl(var(--ring) / 0.55);
					pointer-events: none;
					transition:
						transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
						width 220ms cubic-bezier(0.16, 1, 0.3, 1),
						height 220ms cubic-bezier(0.16, 1, 0.3, 1),
						opacity 140ms ease;
				}
				@media (prefers-reduced-motion: reduce) {
					.blocknote-wrapper .skriuw-fmt-focus-ring {
						transition: opacity 140ms ease;
					}
				}
				.blocknote-wrapper .skriuw-fmt-btn,
				.blocknote-wrapper .skriuw-fmt-trigger,
				.blocknote-wrapper .skriuw-fmt-menu,
				.blocknote-wrapper .skriuw-fmt-sep {
					position: relative;
					z-index: 1;
				}
				.blocknote-wrapper .skriuw-fmt-btn:focus-visible,
				.blocknote-wrapper .skriuw-fmt-trigger:focus-visible {
					outline: none;
				}
				.blocknote-wrapper .skriuw-fmt-toolbar {
					display: flex;
					align-items: center;
					gap: 1px;
					padding: 2px;
					overflow: visible;
				}
					.blocknote-wrapper .skriuw-fmt-toolbar[data-mobile="true"] {
						max-width: calc(100vw - 16px);
						min-height: 2.75rem;
						flex-wrap: wrap;
						row-gap: 0.2rem;
						overflow: visible;
						padding: 0.3rem;
						gap: 0.15rem;
					}
				.blocknote-wrapper .skriuw-fmt-btn,
				.blocknote-wrapper .skriuw-fmt-trigger {
					display: inline-flex;
					align-items: center;
					justify-content: center;
					gap: 0.28rem;
					height: 1.75rem;
					min-width: 1.75rem;
					padding: 0 0.42rem;
					border: 0;
					border-radius: calc(var(--radius) - 2px);
					background: transparent;
					color: hsl(var(--popover-foreground));
					font-size: 0.75rem;
					font-weight: 500;
					cursor: pointer;
					transition:
						background-color 120ms ease,
						color 120ms ease;
				}
				.blocknote-wrapper .skriuw-fmt-btn {
					width: 1.75rem;
					padding: 0;
				}
				.blocknote-wrapper .skriuw-fmt-toolbar[data-mobile="true"] .skriuw-fmt-btn,
				.blocknote-wrapper .skriuw-fmt-toolbar[data-mobile="true"] .skriuw-fmt-trigger {
					flex: 0 0 auto;
					height: 2.15rem;
					min-width: 2.15rem;
					padding: 0 0.58rem;
				}
				.blocknote-wrapper .skriuw-fmt-toolbar[data-mobile="true"] .skriuw-fmt-btn {
					width: 2.15rem;
					padding: 0;
				}
				.blocknote-wrapper .skriuw-fmt-btn:hover,
				.blocknote-wrapper .skriuw-fmt-trigger:hover {
					background: hsl(var(--accent));
					color: hsl(var(--foreground));
				}
				.blocknote-wrapper .skriuw-fmt-btn[data-active="true"],
				.blocknote-wrapper .skriuw-fmt-trigger[aria-expanded="true"] {
					background: hsl(var(--muted));
					color: hsl(var(--foreground));
				}
				.blocknote-wrapper .skriuw-fmt-btn svg,
				.blocknote-wrapper .skriuw-fmt-trigger svg {
					width: 0.95rem;
					height: 0.95rem;
				}
				.blocknote-wrapper .skriuw-fmt-trigger-label {
					white-space: nowrap;
				}
				.blocknote-wrapper .skriuw-fmt-toolbar[data-mobile="true"] .skriuw-fmt-trigger-label {
					max-width: 6.5rem;
					overflow: hidden;
					text-overflow: ellipsis;
				}
				.blocknote-wrapper .skriuw-fmt-caret {
					opacity: 0.6;
				}
				.blocknote-wrapper .skriuw-fmt-sep {
					width: 1px;
					align-self: stretch;
					margin: 0.2rem 0.18rem;
					background: hsl(var(--border));
				}
				.blocknote-wrapper .skriuw-fmt-menu {
					position: relative;
					display: inline-flex;
					flex: 0 0 auto;
				}
				.blocknote-wrapper .skriuw-fmt-dropdown {
					position: absolute;
					top: calc(100% + 4px);
					left: 0;
					z-index: 60;
					min-width: 11rem;
					max-height: min(20rem, 60vh);
					overflow-y: auto;
					padding: 0.25rem;
					border: 1px solid hsl(var(--border));
					border-radius: var(--radius);
					background: hsl(var(--popover));
					color: hsl(var(--popover-foreground));
					box-shadow: 0 16px 36px hsl(var(--editor-shadow) / 0.42);
				}
				.blocknote-wrapper .skriuw-fmt-toolbar[data-mobile="true"] .skriuw-fmt-dropdown {
					top: auto;
					bottom: calc(100% + 0.5rem);
					left: 0;
					max-height: min(18rem, 48dvh);
				}
				.blocknote-wrapper .skriuw-fmt-item {
					display: flex;
					align-items: center;
					gap: 0.5rem;
					width: 100%;
					min-height: 1.85rem;
					padding: 0.2rem 0.5rem;
					border: 0;
					border-radius: calc(var(--radius) - 2px);
					background: transparent;
					color: hsl(var(--popover-foreground));
					font-size: 0.8rem;
					text-align: left;
					cursor: pointer;
				}
				.blocknote-wrapper .skriuw-fmt-item:hover {
					background: hsl(var(--accent));
					color: hsl(var(--foreground));
				}
				.blocknote-wrapper .skriuw-fmt-item[data-active="true"] {
					background: hsl(var(--muted));
					color: hsl(var(--foreground));
				}
				.blocknote-wrapper .skriuw-fmt-item-icon {
					display: inline-flex;
					color: hsl(var(--muted-foreground));
				}
				.blocknote-wrapper .skriuw-fmt-item-icon svg {
					width: 0.95rem;
					height: 0.95rem;
				}
				.blocknote-wrapper .skriuw-fmt-form {
					display: flex;
					align-items: center;
					gap: 0.4rem;
					padding: 0.15rem;
				}
				.blocknote-wrapper .skriuw-fmt-comment {
					display: flex;
					flex-direction: column;
					gap: 0.4rem;
					padding: 0.15rem;
				}
				.blocknote-wrapper .skriuw-fmt-input,
				.blocknote-wrapper .skriuw-fmt-textarea {
					flex: 1;
					min-width: 0;
					border: 1px solid hsl(var(--border));
					border-radius: calc(var(--radius) - 2px);
					background: hsl(var(--background));
					color: hsl(var(--foreground));
					font-size: 0.78rem;
					padding: 0.32rem 0.46rem;
					outline: none;
				}
				.blocknote-wrapper .skriuw-fmt-input:focus,
				.blocknote-wrapper .skriuw-fmt-textarea:focus {
					border-color: hsl(var(--ring));
					box-shadow: 0 0 0 1px hsl(var(--ring));
				}
				.blocknote-wrapper .skriuw-fmt-textarea {
					height: 4.5rem;
					resize: none;
				}
				.blocknote-wrapper .skriuw-fmt-apply {
					border: 0;
					border-radius: calc(var(--radius) - 2px);
					background: hsl(var(--foreground));
					color: hsl(var(--background));
					font-size: 0.72rem;
					font-weight: 600;
					padding: 0.34rem 0.6rem;
					cursor: pointer;
				}
				.blocknote-wrapper .skriuw-fmt-apply:disabled {
					opacity: 0.5;
					cursor: default;
				}
				.blocknote-wrapper .skriuw-fmt-ghost {
					border: 0;
					border-radius: calc(var(--radius) - 2px);
					background: transparent;
					color: hsl(var(--muted-foreground));
					font-size: 0.72rem;
					padding: 0.34rem 0.5rem;
					cursor: pointer;
				}
				.blocknote-wrapper .skriuw-fmt-ghost:hover {
					background: hsl(var(--muted));
				}
				.blocknote-wrapper .skriuw-fmt-comment-actions {
					display: flex;
					justify-content: flex-end;
					gap: 0.4rem;
				}
				.blocknote-wrapper .bn-toolbar {
					min-height: 2rem;
					background: hsl(var(--popover)) !important;
					border: 1px solid hsl(var(--border)) !important;
					color: hsl(var(--popover-foreground)) !important;
					box-shadow: 0 16px 36px hsl(var(--editor-shadow) / 0.42);
					padding: 1px;
					gap: 1px;
					border-radius: var(--radius);
				}
				.blocknote-wrapper .bn-toolbar .mantine-Button-root,
				.blocknote-wrapper .bn-toolbar .mantine-ActionIcon-root {
					min-height: 1.75rem;
					height: 1.75rem;
					background: transparent !important;
					color: hsl(var(--popover-foreground)) !important;
					border-radius: calc(var(--radius) - 2px);
				}
				.blocknote-wrapper .bn-toolbar .mantine-Button-root {
					padding-left: 0.45rem;
					padding-right: 0.45rem;
					font-size: 0.6875rem;
				}
				.blocknote-wrapper .bn-toolbar .mantine-Button-section {
					margin-inline: 0.2rem;
				}
				.blocknote-wrapper .bn-toolbar .mantine-ActionIcon-root {
					width: 1.75rem;
					min-width: 1.75rem;
				}
				.blocknote-wrapper .bn-toolbar .mantine-Button-root:hover,
				.blocknote-wrapper .bn-toolbar .mantine-ActionIcon-root:hover,
				.blocknote-wrapper .bn-toolbar .mantine-UnstyledButton-root:hover {
					background: hsl(var(--accent)) !important;
					color: hsl(var(--foreground)) !important;
				}
				.blocknote-wrapper .bn-toolbar .mantine-Button-root[data-active="true"],
				.blocknote-wrapper .bn-toolbar .mantine-ActionIcon-root[data-active="true"],
				.blocknote-wrapper .bn-toolbar .mantine-UnstyledButton-root[data-active="true"] {
					background: hsl(var(--muted)) !important;
					color: hsl(var(--foreground)) !important;
				}
				.blocknote-wrapper .bn-toolbar svg {
					width: 0.82rem;
					height: 0.82rem;
				}
				.blocknote-wrapper .bn-toolbar .mantine-Menu-item {
					min-height: 1.75rem;
					height: 1.75rem;
					font-size: 0.75rem;
				}
				.blocknote-wrapper .bn-toolbar .mantine-Menu-dropdown,
				.blocknote-wrapper .bn-toolbar .mantine-Popover-dropdown,
				.blocknote-wrapper .bn-toolbar .mantine-Tooltip-tooltip {
					background: hsl(var(--popover)) !important;
					border: 1px solid hsl(var(--border)) !important;
					color: hsl(var(--popover-foreground)) !important;
					box-shadow: 0 16px 36px hsl(var(--editor-shadow) / 0.42) !important;
					backdrop-filter: none !important;
				}
				:global(.mantine-Menu-dropdown),
				:global(.mantine-Popover-dropdown) {
					z-index: 10050 !important;
				}
				.blocknote-wrapper .bn-toolbar .mantine-Menu-item:hover,
				.blocknote-wrapper .bn-toolbar .mantine-Menu-item[data-hovered],
				.blocknote-wrapper .bn-toolbar .mantine-Menu-item[data-selected] {
					background: hsl(var(--accent)) !important;
					color: hsl(var(--foreground)) !important;
				}
				.blocknote-wrapper .skriuw-editor-suggestion-menu {
					background: hsl(var(--popover)) !important;
					border: 1px solid hsl(var(--border)) !important;
					color: hsl(var(--popover-foreground)) !important;
					box-shadow:
						0 20px 25px -5px rgb(0 0 0 / 0.4),
						0 8px 10px -6px rgb(0 0 0 / 0.4) !important;
				}
				.blocknote-wrapper .skriuw-file-tree {
					--skriuw-file-tree-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
					width: min(100%, 42rem);
					overflow: hidden;
					border: 1px solid hsl(var(--border));
					border-radius: 0.5rem;
					background: hsl(var(--popover));
					color: hsl(var(--popover-foreground));
					box-shadow: inset 0 1px 0 hsl(var(--foreground) / 0.03);
				}
				.blocknote-wrapper .skriuw-file-tree__header {
					display: flex;
					min-height: 2.75rem;
					align-items: center;
					justify-content: space-between;
					gap: 0.75rem;
					border-bottom: 1px solid hsl(var(--border));
					padding: 0.5rem 0.625rem 0.5rem 0.75rem;
				}
				.blocknote-wrapper .skriuw-file-tree__title-wrap {
					display: flex;
					min-width: 0;
					align-items: center;
					gap: 0.55rem;
				}
				.blocknote-wrapper .skriuw-file-tree__header-icon,
				.blocknote-wrapper .skriuw-file-tree__icon {
					flex: 0 0 auto;
					color: hsl(var(--muted-foreground));
				}
				.blocknote-wrapper .skriuw-file-tree__title {
					margin: 0;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
					font-size: 0.8125rem;
					font-weight: 600;
					line-height: 1.25;
					color: hsl(var(--foreground));
				}
				.blocknote-wrapper .skriuw-file-tree__meta {
					margin: 0.1rem 0 0;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
					font-size: 0.6875rem;
					line-height: 1.2;
					color: hsl(var(--muted-foreground));
				}
				.blocknote-wrapper .skriuw-file-tree__actions {
					display: flex;
					flex: 0 0 auto;
					align-items: center;
					gap: 0.125rem;
				}
				.blocknote-wrapper .skriuw-file-tree__icon-button {
					display: inline-flex;
					height: 1.75rem;
					width: 1.75rem;
					align-items: center;
					justify-content: center;
					border: 0;
					border-radius: 0.375rem;
					background: transparent;
					color: hsl(var(--muted-foreground));
					transition:
						background-color 140ms var(--skriuw-file-tree-ease-out),
						color 140ms var(--skriuw-file-tree-ease-out),
						transform 140ms var(--skriuw-file-tree-ease-out);
				}
				.blocknote-wrapper .skriuw-file-tree__icon-button:active {
					transform: scale(0.97);
				}
				.blocknote-wrapper .skriuw-file-tree__icon-button:focus-visible,
				.blocknote-wrapper .skriuw-file-tree__row:focus-visible {
					outline: 1px solid hsl(var(--ring));
					outline-offset: -1px;
				}
				.blocknote-wrapper .skriuw-file-tree__body {
					padding: 0.375rem;
				}
				.blocknote-wrapper .skriuw-file-tree__row {
					display: flex;
					width: 100%;
					min-height: 1.75rem;
					align-items: center;
					gap: 0.375rem;
					border: 0;
					border-radius: 0.375rem;
					background: transparent;
					color: hsl(var(--foreground) / 0.86);
					padding: 0.125rem 0.5rem 0.125rem calc(0.375rem + var(--depth, 0) * 1.125rem);
					text-align: left;
					transition:
						background-color 140ms var(--skriuw-file-tree-ease-out),
						color 140ms var(--skriuw-file-tree-ease-out),
						transform 140ms var(--skriuw-file-tree-ease-out);
				}
				.blocknote-wrapper .skriuw-file-tree__row--folder {
					cursor: pointer;
					font: inherit;
				}
				.blocknote-wrapper .skriuw-file-tree__row--folder:active {
					transform: scale(0.997);
				}
				.blocknote-wrapper .skriuw-file-tree__toggle {
					display: inline-flex;
					width: 0.875rem;
					flex: 0 0 0.875rem;
					align-items: center;
					justify-content: center;
					color: hsl(var(--muted-foreground));
				}
				.blocknote-wrapper .skriuw-file-tree__chevron {
					transition: transform 150ms var(--skriuw-file-tree-ease-out);
				}
				.blocknote-wrapper .skriuw-file-tree__chevron.is-open {
					transform: rotate(90deg);
				}
				.blocknote-wrapper .skriuw-file-tree__name {
					min-width: 0;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
					font-family: "SFMono-Regular", "Cascadia Code", "Roboto Mono", monospace;
					font-size: 0.78rem;
					line-height: 1.35;
				}
				.blocknote-wrapper .skriuw-file-tree__editor {
					display: block;
					width: calc(100% - 0.75rem);
					min-height: 16rem;
					resize: vertical;
					border: 1px solid hsl(var(--border));
					border-radius: 0.375rem;
					background: hsl(var(--background));
					color: hsl(var(--foreground));
					font-family: "SFMono-Regular", "Cascadia Code", "Roboto Mono", monospace;
					font-size: 0.75rem;
					line-height: 1.65;
					margin: 0.375rem;
					padding: 0.625rem 0.75rem;
					outline: none;
				}
				.blocknote-wrapper .skriuw-file-tree__editor:focus {
					border-color: hsl(var(--ring));
					box-shadow: 0 0 0 1px hsl(var(--ring));
				}
				@media (hover: hover) and (pointer: fine) {
					.blocknote-wrapper .skriuw-file-tree__icon-button:hover,
					.blocknote-wrapper .skriuw-file-tree__row--folder:hover {
						background: hsl(var(--accent));
						color: hsl(var(--accent-foreground));
					}
				}
				@media (prefers-reduced-motion: reduce) {
					.blocknote-wrapper .skriuw-file-tree__icon-button,
					.blocknote-wrapper .skriuw-file-tree__row,
					.blocknote-wrapper .skriuw-file-tree__chevron {
						transition-duration: 0ms;
					}
				}
				.blocknote-wrapper pre,
				.blocknote-wrapper pre code,
				.blocknote-wrapper [data-content-type="codeBlock"],
				.blocknote-wrapper [data-content-type="codeBlock"] * {
					white-space: pre-wrap !important;
					overflow-wrap: anywhere;
					word-break: break-word;
				}
				.blocknote-wrapper pre {
					max-width: 100%;
					overflow-x: hidden;
				}
				/* Override any mantine styles */
				.blocknote-wrapper .mantine-Paper-root,
				.blocknote-wrapper [class*="mantine-"] {
					--mantine-color-body: hsl(var(--background));
				}
				.blocknote-wrapper .bn-editor [data-content-type="table"] th,
				.blocknote-wrapper .bn-editor [data-content-type="table"] td {
					border-color: hsl(var(--border) / 0.72) !important;
				}
				.blocknote-wrapper .bn-editor [data-content-type="table"] th {
					background: hsl(var(--muted) / 0.6);
					font-weight: 500;
				}
			`}</style>
		</div>
	);
}
