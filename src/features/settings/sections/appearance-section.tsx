"use client";

import { Check } from "lucide-react";
import { Switch } from "@/shared/ui/switch";
import { usePreferencesStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/utils";
import {
	SectionHeader,
	Row,
	SettingsCard,
	GroupLabel,
} from "@/features/settings/components/settings-primitives";
import { ACCENTS, THEMES } from "@/features/settings/preferences/themes";

export function AppearanceSection() {
	const appearance = usePreferencesStore((s) => s.appearance);
	const update = usePreferencesStore((s) => s.updateAppearancePreference);

	return (
		<>
			<SectionHeader
				title="Appearance"
				description="Make Skriuw feel like yours. Changes apply across your account."
			/>

			<GroupLabel>THEME</GroupLabel>
			<div className="grid grid-cols-3 gap-3">
				{THEMES.map((t) => (
					<button
						key={t.id}
						type="button"
						aria-pressed={appearance.theme === t.id}
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

			<GroupLabel>ACCENT</GroupLabel>
			<div className="flex gap-2 rounded-lg border border-border/60 bg-card/40 p-3">
				{ACCENTS.map((c) => (
					<button
						key={c.id}
						type="button"
						aria-pressed={appearance.accentColor === c.id}
						onClick={() => update("accentColor", c.id)}
						className={cn(
							"size-7 rounded-full ring-offset-2 ring-offset-background transition-all",
							appearance.accentColor === c.id && "ring-2 ring-foreground/70",
						)}
						style={{ backgroundColor: c.value }}
						aria-label={c.label}
					/>
				))}
			</div>

			<GroupLabel>INTERFACE</GroupLabel>
			<SettingsCard>
				<Row title="Compact sidebar" description="Tighter spacing in the file tree.">
					<Switch
						checked={appearance.compactSidebar}
						onCheckedChange={(v) => update("compactSidebar", v)}
					/>
				</Row>
				<Row title="Show line numbers" description="In the editor gutter.">
					<Switch
						checked={appearance.showLineNumbers}
						onCheckedChange={(v) => update("showLineNumbers", v)}
					/>
				</Row>
				<Row title="Reduce motion" description="Minimize transitions and animations.">
					<Switch
						checked={appearance.reduceMotion}
						onCheckedChange={(v) => update("reduceMotion", v)}
					/>
				</Row>
			</SettingsCard>
		</>
	);
}
