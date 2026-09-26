type EditorFontDefinition<TId extends string = string> = {
	id: TId;
	label: string;
	family: string;
	category: "sans" | "serif" | "mono";
};

function defineEditorFonts<const TFonts extends readonly EditorFontDefinition[]>(
	fonts: TFonts,
): TFonts {
	return fonts;
}

export const EDITOR_FONTS = defineEditorFonts([
	{
		id: "inter",
		label: "Inter",
		family: "var(--font-editor-inter), system-ui, -apple-system, sans-serif",
		category: "sans",
	},
	{
		id: "lora",
		label: "Lora",
		family: "var(--font-editor-lora), Georgia, serif",
		category: "serif",
	},
	{
		id: "source-serif",
		label: "Source Serif",
		family: "var(--font-editor-source-serif), Georgia, serif",
		category: "serif",
	},
	{
		id: "merriweather",
		label: "Merriweather",
		family: "var(--font-editor-merriweather), Georgia, serif",
		category: "serif",
	},
	{
		id: "libre-baskerville",
		label: "Libre Baskerville",
		family: "var(--font-editor-libre-baskerville), Georgia, serif",
		category: "serif",
	},
	{
		id: "sohne",
		label: "Sohne",
		family: '"Sohne", var(--font-editor-inter), system-ui, -apple-system, sans-serif',
		category: "sans",
	},
	{
		id: "ia-writer",
		label: "iA Writer Quattro",
		family: '"iA Writer Quattro", var(--font-editor-source-serif), Georgia, serif',
		category: "serif",
	},
	{
		id: "jetbrains-mono",
		label: "JetBrains Mono",
		family: "var(--font-editor-jetbrains-mono), ui-monospace, SFMono-Regular, monospace",
		category: "mono",
	},
	{
		id: "fira-code",
		label: "Fira Code",
		family: "var(--font-editor-fira-code), ui-monospace, SFMono-Regular, monospace",
		category: "mono",
	},
] as const);

export type EditorFontId = (typeof EDITOR_FONTS)[number]["id"];
export type EditorFontOption = (typeof EDITOR_FONTS)[number];

const FONT_REGISTRY = new Map<EditorFontId, EditorFontOption>(
	EDITOR_FONTS.map((font) => [font.id, font]),
);

export function isEditorFontId(value: string | null | undefined): value is EditorFontId {
	return typeof value === "string" && FONT_REGISTRY.has(value as EditorFontId);
}

export function getEditorFontDefinition(fontId: EditorFontId): EditorFontOption {
	return FONT_REGISTRY.get(fontId) ?? EDITOR_FONTS[0];
}

export function getEditorFontFamily(fontId: EditorFontId): string {
	return getEditorFontDefinition(fontId).family;
}

export function getEditorFontLabel(fontId: EditorFontId): string {
	return getEditorFontDefinition(fontId).label;
}

export type EditorFontCategory = EditorFontOption["category"];

const FONT_CATEGORY_LABELS: Record<EditorFontCategory, string> = {
	sans: "Sans",
	serif: "Serif",
	mono: "Monospace",
};

export function getEditorFontCategoryLabel(category: EditorFontCategory): string {
	return FONT_CATEGORY_LABELS[category];
}

export function getEditorFontsByCategory(): Record<EditorFontCategory, EditorFontOption[]> {
	const grouped: Record<EditorFontCategory, EditorFontOption[]> = {
		sans: [],
		serif: [],
		mono: [],
	};

	for (const font of EDITOR_FONTS) {
		grouped[font.category].push(font);
	}

	return grouped;
}
