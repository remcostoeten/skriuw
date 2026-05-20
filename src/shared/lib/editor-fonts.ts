type EditorFontDefinition<TId extends string = string> = {
	id: TId;
	label: string;
	family: string;
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
	},
	{
		id: "lora",
		label: "Lora",
		family: "var(--font-editor-lora), Georgia, serif",
	},
	{
		id: "source-serif",
		label: "Source Serif",
		family: "var(--font-editor-source-serif), Georgia, serif",
	},
	{
		id: "merriweather",
		label: "Merriweather",
		family: "var(--font-editor-merriweather), Georgia, serif",
	},
	{
		id: "libre-baskerville",
		label: "Libre Baskerville",
		family: "var(--font-editor-libre-baskerville), Georgia, serif",
	},
	{
		id: "sohne",
		label: "Sohne",
		family: '"Sohne", var(--font-editor-inter), system-ui, -apple-system, sans-serif',
	},
	{
		id: "ia-writer",
		label: "iA Writer Quattro",
		family: '"iA Writer Quattro", var(--font-editor-source-serif), Georgia, serif',
	},
	{
		id: "jetbrains-mono",
		label: "JetBrains Mono",
		family: "var(--font-editor-jetbrains-mono), ui-monospace, SFMono-Regular, monospace",
	},
	{
		id: "fira-code",
		label: "Fira Code",
		family: "var(--font-editor-fira-code), ui-monospace, SFMono-Regular, monospace",
	},
] as const);

export type EditorFontId = (typeof EDITOR_FONTS)[number]["id"];
export type EditorFontOption = (typeof EDITOR_FONTS)[number];

export const EDITOR_FONT_IDS = EDITOR_FONTS.map((font) => font.id) as EditorFontId[];

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

export function getEditorFontOptions(): EditorFontOption[] {
	return [...EDITOR_FONTS];
}
