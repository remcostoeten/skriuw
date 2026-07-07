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
import { initDesktopMenuBridge } from "./desktop-menu-bridge";
import { router } from "./router";

initDesktopMenuBridge();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");

createRoot(rootElement).render(
	<StrictMode>
		<RouterProvider router={router} />
		<DesktopAboutDialog />
		<WindowControls />
	</StrictMode>,
);

// Fade out the boot splash (painted in index.html) once the app has had a
// frame to paint, then drop it from the DOM after the transition.
function dismissSplash() {
	const splash = document.getElementById("splash");
	if (!splash) return;
	splash.classList.add("is-hidden");
	splash.addEventListener(
		"transitionend",
		function remove() {
			splash.remove();
		},
		{ once: true },
	);
}

requestAnimationFrame(function afterFirstFrame() {
	requestAnimationFrame(dismissSplash);
});
