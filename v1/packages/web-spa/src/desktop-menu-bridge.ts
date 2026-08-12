/**
 * Desktop-only bridge: forwards native menu actions (emitted by the Rust shell
 * as `menu://action`) to a DOM CustomEvent `skriuw:menu-action` that the app can
 * subscribe to. No-ops outside the Tauri runtime. Uses the global Tauri event
 * API exposed via `withGlobalTauri`, so it needs no @tauri-apps/api dependency.
 */
type TauriEventApi = {
	listen: (event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>;
};

type TauriGlobal = { __TAURI__?: { event?: TauriEventApi } };

export type MenuAction = "new-note" | "new-folder" | "save" | "toggle-sidebar" | "about";

export function initDesktopMenuBridge(): void {
	const events = (window as unknown as TauriGlobal).__TAURI__?.event;
	if (!events) return;

	events.listen("menu://action", (event) => {
		const action = event.payload;
		if (typeof action !== "string") return;
		window.dispatchEvent(
			new CustomEvent<MenuAction>("skriuw:menu-action", { detail: action as MenuAction }),
		);
	});
}
