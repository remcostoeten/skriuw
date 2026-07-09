import * as React from "react";

import { Minus, Square, X, Copy } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { isTauriRuntime } from "@/core/workspace-backend/tauri-backend";
import { noop } from "@/shared/lib/noop";

type TauriWindow = {
	minimize: () => Promise<void>;
	toggleMaximize: () => Promise<void>;
	close: () => Promise<void>;
	isMaximized: () => Promise<boolean>;
};

type TauriWindowApi = {
	getCurrentWindow?: () => TauriWindow;
	getCurrent?: () => TauriWindow;
};

type TauriGlobal = { __TAURI__?: { window?: TauriWindowApi } };

/** The current Tauri window via the global API (exposed by `withGlobalTauri`). */
function getAppWindow(): TauriWindow | null {
	if (typeof window === "undefined") return null;
	const api = (window as TauriGlobal).__TAURI__?.window;
	if (!api) return null;
	const resolve = api.getCurrentWindow ?? api.getCurrent;
	return resolve ? resolve() : null;
}

type ControlButtonProps = {
	label: string;
	onClick: () => void;
	className?: string;
	children: React.ReactNode;
};

function runWindowAction(action: (appWindow: TauriWindow) => Promise<void>) {
	return () => {
		const appWindow = getAppWindow();
		if (appWindow) void action(appWindow).catch(noop);
	};
}

function ControlButton({ label, onClick, className, children }: ControlButtonProps) {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onClick}
			// Buttons are interactive, so the parent drag region ignores them — a
			// click triggers the action while empty cluster space still drags.
			className={cn(
				"inline-flex h-7 w-9 items-center justify-center text-sidebar-foreground/55 transition-colors hover:text-sidebar-foreground",
				className,
			)}
		>
			{children}
		</button>
	);
}

/**
 * Desktop-only window controls. The shell runs with `decorations: false`, so the
 * OS chrome (minimize / maximize / close) is replaced by this compact cluster
 * pinned to the top-right corner — no full-width title bar. The padding around
 * the buttons is a Tauri drag region, so the window can still be moved from here.
 */
export function WindowControls() {
	const [isTauri] = React.useState(() => isTauriRuntime());
	const [isMaximized, setIsMaximized] = React.useState(false);

	React.useEffect(() => {
		if (!isTauri) return;
		const appWindow = getAppWindow();
		if (!appWindow) return;

		let active = true;
		const refresh = () => {
			appWindow
				.isMaximized()
				.then((value) => {
					if (active) setIsMaximized(value);
				})
				.catch(() => {});
		};
		refresh();
		// Maximizing/restoring resizes the webview, so the DOM resize event is a
		// reliable signal without pulling in the Tauri event API.
		window.addEventListener("resize", refresh);
		return () => {
			active = false;
			window.removeEventListener("resize", refresh);
		};
	}, [isTauri]);

	if (!isTauri) return null;

	return (
		<div
			data-tauri-drag-region
			className="fixed right-0 top-0 z-50 flex h-9 items-center gap-0.5 rounded-bl-lg border-b border-l border-sidebar-border/70 bg-sidebar pl-3 pr-1"
		>
			<ControlButton label="Minimize" onClick={runWindowAction((w) => w.minimize())}>
				<Minus className="h-3.5 w-3.5" strokeWidth={1.75} />
			</ControlButton>
			<ControlButton
				label={isMaximized ? "Restore" : "Maximize"}
				onClick={runWindowAction((w) => w.toggleMaximize())}
			>
				{isMaximized ? (
					<Copy className="h-3 w-3" strokeWidth={1.75} />
				) : (
					<Square className="h-3 w-3" strokeWidth={1.75} />
				)}
			</ControlButton>
			<ControlButton
				label="Close"
				onClick={runWindowAction((w) => w.close())}
				className="hover:bg-red-500/85 hover:text-white"
			>
				<X className="h-3.5 w-3.5" strokeWidth={1.75} />
			</ControlButton>
		</div>
	);
}
