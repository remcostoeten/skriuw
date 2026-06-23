import "@remcostoeten/auth-drawer/styles.css";
import "@/app/globals.css";
import "./styles/fonts.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { initDesktopMenuBridge } from "./desktop-menu-bridge";
import { router } from "./router";

initDesktopMenuBridge();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");

createRoot(rootElement).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
