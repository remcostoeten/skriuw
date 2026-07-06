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
	AnimatedNumberDemo,
	DefaultFontDemo,
	LineHeightDemo,
	RawMdxModeDemo,
} from "@/features/settings/demos";
import {
	EDITOR_LINE_HEIGHTS,
	getEditorLineHeightLabel,
} from "@/features/editor/lib/editor-line-height";
import { settingsAnchorProps } from "@/features/settings/lib/settings-focus-anchor";
import { useIsMobile } from "@/shared/hooks/use-mobile";

export function EditorSection() {
	const editor = usePreferencesStore((s) => s.editor);
	const update = usePreferencesStore((s) => s.updateEditorPreference);
	const isMobile = useIsMobile();

	return (
		<>
			<SectionHeader title="Editor" description="How writing in Skriuw should feel." />

			<GroupLabel focusId="typography">TYPOGRAPHY</GroupLabel>
			<div className="space-y-6 rounded-lg border border-border/60 bg-card/40 p-5">
				<div {...settingsAnchorProps("editor-font")} className="space-y-3 scroll-mt-24">
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
					<DefaultFontDemo fontId={editor.defaultFont} />
				</div>

				<div
					{...settingsAnchorProps("line-height")}
					className="border-t border-border/50 pt-5 scroll-mt-24"
				>
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
						<LineHeightDemo lineHeight={editor.lineHeight} />
					</div>
				</div>
			</div>

			<GroupLabel focusId="behavior">BEHAVIOR</GroupLabel>
			<SettingsCard>
				<Row
					focusId="raw-mdx"
					title="Default to Raw MDX"
					description="New notes open in raw MDX mode."
					visualization={<RawMdxModeDemo enabled={editor.defaultModeRaw} />}
				>
					<Switch
						checked={editor.defaultModeRaw}
						onCheckedChange={(v) => update("defaultModeRaw", v)}
					/>
				</Row>
				<Row
					focusId="animated-numbers"
					title="Animated numbers"
					description="Animate changing counts in the inspector and status bar."
					visualization={<AnimatedNumberDemo animate={editor.animateNumbers} />}
				>
					<Switch
						checked={editor.animateNumbers}
						onCheckedChange={(v) => update("animateNumbers", v)}
					/>
				</Row>
				{isMobile ? null : (
					<Row
						focusId="vim-mode"
						title="Vim mode"
						description="Modal editing with Normal and Insert modes (h/j/k/l, w/b/e, dd, x, i/a/o, and more). Press Esc for Normal mode."
					>
						<Switch
							checked={editor.vimMode}
							onCheckedChange={(v) => update("vimMode", v)}
						/>
					</Row>
				)}
				<Row
					focusId="open-in-tabs"
					title="Open notes in tabs"
					description="Keep opened notes in a tab bar instead of replacing the current note."
				>
					<Switch
						checked={editor.openNotesInTabs}
						onCheckedChange={(v) => update("openNotesInTabs", v)}
					/>
				</Row>
				<Row
					focusId="detect-tags-in-text"
					title="Detect #tags in note text"
					description="Turn #words written in plain text into workspace tags. Disable if your notes contain code comments or .env snippets — tags inserted via the # menu keep working either way."
				>
					<Switch
						checked={editor.detectTagsInText}
						onCheckedChange={(v) => update("detectTagsInText", v)}
					/>
				</Row>
			</SettingsCard>
		</>
	);
}
