type ShouldClearSelectionBubbleRectInput = {
	hasOpenMenu: boolean;
	hasSelection: boolean;
	isCollapsed: boolean;
	isInsideEditor: boolean;
	hasSelectedText: boolean;
};

export function shouldClearSelectionBubbleRect({
	hasOpenMenu,
	hasSelection,
	isCollapsed,
	isInsideEditor,
	hasSelectedText,
}: ShouldClearSelectionBubbleRectInput) {
	if (hasOpenMenu) {
		return false;
	}

	if (!hasSelection || isCollapsed) {
		return true;
	}

	if (!isInsideEditor || !hasSelectedText) {
		return true;
	}

	return false;
}
