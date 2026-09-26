import { describe, expect, test } from "bun:test";
import {
	buildLinkShareMessage,
	buildMailtoShareUrl,
	buildMailtoShareUrlWithLink,
	buildNoteSharePayload,
	buildWhatsAppShareUrl,
	buildWhatsAppShareUrlWithLink,
	buildXShareUrl,
	buildTelegramShareUrl,
	buildSmsShareUrl,
	formatShareText,
	MAX_SHARE_TEXT_LENGTH,
	copyTextToClipboard,
	openDiscordShare,
	resolveClientShareUrl,
} from "@/features/notes/lib/note-share-export";

describe("note share export", () => {
	test("builds a markdown payload with a readable title", () => {
		const payload = buildNoteSharePayload({
			name: "ideas.md",
			content: "# Draft\n\nBody text",
		});

		expect(payload.title).toBe("Draft");
		expect(payload.fileName).toBe("ideas.md");
		expect(payload.markdown).toBe("# Draft\n\nBody text");
		expect(payload.plainText.startsWith("Draft\n\n# Draft")).toBe(true);
	});

	test("truncates long share text for external apps", () => {
		const payload = buildNoteSharePayload({
			name: "long.md",
			content: "x".repeat(MAX_SHARE_TEXT_LENGTH + 100),
		});

		expect(formatShareText(payload).length).toBeLessThanOrEqual(MAX_SHARE_TEXT_LENGTH);
	});

	test("builds mailto and whatsapp urls", () => {
		const payload = buildNoteSharePayload({
			name: "note.md",
			content: "# Hello\n\nWorld",
		});

		expect(buildMailtoShareUrl(payload)).toContain("mailto:?subject=Hello");
		expect(buildMailtoShareUrl(payload)).toContain("body=");
		expect(buildWhatsAppShareUrl(payload)).toBe(
			`https://wa.me/?text=${encodeURIComponent(formatShareText(payload))}`,
		);
	});

	test("builds link share messages and platform urls", () => {
		const title = "My note";
		const url = "https://skriuw.app/s/abc123";
		const message = buildLinkShareMessage(title, url);

		expect(message).toContain(title);
		expect(message).toContain(url);
		expect(buildXShareUrl(url, title)).toContain("x.com/intent/tweet");
		expect(buildXShareUrl(url, title)).toContain(encodeURIComponent(url));
		expect(buildWhatsAppShareUrlWithLink(title, url)).toBe(
			`https://wa.me/?text=${encodeURIComponent(message)}`,
		);
		expect(buildMailtoShareUrlWithLink(title, url)).toContain(encodeURIComponent(message));
	});

	test("resolves client share urls from path", () => {
		expect(resolveClientShareUrl("/s/token", "https://fallback.app/s/token")).toBe(
			"https://fallback.app/s/token",
		);
		expect(resolveClientShareUrl("/s/abc", "https://example.com/fallback")).toBe(
			"https://example.com/fallback",
		);
	});

	test("builds telegram and sms share urls", () => {
		const payload = buildNoteSharePayload({
			name: "note.md",
			content: "# Hello\n\nWorld",
		});

		expect(buildTelegramShareUrl("Hello", "https://skriuw.app/s/abc")).toContain(
			"t.me/share/url",
		);
		expect(buildSmsShareUrl(payload)).toContain("sms:?body=");
	});

	test("copyTextToClipboard falls back to execCommand when clipboard API fails", async () => {
		if (typeof document === "undefined") return;

		const originalExec = document.execCommand;
		document.execCommand = () => true;

		await expect(copyTextToClipboard("https://skriuw.app/s/abc")).resolves.toBe(true);

		document.execCommand = originalExec;
	});

	test("returns cancelled when native discord share is dismissed", async () => {
		const originalShare = navigator.share;
		navigator.share = () => Promise.reject(new DOMException("Aborted", "AbortError"));

		await expect(openDiscordShare("Title", "https://skriuw.app/s/abc")).resolves.toBe(
			"cancelled",
		);

		navigator.share = originalShare;
	});
});
