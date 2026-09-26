import { describe, expect, mock, test } from "bun:test";
import {
	confirmFirstSharePublish,
	FIRST_SHARE_PUBLISH_MESSAGE,
	resolveShareUrlForAction,
} from "@/features/notes/lib/note-share-link";

describe("note share link helpers", () => {
	test("confirmFirstSharePublish delegates to confirm callback", () => {
		const confirm = mock(() => true);
		expect(confirmFirstSharePublish(confirm)).toBe(true);
		expect(confirm).toHaveBeenCalledWith(FIRST_SHARE_PUBLISH_MESSAGE);
	});

	test("resolveShareUrlForAction returns existing share url without publishing", async () => {
		const confirm = mock(() => true);
		const publish = mock(async () => {
			throw new Error("should not publish");
		});

		await expect(
			resolveShareUrlForAction({
				existing: { path: "/s/token", url: "https://fallback.app/s/token" },
				confirmPublish: confirm,
				publish,
			}),
		).resolves.toBe("https://fallback.app/s/token");

		expect(confirm).not.toHaveBeenCalled();
		expect(publish).not.toHaveBeenCalled();
	});

	test("resolveShareUrlForAction skips publish when confirm is declined", async () => {
		const confirm = mock(() => false);
		const publish = mock(async () => ({
			path: "/s/new",
			url: "https://fallback.app/s/new",
			token: "new",
			hasPassword: false,
			viewOnce: false,
			expiresAt: null,
			consumedAt: null,
			revokedAt: null,
			viewCount: 0,
			lastViewedAt: null,
			createdAt: new Date().toISOString(),
			snapshotName: "Note",
			authorName: null,
			isStale: false,
		}));

		await expect(
			resolveShareUrlForAction({
				existing: null,
				confirmPublish: confirm,
				publish,
			}),
		).resolves.toBeNull();

		expect(publish).not.toHaveBeenCalled();
	});

	test("resolveShareUrlForAction publishes when confirmed", async () => {
		const confirm = mock(() => true);
		const publish = mock(async () => ({
			path: "/s/new",
			url: "https://fallback.app/s/new",
			token: "new",
			hasPassword: false,
			viewOnce: false,
			expiresAt: null,
			consumedAt: null,
			revokedAt: null,
			viewCount: 0,
			lastViewedAt: null,
			createdAt: new Date().toISOString(),
			snapshotName: "Note",
			authorName: null,
			isStale: false,
		}));

		await expect(
			resolveShareUrlForAction({
				existing: null,
				confirmPublish: confirm,
				publish,
			}),
		).resolves.toBe("https://fallback.app/s/new");
	});
});
