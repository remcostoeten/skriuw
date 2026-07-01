"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SCOPES, useShortcutScope } from "@/core/shortcuts";
import { useWorkspaceCapabilities } from "@/core/workspace-backend";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { buildSettingsCommandItems } from "@/features/settings/settings-command-index";
import { CommandPalette, type CommandPaletteItem } from "@/shared/ui/command-palette";

/**
 * Routes that mount their own feature-rich command palette (notes, journal).
 * The global fallback stays inert on these so a single `mod+k` press never
 * opens two palettes at once.
 */
const ROUTES_WITH_OWN_PALETTE = ["/app", "/app/journal"];

function hasOwnPalette(pathname: string): boolean {
	return ROUTES_WITH_OWN_PALETTE.includes(pathname);
}

/**
 * App-wide command palette so `mod+k` works on every `/app` surface — settings,
 * trash, graph, shared — not just inside the note editor. On routes that already
 * ship their own palette it registers no shortcut and renders nothing.
 */
export function GlobalCommandPalette() {
	const pathname = usePathname();
	const router = useRouter();
	const capabilities = useWorkspaceCapabilities();
	const [open, setOpen] = useState(false);

	const active = !hasOwnPalette(pathname);

	const handleOpen = useCallback(() => {
		triggerNativeFeedback("selection");
		setOpen(true);
	}, []);

	useShortcutScope(
		SCOPES.app,
		{ "app.commandPalette": handleOpen },
		{ active },
	);

	const items = useMemo<CommandPaletteItem[]>(() => {
		function go(href: string) {
			return () => router.push(href);
		}

		const navItems: CommandPaletteItem[] = [
			{
				id: "nav.notes",
				label: "Go to Notes",
				group: "Navigation",
				keywords: ["editor", "workspace"],
				action: go("/app"),
			},
		];

		if (capabilities.journal) {
			navItems.push({
				id: "nav.journal",
				label: "Go to Journal",
				group: "Navigation",
				keywords: ["diary", "daily"],
				action: go("/app/journal"),
			});
		}

		navItems.push({
			id: "nav.graph",
			label: "Go to Graph",
			group: "Navigation",
			keywords: ["links", "connections"],
			action: go("/app/graph"),
		});

		if (capabilities.sharing) {
			navItems.push({
				id: "nav.shared",
				label: "Go to Shared",
				group: "Navigation",
				keywords: ["collaboration"],
				action: go("/app/shared"),
			});
		}

		if (capabilities.trash) {
			navItems.push({
				id: "nav.trash",
				label: "Go to Trash",
				group: "Navigation",
				keywords: ["deleted", "bin"],
				action: go("/app/trash"),
			});
		}

		navItems.push({
			id: "nav.settings",
			label: "Open Settings",
			group: "Settings",
			keywords: ["preferences", "config"],
			action: go("/app/settings"),
		});

		navItems.push(...buildSettingsCommandItems((href) => router.push(href)));

		return navItems;
	}, [capabilities.journal, capabilities.sharing, capabilities.trash, router]);

	if (!active) return null;

	return (
		<CommandPalette
			open={open}
			onOpenChange={setOpen}
			items={items}
			description="Navigate and run actions from anywhere."
		/>
	);
}
