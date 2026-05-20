"use client";

import { useEffect, useMemo, useCallback, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
	filterSuggestionItems,
	insertOrUpdateBlockForSlashMenu,
	SuggestionMenu as SuggestionMenuExtension,
} from "@blocknote/core/extensions";
import { LinkToolbarExtension } from "@blocknote/core/extensions";
import {
	DeleteLinkButton,
	EditLinkButton,
	FormattingToolbar,
	FormattingToolbarController,
	getFormattingToolbarItems,
	getDefaultReactSlashMenuItems,
	LinkToolbarController,
	OpenLinkButton,
	SuggestionMenuController,
	type DefaultReactSuggestionItem,
	type LinkToolbarProps,
	type SuggestionMenuProps,
	useBlockNoteEditor,
	useComponentsContext,
	useCreateBlockNote,
	useEditorState,
	useExtension,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { FileText, FolderTree, PenTool, SpellCheck } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { DEFAULT_FILE_TREE_SOURCE } from "@/shared/lib/file-tree";
import { getEditorFontFamily, type EditorFontId } from "@/shared/lib/editor-fonts";
import {
	getEditorLineHeightValue,
	type EditorLineHeight,
} from "@/features/editor/lib/editor-line-height";
import type { NoteFile, RichTextDocument } from "@/types/notes";
import { extractNoteTags, getNoteTitle, getWorkspaceTags } from "@/features/notes/lib/note-links";
import { useNotesStore } from "@/features/notes/store";
import { useCreateNote } from "@/features/notes/hooks/use-create-note";
import {
	cloneRichDocument,
	flattenInlineChips,
	markdownToRichDocument,
	resolveRichDocument,
	upgradeRichDocumentChips,
} from "@/domain/notes/rich-document";
import type { AiEditorHandle } from "@/features/ai/service";
import { usePreferencesStore } from "@/features/settings/store";
import { editorSchema } from "./inline-specs/schema";
import { NoteLinkProvider } from "./inline-specs/note-link-context";

// biome-ignore lint/suspicious/noExplicitAny: editor type with custom schema requires deep inference
type EditorInstance = any;

interface RichTextEditorProps {
	content: string;
	richContent?: RichTextDocument;
	files?: NoteFile[];
	activeFileId?: string;
	editorFontId: EditorFontId;
	editorLineHeight: EditorLineHeight;
	onChange: (next: { markdown: string; richContent: RichTextDocument }) => void;
	onEditorReady?: (handle: AiEditorHandle) => void;
	onAiSpellCheck?: () => void;
	onAiContinueWriting?: () => void;
	onTitleCommit?: (title: string) => void;
}

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
			className="bn-suggestion-menu skriuw-editor-suggestion-menu z-[100] max-h-[min(24rem,50vh)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-xl"
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
						"flex w-full items-start gap-3 rounded-[4px] px-2.5 py-1.5 text-left transition-colors",
						index === activeIndex
							? "bg-accent text-accent-foreground"
							: "text-popover-foreground hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none",
					)}
				>
					{item.icon ? (
						<span className="mt-0.5 shrink-0 text-muted-foreground">{item.icon}</span>
					) : null}
					<span className="min-w-0 flex-1">
						<span className="block truncate text-sm font-medium">{item.title}</span>
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

function InternalNoteLinkButton({
	files,
	activeFileId,
}: {
	files: NoteFile[];
	activeFileId?: string;
}) {
	const editor = useBlockNoteEditor<any, any, any>();
	const Components = useComponentsContext()!;
	const [open, setOpen] = useState(false);

	const state = useEditorState({
		editor,
		selector: ({ editor }) => {
			if (
				!editor.isEditable ||
				!(editor.getSelection?.()?.blocks || [editor.getTextCursorPosition?.().block]).find(
					(block: { content?: unknown }) => block.content !== undefined,
				)
			) {
				return undefined;
			}

			return {
				selectedText: editor.getSelectedText?.() ?? "",
			};
		},
	});

	if (state === undefined) {
		return null;
	}

	return (
		<Components.Generic.Popover.Root open={open} onOpenChange={setOpen}>
			<Components.Generic.Popover.Trigger>
				<Components.FormattingToolbar.Button
					className="bn-button"
					label="Link note"
					mainTooltip="Link selected text to another note"
					icon={<FileText />}
					isSelected={false}
					onClick={() => setOpen((current) => !current)}
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
						const title = getNoteTitle(targetFile);
						editor.focus();
						editor.createLink(
							`note://${targetFile.id}`,
							state.selectedText.trim() || title,
						);
						setOpen(false);
					}}
				/>
			</Components.Generic.Popover.Content>
		</Components.Generic.Popover.Root>
	);
}

function CustomFormattingToolbar({
	files,
	activeFileId,
}: {
	files: NoteFile[];
	activeFileId?: string;
}) {
	return (
		<FormattingToolbar>
			{getFormattingToolbarItems()}
			<InternalNoteLinkButton files={files} activeFileId={activeFileId} />
		</FormattingToolbar>
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
					onClick={() => setOpen((current) => !current)}
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
			const tags = extractNoteTags(file.content);
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
			group: "Connect",
			subtext: "Insert a tag marker",
			onItemClick: () => {
				editor.insertInlineContent("#", { updateSelection: true });
			},
		},
		{
			title: "Link note",
			aliases: ["mention", "backlink", "wiki"],
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
	onChange,
	onEditorReady,
	onAiSpellCheck,
	onAiContinueWriting,
	onTitleCommit,
}: RichTextEditorProps) {
	const appTheme = usePreferencesStore((state) => state.appearance.theme);
	const blockNoteTheme = appTheme === "paper" ? "light" : "dark";
	const lastContentRef = useRef(content);
	const lastRichContentRef = useRef<string>(JSON.stringify(richContent ?? []));
	const pendingMarkdownRef = useRef(content);
	const isInternalChangeRef = useRef(false);
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const serializeRunIdRef = useRef(0);

	const initialBlocks = useMemo(() => {
		const base = resolveRichDocument(content, richContent);
		return upgradeRichDocumentChips(base);
	}, []);

	const editor = useCreateBlockNote({
		schema: editorSchema,
		initialContent: initialBlocks,
	});
	const workspaceTags = useMemo(() => getWorkspaceTags(files), [files]);
	const setActiveFileId = useNotesStore((state) => state.setActiveFileId);
	const createNote = useCreateNote();

	const handleCreateNoteFromMention = useCallback(
		(title: string) => {
			createNote.mutate({
				name: title,
				content: `# ${title}\n\n`,
			});
		},
		[createNote],
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
			setActiveFileId(noteId);
			const url = new URL(window.location.href);
			url.searchParams.set("note", noteId);
			window.history.pushState({}, "", url.toString());
		};

		domElement.addEventListener("click", handleInternalLinkClick);
		return () => domElement.removeEventListener("click", handleInternalLinkClick);
	}, [editor.domElement, setActiveFileId]);

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

	useEffect(() => {
		if (!onEditorReady) return;
		onEditorReady({
			getMarkdown: () => blocksToMarkdown(editor),
			replaceContent: (markdown) => {
				// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
				editor.replaceBlocks(editor.document, markdownToRichDocument(markdown) as any);
			},
			appendContent: (markdown) => {
				const blocks = markdownToRichDocument(markdown);
				// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
				editor.insertBlocks(
					blocks as any,
					editor.document[editor.document.length - 1],
					"after",
				);
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
	}, [editor, onEditorReady]);

	const handleEditorChange = useCallback(async () => {
		if (!editor) return;

		const runId = ++serializeRunIdRef.current;
		const markdown = await blocksToMarkdown(editor);
		if (runId !== serializeRunIdRef.current) {
			return;
		}

		// biome-ignore lint/suspicious/noExplicitAny: schema-flexible blocks
		const nextRichContent = cloneRichDocument(editor.document as any);
		const nextRichContentKey = JSON.stringify(nextRichContent);
		pendingMarkdownRef.current = markdown;

		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
		}

		saveTimeoutRef.current = setTimeout(() => {
			if (
				pendingMarkdownRef.current === lastContentRef.current &&
				nextRichContentKey === lastRichContentRef.current
			) {
				return;
			}

			isInternalChangeRef.current = true;
			lastContentRef.current = pendingMarkdownRef.current;
			lastRichContentRef.current = nextRichContentKey;
			onChange({ markdown: pendingMarkdownRef.current, richContent: nextRichContent });

			window.setTimeout(() => {
				isInternalChangeRef.current = false;
			}, 80);
		}, 180);
	}, [editor, onChange]);

	useEffect(() => {
		if (!editor || isInternalChangeRef.current) return;
		const baseRichContent = resolveRichDocument(content, richContent);
		const nextRichContent = upgradeRichDocumentChips(baseRichContent);
		const nextRichContentKey = JSON.stringify(nextRichContent);
		if (
			content !== lastContentRef.current ||
			nextRichContentKey !== lastRichContentRef.current
		) {
			// biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
			editor.replaceBlocks(editor.document, nextRichContent as any);
			lastContentRef.current = content;
			lastRichContentRef.current = nextRichContentKey;
			pendingMarkdownRef.current = content;
		}
	}, [content, editor, richContent]);

	useEffect(() => {
		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
		};
	}, []);

	return (
		<div
			className="blocknote-wrapper h-full min-h-full px-6 py-3"
			style={
				{
					"--bn-font-family": getEditorFontFamily(editorFontId),
					"--skriuw-editor-line-height": getEditorLineHeightValue(editorLineHeight),
				} as CSSProperties
			}
		>
			<NoteLinkProvider files={files} activeFileId={activeFileId}>
				<BlockNoteView
					editor={editor}
					onChange={handleEditorChange}
					theme={blockNoteTheme}
					className="h-full"
					formattingToolbar={false}
					linkToolbar={false}
					slashMenu={false}
				>
					<FormattingToolbarController
						formattingToolbar={() => (
							<CustomFormattingToolbar files={files} activeFileId={activeFileId} />
						)}
					/>
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
				</BlockNoteView>
			</NoteLinkProvider>
			<style jsx global>{`
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
					font-size: 0.9375rem;
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
				.blocknote-wrapper .bn-suggestion-decorator {
					border-radius: 0.2rem;
					background: hsl(var(--editor-selection));
					box-shadow: 0 0 0 1px hsl(var(--ring) / 0.7);
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
					box-shadow: 0 16px 36px hsl(var(--editor-shadow) / 0.42) !important;
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
