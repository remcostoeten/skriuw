"use client";

import { lazy, Suspense, useEffect, useState } from "react";

export { installDevtoolsHookStub } from "./devtools-hook";

const PerfHud = lazy(() => import("./perf-hud").then((module) => ({ default: module.PerfHud })));

const STORAGE_KEY = "devtools:perf-hud";

/**
 * Dev-only mount point for the performance HUD. Toggle with
 * Ctrl/Cmd+Shift+F12 (or set localStorage "devtools:perf-hud" to "on"); the
 * open state persists across reloads. Renders nothing in production builds.
 */
export function PerfDevtools() {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		setOpen(localStorage.getItem(STORAGE_KEY) === "on");

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "F12" && event.shiftKey && (event.ctrlKey || event.metaKey)) {
				event.preventDefault();
				setOpen((current) => {
					const next = !current;
					localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
					return next;
				});
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	if (!open) return null;

	return (
		<Suspense fallback={null}>
			<PerfHud
				onClose={() => {
					localStorage.setItem(STORAGE_KEY, "off");
					setOpen(false);
				}}
			/>
		</Suspense>
	);
}
