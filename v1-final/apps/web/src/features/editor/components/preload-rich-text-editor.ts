export function preloadRichTextEditor(): Promise<typeof import("./rich-text-editor")> {
	return import("./rich-text-editor");
}
