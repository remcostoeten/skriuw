"use server";

import { list } from "@vercel/blob";
import { getAuthenticatedUser } from "@/core/db";
import {
	getDecryptedUserStorageConfig,
	getServerDefaultStorageConfig,
} from "@/domain/storage/config";
import {
	deleteUserStorageImage,
	listUserStorageImagesDetailed,
	type StorageImage,
	uploadToUserStorage,
} from "@/domain/storage/uploader";

const MAX_COVER_BYTES = 2 * 1024 * 1024;
const MAX_USER_STORAGE_BYTES = 100 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

async function getUserCoverStorageBytes(userId: string, token: string): Promise<number> {
	let total = 0;
	let cursor: string | undefined;
	do {
		const page = await list({ prefix: `covers/${userId}/`, cursor, limit: 1000, token });
		total += page.blobs.reduce((sum, blob) => sum + blob.size, 0);
		cursor = page.hasMore ? page.cursor : undefined;
	} while (cursor);
	return total;
}

/**
 * Uploads a note cover image and returns its public URL. Uses the user's own
 * connected storage if set (Settings → Data & sync), otherwise falls back to
 * the server-wide default storage (DEFAULT_STORAGE_S3_* or BLOB_READ_WRITE_TOKEN).
 * The 100MB cap only applies to the shared default Vercel Blob store — a
 * user's own storage, or a self-hosted default S3 bucket, is unmetered here.
 */
export async function uploadNoteCoverImage(formData: FormData): Promise<string> {
	const { user } = await getAuthenticatedUser();
	const file = formData.get("file");
	if (!(file instanceof File)) {
		throw new Error("No file provided.");
	}
	if (!ALLOWED_TYPES.has(file.type)) {
		throw new Error("Unsupported image type.");
	}
	if (file.size > MAX_COVER_BYTES) {
		throw new Error("Cover image is too large.");
	}

	const ext = file.type.split("/")[1] ?? "png";
	const pathname = `covers/${user.id}/${crypto.randomUUID()}.${ext}`;

	const ownStorage = await getDecryptedUserStorageConfig(user.id);
	if (ownStorage) {
		return uploadToUserStorage(ownStorage, pathname, file);
	}

	const defaultStorage = getServerDefaultStorageConfig();
	if (!defaultStorage) {
		throw new Error(
			"Cover uploads aren't configured on this server. Set BLOB_READ_WRITE_TOKEN or DEFAULT_STORAGE_S3_* env vars, or connect your own storage in Settings → Data & sync.",
		);
	}

	if (defaultStorage.provider === "vercel-blob") {
		const usedBytes = await getUserCoverStorageBytes(user.id, defaultStorage.token);
		if (usedBytes + file.size > MAX_USER_STORAGE_BYTES) {
			throw new Error(
				"Storage limit reached (100MB). Delete some cover images, or connect your own storage in Settings → Data & sync.",
			);
		}
	}

	return uploadToUserStorage(defaultStorage, pathname, file);
}

/** Returns the signed-in user's uploaded cover images, newest first. */
export async function listNoteCoverImages(): Promise<string[]> {
	await getAuthenticatedUser();
	const images = await listNoteCoverImagesDetailed();
	return images.map((image) => image.url);
}

/**
 * Returns the signed-in user's uploaded cover images newest-first, including the
 * byte size and pathname needed to show storage totals and delete each image.
 */
export async function listNoteCoverImagesDetailed(): Promise<StorageImage[]> {
	const { user } = await getAuthenticatedUser();
	const storage =
		(await getDecryptedUserStorageConfig(user.id)) ?? getServerDefaultStorageConfig();
	if (!storage) return [];
	return listUserStorageImagesDetailed(storage, `covers/${user.id}/`);
}

/** Deletes one of the signed-in user's cover images from storage. */
export async function deleteNoteCoverImage(image: StorageImage): Promise<void> {
	const { user } = await getAuthenticatedUser();
	if (!image.pathname.startsWith(`covers/${user.id}/`)) {
		throw new Error("Cannot delete this image.");
	}
	const storage =
		(await getDecryptedUserStorageConfig(user.id)) ?? getServerDefaultStorageConfig();
	if (!storage) return;
	await deleteUserStorageImage(storage, image);
}
