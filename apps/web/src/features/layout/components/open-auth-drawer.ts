import type { AuthDrawerInitialMode } from "./auth-drawer-types";

export type { AuthDrawerInitialMode };

export const OPEN_AUTH_DRAWER_EVENT = "skriuw:auth:open-drawer";

export type OpenAuthDrawerDetail = {
	mode: AuthDrawerInitialMode;
	destination: string;
};

export function openAuthDrawer(mode: AuthDrawerInitialMode, destination = "/app") {
	window.dispatchEvent(
		new CustomEvent<OpenAuthDrawerDetail>(OPEN_AUTH_DRAWER_EVENT, {
			detail: { mode, destination },
		}),
	);
}
