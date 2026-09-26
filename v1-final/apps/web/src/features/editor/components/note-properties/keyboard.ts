"use client";

import type { KeyboardEvent } from "react";

const FIELD_SELECTOR = "[data-note-property-field]";

function isFocusableField(element: HTMLElement) {
	return !element.hasAttribute("disabled") && element.getAttribute("aria-disabled") !== "true";
}

export function focusNextPropertyField(current: HTMLElement) {
	const root = current.closest("[data-note-properties-shelf]");
	if (!root) return false;

	const fields = Array.from(root.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter(
		isFocusableField,
	);
	const index = fields.indexOf(current);
	const next = index >= 0 ? fields[index + 1] : null;
	if (!next) return false;

	next.focus();
	if (next instanceof HTMLInputElement) next.select();
	return true;
}

// Vim-like shortcuts for a value that renders as a non-editable display
// (a link, a pill button…): `e` drops into edit mode, and Backspace / Delete /
// `d` clear the value. Applied only to the display element, never the input, so
// typing those keys while editing behaves normally.
export function valueDisplayKeys({
	onEdit,
	onClear,
}: {
	onEdit?: () => void;
	onClear?: () => void;
}) {
	return function handleValueDisplayKey(event: KeyboardEvent<HTMLElement>) {
		if (event.altKey || event.ctrlKey || event.metaKey) return;

		if (event.key === "e" && onEdit) {
			event.preventDefault();
			onEdit();
			return;
		}

		if ((event.key === "Backspace" || event.key === "Delete" || event.key === "d") && onClear) {
			event.preventDefault();
			onClear();
		}
	};
}

export function submitPropertyField(event: KeyboardEvent<HTMLElement>) {
	if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
		return;
	}

	event.preventDefault();
	const current = event.currentTarget;
	current.blur();
	window.requestAnimationFrame(() => focusNextPropertyField(current));
}
