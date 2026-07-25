import { useEffect, useRef, useState } from "react";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { openExternalUrl } from "../bridge/external-links";
import { CheckIcon, ExternalLinkIcon, LinkIcon, PencilIcon, UnlinkIcon } from "../shared/icons";
import { rangeMenuAnchor, type MenuAnchor } from "./menu-anchor";
import { productSchema } from "./schema";

export type LinkMenuState = {
  open: boolean;
  editing: boolean;
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

/**
 * The contiguous run of text under an empty selection that carries the link
 * mark, or null when the cursor is not inside a link.
 */
export function linkAtCursor(state: EditorState): LinkRange | null {
  const link = productSchema.marks.link;
  const { $from, empty } = state.selection;
  if (!link || !empty || !$from.parent.isTextblock) return null;
  const blockStart = $from.start();
  const cursor = $from.pos;
  const runs: LinkRange[] = [];
  let offset = 0;
  $from.parent.forEach((child) => {
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
  return runs.find((run) => cursor > run.from && cursor < run.to) ?? null;
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

function normalizeHref(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("#")) return trimmed;
  return `https://${trimmed}`;
}

type Props = {
  state: LinkMenuState;
  getView: () => EditorView | null;
  onClose: () => void;
  onEdit: () => void;
};

export function LinkMenu({ state, getView, onClose, onEdit }: Props) {
  const [draft, setDraft] = useState(state.href);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state.editing) {
      setDraft(state.href);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [state.editing, state.href, state.from, state.to]);
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

  return (
    <div
      className="link-menu"
      data-below={state.below ? "true" : undefined}
      style={{ left: state.x, top: state.y }}
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
        <>
          <button
            type="button"
            className="link-menu-href"
            title={state.href}
            onMouseDown={(event) => {
              event.preventDefault();
              openExternalUrl(state.href).catch((error) => {
                console.error("open external url rejected", error);
              });
            }}
          >
            <ExternalLinkIcon size={13} />
            <span>{state.href}</span>
          </button>
          <span className="link-menu-sep" />
          <button
            type="button"
            title="Edit link"
            aria-label="Edit link"
            onMouseDown={(event) => {
              event.preventDefault();
              onEdit();
            }}
          >
            <PencilIcon size={13} />
          </button>
          <button
            type="button"
            title="Remove link"
            aria-label="Remove link"
            onMouseDown={(event) => {
              event.preventDefault();
              removeLink();
            }}
          >
            <UnlinkIcon size={13} />
          </button>
        </>
      )}
    </div>
  );
}
