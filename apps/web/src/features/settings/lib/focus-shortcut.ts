export const SETTINGS_FOCUSABLE_SELECTOR = [
	'a[href]',
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	'[tabindex]:not([tabindex="-1"])',
].join(", ");

const EDITABLE_SHORTCUT_TARGET_SELECTOR =
	"input, textarea, select, [contenteditable='true'], [role='textbox']";

type ClosableTarget = {
	closest?: (selector: string) => unknown;
};

export function isEditableShortcutTarget(target: EventTarget | ClosableTarget | null): boolean {
	if (!target || typeof target !== "object") return false;
	const closest = (target as ClosableTarget).closest;
	return typeof closest === "function"
		? Boolean(closest.call(target, EDITABLE_SHORTCUT_TARGET_SELECTOR))
		: false;
}

export function getSettingsMainFocusTarget(
	panel: HTMLElement | null,
	lastMainFocus: HTMLElement | null,
): HTMLElement | null {
	if (!panel) return null;
	if (lastMainFocus?.isConnected && panel.contains(lastMainFocus)) return lastMainFocus;
	return panel;
}

export function getSettingsSidebarFocusTarget(
	sidebar: HTMLElement | null,
	lastSidebarFocus: HTMLElement | null,
): HTMLElement | null {
	if (!sidebar) return null;
	if (lastSidebarFocus?.isConnected && sidebar.contains(lastSidebarFocus)) {
		return lastSidebarFocus;
	}

	return (
		sidebar.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
		sidebar.querySelector<HTMLElement>(SETTINGS_FOCUSABLE_SELECTOR)
	);
}
