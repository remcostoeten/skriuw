import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/dynamic", () => ({
	default: () => () => null,
}));

mock.module("@/core/shortcuts", () => ({
	useShortcutHint: () => "Ctrl+N",
}));

// The real module starts with `import "server-only"`, which only throws
// under bun:test's plain SSR render — Next's bundler strips it before this
// client tree would ever reach it in production.
mock.module("@/core/db", () => ({
	prisma: {},
	getServerUser: async () => ({ prisma: {}, user: null }),
	getAuthenticatedUser: async () => {
		throw new Error("Not authenticated");
	},
	tryGetAuthenticatedUser: async () => ({ prisma: {}, user: null }),
}));

describe("Editor focus styles", () => {
	test("raw editor surface suppresses the global focus-visible box shadow", async () => {
		const { Editor } = await import(
			`@/features/editor/components/editor?focus-style=${Math.random().toString(36).slice(2)}`
		);

		const html = renderToStaticMarkup(
			<Editor
				file={{
					id: "note-1",
					name: "Note.md",
					content: "A plain note",
				} as never}
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
