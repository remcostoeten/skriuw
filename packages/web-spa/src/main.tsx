import "@remcostoeten/auth-drawer/styles.css";
import "@/app/globals.css";
import "./styles/fonts.css";
import "./styles/desktop-chrome.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { DesktopAboutDialog } from "@/features/desktop/about-dialog";
import { initDesktopMenuBridge } from "./desktop-menu-bridge";
import { router } from "./router";

initDesktopMenuBridge();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");

createRoot(rootElement).render(
	<StrictMode>
		<RouterProvider router={router} />
		<DesktopAboutDialog />
	</StrictMode>,
);

dismissSplash(rootElement);

function dismissSplash(root: HTMLElement) {
	const splash = document.getElementById("splash");
	if (!splash) return;

	function leave() {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				splash.dataset.leaving = "true";
				splash.addEventListener("transitionend", () => splash.remove(), {
					once: true,
				});
				setTimeout(() => splash.remove(), 400);
			});
		});
	}

	if (root.childElementCount > 0) {
		leave();
		return;
	}

	const observer = new MutationObserver(() => {
		if (root.childElementCount > 0) {
			observer.disconnect();
			leave();
		}
	});
	observer.observe(root, { childList: true });
	setTimeout(() => {
		observer.disconnect();
		leave();
	}, 8000);
}
