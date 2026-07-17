// Arms the boot-splash safety timeout as the very first side effect, before the
// router/provider modules below are evaluated — a module-eval failure there
// must still leave a recoverable Reload prompt rather than a frozen splash.
import "./boot-splash-safety";
import "./raf-fallback";
import "@remcostoeten/auth-drawer/styles.css";
import "@/app/globals.css";
import "./styles/fonts.css";
import "./styles/desktop-chrome.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { DesktopAboutDialog } from "@/features/desktop/about-dialog";
import { WindowControls } from "@/features/desktop/window-controls";
import { DesktopFatalErrorBoundary } from "./components/desktop-fatal-error";
import { initDesktopMenuBridge } from "./desktop-menu-bridge";
import { router } from "./router";

initDesktopMenuBridge();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");

// The single desktop WindowControls mount lives here in the explicit entry
// shell (it was previously also mounted inside shared AppProviders, producing
// duplicate fixed controls and resize listeners). It sits OUTSIDE the fatal
// error boundary so minimize/close/drag remain available even when the router
// or providers throw — the window runs with `decorations: false`.
createRoot(rootElement).render(
	<StrictMode>
		<DesktopFatalErrorBoundary>
			<RouterProvider router={router} />
			<DesktopAboutDialog />
		</DesktopFatalErrorBoundary>
		<WindowControls />
	</StrictMode>,
);
