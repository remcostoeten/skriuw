type EditorContextMenuInput = {
	mode: "raw" | "block";
	hasFile: boolean;
};

export function getEditorContextMenuState({ mode, hasFile }: EditorContextMenuInput) {
	return {
		canCopyTitle: hasFile,
		canExportMarkdown: hasFile,
		modeLabel: mode === "block" ? "Switch to raw markdown" : "Switch to block editor",
	};
}

type CalendarDayContextMenuInput = {
	hasEntry: boolean;
	isSelected: boolean;
	isToday: boolean;
};

export function getCalendarDayContextMenuState({ hasEntry, isToday }: CalendarDayContextMenuInput) {
	return {
		openLabel: hasEntry ? "Open entry" : "Start entry",
		copyLabel: "Copy date",
		canJumpToToday: !isToday,
	};
}

export async function copyTextToClipboard(text: string) {
	if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
		return;
	}

	if (typeof document === "undefined") return;

	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.left = "-9999px";
	document.body.appendChild(textarea);
	textarea.select();
	document.execCommand("copy");
	textarea.remove();
}
