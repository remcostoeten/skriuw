import { afterEach, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type React from "react";
import type { AuthSnapshot } from "@/core/auth";
import type { TPublicShareSnapshot } from "@/domain/sharing/models";

function snapshot(): TPublicShareSnapshot {
	return {
		noteId: "note-1",
		name: "shared-note.md",
		content: "Hello",
		richContent: null,
		preferredEditorMode: "block",
		sharedAt: "2026-06-19T10:00:00.000Z",
		author: "Remco",
	};
}

async function renderReader(
	auth: AuthSnapshot,
	initialCollabStatus: "none" | "pending" | "collaborator" = "none",
) {
	mock.module("@/core/auth/use-auth", () => ({
		useAuth: () => auth,
	}));
	mock.module("@/features/editor/components/editor", () => ({
		Editor: () => <article>Reader</article>,
	}));
	mock.module("@remcostoeten/auth-drawer", () => ({
		AuthProvider: ({ children }: { children: React.ReactNode }) => children,
		AuthDrawer: () => null,
	}));
	mock.module("@/features/auth/auth-drawer-adapter", () => ({
		authDrawerAdapter: {},
	}));
	mock.module("@/features/collaboration/components/collab-request-button", () => ({
		CollabRequestButton: () => null,
	}));

	const { PublicNoteReader } = await import(
		`@/app/s/[token]/public-note-reader?auth=${Math.random().toString(36).slice(2)}`
	);

	return renderToStaticMarkup(
		<PublicNoteReader snapshot={snapshot()} initialCollabStatus={initialCollabStatus} />,
	);
}

afterEach(() => {
	mock.restore();
});

describe("PublicNoteReader", () => {
	test("shows the auth CTA to signed-out users", async () => {
		const html = await renderReader({
			phase: "signed_out",
			rememberMe: true,
			isReady: true,
			user: null,
			error: null,
		});

		expect(html).toContain("Try Skriuw");
		expect(html).not.toContain("Open Skriuw");
	});

	test("does not show the auth CTA to signed-in users", async () => {
		const html = await renderReader({
			phase: "authenticated",
			rememberMe: true,
			isReady: true,
			user: { id: "user-1", email: "user@example.com", name: "User", role: null },
			error: null,
		});

		expect(html).not.toContain("Try Skriuw");
		expect(html).toContain("Open Skriuw");
	});

	test("links collaborators directly to the shared note in the editor", async () => {
		const html = await renderReader(
			{
				phase: "authenticated",
				rememberMe: true,
				isReady: true,
				user: { id: "user-1", email: "user@example.com", name: "User", role: null },
				error: null,
			},
			"collaborator",
		);

		expect(html).toContain('href="/app?note=note-1"');
	});
});
