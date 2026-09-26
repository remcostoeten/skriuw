import { focusActiveEditor, focusActiveNoteTreeItem } from "@/shared/lib/focus-editor";
import type { GotoDestination } from "./goto-types";

type GotoRouter = {
	push: (path: string) => void;
};

/**
 * Route destinations are app-relative; the Next router prepends the configured
 * base path, so this is the single seam if resolution ever needs more.
 */
export function resolveRoute(path: string): string {
	return path;
}

const FOCUS_HANDLERS: Record<string, () => boolean> = {
	editor: () => focusActiveEditor(),
	leftSidebar: () => focusActiveNoteTreeItem(),
	searchInput: () => window.dispatchEvent(new Event("skriuw:focus-sidebar-search")),
};

function focusRegisteredElement(element: HTMLElement | null): boolean {
	if (!element) return false;

	const focusable = element.matches("a, button, input, textarea, select, [tabindex]")
		? element
		: element.querySelector<HTMLElement>(
				"a, button, input, textarea, select, [tabindex], [contenteditable='true']",
			);
	if (!focusable) return false;

	focusable.focus();
	return true;
}

export function executeGotoDestination(
	destination: GotoDestination,
	element: HTMLElement | null,
	router: GotoRouter,
): void {
	switch (destination.type) {
		case "focus": {
			const handler = FOCUS_HANDLERS[destination.focusTarget];
			if (handler?.()) return;
			focusRegisteredElement(element);
			return;
		}
		case "route":
			router.push(resolveRoute(destination.path));
			return;
	}
}
