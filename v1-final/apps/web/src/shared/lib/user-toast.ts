"use client";

export type UserToastVariant = "success" | "error" | "info";

export type UserToast = {
	id: string;
	message: string;
	variant: UserToastVariant;
};

type ToastListener = (toast: UserToast | null) => void;

const listeners = new Set<ToastListener>();
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function subscribeUserToast(listener: ToastListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function showUserToast(message: string, variant: UserToastVariant = "info") {
	if (typeof window === "undefined") return;

	const toast: UserToast = {
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		message,
		variant,
	};

	for (const listener of listeners) {
		listener(toast);
	}

	if (hideTimer) clearTimeout(hideTimer);
	hideTimer = setTimeout(() => {
		for (const listener of listeners) {
			listener(null);
		}
		hideTimer = null;
	}, 2800);
}
