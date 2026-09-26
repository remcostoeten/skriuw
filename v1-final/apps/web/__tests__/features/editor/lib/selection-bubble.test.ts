import { describe, expect, test } from "bun:test";
import { shouldClearSelectionBubbleRect } from "@/features/editor/lib/selection-bubble";

describe("shouldClearSelectionBubbleRect", () => {
	test("keeps the toolbar visible while a formatting menu is open", () => {
		expect(
			shouldClearSelectionBubbleRect({
				hasOpenMenu: true,
				hasSelection: false,
				isCollapsed: true,
				isInsideEditor: true,
				hasSelectedText: false,
			}),
		).toBe(false);
	});

	test("clears the toolbar when the selection is gone and no menu is open", () => {
		expect(
			shouldClearSelectionBubbleRect({
				hasOpenMenu: false,
				hasSelection: false,
				isCollapsed: true,
				isInsideEditor: true,
				hasSelectedText: false,
			}),
		).toBe(true);
	});
});
