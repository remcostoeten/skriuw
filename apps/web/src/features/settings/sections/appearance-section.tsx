"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
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
	const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

	return (
		<>
			<SectionHeader
				title="Appearance"
				description="Make Skriuw feel like yours. Changes apply across your account."
			/>
			<ThemePicker expandedGroup={expandedGroup} setExpandedGroup={setExpandedGroup} />
			<AppearanceToggles />
		</>
	);
}

function ThemePicker({
	expandedGroup,
	setExpandedGroup,
}: {
	expandedGroup: string | null;
	setExpandedGroup: (value: string | null) => void;
}) {
	const theme = usePreferencesStore((s) => s.appearance.theme);
	const update = usePreferencesStore((s) => s.updateAppearancePreference);

	return (
		<>
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
						THEMES.findIndex((t) => {
							if (t.id === theme) return true;
							if ("variants" in t && t.variants?.some((v) => v.id === theme))
								return true;
							return false;
						}),
					);
					const delta = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
					const next = THEMES[(idx + delta + THEMES.length) % THEMES.length];
					setExpandedGroup(null);
					update("theme", next.id);
					const target = e.currentTarget.querySelector<HTMLElement>(
						`[data-theme-id="${next.id}"]`,
					);
					target?.focus();
				}}
			>
				{THEMES.map((t) => {
					if ("variants" in t && t.variants) {
						const activeVariant = t.variants.find((v) => v.id === theme);
						const isExpanded = expandedGroup === t.id;
						return (
							<div key={t.id} className="flex flex-col">
								<button
									type="button"
									data-theme-id={t.id}
									aria-checked={!!activeVariant}
									onClick={() => setExpandedGroup(isExpanded ? null : t.id)}
									className={cn(
										"group rounded-lg border p-2 text-left transition-colors",
										activeVariant
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
										{activeVariant ? (
											<Check className="size-3.5" />
										) : (
											<ChevronDown
												className={cn(
													"size-3.5 text-muted-foreground transition-transform",
													isExpanded && "rotate-180",
												)}
											/>
										)}
									</div>
								</button>
								{isExpanded && (
									<div className="mt-1.5 space-y-1">
										{t.variants.map((v) => (
											<button
												key={v.id}
												type="button"
												role="radio"
												data-theme-id={v.id}
												aria-checked={theme === v.id}
												onClick={() => update("theme", v.id)}
												className={cn(
													"flex w-full items-center gap-2 rounded-md border p-1.5 text-left text-xs transition-colors",
													theme === v.id
														? "border-foreground/60 bg-accent/40"
														: "border-border/60 bg-card/30 hover:border-border",
												)}
											>
												<div
													className="size-5 shrink-0 overflow-hidden rounded"
													style={{
														background: `linear-gradient(135deg, ${v.swatchFrom}, ${v.swatchTo})`,
													}}
												/>
												<span className="font-medium">{v.label}</span>
												{theme === v.id && (
													<Check className="ml-auto size-3" />
												)}
											</button>
										))}
									</div>
								)}
							</div>
						);
					}

					return (
						<button
							key={t.id}
							type="button"
							role="radio"
							data-theme-id={t.id}
							aria-checked={theme === t.id}
							onClick={() => update("theme", t.id)}
							className={cn(
								"group rounded-lg border p-2 text-left transition-colors",
								theme === t.id
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
								{theme === t.id && <Check className="size-3.5" />}
							</div>
						</button>
					);
				})}
			</div>
		</>
	);
}

function AppearanceToggles() {
	const update = usePreferencesStore((s) => s.updateAppearancePreference);
	const showLineNumbers = usePreferencesStore((s) => s.appearance.showLineNumbers);
	const reduceMotion = usePreferencesStore((s) => s.appearance.reduceMotion);
	const showAnimatedIcons = usePreferencesStore((s) => s.appearance.showAnimatedIcons);
	const rememberLastTab = usePreferencesStore((s) => s.appearance.rememberLastTab);
	const rememberLastNote = usePreferencesStore((s) => s.appearance.rememberLastNote);
	const showPageIcons = usePreferencesStore((s) => s.appearance.showPageIcons);

	const showTreeGuides = useSidebarStore((s) => s.config.showTreeGuides);
	const toggleTreeGuides = useSidebarStore((s) => s.toggleTreeGuides);
	const compactMode = useSidebarStore((s) => s.config.compactMode);
	const setCompactMode = useSidebarStore((s) => s.setCompactMode);

	return (
		<>
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
					visualization={<LineNumbersDemo enabled={showLineNumbers} />}
				>
					<Switch
						checked={showLineNumbers}
						onCheckedChange={(v) => update("showLineNumbers", v)}
					/>
				</Row>
				<Row
					focusId="reduce-motion"
					title="Reduce motion"
					description="Minimize transitions and animations."
				>
					<Switch
						checked={reduceMotion}
						onCheckedChange={(v) => update("reduceMotion", v)}
					/>
				</Row>
				<Row
					focusId="show-animated-icons"
					title="Show animated icons"
					description="Play a small animation on hover for sidebar and settings icons."
				>
					<Switch
						checked={showAnimatedIcons}
						onCheckedChange={(v) => update("showAnimatedIcons", v)}
					/>
				</Row>
				<Row
					focusId="remember-last-tab"
					title="Remember last settings tab"
					description="Reopen settings on the tab you last visited instead of the default."
				>
					<Switch
						checked={rememberLastTab}
						onCheckedChange={(v) => update("rememberLastTab", v)}
					/>
				</Row>
				<Row
					focusId="remember-last-note"
					title="Remember last opened note"
					description="Reopen the note you last viewed on launch instead of the first note."
				>
					<Switch
						checked={rememberLastNote}
						onCheckedChange={(v) => update("rememberLastNote", v)}
					/>
				</Row>
				<Row
					focusId="show-page-icons"
					title="Show page icons"
					description="Display emoji icons next to note names in the sidebar and tabs."
				>
					<Switch
						checked={showPageIcons}
						onCheckedChange={(v) => update("showPageIcons", v)}
					/>
				</Row>
			</SettingsCard>
		</>
	);
}
