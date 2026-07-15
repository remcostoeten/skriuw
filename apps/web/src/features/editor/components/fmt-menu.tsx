/* eslint-disable react-doctor/interactive-supports-focus, react-doctor/control-has-associated-label, react-doctor/no-autofocus */
/* eslint-disable */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
	ChevronDown,
	FileText,
	Heading1,
	Heading2,
	Heading3,
	Highlighter,
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
	Sparkles,
	SpellCheck,
	Wand2,
} from "lucide-react";
import {
	createMarkId,
	inferMarkKind,
	MARK_COLORS,
	type MarkColor,
} from "@skriuw/domain/living-information";
import { getNoteTitle } from "@/domain/notes/note-links";
import { type EditorInstance, getEditorView } from "@/features/editor/lib/editor-instance";
import type { AiAction } from "@/features/ai/service";
import type { NoteFile } from "@/types/notes";
import { NoteLinkMenuList } from "./note-link-menu-list";
import { applyBlockType } from "./fmt-menu-actions";
import { useShortcutHint, type ShortcutId } from "@/core/shortcuts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

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
	{
		id: "quote",
		label: "Quote",
		icon: <Quote size={15} />,
		type: "quote",
		props: {},
	},
];

const FMT_MENU_FOCUSABLE_ITEMS =
	'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type TFmtIconButtonProps = {
	label: string;
	icon: ReactNode;
	active: boolean;
	onRun: () => void;
	shortcutId?: ShortcutId;
};

export function FmtIconButton({ label, icon, active, onRun, shortcutId }: TFmtIconButtonProps) {
	const shortcut = useShortcutHint(shortcutId);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					className="skriuw-fmt-btn"
					data-active={active ? "true" : undefined}
					aria-label={label}
					aria-pressed={active}
					onMouseDown={(event) => event.preventDefault()}
					onClick={onRun}
				>
					{icon}
				</button>
			</TooltipTrigger>
			<TooltipContent side="top" className="px-2 py-1 text-xs" shortcut={shortcut}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

// BlockNote's FormattingToolbarController unmounts and remounts the toolbar on
// editor interaction (a real click on a control triggers it), which would reset
// any in-component dropdown state and instantly close a menu the user just
// opened. So "which menu is open" lives in a module-level store: a remounted
// toolbar reads it back and re-opens the same menu. A short debounce
// distinguishes a remount (toolbar reappears within a few frames) from a genuine
// hide (selection cleared) and resets in the latter.
let openFmtMenuId: string | null = null;
const fmtMenuListeners = new Set<() => void>();
let fmtToolbarMountCount = 0;
let fmtResetTimer: ReturnType<typeof setTimeout> | null = null;

function setOpenFmtMenu(id: string | null) {
	if (openFmtMenuId === id) return;
	openFmtMenuId = id;
	for (const listener of fmtMenuListeners) listener();
}

export function useOpenFmtMenu(): string | null {
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
	label?: string;
};

function FmtMenu({ id, trigger, children, onOpen, width, label }: TFmtMenuProps) {
	const open = useOpenFmtMenu() === id;
	const ref = useRef<HTMLDivElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);

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

	useLayoutEffect(() => {
		if (!open) return;
		dropdownRef.current?.querySelector<HTMLElement>(FMT_MENU_FOCUSABLE_ITEMS)?.focus();
	}, [open]);

	const focusTrigger = () => {
		ref.current?.querySelector<HTMLElement>("button")?.focus();
	};

	const focusDropdownItem = (direction: 1 | -1) => {
		const dropdown = dropdownRef.current;
		if (!dropdown) return;
		const items = Array.from(dropdown.querySelectorAll<HTMLElement>(FMT_MENU_FOCUSABLE_ITEMS));
		if (items.length === 0) return;
		const index = document.activeElement
			? items.indexOf(document.activeElement as HTMLElement)
			: -1;
		items[(index + direction + items.length) % items.length]?.focus();
	};

	const focusDropdownBoundary = (edge: "first" | "last") => {
		const dropdown = dropdownRef.current;
		if (!dropdown) return;
		const items = Array.from(dropdown.querySelectorAll<HTMLElement>(FMT_MENU_FOCUSABLE_ITEMS));
		const item = edge === "first" ? items[0] : items.at(-1);
		item?.focus();
	};

	return (
		<div className="skriuw-fmt-menu" ref={ref}>
			{label ? (
				<Tooltip>
					<TooltipTrigger asChild>{trigger({ open, toggle })}</TooltipTrigger>
					<TooltipContent side="top" className="px-2 py-1 text-xs">
						{label}
					</TooltipContent>
				</Tooltip>
			) : (
				trigger({ open, toggle })
			)}
			{open ? (
				<div
					ref={dropdownRef}
					className="skriuw-fmt-dropdown"
					role="menu"
					style={width ? ({ minWidth: width } as CSSProperties) : undefined}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.preventDefault();
							setOpenFmtMenu(null);
							focusTrigger();
							return;
						}

						if (event.key === "ArrowDown" || event.key === "ArrowUp") {
							event.preventDefault();
							focusDropdownItem(event.key === "ArrowDown" ? 1 : -1);
							return;
						}

						if (event.key === "Home" || event.key === "End") {
							event.preventDefault();
							focusDropdownBoundary(event.key === "Home" ? "first" : "last");
						}
					}}
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

export function BlockTypeMenu({ editor, blockType, level }: TBlockTypeMenuProps) {
	const current =
		BLOCK_TYPE_OPTIONS.find(
			(option) =>
				option.type === blockType &&
				(option.type !== "heading" || option.props.level === level),
		) ?? BLOCK_TYPE_OPTIONS[0];

	return (
		<FmtMenu
			id="block-type"
			label="Block type"
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

export function LinkPopover({ editor }: { editor: EditorInstance }) {
	const selectedTextRef = useRef("");
	const [url, setUrl] = useState("");

	return (
		<FmtMenu
			id="link"
			label="Create link"
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

const HIGHLIGHT_COLOR_CLASS: Record<MarkColor, string> = {
	yellow: "bg-amber-300 text-amber-950",
	green: "bg-emerald-300 text-emerald-950",
	blue: "bg-sky-300 text-sky-950",
	pink: "bg-rose-300 text-rose-950",
	purple: "bg-violet-300 text-violet-950",
	orange: "bg-orange-300 text-orange-950",
};

export function HighlightPopover({ editor }: { editor: EditorInstance }) {
	const selectedTextRef = useRef("");
	const [color, setColor] = useState<MarkColor>("yellow");
	const [label, setLabel] = useState("");

	return (
		<FmtMenu
			id="highlight"
			label="Highlight selection"
			width="15rem"
			onOpen={() => {
				selectedTextRef.current = String(editor.getSelectedText?.() ?? "").trim();
				setColor("yellow");
				setLabel("");
			}}
			trigger={({ open, toggle }) => (
				<button
					type="button"
					className="skriuw-fmt-btn"
					aria-label="Highlight selection"
					aria-expanded={open}
					onMouseDown={(event) => event.preventDefault()}
					onClick={toggle}
				>
					<Highlighter size={15} />
				</button>
			)}
		>
			{(close) => {
				const submit = () => {
					const text = selectedTextRef.current;
					if (!text) return;
					editor.focus();
					editor.insertInlineContent([
						{
							type: "mark",
							props: {
								id: createMarkId(),
								kind: inferMarkKind(text),
								text,
								value: text,
								color,
								label: label.trim(),
							},
						} as any,
					]);
					close();
				};
				return (
					<div className="skriuw-fmt-form gap-2">
						<div className="flex gap-1" aria-label="Highlight color" role="group">
							{MARK_COLORS.map((option) => (
								<button
									key={option}
									type="button"
									className={`size-7 rounded-full ring-offset-2 ring-offset-popover focus-visible:outline-none focus-visible:ring-2 ${HIGHLIGHT_COLOR_CLASS[option]}`}
									aria-label={`${option} highlight`}
									aria-pressed={color === option}
									data-active={color === option ? "true" : undefined}
									onMouseDown={(event) => event.preventDefault()}
									onClick={() => setColor(option)}
								/>
							))}
						</div>
						<input
							autoFocus
							value={label}
							onChange={(event) => setLabel(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									submit();
								}
								if (event.key === "Escape") close();
							}}
							placeholder="Label (optional)"
							className="skriuw-fmt-input"
						/>
						<button
							type="button"
							className="skriuw-fmt-apply"
							onMouseDown={(event) => event.preventDefault()}
							onClick={submit}
						>
							Highlight
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

export function InternalNoteLinkMenu({ editor, files, activeFileId }: TInternalNoteLinkMenuProps) {
	const selectedTextRef = useRef("");

	return (
		<FmtMenu
			id="note-link"
			label="Link to a note"
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

type TAddComment = (range: { from: number; to: number }, body: string) => void;

export function CommentPopover({
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
			label="Comment on selection"
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

type TAiMenuProps = {
	onSpellCheck?: () => void;
	onContinueWriting?: () => void;
	onAiAction?: (action: AiAction) => void;
	onOpenCustomPrompt?: () => void;
};

const SELECTION_AI_ITEMS: Array<{
	action: AiAction;
	label: string;
	icon: ReactNode;
}> = [
	{
		action: "fixSelection",
		label: "Fix spelling & grammar",
		icon: <SpellCheck size={15} />,
	},
	{
		action: "rewriteSelection",
		label: "Rewrite",
		icon: <RefreshCw size={15} />,
	},
	{
		action: "shortenSelection",
		label: "Make shorter",
		icon: <Minimize2 size={15} />,
	},
	{
		action: "expandSelection",
		label: "Make longer",
		icon: <Maximize2 size={15} />,
	},
	{
		action: "translateSelection",
		label: "Translate",
		icon: <Languages size={15} />,
	},
];

export function AiMenu({
	onSpellCheck,
	onContinueWriting,
	onAiAction,
	onOpenCustomPrompt,
}: TAiMenuProps) {
	if (!onSpellCheck && !onContinueWriting && !onAiAction && !onOpenCustomPrompt) return null;

	return (
		<FmtMenu
			id="ai"
			label="AI actions"
			width="13rem"
			trigger={({ open, toggle }) => (
				<button
					type="button"
					className="skriuw-fmt-btn"
					aria-label="AI actions"
					aria-haspopup="menu"
					aria-expanded={open}
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
