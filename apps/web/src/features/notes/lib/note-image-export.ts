import { toBlob } from "html-to-image";
import { splitFrontmatter } from "@/domain/data-transfer/frontmatter";

const IMAGE_PIXEL_RATIO = 2;
const PREVIEW_MAX_LENGTH = 640;

export function buildNoteImageFileName(title: string): string {
	const slug = title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return `${slug || "note"}.png`;
}

export function buildNoteImagePreview(markdown: string): string {
	const { body } = splitFrontmatter(markdown);
	const cleaned = body
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/^\s{0,3}#{1,6}\s+/gm, "")
		.replace(/^\s{0,3}>\s?/gm, "")
		.replace(/^\s{0,3}[-*+]\s+/gm, "• ")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/\*([^*]+)\*/g, "$1")
		.replace(/__([^_]+)__/g, "$1")
		.replace(/_([^_]+)_/g, "$1")
		.replace(/~~([^~]+)~~/g, "$1")
		.replace(/\n{3,}/g, "\n\n")
		.trim();

	if (cleaned.length <= PREVIEW_MAX_LENGTH) return cleaned;
	return `${cleaned.slice(0, PREVIEW_MAX_LENGTH - 1).trimEnd()}…`;
}

export async function renderElementToPngBlob(element: HTMLElement): Promise<Blob | null> {
	return toBlob(element, {
		pixelRatio: IMAGE_PIXEL_RATIO,
		cacheBust: true,
		skipFonts: false,
	});
}

export function downloadImageBlob(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = fileName;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}

export async function copyImageBlobToClipboard(blob: Blob): Promise<boolean> {
	if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
		return false;
	}
	try {
		await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
		return true;
	} catch {
		return false;
	}
}
