"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SCOPES, useShortcutScope } from "@/core/shortcuts";
import { useWorkspaceCapabilities } from "@/core/workspace-backend";
import { usePreferencesStore } from "@/features/settings/store";
import { THEMES } from "@/features/settings/preferences/themes";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { buildSettingsCommandItems } from "@/features/settings/settings-command-index";
import { openSettings } from "@/features/settings/use-settings-modal";
import { CommandPalette, type CommandPaletteItem } from "@/shared/ui/command-palette";

const ROUTES_WITH_OWN_PALETTE = ["/app", "/app/journal"];

function hasOwnPalette(pathname: string): boolean {
	return ROUTES_WITH_OWN_PALETTE.includes(pathname);
}

export function GlobalCommandPalette() {
	const pathname = usePathname();
	const router = useRouter();
	const capabilities = useWorkspaceCapabilities();
	const [open, setOpen] = useState(false);

	const activeTheme = usePreferencesStore((state) => state.appearance.theme);
	const updateAppearancePreference = usePreferencesStore(
		(state) => state.updateAppearancePreference,
	);

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

	useShortcutScope(
		SCOPES.settings,
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
			action: () => openSettings(),
		});

		navItems.push({
			id: "switch-theme",
			label: "Switch theme",
			group: "Settings",
			keywords: ["theme", "appearance", "color", "dark", "light", "switch", "cycle"],
			description: `Cycle to the next theme (current: ${activeTheme}).`,
			action: () => {
				const currentIndex = THEMES.findIndex((t) => t.id === activeTheme);
				const nextTheme = THEMES[(currentIndex + 1) % THEMES.length];
				updateAppearancePreference("theme", nextTheme.id);
			},
		});

		navItems.push(...buildSettingsCommandItems());

		return navItems;
	}, [
		capabilities.journal,
		capabilities.sharing,
		capabilities.trash,
		router,
		activeTheme,
		updateAppearancePreference,
	]);

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
