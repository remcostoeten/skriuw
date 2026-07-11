"use client";

import { useEffect, useRef, useState } from "react";
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

function isMobileInstallSurface() {
	const coarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
	const narrowViewport = window.matchMedia("(max-width: 767px)").matches;
	return (coarsePointer && narrowViewport) || isIos();
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
	const installEventRef = useRef<TBeforeInstallPromptEvent | null>(null);

	useEffect(function registerServiceWorker() {
		if (!("serviceWorker" in navigator)) return;
		if (process.env.NODE_ENV !== "production") {
			// A worker registered by a past local production run (`next start`)
			// persists on this origin and keeps serving /_next/static cache-first,
			// which feeds dev stale chunks after HMR ("module factory is not
			// available"). Evict it and its caches whenever dev boots.
			navigator.serviceWorker.getRegistrations().then(function (registrations) {
				for (const registration of registrations) {
					registration.unregister();
				}
			});
			if ("caches" in window) {
				caches.keys().then(function (keys) {
					for (const key of keys) {
						caches.delete(key);
					}
				});
			}
			return;
		}
		navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {
			// Registration failure only costs offline support; never surface it.
		});
	}, []);

	useEffect(function armInstallPrompt() {
		if (isStandalone() || wasHandled()) return;
		if (!isMobileInstallSurface()) return;

		let timer: ReturnType<typeof setTimeout> | undefined;

		function onBeforeInstallPrompt(event: Event) {
			event.preventDefault();
			installEventRef.current = event as TBeforeInstallPromptEvent;
			timer = setTimeout(function () {
				setMode("android");
			}, PROMPT_DELAY_MS);
		}

		if (isIos()) {
			timer = setTimeout(function () {
				setMode("ios");
			}, PROMPT_DELAY_MS);
		} else {
			// Chromium Android fires this; desktop Chromium is gated out above.
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
		const installEvent = installEventRef.current;
		if (!installEvent) return;
		setMode("hidden");
		await installEvent.prompt();
		const choice = await installEvent.userChoice;
		installEventRef.current = null;
		// Only suppress the banner permanently on an actual install; a dismissed
		// native prompt leaves the door open for a later attempt.
		if (choice.outcome === "accepted") {
			markHandled();
		}
	}

	if (mode === "hidden") return null;

	return (
		<dialog
			open
			aria-label="Install Skriuw"
			// Sit above the iOS home indicator: hold the visual 0.75rem gap but
			// grow it by the safe-area inset on notched devices.
			style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
			className="fixed inset-x-3 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-border bg-popover py-3 pl-3 pr-2 text-popover-foreground shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-300"
		>
			<Image
				src="/icon-192.png"
				alt=""
				width={36}
				height={36}
				className="size-9 shrink-0 rounded-[9px]"
			/>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium leading-tight">Install Skriuw</p>
				{mode === "android" ? (
					<p className="truncate text-xs text-muted-foreground">
						Faster, full-screen experience
					</p>
				) : (
					<p className="truncate text-xs text-muted-foreground">
						Share → Add to Home Screen
					</p>
				)}
			</div>
			{mode === "android" ? (
				<button
					type="button"
					onClick={install}
					className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
				>
					Install
				</button>
			) : null}
			<button
				type="button"
				onClick={dismiss}
				aria-label="Dismiss"
				className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
			>
				<X className="size-4" />
			</button>
		</dialog>
	);
}
