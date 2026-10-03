import type { DrawingLayer } from "./layer";
import type { DrawingShortcutId } from "./shortcut-ids";

/**
 * The live document a note's annotation layer belongs to. The editor that owns
 * the note implements it, so ink joins the document's transactions, undo
 * history, and save path without the drawing module knowing the editor.
 */
export type DrawingDocument = {
  readPayload: () => unknown;
  replaceLayer: (layer: DrawingLayer | null) => void;
  undo: () => void;
  redo: () => void;
  focus: () => void;
};

export type DrawingShortcutHandlers = Record<DrawingShortcutId, () => void>;
