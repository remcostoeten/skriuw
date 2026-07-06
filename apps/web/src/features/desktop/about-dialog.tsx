import * as React from "react";

import { RawLogo } from "@/shared/icons/logo";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/ui/dialog";
import { cn } from "@/shared/lib/utils";
import { isTauriRuntime, tauriInvoke } from "@/core/workspace-backend/tauri-backend";

type AppInfo = {
	app: string;
	shell: string;
	status: string;
	version: string;
};

const MENU_ACTION_EVENT = "skriuw:menu-action";
const HOMEPAGE = "https://skriuw.com";

function useAppInfo(enabled: boolean): AppInfo | null {
	const [info, setInfo] = React.useState<AppInfo | null>(null);

	React.useEffect(() => {
		if (!enabled || info || !isTauriRuntime()) return;
		let active = true;
		tauriInvoke<AppInfo>("app_info")
			.then((next) => {
				if (active) setInfo(next);
			})
			.catch(() => {
				if (active) setInfo(null);
			});
		return () => {
			active = false;
		};
	}, [enabled, info]);

	return info;
}

/**
 * Themed replacement for the OS-native "About" panel. The Rust shell forwards
 * the native menu click as a `skriuw:menu-action` DOM event (payload `"about"`);
 * this renders an in-app dialog styled with the app's own theme tokens instead.
 */
export function DesktopAboutDialog() {
	const [open, setOpen] = React.useState(false);
	const info = useAppInfo(open);

	React.useEffect(() => {
		function onMenuAction(event: Event) {
			if ((event as CustomEvent<string>).detail === "about") setOpen(true);
		}
		window.addEventListener(MENU_ACTION_EVENT, onMenuAction);
		return () => window.removeEventListener(MENU_ACTION_EVENT, onMenuAction);
	}, []);

	const version = info?.version ?? "0.1.0";

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
				<div className="relative flex flex-col items-center gap-4 bg-muted/40 px-6 pb-6 pt-8 text-center">
					<div className="flex h-16 w-16 items-center justify-center border border-border bg-background">
						<RawLogo variant="explanation" size={36} />
					</div>
					<div className="space-y-1">
						<DialogTitle className="text-xl font-semibold tracking-tight">
							Skriuw
						</DialogTitle>
						<DialogDescription className="text-sm text-muted-foreground">
							A local-first notebook for plain-text thinking.
						</DialogDescription>
					</div>
					<span className="inline-flex items-center gap-1.5 border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground">
						<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
						Version {version}
					</span>
				</div>

				<dl className="divide-y divide-border border-t border-border text-sm">
					<AboutRow label="Edition" value="Desktop" />
					<AboutRow label="Runtime" value={info?.shell === "tauri" ? "Tauri" : "Web"} />
					<AboutRow label="Storage" value="Local vault" />
				</dl>

				<div className="flex items-center justify-between border-t border-border px-6 py-3 text-xs text-muted-foreground">
					<span>© {new Date().getFullYear()} Remco Stoeten</span>
					<a
						href={HOMEPAGE}
						target="_blank"
						rel="noreferrer"
						className="text-foreground underline-offset-4 transition-colors hover:underline"
					>
						skriuw.com
					</a>
				</div>
			</DialogContent>
		</Dialog>
	);
}

type AboutRowProps = {
	label: string;
	value: string;
	className?: string;
};

function AboutRow({ label, value, className }: AboutRowProps) {
	return (
		<div className={cn("flex items-center justify-between px-6 py-2.5", className)}>
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="font-medium text-foreground">{value}</dd>
		</div>
	);
}
