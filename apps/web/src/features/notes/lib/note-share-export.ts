import { getNoteTitle } from "@/domain/notes/note-links";
import { normalizeNoteFileName } from "@/domain/data-transfer/paths";
import type { NoteFile } from "@/types/notes";
import { noop } from "@/shared/lib/noop";

export const MAX_SHARE_TEXT_LENGTH = 3_500;

export type NoteSharePayload = {
	title: string;
	fileName: string;
	markdown: string;
	plainText: string;
};

export type NativeShareResult = "shared" | "unsupported" | "cancelled" | "failed";

function truncateShareText(text: string, max = MAX_SHARE_TEXT_LENGTH): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1)}…`;
}

export function buildNoteSharePayload(note: Pick<NoteFile, "name" | "content">): NoteSharePayload {
	const title = getNoteTitle(note);
	const fileName = normalizeNoteFileName(note.name);
	const markdown = note.content;
	const plainText = truncateShareText(`${title}\n\n${markdown}`);

	return {
		title,
		fileName,
		markdown,
		plainText,
	};
}

export function formatShareText(payload: NoteSharePayload): string {
	return payload.plainText;
}

export function buildLinkShareMessage(title: string, url: string): string {
	return truncateShareText(`${title}\n\n${url}`);
}

export function resolveClientShareUrl(path: string, serverUrl?: string): string {
	if (typeof window !== "undefined" && window.location.origin) {
		return `${window.location.origin}${path}`;
	}
	if (serverUrl?.startsWith("http")) return serverUrl;
	return path;
}

export function canUseNativeShare(): boolean {
	return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export function isAppleSharePlatform(): boolean {
	if (typeof navigator === "undefined") return false;
	return /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
}

export function isMobileSharePlatform(): boolean {
	if (typeof navigator === "undefined" || typeof window === "undefined") {
		return false;
	}
	if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
	return navigator.maxTouchPoints > 0 && window.innerWidth < 768;
}

/** Opens outbound share targets reliably after async work on mobile browsers. */
export function openExternalShareUrl(url: string, options?: { preferSameTab?: boolean }): void {
	if (typeof window === "undefined") return;

	const useSameTab = options?.preferSameTab ?? isMobileSharePlatform();
	if (useSameTab) {
		window.location.assign(url);
		return;
	}

	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.target = "_blank";
	anchor.rel = "noopener noreferrer";
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
}

function buildNoteMarkdownFile(payload: NoteSharePayload): File {
	return new File([payload.markdown], payload.fileName, { type: "text/markdown" });
}

function buildNotePlainTextFile(payload: NoteSharePayload): File {
	const fileName = payload.fileName.replace(/\.md$/i, ".txt");
	return new File([payload.plainText], fileName, { type: "text/plain" });
}

export function canShareNoteFiles(payload: NoteSharePayload): boolean {
	if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") {
		return false;
	}

	try {
		return navigator.canShare({ files: [buildNoteMarkdownFile(payload)] });
	} catch {
		return false;
	}
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
	if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// Fall through to legacy copy for Safari / restricted contexts.
			noop();
		}
	}

	if (typeof document === "undefined") {
		return false;
	}

	try {
		const textarea = document.createElement("textarea");
		textarea.value = text;
		textarea.setAttribute("readonly", "");
		textarea.style.position = "fixed";
		textarea.style.top = "0";
		textarea.style.left = "0";
		textarea.style.opacity = "0";
		textarea.style.pointerEvents = "none";
		document.body.appendChild(textarea);
		textarea.focus({ preventScroll: true });
		textarea.select();
		textarea.setSelectionRange(0, text.length);
		const copied = document.execCommand("copy");
		textarea.remove();
		return copied;
	} catch {
		return false;
	}
}

export async function shareNoteNatively(payload: NoteSharePayload): Promise<NativeShareResult> {
	if (!canUseNativeShare()) return "unsupported";

	const shareData: ShareData = {
		title: payload.title,
		text: formatShareText(payload),
	};

	if (canShareNoteFiles(payload)) {
		shareData.files = [buildNoteMarkdownFile(payload)];
	}

	try {
		await navigator.share(shareData);
		return "shared";
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			return "cancelled";
		}
		return "failed";
	}
}

/** Files-only share surfaces "Save to Files" on iOS without duplicating body text. */
export async function shareNoteAsFile(payload: NoteSharePayload): Promise<NativeShareResult> {
	if (!canUseNativeShare() || !canShareNoteFiles(payload)) return "unsupported";

	try {
		await navigator.share({ files: [buildNoteMarkdownFile(payload)] });
		return "shared";
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			return "cancelled";
		}
		return "failed";
	}
}

/** Optimized for Apple Notes via the system share sheet (plain text file, then text). */
export async function shareNoteToAppleNotes(payload: NoteSharePayload): Promise<NativeShareResult> {
	if (!canUseNativeShare()) return "unsupported";

	const plainFile = buildNotePlainTextFile(payload);

	if (typeof navigator.canShare === "function") {
		try {
			if (navigator.canShare({ files: [plainFile] })) {
				await navigator.share({ title: payload.title, files: [plainFile] });
				return "shared";
			}
		} catch {
			// Fall through to text-only share.
			noop();
		}
	}

	try {
		await navigator.share({ title: payload.title, text: payload.plainText });
		return "shared";
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			return "cancelled";
		}
		return "failed";
	}
}

export async function shareUrlNatively(
	url: string,
	title: string,
	text?: string,
): Promise<NativeShareResult> {
	if (!canUseNativeShare()) return "unsupported";

	try {
		await navigator.share({ title, text: text ?? url, url });
		return "shared";
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			return "cancelled";
		}
		return "failed";
	}
}

export function buildMailtoShareUrl(payload: NoteSharePayload): string {
	const subject = encodeURIComponent(payload.title);
	const body = encodeURIComponent(formatShareText(payload));
	return `mailto:?subject=${subject}&body=${body}`;
}

export function buildMailtoShareUrlWithLink(title: string, url: string): string {
	const subject = encodeURIComponent(title);
	const body = encodeURIComponent(buildLinkShareMessage(title, url));
	return `mailto:?subject=${subject}&body=${body}`;
}

export function buildWhatsAppShareUrl(payload: NoteSharePayload): string {
	const text = encodeURIComponent(formatShareText(payload));
	return `https://wa.me/?text=${text}`;
}

export function buildWhatsAppShareUrlWithLink(title: string, url: string): string {
	const text = encodeURIComponent(buildLinkShareMessage(title, url));
	return `https://wa.me/?text=${text}`;
}

export function buildTelegramShareUrl(title: string, url: string): string {
	const params = new URLSearchParams({
		url,
		text: title,
	});
	return `https://t.me/share/url?${params.toString()}`;
}

export function buildSmsShareUrl(payload: NoteSharePayload): string {
	return `sms:?body=${encodeURIComponent(formatShareText(payload))}`;
}

export function buildSmsShareUrlWithLink(title: string, url: string): string {
	return `sms:?body=${encodeURIComponent(buildLinkShareMessage(title, url))}`;
}

export function buildXShareUrl(shareUrl: string, title: string): string {
	const params = new URLSearchParams({
		text: title,
		url: shareUrl,
	});
	return `https://x.com/intent/tweet?${params.toString()}`;
}

export function openEmailShare(payload: NoteSharePayload): void {
	window.location.href = buildMailtoShareUrl(payload);
}

export function openEmailShareWithLink(title: string, url: string): void {
	window.location.href = buildMailtoShareUrlWithLink(title, url);
}

export function openWhatsAppShare(payload: NoteSharePayload): void {
	openExternalShareUrl(buildWhatsAppShareUrl(payload), { preferSameTab: true });
}

export function openWhatsAppShareWithLink(title: string, url: string): void {
	openExternalShareUrl(buildWhatsAppShareUrlWithLink(title, url), { preferSameTab: true });
}

export function openTelegramShare(title: string, url: string): void {
	openExternalShareUrl(buildTelegramShareUrl(title, url));
}

export function openTelegramShareWithLink(title: string, url: string): void {
	openTelegramShare(title, url);
}

export function openSmsShare(payload: NoteSharePayload): void {
	openExternalShareUrl(buildSmsShareUrl(payload), { preferSameTab: true });
}

export function openSmsShareWithLink(title: string, url: string): void {
	openExternalShareUrl(buildSmsShareUrlWithLink(title, url), { preferSameTab: true });
}

export function openXShare(shareUrl: string, title: string): void {
	openExternalShareUrl(buildXShareUrl(shareUrl, title));
}

export async function openDiscordShare(
	title: string,
	shareUrl: string,
): Promise<"shared" | "copied" | "failed" | "cancelled"> {
	const message = buildLinkShareMessage(title, shareUrl);
	const native = await shareUrlNatively(shareUrl, title, message);
	if (native === "shared") return "shared";
	if (native === "cancelled") return "cancelled";

	const copied = await copyTextToClipboard(message);
	if (!copied) return "failed";

	if (!isMobileSharePlatform()) {
		openExternalShareUrl("https://discord.com/channels/@me");
	}
	return "copied";
}

export function downloadNoteMarkdown(payload: NoteSharePayload): void {
	const blob = new Blob([payload.markdown], { type: "text/markdown;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = payload.fileName;
	anchor.click();
	URL.revokeObjectURL(url);
}
