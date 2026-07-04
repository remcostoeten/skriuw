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
	Languages,
	Link2,
	List,
	ListChecks,
	ListOrdered,
	Maximize2,
	MessageSquarePlus,
	Minimize2,
	PenTool,
	Pilcrow,
	Quote,
	RefreshCw,
	ScrollText,
	Sparkles,
	SpellCheck,
	Strikethrough,
	Tag,
	Tags,
	Underline,
	Wand2,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { getShortcutDef, useShortcutManager, type ShortcutId } from "@/core/shortcuts";
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
} from "@/domain/notes/note-links";
import { useNotesStore } from "@/features/notes/store";
import { useNoteLinkActions } from "@/features/editor/hooks/use-note-link-actions";
import {
	cloneRichDocument,
	flattenInlineChips,
	markdownToRichDocument,
	resolveRichDocument,
	richDocumentKey,
	upgradeRichDocumentChips,
} from "@/domain/notes/rich-document";
import type { AiAction, AiEditorHandle, AiStreamApplier } from "@/features/ai/service";
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
import type { Plugin } from "prosemirror-state";
import { createVimPlugin, vimPluginKey, type VimMode } from "@/features/editor/lib/vim-plugin";
import {
	codeBlockIndentPluginKey,
	createCodeBlockIndentPlugin,
} from "@/features/editor/lib/code-block-indent-plugin";
import { shouldClearSelectionBubbleRect } from "@/features/editor/lib/selection-bubble";
import { SearchWidget } from "./search-widget";
import { NotePropertiesShelf } from "./note-properties/note-properties-shelf";
import { editorSchema } from "./inline-specs/schema";
import { EDITOR_STYLES } from "./editor-styles";
import { NoteLinkProvider } from "./inline-specs/note-link-context";
import { PeopleProvider } from "./inline-specs/people-context";
import type { Person } from "@/domain/people/models";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";

// biome-ignore lint/suspicious/noExplicitAny: editor type with custom schema requires deep inference
type EditorInstance = any;

// BlockNote 0.46 runs on TipTap 3, whose `editor.view` getter returns a *proxy*
// (truthy, not null) until the ProseMirror view is mounted; reading any property
// other than `state` on that proxy — `dom` in particular — throws "[tiptap
// error]: ... Cannot access view['dom']". `editor.prosemirrorView` and
// `editor.domElement` both route through that proxy, so the usual `?.` / truthy
// guards don't protect against it (the proxy passes them). These read the real
// view object directly, which is genuinely null before mount / after unmount.
function getEditorView(editor: EditorInstance): EditorInstance | null {
	return editor?._tiptapEditor?.editorView ?? null;
}

const STREAM_APPLY_INTERVAL_MS = 150;

const COLLAPSED_SELECTION_STATE = {
	bold: false,
	italic: false,
	underline: false,
	strike: false,
	code: false,
	blockType: "paragraph",
	level: undefined as number | undefined,
	align: "left",
};

function getEditorDom(editor: EditorInstance): HTMLElement | null {
	return getEditorView(editor)?.dom ?? null;
}

// Tracks the live editor DOM element across mount/unmount, so effects that wire
// listeners onto it re-run when the view actually attaches instead of reading a
// transient `undefined` (or throwing) during the mount race.
function useEditorDom(editor: EditorInstance): HTMLElement | null {
	const [dom, setDom] = useState<HTMLElement | null>(() => getEditorDom(editor));

	useEffect(() => {
		const tiptap = editor?._tiptapEditor;
		if (!tiptap) return;
		const sync = () => setDom(getEditorDom(editor));
		sync();
		tiptap.on("mount", sync);
		tiptap.on("unmount", sync);
		return () => {
			tiptap.off("mount", sync);
			tiptap.off("unmount", sync);
		};
	}, [editor]);

	return dom;
}

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
	readOnly?: boolean;
	onChange: (next: { markdown: string; richContent: RichTextDocument }) => void;
	onPropertiesChange?: (properties: NoteProperty[]) => void;
	onEditorReady?: (handle: AiEditorHandle) => void;
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
				const selection = getEditorView(editor)?.state.selection;
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

type TCustomPromptWidgetProps = {
	onSubmit: (instruction: string) => void;
	onClose: () => void;
};

function CustomPromptWidget({ onSubmit, onClose }: TCustomPromptWidgetProps) {
	const [instruction, setInstruction] = useState("");

	const submit = () => {
		const trimmed = instruction.trim();
		if (!trimmed) return;
		onSubmit(trimmed);
		onClose();
	};

	return (
		<div
			role="dialog"
			aria-label="Custom AI prompt"
			className="skriuw-fmt-comment w-[min(92vw,26rem)] rounded-md border border-[color:var(--search-widget-border)] bg-[var(--search-widget)] p-2 shadow-2xl backdrop-blur-sm"
		>
			<textarea
				autoFocus
				value={instruction}
				onChange={(event) => setInstruction(event.target.value)}
				onKeyDown={(event) => {
					if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit();
					if (event.key === "Escape") onClose();
				}}
				placeholder="Ask AI anything — “spellcheck this”, “summarize as bullets”, “translate to French”…"
				className="skriuw-fmt-textarea min-h-[4.5rem]"
			/>
			<div className="skriuw-fmt-comment-actions">
				<button
					type="button"
					className="skriuw-fmt-ghost"
					onMouseDown={(event) => event.preventDefault()}
					onClick={onClose}
				>
					Cancel
				</button>
				<button
					type="button"
					className="skriuw-fmt-apply"
					disabled={!instruction.trim()}
					onMouseDown={(event) => event.preventDefault()}
					onClick={submit}
				>
					Run
				</button>
			</div>
		</div>
	);
}

type TSelectionBubbleMenuProps = {
	editor: EditorInstance;
	files: NoteFile[];
	activeFileId?: string;
	onAddComment?: TAddComment;
	onAiSpellCheck?: () => void;
	onAiContinueWriting?: () => void;
	onAiAction?: (action: AiAction) => void;
	onOpenCustomPrompt?: () => void;
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
	onAiAction?: (action: AiAction) => void;
	onOpenCustomPrompt?: () => void;
};

const SELECTION_AI_ITEMS: Array<{ action: AiAction; label: string; icon: ReactNode }> = [
	{ action: "fixSelection", label: "Fix spelling & grammar", icon: <SpellCheck size={15} /> },
	{ action: "rewriteSelection", label: "Rewrite", icon: <RefreshCw size={15} /> },
	{ action: "shortenSelection", label: "Make shorter", icon: <Minimize2 size={15} /> },
	{ action: "expandSelection", label: "Make longer", icon: <Maximize2 size={15} /> },
	{ action: "translateSelection", label: "Translate", icon: <Languages size={15} /> },
];

function AiMenu({ onSpellCheck, onContinueWriting, onAiAction, onOpenCustomPrompt }: TAiMenuProps) {
	if (!onSpellCheck && !onContinueWriting && !onAiAction && !onOpenCustomPrompt) return null;

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
					{onAiAction
						? SELECTION_AI_ITEMS.map((item) => (
								<button
									key={item.action}
									type="button"
									className="skriuw-fmt-item"
									onMouseDown={(event) => event.preventDefault()}
									onClick={() => {
										onAiAction(item.action);
										close();
									}}
								>
									<span className="skriuw-fmt-item-icon">{item.icon}</span>
									<span>{item.label}</span>
								</button>
							))
						: null}
					{onOpenCustomPrompt ? (
						<button
							type="button"
							className="skriuw-fmt-item"
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => {
								onOpenCustomPrompt();
								close();
							}}
						>
							<span className="skriuw-fmt-item-icon">
								<Wand2 size={15} />
							</span>
							<span>Ask AI…</span>
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
	onAiAction,
	onOpenCustomPrompt,
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
			const editorDom = getEditorDom(editor);
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
			if (!getEditorDom(editor)?.contains(document.activeElement)) return;
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
			// This selector runs on EVERY transaction (each keystroke). The bubble
			// only renders while a range is selected, so with a collapsed caret the
			// expensive cursor/style getters are skipped in favor of a shared
			// constant that the deep-equality check resolves for free.
			if (getEditorView(editor)?.state.selection.empty !== false) {
				return COLLAPSED_SELECTION_STATE;
			}
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
			{onAiSpellCheck || onAiContinueWriting || onAiAction || onOpenCustomPrompt ? (
				<>
					<span className="skriuw-fmt-sep" />
					<AiMenu
						onSpellCheck={onAiSpellCheck}
						onContinueWriting={onAiContinueWriting}
						onAiAction={onAiAction}
						onOpenCustomPrompt={onOpenCustomPrompt}
					/>
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

function insertPersonChip(editor: EditorInstance, person: Person) {
	const name = person.name.trim();
	if (!person.id || !name) return;
	editor.insertInlineContent([
		// biome-ignore lint/suspicious/noExplicitAny: custom inline content type
		{ type: "person", props: { id: person.id, name } } as any,
		" ",
	]);
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

	// Existing matches first, "create" last — same ordering as the "@" note
	// menu, so a stray Enter never creates something new by accident.
	return [
		...filterSuggestionItems(existingItems, normalizedQuery),
		...(shouldOfferCreate
			? [
					{
						title: normalizedQuery,
						subtext: "Create tag",
						group: "Create",
						onItemClick: () => {
							insertTagChip(editor, normalizedQuery);
						},
					},
				]
			: []),
	];
}

function getPersonMentionMenuItems(
	editor: EditorInstance,
	people: Person[],
	query: string,
	onCreatePerson?: (name: string) => Promise<Person | null>,
): DefaultReactSuggestionItem[] {
	const normalizedQuery = query.trim().replace(/^\$/, "");
	const existingItems: DefaultReactSuggestionItem[] = people.map((person) => ({
		title: person.name,
		subtext: "Person",
		group: "People",
		onItemClick: () => {
			insertPersonChip(editor, person);
		},
	}));

	const shouldOfferCreate =
		Boolean(onCreatePerson) &&
		normalizedQuery.length > 0 &&
		!people.some((person) => person.name.toLowerCase() === normalizedQuery.toLowerCase());

	// Existing matches first, "create" last — same ordering as the "@" note
	// menu, so a stray Enter never creates something new by accident.
	return [
		...filterSuggestionItems(existingItems, normalizedQuery),
		...(shouldOfferCreate
			? [
					{
						title: normalizedQuery,
						subtext: "Add person",
						group: "Create",
						onItemClick: () => {
							void onCreatePerson?.(normalizedQuery).then((person) => {
								if (person) insertPersonChip(editor, person);
							});
						},
					},
				]
			: []),
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
	onAiAction?: (action: AiAction) => void,
	onOpenCustomPrompt?: () => void,
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

	if (onAiAction) {
		aiItems.push(
			{
				title: "Summarize",
				aliases: ["ai", "summary", "tldr", "summarize"],
				group: "AI",
				icon: <ScrollText size={16} />,
				subtext: "Append an AI summary of this note",
				onItemClick: () => onAiAction("summarize"),
			},
			{
				title: "Extract tasks",
				aliases: ["ai", "tasks", "todo", "action", "items"],
				group: "AI",
				icon: <ListChecks size={16} />,
				subtext: "Pull action items out of this note",
				onItemClick: () => onAiAction("extractTasks"),
			},
			{
				title: "Suggest tags",
				aliases: ["ai", "tags", "label", "topics"],
				group: "AI",
				icon: <Tags size={16} />,
				subtext: "Get AI tag suggestions for this note",
				onItemClick: () => onAiAction("suggestTags"),
			},
		);
	}

	if (onOpenCustomPrompt) {
		aiItems.push({
			title: "Ask AI…",
			aliases: ["ai", "prompt", "ask", "custom", "instruction"],
			group: "AI",
			icon: <Wand2 size={16} />,
			subtext: "Give the AI a free-form instruction",
			onItemClick: onOpenCustomPrompt,
		});
	}

	return [
		...getDefaultReactSlashMenuItems(editor),
		{
			title: "Code block",
			aliases: ["code", "fence", "syntax"],
			group: "Structure",
			icon: <Code size={16} />,
			subtext: "Insert a code block with syntax highlighting",
			onItemClick: () => {
				insertOrUpdateBlockForSlashMenu(editor, {
					type: "procode",
					props: { language: "typescript", title: "" },
					// biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
				} as any);
			},
		},
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
	people = [],
	onCreatePerson,
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
	onAiAction,
	onAiCustomPrompt,
	onTitleCommit,
	onBlur,
	onCursorChange,
	onVimModeChange,
	collab,
}: RichTextEditorProps) {
	const appTheme = usePreferencesStore((state) => state.appearance.theme);
	const blockNoteTheme = appTheme === "paper" ? "light" : "dark";
	const lastContentRef = useRef(content);
	const lastRichContentRef = useRef<string>(richDocumentKey(richContent));
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
	const editorDom = useEditorDom(editor);
	const searchPlugin = useMemo(() => createSearchPlugin(), []);
	const vimModeEnabled = usePreferencesStore((state) => state.editor.vimMode);
	const onVimModeChangeRef = useRef(onVimModeChange);
	onVimModeChangeRef.current = onVimModeChange;
	const [vimCommand, setVimCommand] = useState<string | null>(null);
	const [searchOpen, setSearchOpen] = useState(false);
	const [customPromptOpen, setCustomPromptOpen] = useState(false);
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
	const { createAndOpenNote, openNote } = useNoteLinkActions(files);

	// Anchored comments live alongside the document in the same Yjs room; the
	// engine only attaches on collaborative notes and tears down otherwise.
	const { addComment } = useAnchoredMarks(editor, collab ?? null);

	const regexError = useMemo(() => {
		if (!searchOptions.regex || searchQuery.length === 0) return false;
		return buildRegex(searchQuery, searchOptions) === null;
	}, [searchOptions, searchQuery]);

	const syncMatchInfo = useCallback(() => {
		const view = getEditorView(editor);
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
		const view = getEditorView(editor);
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
		const view = getEditorView(editor);
		if (!view) return;
		nextMatch(view);
		syncMatchInfo();
	}, [editor, syncMatchInfo]);

	const handlePreviousMatch = useCallback(() => {
		const view = getEditorView(editor);
		if (!view) return;
		previousMatch(view);
		syncMatchInfo();
	}, [editor, syncMatchInfo]);

	const handleReplaceCurrent = useCallback(() => {
		const view = getEditorView(editor);
		if (!view) return;
		replaceCurrent(view, replaceValue);
		syncMatchInfo();
	}, [editor, replaceValue, syncMatchInfo]);

	const handleReplaceAll = useCallback(() => {
		const view = getEditorView(editor);
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
		if (!tiptap || readOnly) return;
		// Prepend so ProseMirror sees Tab before BlockNote's built-in code-block
		// shortcut, which hardcodes a two-space indent — we want four.
		tiptap.registerPlugin(
			createCodeBlockIndentPlugin(),
			(indentPlugin: Plugin, plugins: Plugin[]) => [indentPlugin, ...plugins],
		);
		return () => {
			tiptap.unregisterPlugin(codeBlockIndentPluginKey);
		};
	}, [editor, readOnly]);

	useEffect(() => {
		const tiptap = editor._tiptapEditor;
		if (!tiptap || !vimModeEnabled || readOnly) return;
		const plugin = createVimPlugin((status) => {
			onVimModeChangeRef.current?.(status.mode);
			setVimCommand(status.command);
		});
		// Prepend: BlockNote ships an `OverrideEscape` keymap that blurs the
		// editor on Escape, and ProseMirror consults plugins in order — vim must
		// see keys first or Escape kicks the user out of the editor.
		tiptap.registerPlugin(plugin, (vimPlugin: Plugin, plugins: Plugin[]) => [
			vimPlugin,
			...plugins,
		]);
		onVimModeChangeRef.current?.("normal");
		return () => {
			tiptap.unregisterPlugin(vimPluginKey);
			getEditorDom(editor)?.classList.remove("vim-normal", "vim-insert", "vim-visual");
			setVimCommand(null);
			onVimModeChangeRef.current?.(null);
		};
	}, [editor, vimModeEnabled, readOnly]);

	useEffect(() => {
		const view = getEditorView(editor);
		if (!view) return;
		setSearch(view, searchQuery, searchOptions);
		syncMatchInfo();
	}, [editor, searchOptions, searchQuery, syncMatchInfo]);

	const { bindings } = useShortcutManager();
	const shortcutKeys = useCallback(
		(id: ShortcutId) => bindings[id] ?? getShortcutDef(id).keys,
		[bindings],
	);

	useShortcutMap(
		{
			findInNote: {
				keys: shortcutKeys("notes.findInNote"),
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
				keys: shortcutKeys("notes.searchMatchCase"),
				handler: () => toggleSearchOption("caseSensitive"),
				options: {
					description: "Toggle match case",
					preventDefault: true,
				},
			},
			wholeWord: {
				keys: shortcutKeys("notes.searchWholeWord"),
				handler: () => toggleSearchOption("wholeWord"),
				options: {
					description: "Toggle whole word",
					preventDefault: true,
				},
			},
			regex: {
				keys: shortcutKeys("notes.searchRegex"),
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

	useEffect(() => {
		if (!onTitleCommit) return;

		const domElement = editorDom;
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
	}, [editor, editorDom, onTitleCommit]);

	// Commit the title the moment the caret leaves the first heading block —
	// pressing Enter, Tab, or navigating into another block. `focusout` above only
	// fires when focus leaves the editor entirely, so without this the filename
	// wouldn't follow the heading until the editor blurred. Caret moves between
	// blocks don't blur the (single) contenteditable, so we watch the selection.
	useEffect(() => {
		if (!onTitleCommit) return;
		const domElement = editorDom;
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
	}, [editor, editorDom, onTitleCommit]);

	useEffect(() => {
		if (!onCursorChange) return;
		const root = wrapperRef.current ?? editorDom;
		if (!root) return;

		let animationFrame: number | null = null;
		let suppressUntil = 0;

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

		const queueSelectionReport = (event?: Event) => {
			// Right-click opens the context menu; reporting the selection here forces
			// a re-render of the parent (EditorContainer) while Radix is still
			// measuring/positioning the freshly-opened menu, which can dismiss it or
			// throw its position off. Suppress both the triggering pointerdown and
			// the selectionchange it causes (the browser collapses the caret to the
			// click point before the contextmenu event fires).
			if (event instanceof PointerEvent && event.button === 2) {
				suppressUntil = window.performance.now() + 200;
				return;
			}

			if (window.performance.now() < suppressUntil) {
				return;
			}

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
	}, [editorDom, onCursorChange]);

	useEffect(() => {
		if (!onEditorReady) return;

		function highlightBlocks(ids: string[]) {
			if (ids.length === 0) return;
			aiDiffHighlightRef.current?.cancel();
			let attempts = 0;
			const resolve = () => {
				const root = wrapperRef.current ?? getEditorDom(editor);
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

		// Range captured when a selection-scoped AI action reads the selection, so
		// the replacement lands on the original text even if focus moved during
		// the async AI round-trip.
		let capturedSelection: { from: number; to: number } | null = null;

		onEditorReady({
			getMarkdown: () => blocksToMarkdown(editor),
			getSelectionText: () => {
				const view = getEditorView(editor);
				if (!view) return "";
				const selection = view.state.selection;
				if (selection.empty) {
					capturedSelection = null;
					return "";
				}
				capturedSelection = { from: selection.from, to: selection.to };
				return view.state.doc.textBetween(selection.from, selection.to, "\n");
			},
			replaceSelection: (text) => {
				const view = getEditorView(editor);
				const range = capturedSelection;
				capturedSelection = null;
				if (!view || !range) return;
				if (range.to > view.state.doc.content.size) return;
				view.dispatch(view.state.tr.insertText(text, range.from, range.to));
			},
			appendMarkdown: (markdown) => {
				const blocks = markdownToRichDocument(markdown);
				if (blocks.length === 0) return;
				const doc = editor.document;
				const last = doc[doc.length - 1];
				if (!last) return;
				// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
				const inserted = editor.insertBlocks(blocks as any, last, "after");
				highlightBlocks(inserted.map((b) => b.id));
			},
			beginStreamingContinue: (): AiStreamApplier => {
				// First update anchors like continueWriting (merge into the cut-off
				// final paragraph); later updates re-parse the accumulated markdown
				// and swap the previously inserted blocks in place. Applies are
				// throttled (trailing) so long generations don't re-parse the whole
				// accumulated markdown on every network chunk.
				let insertedIds: string[] = [];
				let started = false;
				let stopped = false;
				let lastAppliedAt = 0;
				let pendingMarkdown: string | null = null;
				let pendingTimer: ReturnType<typeof setTimeout> | null = null;

				const apply = (markdown: string) => {
					const blocks = markdownToRichDocument(markdown);
					if (blocks.length === 0) return;
					if (!started) {
						started = true;
						const doc = editor.document;
						let anchorIndex = doc.length - 1;
						while (
							anchorIndex >= 0 &&
							blockToPlainText(doc[anchorIndex]).length === 0
						) {
							anchorIndex -= 1;
						}
						const anchor = anchorIndex >= 0 ? doc[anchorIndex] : null;
						const anchorType = (anchor as { type?: string } | null)?.type;
						if (anchor && (anchorType === "paragraph" || anchorType === "quote")) {
							const { insertedBlocks } = editor.replaceBlocks(
								[anchor],
								// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
								blocks as any,
							);
							insertedIds = insertedBlocks.map((b) => b.id);
						} else {
							const reference = anchor ?? doc[doc.length - 1];
							const inserted = editor.insertBlocks(
								// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
								blocks as any,
								reference,
								"after",
							);
							insertedIds = inserted.map((b) => b.id);
						}
						return;
					}
					const docIds = new Set(editor.document.map((b) => b.id));
					const existing = insertedIds.filter((id) => docIds.has(id));
					if (existing.length === 0) {
						// The user removed the streamed blocks — stop touching the doc.
						stopped = true;
						return;
					}
					const { insertedBlocks } = editor.replaceBlocks(
						existing,
						// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
						blocks as any,
					);
					insertedIds = insertedBlocks.map((b) => b.id);
				};

				return {
					update: (markdown) => {
						if (stopped) return;
						const now = Date.now();
						const elapsed = now - lastAppliedAt;
						if (elapsed >= STREAM_APPLY_INTERVAL_MS) {
							lastAppliedAt = now;
							pendingMarkdown = null;
							apply(markdown);
							return;
						}
						pendingMarkdown = markdown;
						if (pendingTimer === null) {
							pendingTimer = setTimeout(() => {
								pendingTimer = null;
								if (stopped || pendingMarkdown === null) return;
								lastAppliedAt = Date.now();
								const latest = pendingMarkdown;
								pendingMarkdown = null;
								apply(latest);
							}, STREAM_APPLY_INTERVAL_MS - elapsed);
						}
					},
					done: () => {
						if (pendingTimer !== null) {
							clearTimeout(pendingTimer);
							pendingTimer = null;
						}
						if (stopped) return insertedIds;
						if (pendingMarkdown !== null) {
							const latest = pendingMarkdown;
							pendingMarkdown = null;
							apply(latest);
						}
						stopped = true;
						highlightBlocks(insertedIds);
						return insertedIds;
					},
				};
			},
			beginStreamingCustomPrompt: (): AiStreamApplier => {
				// Always inserts new blocks after the cursor (or after the last block
				// when no cursor position is known) rather than merging into existing
				// content, so an arbitrary free-form instruction can never silently
				// overwrite prose the way continueWriting's anchor-merge does.
				let insertedIds: string[] = [];
				let started = false;
				let stopped = false;
				let lastAppliedAt = 0;
				let pendingMarkdown: string | null = null;
				let pendingTimer: ReturnType<typeof setTimeout> | null = null;

				const apply = (markdown: string) => {
					const blocks = markdownToRichDocument(markdown);
					if (blocks.length === 0) return;
					if (!started) {
						started = true;
						let reference: { id: string } | null = null;
						try {
							reference = editor.getTextCursorPosition?.().block ?? null;
						} catch {
							reference = null;
						}
						const doc = editor.document;
						reference = reference ?? doc[doc.length - 1] ?? null;
						if (!reference) return;
						const inserted = editor.insertBlocks(
							// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
							blocks as any,
							reference,
							"after",
						);
						insertedIds = inserted.map((b) => b.id);
						return;
					}
					const docIds = new Set(editor.document.map((b) => b.id));
					const existing = insertedIds.filter((id) => docIds.has(id));
					if (existing.length === 0) {
						stopped = true;
						return;
					}
					const { insertedBlocks } = editor.replaceBlocks(
						existing,
						// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
						blocks as any,
					);
					insertedIds = insertedBlocks.map((b) => b.id);
				};

				return {
					update: (markdown) => {
						if (stopped) return;
						const now = Date.now();
						const elapsed = now - lastAppliedAt;
						if (elapsed >= STREAM_APPLY_INTERVAL_MS) {
							lastAppliedAt = now;
							pendingMarkdown = null;
							apply(markdown);
							return;
						}
						pendingMarkdown = markdown;
						if (pendingTimer === null) {
							pendingTimer = setTimeout(() => {
								pendingTimer = null;
								if (stopped || pendingMarkdown === null) return;
								lastAppliedAt = Date.now();
								const latest = pendingMarkdown;
								pendingMarkdown = null;
								apply(latest);
							}, STREAM_APPLY_INTERVAL_MS - elapsed);
						}
					},
					done: () => {
						if (pendingTimer !== null) {
							clearTimeout(pendingTimer);
							pendingTimer = null;
						}
						if (stopped) return insertedIds;
						if (pendingMarkdown !== null) {
							const latest = pendingMarkdown;
							pendingMarkdown = null;
							apply(latest);
						}
						stopped = true;
						highlightBlocks(insertedIds);
						return insertedIds;
					},
				};
			},
			deleteBlocks: (ids) => {
				const docIds = new Set(editor.document.map((b) => b.id));
				const existing = ids.filter((id) => docIds.has(id));
				if (existing.length === 0) return;
				editor.removeBlocks(existing);
			},
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
		const nextRichContentKey = richDocumentKey(nextRichContent);
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
						getItems={async (query) =>
							filterSuggestionItems(
								getCustomSlashMenuItems(
									editor,
									onAiSpellCheck,
									onAiContinueWriting,
									onAiAction,
									onAiCustomPrompt ? () => setCustomPromptOpen(true) : undefined,
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
							getPersonMentionMenuItems(editor, people, query, onCreatePerson)
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
						onOpenCustomPrompt={onAiCustomPrompt ? () => setCustomPromptOpen(true) : undefined}
					/>
				</BlockNoteView>
				</PeopleProvider>
			</NoteLinkProvider>
			<AnimatePresence>
				{customPromptOpen ? (
					<motion.div
						className="absolute inset-x-0 top-3 z-40 flex justify-center"
						initial={
							prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }
						}
						animate={
							prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
						}
						exit={
							prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }
						}
						transition={searchWidgetTransition}
					>
						<CustomPromptWidget
							onSubmit={(instruction) => onAiCustomPrompt?.(instruction)}
							onClose={() => setCustomPromptOpen(false)}
						/>
					</motion.div>
				) : null}
			</AnimatePresence>
			{vimCommand !== null ? (
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
	);
}
