"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
		(element) => !element.hasAttribute("disabled") && element.tabIndex !== -1,
	);
}

export function useFocusTrap(
	active: boolean,
	containerRef: RefObject<HTMLElement | null>,
) {
	useEffect(() => {
		if (!active) return;

		const container = containerRef.current;
		if (!container) return;

		const previouslyFocused =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const focusable = getFocusableElements(container);
		focusable[0]?.focus();

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key !== "Tab" || !container) return;

			const elements = getFocusableElements(container);
			if (elements.length === 0) {
				event.preventDefault();
				return;
			}

			const first = elements[0];
			const last = elements.at(-1);
			if (!first || !last) return;

			const activeElement = document.activeElement;
			if (event.shiftKey && activeElement === first) {
				event.preventDefault();
				last.focus();
				return;
			}

			if (!event.shiftKey && activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}

		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			previouslyFocused?.focus();
		};
	}, [active, containerRef]);
}
