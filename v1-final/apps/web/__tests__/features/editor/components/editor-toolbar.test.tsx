import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type React from "react";

describe("EditorToolbar", () => {
	test("shows workspace navigation when workspace items are provided", async () => {
		mock.module("server-only", () => ({}));
		mock.module("@/shared/ui/guest-gate", () => ({
			GuestGate: ({ children }: { children: React.ReactNode }) => children,
		}));
		mock.module("@/features/collaboration/components/collab-presence", () => ({
			CollabPresence: () => null,
		}));
		mock.module("@/features/settings/store", () => ({
			usePreferencesStore: <T,>(
				selector: (state: { appearance: { showPageIcons: boolean } }) => T,
			) => selector({ appearance: { showPageIcons: false } }),
		}));

		const { EditorToolbar } = await import(
			`@/features/editor/components/editor-toolbar?workspace-menu=${Math.random().toString(36).slice(2)}`
		);

		const html = renderToStaticMarkup(
			<EditorToolbar
				fileName="Daily note"
				onToggleSidebar={() => {}}
				onToggleMetadata={() => {}}
				workspaceItems={[
					{ href: "/app", label: "Notes", isActive: true },
					{ href: "/app/journal", label: "Journal" },
				]}
			/>,
		);

		expect(html).toContain('aria-label="Switch workspace"');
		mock.restore();
	});
});
