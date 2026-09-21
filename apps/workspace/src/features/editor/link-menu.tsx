import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { ResolvedPos } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  AppWindowIcon,
  CheckIcon,
  ExternalLinkIcon,
  LinkIcon,
  PencilIcon,
  UnlinkIcon,
} from "@/shared/icons/static";
import { linkTargetLabel, otherLinkTarget, type LinkTarget } from "./open-link";
import { rangeMenuAnchor, type MenuAnchor } from "./menu-anchor";
import { productSchema } from "./schema";

/** What put the menu on screen: the caret entering a link, or the pointer over one. */
export type LinkMenuSource = "caret" | "hover";

export type LinkMenuState = {
  open: boolean;
  editing: boolean;
  source: LinkMenuSource;
  href: string;
  from: number;
  to: number;
  x: number;
  y: number;
  below: boolean;
};

export const closedLinkMenu: LinkMenuState = {
  open: false,
  editing: false,
  source: "caret",
  href: "",
  from: 0,
  to: 0,
  x: 0,
  y: 0,
  below: false,
};

const LINK_MENU_WIDTH = 300;

type LinkRange = {
  href: string;
  from: number;
  to: number;
};

/** The contiguous runs of text carrying the link mark inside the resolved textblock. */
function linkRuns($pos: ResolvedPos): LinkRange[] {
  const link = productSchema.marks.link;
  if (!link) return [];
  const blockStart = $pos.start();
  const runs: LinkRange[] = [];
  let offset = 0;
  $pos.parent.forEach((child) => {
    const from = blockStart + offset;
    const mark = link.isInSet(child.marks);
    if (mark) {
      const href = String(mark.attrs.href ?? "");
      const last = runs[runs.length - 1];
      if (last && last.to === from && last.href === href) {
        last.to = from + child.nodeSize;
      } else {
        runs.push({ href, from, to: from + child.nodeSize });
      }
    }
    offset += child.nodeSize;
  });
  return runs;
}

/**
 * The contiguous run of text under an empty selection that carries the link
 * mark, or null when the cursor is not inside a link.
 */
export function linkAtCursor(state: EditorState): LinkRange | null {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock) return null;
  const cursor = $from.pos;
  return linkRuns($from).find((run) => cursor > run.from && cursor < run.to) ?? null;
}

/**
 * The link run covering a document position, used to resolve the link the
 * pointer is over. Unlike the caret lookup this includes the run's leading
 * edge, because a hovered anchor resolves to the position before its text.
 */
export function linkAtPos(state: EditorState, pos: number): LinkRange | null {
  if (pos < 0 || pos > state.doc.content.size) return null;
  const $pos = state.doc.resolve(pos);
  if (!$pos.parent.isTextblock) return null;
  return linkRuns($pos).find((run) => pos >= run.from && pos < run.to) ?? null;
}

/** The href of the first link mark inside the range, or "" when there is none. */
export function linkInRange(state: EditorState, from: number, to: number): string {
  const link = productSchema.marks.link;
  if (!link) return "";
  let href = "";
  state.doc.nodesBetween(from, to, (node) => {
    if (href) return false;
    const mark = link.isInSet(node.marks);
    if (mark) href = String(mark.attrs.href ?? "");
    return true;
  });
  return href;
}

/**
 * The viewport anchor for the link menu over the range, sharing the bubble
 * menu's anchor so the two swap in place rather than jumping.
 */
export function linkMenuAnchor(view: EditorView, from: number, to: number): MenuAnchor {
  return rangeMenuAnchor(view, from, to, LINK_MENU_WIDTH);
}

const SAFE_LINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function normalizeHref(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("#")) return trimmed;
  const scheme = /^([a-z][a-z0-9+.-]*:)/i.exec(trimmed)?.[1];
  if (scheme) {
    return SAFE_LINK_SCHEMES.has(scheme.toLowerCase()) ? trimmed : "";
  }
  return `https://${trimmed}`;
}

type Props = {
  state: LinkMenuState;
  getView: () => EditorView | null;
  /** Where the href button sends the link; the alternate button offers the other. */
  defaultTarget: LinkTarget;
  /** Display form of the open-link shortcut, shown in the href button's tooltip. */
  openShortcut?: string;
  onOpen: (href: string, target: LinkTarget) => void;
  onClose: () => void;
  onEdit: () => void;
  /** The pointer entering the menu keeps a hover-opened menu on screen. */
  onHoverStart: () => void;
  onHoverEnd: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
};

type LinkAction = {
  id: string;
  label: string;
  title: string;
  className?: string;
  separatorBefore?: boolean;
  content: ReactNode;
  run: () => void;
};

function openTitle(target: LinkTarget, shortcut?: string): string {
  const label = linkTargetLabel(target);
  return shortcut ? `${label} (${shortcut})` : label;
}

function TargetIcon({ target }: { target: LinkTarget }) {
  return target === "app" ? <AppWindowIcon size={13} /> : <ExternalLinkIcon size={13} />;
}

export function LinkMenu({
  state,
  getView,
  defaultTarget,
  openShortcut,
  onOpen,
  onClose,
  onEdit,
  onHoverStart,
  onHoverEnd,
  containerRef,
}: Props) {
  const alternateTarget = otherLinkTarget(defaultTarget);
  const [draft, setDraft] = useState(state.href);
  const [focusIndex, setFocusIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (state.editing) {
      setDraft(state.href);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [state.editing, state.href, state.from, state.to]);
  useEffect(() => {
    if (!state.open) setFocusIndex(0);
  }, [state.open]);
  if (!state.open) return null;

  function closeAndFocus(): void {
    onClose();
    getView()?.focus();
  }

  function applyDraft(): void {
    const view = getView();
    const link = productSchema.marks.link;
    if (!view || !link) return;
    const href = normalizeHref(draft);
    const tr = view.state.tr.removeMark(state.from, state.to, link);
    if (href) tr.addMark(state.from, state.to, link.create({ href }));
    view.dispatch(tr);
    closeAndFocus();
  }

  function removeLink(): void {
    const view = getView();
    const link = productSchema.marks.link;
    if (!view || !link) return;
    view.dispatch(view.state.tr.removeMark(state.from, state.to, link));
    closeAndFocus();
  }

  const actions: LinkAction[] = [
    {
      id: "open",
      label: `${linkTargetLabel(defaultTarget)}: ${state.href}`,
      title: `${openTitle(defaultTarget, openShortcut)}: ${state.href}`,
      className: "link-menu-href",
      content: (
        <>
          <TargetIcon target={defaultTarget} />
          <span>{state.href}</span>
        </>
      ),
      run: () => onOpen(state.href, defaultTarget),
    },
    {
      id: "open-alternate",
      label: linkTargetLabel(alternateTarget),
      title: linkTargetLabel(alternateTarget),
      content: <TargetIcon target={alternateTarget} />,
      run: () => onOpen(state.href, alternateTarget),
    },
    {
      id: "edit",
      label: "Edit link",
      title: "Edit link",
      separatorBefore: true,
      content: <PencilIcon size={13} />,
      run: onEdit,
    },
    {
      id: "unlink",
      label: "Remove link",
      title: "Remove link",
      content: <UnlinkIcon size={13} />,
      run: removeLink,
    },
  ];

  function moveFocus(next: number): void {
    const wrapped = (next + actions.length) % actions.length;
    setFocusIndex(wrapped);
    buttonsRef.current[wrapped]?.focus();
  }

  return (
    <div
      ref={containerRef}
      className="link-menu"
      role={state.editing ? "group" : "toolbar"}
      aria-label="Link"
      aria-orientation={state.editing ? undefined : "horizontal"}
      data-below={state.below ? "true" : undefined}
      style={{ left: state.x, top: state.y }}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (
          next instanceof HTMLElement &&
          (next.closest(".link-menu") || next.closest(".prosemirror-host"))
        ) {
          return;
        }
        onClose();
      }}
      onKeyDown={(event) => {
        if (state.editing) return;
        if (event.key === "Tab") {
          event.preventDefault();
          moveFocus(focusIndex + (event.shiftKey ? -1 : 1));
        } else if (event.key === "ArrowRight") {
          // 60% keyboards have no Home or End, so shift+arrow jumps to either
          // end of the toolbar; Home and End still work where they exist.
          event.preventDefault();
          moveFocus(event.shiftKey ? actions.length - 1 : focusIndex + 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          moveFocus(event.shiftKey ? 0 : focusIndex - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          moveFocus(0);
        } else if (event.key === "End") {
          event.preventDefault();
          moveFocus(actions.length - 1);
        } else if (event.key === "Escape") {
          event.preventDefault();
          closeAndFocus();
        }
      }}
    >
      {state.editing ? (
        <>
          <span className="link-menu-input-icon" aria-hidden="true">
            <LinkIcon size={13} />
          </span>
          <input
            ref={inputRef}
            className="link-menu-input"
            type="text"
            placeholder="Paste or type a link"
            aria-label="Link URL"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyDraft();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                closeAndFocus();
              }
            }}
          />
          <button
            type="button"
            className="link-menu-apply"
            title={draft.trim() ? "Apply link" : "Remove link"}
            aria-label={draft.trim() ? "Apply link" : "Remove link"}
            onMouseDown={(event) => {
              event.preventDefault();
              applyDraft();
            }}
          >
            <CheckIcon size={13} />
          </button>
        </>
      ) : (
        actions.map((action, index) => (
          <Fragment key={action.id}>
            {action.separatorBefore && <span className="link-menu-sep" />}
            <button
              ref={(element) => {
                buttonsRef.current[index] = element;
              }}
              type="button"
              className={action.className}
              title={action.title}
              aria-label={action.label}
              tabIndex={index === focusIndex ? 0 : -1}
              onFocus={() => setFocusIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                action.run();
              }}
            >
              {action.content}
            </button>
          </Fragment>
        ))
      )}
    </div>
  );
}
