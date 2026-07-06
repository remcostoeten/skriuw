// Public surface of the anchored-marks engine. Import from here, not from deep
// paths, so the internal layering can move without breaking consumers.
//
// The whole module is side-effect free and tree-shakeable; import it lazily
// (e.g. `await import("@/features/collaboration/anchored-marks")`) behind the
// collab gate so solo notes never pay its bundle cost.

export type { TAnchor, TAnchoredMark, TMarkAuthor, TMarkRenderer, TResolvedMark } from "./types";

export { AnchoredMarkStore, getAnchoredMarkMap } from "./store";
export { MarkRendererRegistry } from "./registry";
export { AnchoredMarksEngine, type TCreateMarkInput } from "./engine";
export { anchoredMarksPlugin, anchoredMarksPluginKey } from "./prosemirror/plugin";
export { encodeAnchor, resolveAnchor } from "./prosemirror/anchor-codec";
export { commentRenderer, COMMENT_MARK_TYPE, type TCommentPayload } from "./renderers/comment";
