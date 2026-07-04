"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";

/**
 * PWA bootstrap: registers the service worker and shows a one-time install
 * banner on mobile. Android/Chromium gets the real install prompt via
 * `beforeinstallprompt`; iOS Safari has no install API, so it gets a short
 * "Share → Add to Home Screen" instruction instead.
 */

const DISMISS_KEY = "pwa-install-prompt";
const PROMPT_DELAY_MS = 4000;

type TBeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		(window.navigator as { standalone?: boolean }).standalone === true
	);
}

function isIos() {
	return (
		/iPad|iPhone|iPod/.test(navigator.userAgent) ||
		// iPadOS 13+ reports as macOS but has touch support.
		(navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1)
	);
}

function markHandled() {
	try {
		localStorage.setItem(DISMISS_KEY, "handled");
	} catch {}
}

function wasHandled() {
	try {
		return localStorage.getItem(DISMISS_KEY) !== null;
	} catch {
		return true;
	}
}

export function PwaSetup() {
	const [mode, setMode] = useState<"hidden" | "android" | "ios">("hidden");
	const [installEvent, setInstallEvent] = useState<TBeforeInstallPromptEvent | null>(null);

	useEffect(function registerServiceWorker() {
		if (process.env.NODE_ENV !== "production") return;
		if (!("serviceWorker" in navigator)) return;
		navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {
			// Registration failure only costs offline support; never surface it.
		});
	}, []);

	useEffect(function armInstallPrompt() {
		if (isStandalone() || wasHandled()) return;

		let timer: ReturnType<typeof setTimeout> | undefined;

		function onBeforeInstallPrompt(event: Event) {
			event.preventDefault();
			setInstallEvent(event as TBeforeInstallPromptEvent);
			timer = setTimeout(function () {
				setMode("android");
			}, PROMPT_DELAY_MS);
		}

		if (isIos()) {
			timer = setTimeout(function () {
				setMode("ios");
			}, PROMPT_DELAY_MS);
		} else {
			// Any Chromium (Android, desktop Chrome/Edge, ChromeOS) can fire this.
			window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
		}

		return function () {
			window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
			if (timer) clearTimeout(timer);
		};
	}, []);

	function dismiss() {
		markHandled();
		setMode("hidden");
	}

	async function install() {
		if (!installEvent) return;
		setMode("hidden");
		await installEvent.prompt();
		const choice = await installEvent.userChoice;
		setInstallEvent(null);
		// Only suppress the banner permanently on an actual install; a dismissed
		// native prompt leaves the door open for a later attempt.
		if (choice.outcome === "accepted") {
			markHandled();
		}
	}

	if (mode === "hidden") return null;

	return (
		<div
			role="dialog"
			aria-label="Install Skriuw"
			className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-sm rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-300"
		>
			<button
				type="button"
				onClick={dismiss}
				aria-label="Dismiss"
				className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
			>
				<X className="size-4" />
			</button>
			<div className="flex items-start gap-3">
				<Image
					src="/icon-192.png"
					alt=""
					width={44}
					height={44}
					className="rounded-[10px]"
				/>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium">Install Skriuw</p>
					{mode === "android" ? (
						<>
							<p className="mt-0.5 text-xs text-muted-foreground">
								Add Skriuw to your home screen for a faster, full-screen experience.
							</p>
							<button
								type="button"
								onClick={install}
								className="mt-2.5 inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
							>
								Install app
							</button>
						</>
					) : (
						<p className="mt-0.5 text-xs text-muted-foreground">
							Tap the <span className="font-medium text-foreground">Share</span> icon in
							Safari, then{" "}
							<span className="font-medium text-foreground">Add to Home Screen</span>.
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
