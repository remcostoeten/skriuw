import { isTauriRuntime, tauriInvoke } from "@/core/workspace-backend";

/** Prefix marking a cover value as a desktop on-disk asset (see tauriBackend.uploadCoverImage). */
export const VAULT_ASSET_PREFIX = "vault-asset:";

const MAX_DIMENSION = 1600;
const OUTPUT_TYPE = "image/webp";
const OUTPUT_QUALITY = 0.8;

/**
 * Downscales and re-encodes an uploaded image client-side before it's sent to
 * storage — keeps Blob usage and vault disk usage small regardless of what
 * the user picked. Skips GIFs untouched: re-encoding through canvas would
 * flatten an animated GIF to its first frame.
 */
export async function compressCoverImage(file: File): Promise<File> {
	if (file.type === "image/gif") return file;

	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
	const width = Math.round(bitmap.width * scale);
	const height = Math.round(bitmap.height * scale);

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) return file;
	ctx.drawImage(bitmap, 0, 0, width, height);

	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, OUTPUT_TYPE, OUTPUT_QUALITY),
	);
	if (!blob) return file;

	const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
	return new File([blob], name, { type: OUTPUT_TYPE });
}

const resolvedAssetUrls = new Map<string, string>();
const pendingAssetUrls = new Map<string, Promise<string>>();

/**
 * Resolves a `vault-asset:<relative>` cover value to a displayable blob URL by
 * reading the bytes back from the vault over Tauri IPC. Results are cached
 * for the life of the tab — the underlying file never changes once uploaded.
 */
export function resolveVaultAssetUrl(cover: string): Promise<string> | string {
	const relative = cover.slice(VAULT_ASSET_PREFIX.length);
	const cached = resolvedAssetUrls.get(relative);
	if (cached) return cached;

	const pending = pendingAssetUrls.get(relative);
	if (pending) return pending;

	if (!isTauriRuntime()) return "";

	const promise = tauriInvoke<number[]>("read_cover_image", { relative }).then((bytes) => {
		const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
		resolvedAssetUrls.set(relative, url);
		pendingAssetUrls.delete(relative);
		return url;
	});
	pendingAssetUrls.set(relative, promise);
	return promise;
}
