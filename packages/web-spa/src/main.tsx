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
import { installSplashSafetyTimeout } from "./components/boot-splash-controller";
import { initDesktopMenuBridge } from "./desktop-menu-bridge";
import { router } from "./router";

initDesktopMenuBridge();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");

// The boot splash (painted in index.html) is now dismissed by
// `BootSplashController` once React commits a visible shell/loading/recovery
// state — never on a blind timer. This safety net only fires if the shell never
// commits at all, replacing the splash with a recoverable Reload prompt.
installSplashSafetyTimeout();

// The single desktop WindowControls mount lives here in the explicit entry
// shell (it was previously also mounted inside shared AppProviders, producing
// duplicate fixed controls and resize listeners in the desktop bundle).
createRoot(rootElement).render(
	<StrictMode>
		<DesktopFatalErrorBoundary>
			<RouterProvider router={router} />
			<DesktopAboutDialog />
			<WindowControls />
		</DesktopFatalErrorBoundary>
	</StrictMode>,
);
