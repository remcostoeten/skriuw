"use client";

import { Switch } from "@/shared/ui/switch";
import { usePreferencesStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/utils";
import {
	SectionHeader,
	Row,
	SettingsCard,
	GroupLabel,
} from "@/features/settings/components/settings-primitives";
import { EditorFontPicker } from "@/features/settings/components/editor-font-picker";
import {
	EDITOR_LINE_HEIGHTS,
	getEditorLineHeightLabel,
	getEditorLineHeightValue,
} from "@/features/editor/lib/editor-line-height";

export function EditorSection() {
	const editor = usePreferencesStore((s) => s.editor);
	const update = usePreferencesStore((s) => s.updateEditorPreference);

	return (
		<>
			<SectionHeader title="Editor" description="How writing in Skriuw should feel." />

			<GroupLabel>TYPOGRAPHY</GroupLabel>
			<div className="space-y-6 rounded-lg border border-border/60 bg-card/40 p-5">
				<div className="space-y-3">
					<div>
						<div className="text-sm font-medium">Default font</div>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Choose a typeface for the rich text editor.
						</p>
					</div>
					<EditorFontPicker
						value={editor.defaultFont}
						onChange={(value) => update("defaultFont", value)}
					/>
				</div>

				<div className="border-t border-border/50 pt-5">
					<div className="space-y-3">
						<div>
							<div className="text-sm font-medium">Line height</div>
							<p className="mt-0.5 text-xs text-muted-foreground">
								Spacing between lines while you write.
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							{EDITOR_LINE_HEIGHTS.map((lineHeight) => (
								<button
									key={lineHeight}
									type="button"
									aria-pressed={editor.lineHeight === lineHeight}
									onClick={() => update("lineHeight", lineHeight)}
									className={cn(
										"min-w-[7.5rem] border px-3 py-2.5 text-left transition-colors",
										editor.lineHeight === lineHeight
											? "border-ring bg-accent text-accent-foreground"
											: "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
									)}
								>
									<span className="text-xs font-medium">
										{getEditorLineHeightLabel(lineHeight)}
									</span>
								</button>
							))}
						</div>
						<p
							className="max-w-xl rounded-md border border-border/60 bg-background/55 px-3 py-2.5 text-sm text-foreground/88"
							style={{ lineHeight: getEditorLineHeightValue(editor.lineHeight) }}
						>
							A calmer editing rhythm makes dense notes easier to scan while keeping
							long writing sessions comfortable.
						</p>
					</div>
				</div>
			</div>

			<GroupLabel>BEHAVIOR</GroupLabel>
			<SettingsCard>
				<Row
					title="Default to Raw MDX"
					description="New notes open in raw MDX mode."
				>
					<Switch
						checked={editor.defaultModeRaw}
						onCheckedChange={(v) => update("defaultModeRaw", v)}
					/>
				</Row>
				<Row
					title="Animated numbers"
					description="Animate changing counts in the inspector and status bar."
				>
					<Switch
						checked={editor.animateNumbers}
						onCheckedChange={(v) => update("animateNumbers", v)}
					/>
				</Row>
			</SettingsCard>
		</>
	);
}
