import { Decoration } from "prosemirror-view";
import type { TMarkRenderer, TResolvedMark } from "../types";

export const COMMENT_MARK_TYPE = "comment";

/** Shape stored in a comment mark's `payload`. */
export type TCommentPayload = {
	body: string;
	replies: Array<{ author: string; body: string; at: number }>;
};

/**
 * First adapter: paints a comment as an inline highlight tinted with the
 * author's presence color (the same palette as live cursors), tagged with the
 * mark id so a thread popover can find it. Resolved comments render faded
 * rather than disappearing. Styling is driven by the `--anchored-comment-color`
 * custom property so the CSS stays theme-agnostic — see the folder README for
 * the one rule block to add to the editor styles.
 */
export function commentRenderer(): TMarkRenderer {
	return {
		type: COMMENT_MARK_TYPE,
		buildDecorations(resolved: TResolvedMark): Decoration[] {
			const { mark, from, to } = resolved;
			// A collapsed range means the anchored text was fully deleted; nothing
			// to paint, and ProseMirror rejects zero-width inline decorations.
			if (from >= to) return [];
			const payload = mark.payload as TCommentPayload | undefined;
			// Native `title` gives a zero-JS hover read of the thread until the
			// click-to-open popover lands; the data attribute lets that popover
			// locate the span later.
			const tooltip = payload?.body
				? `${mark.author.name}: ${payload.body}`
				: mark.author.name;
			return [
				Decoration.inline(from, to, {
					class: mark.resolved
						? "anchored-comment anchored-comment--resolved"
						: "anchored-comment",
					style: `--anchored-comment-color: ${mark.author.color};`,
					"data-mark-id": mark.id,
					title: tooltip,
				}),
			];
		},
	};
}
