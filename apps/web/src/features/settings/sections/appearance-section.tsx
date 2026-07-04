"use client";

import { Check } from "lucide-react";
import { Switch } from "@/shared/ui/switch";
import { useSidebarStore } from "@/features/notes/components/sidebar/store";
import { usePreferencesStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/utils";
import {
	SectionHeader,
	Row,
	SettingsCard,
	GroupLabel,
} from "@/features/settings/components/settings-primitives";
import { THEMES } from "@/features/settings/preferences/themes";
import { settingsAnchorProps } from "@/features/settings/lib/settings-focus-anchor";
import { CompactSidebarDemo, LineNumbersDemo, TreeGuidesDemo } from "@/features/settings/demos";

export function AppearanceSection() {
	const appearance = usePreferencesStore((s) => s.appearance);
	const update = usePreferencesStore((s) => s.updateAppearancePreference);
	const showTreeGuides = useSidebarStore((s) => s.config.showTreeGuides);
	const toggleTreeGuides = useSidebarStore((s) => s.toggleTreeGuides);
	const compactMode = useSidebarStore((s) => s.config.compactMode);
	const setCompactMode = useSidebarStore((s) => s.setCompactMode);

	return (
		<>
			<SectionHeader
				title="Appearance"
				description="Make Skriuw feel like yours. Changes apply across your account."
			/>

			<GroupLabel>THEME</GroupLabel>
			<div
				{...settingsAnchorProps("theme")}
				role="radiogroup"
				aria-label="Theme"
				className="grid grid-cols-3 gap-3 scroll-mt-24"
				onKeyDown={(e) => {
					const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
					if (!arrows.includes(e.key)) return;
					e.preventDefault();
					const idx = Math.max(
						0,
						THEMES.findIndex((t) => t.id === appearance.theme),
					);
					const delta = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
					const next = THEMES[(idx + delta + THEMES.length) % THEMES.length];
					update("theme", next.id);
					e.currentTarget
						.querySelector<HTMLElement>(`[data-theme-id="${next.id}"]`)
						?.focus();
				}}
			>
				{THEMES.map((t, i) => (
					<button
						key={t.id}
						type="button"
						role="radio"
						data-theme-id={t.id}
						aria-checked={appearance.theme === t.id}
						tabIndex={
							appearance.theme === t.id ||
							(i === 0 && !THEMES.some((x) => x.id === appearance.theme))
								? 0
								: -1
						}
						onClick={() => update("theme", t.id)}
						className={cn(
							"group rounded-lg border p-2 text-left transition-colors",
							appearance.theme === t.id
								? "border-foreground/60 bg-accent/40"
								: "border-border/60 bg-card/30 hover:border-border",
						)}
					>
						<div
							className="relative h-20 overflow-hidden rounded-md"
							style={{
								background: `linear-gradient(135deg, ${t.swatchFrom}, ${t.swatchTo})`,
							}}
						>
							<div className="absolute inset-x-2 top-2 h-1.5 rounded-full bg-foreground/20" />
							<div className="absolute inset-x-2 top-5 h-1 w-2/3 rounded-full bg-foreground/15" />
							<div className="absolute inset-x-2 bottom-2 h-1 w-1/2 rounded-full bg-foreground/10" />
						</div>
						<div className="mt-2 flex items-center justify-between px-0.5">
							<span className="text-xs font-medium">{t.label}</span>
							{appearance.theme === t.id && <Check className="size-3.5" />}
						</div>
					</button>
				))}
			</div>

			<GroupLabel>INTERFACE</GroupLabel>
			<SettingsCard>
				<Row
					focusId="compact-sidebar"
					title="Compact sidebar"
					description="Tighter spacing in the file tree."
					visualization={<CompactSidebarDemo enabled={compactMode} />}
				>
					<Switch
						checked={compactMode}
						onCheckedChange={(value) => {
							setCompactMode(value);
							update("compactSidebar", value);
						}}
					/>
				</Row>
				<Row
					focusId="tree-guides"
					title="File tree guide lines"
					description="Show nested ruler lines in the notes sidebar."
					visualization={<TreeGuidesDemo enabled={showTreeGuides} />}
				>
					<Switch checked={showTreeGuides} onCheckedChange={() => toggleTreeGuides()} />
				</Row>
				<Row
					focusId="line-numbers"
					title="Show line numbers"
					description="In the editor gutter."
					visualization={<LineNumbersDemo enabled={appearance.showLineNumbers} />}
				>
					<Switch
						checked={appearance.showLineNumbers}
						onCheckedChange={(v) => update("showLineNumbers", v)}
					/>
				</Row>
				<Row
					focusId="reduce-motion"
					title="Reduce motion"
					description="Minimize transitions and animations."
				>
					<Switch
						checked={appearance.reduceMotion}
						onCheckedChange={(v) => update("reduceMotion", v)}
					/>
				</Row>
				<Row
					focusId="show-animated-icons"
					title="Show animated icons"
					description="Play a small animation on hover for sidebar and settings icons."
				>
					<Switch
						checked={appearance.showAnimatedIcons}
						onCheckedChange={(v) => update("showAnimatedIcons", v)}
					/>
				</Row>
				<Row
					focusId="remember-last-tab"
					title="Remember last settings tab"
					description="Reopen settings on the tab you last visited instead of the default."
				>
					<Switch
						checked={appearance.rememberLastTab}
						onCheckedChange={(v) => update("rememberLastTab", v)}
					/>
				</Row>
				<Row
					focusId="remember-last-note"
					title="Remember last opened note"
					description="Reopen the note you last viewed on launch instead of the first note."
				>
					<Switch
						checked={appearance.rememberLastNote}
						onCheckedChange={(v) => update("rememberLastNote", v)}
					/>
				</Row>
				<Row
					focusId="show-page-icons"
					title="Show page icons"
					description="Display emoji icons next to note names in the sidebar and tabs."
				>
					<Switch
						checked={appearance.showPageIcons}
						onCheckedChange={(v) => update("showPageIcons", v)}
					/>
				</Row>
			</SettingsCard>
		</>
	);
}
