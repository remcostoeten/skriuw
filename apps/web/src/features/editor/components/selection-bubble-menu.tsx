/* eslint-disable */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useEditorState } from "@blocknote/react";
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	Bold,
	Code,
	Italic,
	Strikethrough,
	Underline,
} from "lucide-react";
import { noop } from "@/shared/lib/noop";
import { shouldClearSelectionBubbleRect } from "@/features/editor/lib/selection-bubble";
import {
	type EditorInstance,
	getEditorDom,
	getEditorView,
} from "@/features/editor/lib/editor-instance";
import type { AiAction } from "@/features/ai/service";
import type { NoteFile } from "@/types/notes";
import {
	AiMenu,
	BlockTypeMenu,
	CommentPopover,
	FmtIconButton,
	InternalNoteLinkMenu,
	LinkPopover,
	useOpenFmtMenu,
} from "./fmt-menu";
import { applyAlignment } from "./fmt-menu-actions";

type TAddComment = (range: { from: number; to: number }, body: string) => void;

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

type TCustomPromptWidgetProps = {
	onSubmit: (instruction: string) => void;
	onClose: () => void;
};

export function CustomPromptWidget({ onSubmit, onClose }: TCustomPromptWidgetProps) {
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

// A hidden probe whose height resolves `env(safe-area-inset-bottom)`, so the
// mobile toolbar can clear the iPhone home indicator when it pins to the very
// bottom (keyboard closed). Resolves to 0 on devices without insets.
let safeAreaProbe: HTMLDivElement | null = null;
function getSafeAreaInsetBottom(): number {
	if (typeof document === "undefined" || !document.body) return 0;
	if (!safeAreaProbe) {
		safeAreaProbe = document.createElement("div");
		safeAreaProbe.style.cssText =
			"position:fixed;bottom:0;left:0;width:0;height:env(safe-area-inset-bottom);pointer-events:none;visibility:hidden;";
		document.body.appendChild(safeAreaProbe);
	}
	return safeAreaProbe.getBoundingClientRect().height;
}

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
	const [viewport, setViewport] = useState<TVisualViewportState | null>(() =>
		typeof window !== "undefined" ? getVisualViewportState() : null,
	);

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
		visualViewport?.addEventListener("scroll", update, { passive: true });
		return () => {
			if (frame !== null) cancelAnimationFrame(frame);
			window.removeEventListener("resize", update);
			visualViewport?.removeEventListener("resize", update);
			visualViewport?.removeEventListener("scroll", update);
		};
	}, []);

	return viewport;
}

const FOCUSABLE_ITEMS =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Top-level toolbar controls only — excludes focusables inside an open dropdown
// so roving navigation steps between toolbar buttons, not menu entries.
function getToolbarItems(toolbar: HTMLElement): HTMLElement[] {
	return Array.from(toolbar.querySelectorAll<HTMLElement>(FOCUSABLE_ITEMS)).filter(
		(el) => !el.closest(".skriuw-fmt-dropdown"),
	);
}

export function SelectionBubbleMenu({
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
		window.visualViewport?.addEventListener("scroll", schedule, { passive: true });
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
			// Runs on EVERY transaction (each keystroke). With a collapsed caret the
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
					mobileViewport.top +
						mobileViewport.height -
						toolbarHeight -
						10 -
						getSafeAreaInsetBottom(),
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

	return createPortal(
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

				if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
					if (index === -1) return;
					e.preventDefault();
					const dir = e.key === "ArrowRight" ? 1 : -1;
					items[(index + dir + items.length) % items.length]?.focus();
					return;
				}

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
		</div>,
		document.body,
	);
}
