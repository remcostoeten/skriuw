import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const noop = () => {};

mock.module("next/navigation", () => ({
	useRouter: () => ({
		push: noop,
		prefetch: noop,
		replace: noop,
	}),
}));

mock.module("@/features/journal/hooks/use-journal-entries", () => ({
	useJournalEntries: () => ({ data: [] }),
}));

// sidebar-item-icon pulls in @/features/settings/store, whose
// editor-preferences chain reaches @/core/db (server-only). Next's bundler
// scopes that away from client bundles; bun:test's plain SSR render has no
// such boundary, so the store hook is mocked out here like the other
// sidebar deps.
mock.module("@/features/settings/store", () => ({
	usePreferencesStore: (
		selector: (state: { appearance: { showAnimatedIcons: boolean } }) => unknown,
	) => selector({ appearance: { showAnimatedIcons: false } }),
}));

describe("sidebar compact states", () => {
	test("recents uses a compact sidebar-native empty state", async () => {
		const { RecentsSection } = await import(
			`@/features/notes/components/sidebar/recents-section?test=${Math.random().toString(36).slice(2)}`
		);

		const html = renderToStaticMarkup(
			<RecentsSection
				recents={[]}
				filesById={new Map()}
				foldersById={new Map()}
				activeFileId=""
				isCollapsed={false}
				onToggleCollapse={noop}
				onToggleVisibility={noop}
				onManageSections={noop}
				onFileSelect={noop}
				onClearRecents={noop}
			/>,
		);

		expect(html).toContain("No recent notes");
		expect(html).not.toContain("Opened notes will appear here.");
	});

	test("journal calendar omits the large selected-day footer copy", async () => {
		const { JournalSection } = await import(
			`@/features/notes/components/sidebar/journal/journal-section?test=${Math.random().toString(36).slice(2)}`
		);

		const html = renderToStaticMarkup(
			<JournalSection isCollapsed={false} onToggleCollapse={noop} />,
		);

		expect(html).not.toContain("Create this day");
		expect(html).not.toContain("Continue writing");
	});
});
