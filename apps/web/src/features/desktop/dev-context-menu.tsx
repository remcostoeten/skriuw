"use client";

import { Bug, Code, Terminal, RefreshCw } from "lucide-react";
import { isTauriRuntime } from "@/core/workspace-backend/tauri-backend";
import { isDev } from "@/shared/lib/env";
import {
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@/shared/ui/context-menu";

type TauriWebview = {
	openDevtools: () => Promise<void>;
};
type TauriWebviewApi = {
	getCurrentWebview?: () => TauriWebview;
	getCurrent?: () => TauriWebview;
};
type TauriWebviewGlobal = { __TAURI__?: { webview?: TauriWebviewApi } };

function getWebview(): TauriWebview | null {
	if (typeof window === "undefined") return null;
	const api = (window as TauriWebviewGlobal).__TAURI__?.webview;
	if (!api) return null;
	const resolve = api.getCurrentWebview ?? api.getCurrent;
	return resolve ? resolve() : null;
}

function openDevtools(): void {
	if (isTauriRuntime()) {
		getWebview()
			?.openDevtools()
			.catch(() => {});
	} else {
		eval("debugger;");
	}
}

function reloadWindow(): void {
	window.location.reload();
}

export function DevContextSubmenu() {
	const isDesktopApp = isTauriRuntime();
	if (!isDev() && !isDesktopApp) return null;

	return (
		<ContextMenuSub>
			<ContextMenuSubTrigger className="gap-2">
				<Bug className="h-4 w-4" />
				Development
			</ContextMenuSubTrigger>
			<ContextMenuSubContent className="w-52">
				<ContextMenuItem onClick={openDevtools} className="gap-2">
					<Terminal className="h-4 w-4" />
					Open console
				</ContextMenuItem>
				<ContextMenuItem onClick={openDevtools} className="gap-2">
					<Code className="h-4 w-4" />
					Open elements inspector
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onClick={reloadWindow} className="gap-2">
					<RefreshCw className="h-4 w-4" />
					Reload app window
				</ContextMenuItem>
			</ContextMenuSubContent>
		</ContextMenuSub>
	);
}
