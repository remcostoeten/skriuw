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

export function submitPropertyField(event: KeyboardEvent<HTMLElement>) {
	if (
		event.key !== "Enter" ||
		event.shiftKey ||
		event.altKey ||
		event.ctrlKey ||
		event.metaKey
	) {
		return;
	}

	event.preventDefault();
	const current = event.currentTarget;
	current.blur();
	window.requestAnimationFrame(() => focusNextPropertyField(current));
}
