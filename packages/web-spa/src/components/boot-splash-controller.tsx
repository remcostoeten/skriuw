import { useEffect } from "react";

const SPLASH_ID = "splash";

let splashDismissed = false;

/**
 * Idempotently fades out and removes the boot splash painted in `index.html`.
 * Called only once the React shell has committed a visible ready, loading, or
 * recovery UI — never on a fixed timer — so the user never sees a blank screen
 * between the splash and real content.
 */
export function markDesktopShellVisible(): void {
	if (splashDismissed) return;
	splashDismissed = true;
	if (typeof document === "undefined") return;
	const splash = document.getElementById(SPLASH_ID);
	if (!splash) return;
	splash.classList.add("is-hidden");
	splash.addEventListener(
		"transitionend",
		function remove() {
			splash.remove();
		},
		{ once: true },
	);
	// Fallback removal in case the transitionend event never fires (e.g. reduced
	// motion collapses the transition to 0ms and no event is emitted).
	window.setTimeout(() => splash.remove(), 400);
}

/**
 * If the shell has still not committed after a bounded wait, replace the splash
 * spinner with an import-light "taking longer than expected" message and a
 * Reload action — so a stuck boot degrades to a recoverable state instead of an
 * indefinite splash. Does nothing once the shell has become visible.
 */
export function installSplashSafetyTimeout(timeoutMs = 15000): void {
	if (typeof window === "undefined") return;
	window.setTimeout(() => {
		if (splashDismissed) return;
		const splash = document.getElementById(SPLASH_ID);
		if (!splash) return;
		splash.setAttribute("role", "alert");
		splash.innerHTML = `
			<div style="max-width:24rem;text-align:center;font-family:system-ui,sans-serif;color:#e5e7eb;padding:1.5rem">
				<p style="font-size:0.95rem;margin:0 0 0.5rem">Skriuw is taking longer than expected to start.</p>
				<p style="font-size:0.8rem;opacity:0.7;margin:0 0 1rem">The app shell did not finish loading.</p>
				<button type="button" id="splash-reload"
					style="border:1px solid #4b5563;background:transparent;color:#e5e7eb;border-radius:0.375rem;padding:0.4rem 0.9rem;font-size:0.85rem;cursor:pointer">
					Reload Skriuw
				</button>
			</div>`;
		document
			.getElementById("splash-reload")
			?.addEventListener("click", () => window.location.reload());
	}, timeoutMs);
}

/**
 * Mounted inside every committed shell state (ready shell, and the fatal
 * recovery view). Its only job is to dismiss the boot splash after React has
 * painted, satisfying the "splash stays until visible UI commits" contract.
 */
export function BootSplashController() {
	useEffect(() => {
		markDesktopShellVisible();
	}, []);
	return null;
}
