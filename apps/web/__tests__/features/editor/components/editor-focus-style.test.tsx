import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/dynamic", () => ({
	default: () => () => null,
}));

mock.module("@/core/shortcuts", () => ({
	useShortcutHint: () => "Ctrl+N",
}));

// Real hooks pull in @/core/workspace-backend's barrel, which re-exports
// server-backend.ts (server-only DB actions). Next's bundler scopes that
// away from client bundles; bun:test's plain SSR render has no such
// boundary, so the hooks are mocked out here like the other editor deps.
mock.module("@/features/people/hooks/use-people", () => ({
	useWorkspacePeople: () => ({ data: [], isLoading: false }),
}));
mock.module("@/features/people/hooks/use-create-person", () => ({
	useCreatePerson: () => ({ mutate: () => {}, isPending: false }),
}));

describe("Editor focus styles", () => {
	test("raw editor surface suppresses the global focus-visible box shadow", async () => {
		const { Editor } = await import(
			`@/features/editor/components/editor?focus-style=${Math.random().toString(36).slice(2)}`
		);

		const html = renderToStaticMarkup(
			<Editor
				file={
					{
						id: "note-1",
						name: "Note.md",
						content: "A plain note",
					} as never
				}
				editorMode="raw"
				editorFontId="inter"
				editorLineHeight="normal"
				onContentChange={() => {}}
			/>,
		);

		expect(html).toContain("data-editor-surface");
		expect(html).toContain("focus-visible:shadow-none");
	});
});
