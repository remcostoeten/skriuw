"use client";

import { Check } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
	getEditorFontCategoryLabel,
	getEditorFontFamily,
	getEditorFontLabel,
	getEditorFontsByCategory,
	type EditorFontCategory,
	type EditorFontId,
} from "@/shared/lib/editor-fonts";

type EditorFontPickerProps = {
	value: EditorFontId;
	onChange: (fontId: EditorFontId) => void;
};

const FONT_GROUPS: EditorFontCategory[] = ["sans", "serif", "mono"];

function FontOptionCard({
	fontId,
	label,
	active,
	onSelect,
}: {
	fontId: EditorFontId;
	label: string;
	active: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onSelect}
			className={cn(
				"group relative flex min-h-[5.5rem] flex-col rounded-lg border p-3 text-left transition-colors",
				active
					? "border-foreground/60 bg-accent/40"
					: "border-border/60 bg-background/50 hover:border-border hover:bg-muted/30",
			)}
		>
			<span
				className="text-[1.75rem] leading-none tracking-tight text-foreground/90"
				style={{ fontFamily: getEditorFontFamily(fontId) }}
				aria-hidden="true"
			>
				Ag
			</span>
			<span className="mt-auto pt-3 text-xs font-medium leading-tight text-foreground">
				{label}
			</span>
			{active ? (
				<span className="absolute right-2 top-2 inline-flex size-5 items-center justify-center rounded-full bg-foreground text-background">
					<Check className="size-3" strokeWidth={2.5} />
				</span>
			) : null}
		</button>
	);
}

export function EditorFontPicker({ value, onChange }: EditorFontPickerProps) {
	const fontsByCategory = getEditorFontsByCategory();
	const selectedFamily = getEditorFontFamily(value);

	return (
		<div className="space-y-5">
			{FONT_GROUPS.map((category) => {
				const fonts = fontsByCategory[category];
				if (fonts.length === 0) return null;

				return (
					<div key={category} className="space-y-2">
						<p className="px-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
							{getEditorFontCategoryLabel(category)}
						</p>
						<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
							{fonts.map((font) => (
								<FontOptionCard
									key={font.id}
									fontId={font.id}
									label={font.label}
									active={value === font.id}
									onSelect={() => onChange(font.id)}
								/>
							))}
						</div>
					</div>
				);
			})}

			<div className="rounded-lg border border-border/60 bg-background/55 p-4">
				<p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
					Preview · {getEditorFontLabel(value)}
				</p>
				<div
					className="mt-3 space-y-1.5"
					style={{ fontFamily: selectedFamily }}
				>
					<p className="text-base font-medium leading-snug text-foreground">
						The quick brown fox jumps over the lazy dog.
					</p>
					<p className="text-sm leading-relaxed text-muted-foreground">
						Editor text uses this family for notes, titles, and body copy.
					</p>
				</div>
			</div>
		</div>
	);
}
