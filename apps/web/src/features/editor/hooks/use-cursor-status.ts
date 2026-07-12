"use client";

import { useSyncExternalStore } from "react";
import { useLazyRef } from "@/shared/lib/use-lazy-ref";

export type EditorCursorStatus = {
	line: number;
	column: number;
	selection?: {
		words: number;
		characters: number;
	};
};

export type CursorStatusStore = {
	get: () => EditorCursorStatus;
	set: (next: EditorCursorStatus) => void;
	reset: () => void;
	subscribe: (listener: () => void) => () => void;
};

const INITIAL_STATUS: EditorCursorStatus = { line: 1, column: 1 };

function sameStatus(a: EditorCursorStatus, b: EditorCursorStatus): boolean {
	return (
		a.line === b.line &&
		a.column === b.column &&
		a.selection?.words === b.selection?.words &&
		a.selection?.characters === b.selection?.characters
	);
}

export function createCursorStatusStore(): CursorStatusStore {
	let status = INITIAL_STATUS;
	const listeners = new Set<() => void>();

	function notify() {
		for (const listener of listeners) listener();
	}

	return {
		get() {
			return status;
		},
		set(next) {
			if (sameStatus(status, next)) return;
			status = next;
			notify();
		},
		reset() {
			if (sameStatus(status, INITIAL_STATUS)) return;
			status = INITIAL_STATUS;
			notify();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

/**
 * Caret line/column + selection stats held outside React state. The selection
 * reporter fires once per keystroke; storing the result in `EditorContainer`
 * state re-rendered the entire editor chrome on every keypress (each report is
 * a fresh object, so React never bailed out). With the store, identical
 * reports — the collapsed-caret case while typing in block mode — notify
 * nobody, and real changes re-render only the status-bar leaf subscribed via
 * `useCursorStatus`.
 */
export function useCursorStatusStore(): CursorStatusStore {
	return useLazyRef(createCursorStatusStore).current;
}

export function useCursorStatus(store: CursorStatusStore): EditorCursorStatus {
	return useSyncExternalStore(store.subscribe, store.get, store.get);
}
