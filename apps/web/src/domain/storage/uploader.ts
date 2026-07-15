import {
	DeleteObjectCommand,
	HeadBucketCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { del, list, put } from "@vercel/blob";
import type { UserStorageProviderConfig } from "@/domain/storage/types";

export type StorageImage = { url: string; pathname: string; size: number; uploadedAt?: number };

function s3Client(config: Extract<UserStorageProviderConfig, { provider: "s3" }>): S3Client {
	return new S3Client({
		region: config.region,
		endpoint: config.endpoint,
		forcePathStyle: Boolean(config.endpoint),
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
		},
	});
}

function s3PublicUrl(
	config: Extract<UserStorageProviderConfig, { provider: "s3" }>,
	key: string,
): string {
	if (config.publicBaseUrl) return `${config.publicBaseUrl.replace(/\/+$/, "")}/${key}`;
	if (config.endpoint) return `${config.endpoint.replace(/\/+$/, "")}/${config.bucket}/${key}`;
	return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}

/**
 * Uploads a file to the user's own storage backend and returns its public URL.
 * Assumes the bucket/store is already configured for public read access —
 * S3-compatible providers vary too much in ACL support to set it here.
 */
export async function uploadToUserStorage(
	config: UserStorageProviderConfig,
	pathname: string,
	file: File,
): Promise<string> {
	if (config.provider === "vercel-blob") {
		const blob = await put(pathname, file, {
			access: "public",
			contentType: file.type,
			token: config.token,
		});
		return blob.url;
	}

	const client = s3Client(config);
	const bytes = new Uint8Array(await file.arrayBuffer());
	await client.send(
		new PutObjectCommand({
			Bucket: config.bucket,
			Key: pathname,
			Body: bytes,
			ContentType: file.type,
		}),
	);
	return s3PublicUrl(config, pathname);
}

/**
 * Lists images under a storage prefix newest-first, with the pathname/key and
 * byte size needed to render storage totals and delete individual objects.
 */
export async function listUserStorageImagesDetailed(
	config: UserStorageProviderConfig,
	prefix: string,
): Promise<StorageImage[]> {
	if (config.provider === "vercel-blob") {
		const images: (StorageImage & { uploadedAt: number })[] = [];
		let cursor: string | undefined;
		do {
			const page = await list({ prefix, cursor, limit: 1000, token: config.token });
			images.push(
				...page.blobs.map((blob) => ({
					url: blob.url,
					pathname: blob.pathname,
					size: blob.size,
					uploadedAt: blob.uploadedAt.getTime(),
				})),
			);
			cursor = page.hasMore ? page.cursor : undefined;
		} while (cursor);
		return images.sort((left, right) => right.uploadedAt - left.uploadedAt);
	}

	const client = s3Client(config);
	const images: (StorageImage & { modifiedAt: number })[] = [];
	let continuationToken: string | undefined;
	do {
		const page = await client.send(
			new ListObjectsV2Command({
				Bucket: config.bucket,
				Prefix: prefix,
				ContinuationToken: continuationToken,
			}),
		);
		images.push(
			...(page.Contents ?? [])
				.filter((object): object is typeof object & { Key: string } => Boolean(object.Key))
				.map((object) => ({
					url: s3PublicUrl(config, object.Key),
					pathname: object.Key,
					size: object.Size ?? 0,
					modifiedAt: object.LastModified?.getTime() ?? 0,
				})),
		);
		continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
	} while (continuationToken);

	return images
		.sort((left, right) => right.modifiedAt - left.modifiedAt)
		.map(({ url, pathname, size, modifiedAt }) => ({
			url,
			pathname,
			size,
			uploadedAt: modifiedAt || undefined,
		}));
}

/** Deletes a single object from the user's storage backend. */
export async function deleteUserStorageImage(
	config: UserStorageProviderConfig,
	image: { url: string; pathname: string },
): Promise<void> {
	if (config.provider === "vercel-blob") {
		await del(image.url, { token: config.token });
		return;
	}

	const client = s3Client(config);
	await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: image.pathname }));
}

/** Verifies the given credentials can reach the target store/bucket. */
export async function testUserStorageConfig(
	config: UserStorageProviderConfig,
): Promise<{ ok: true } | { ok: false; message: string }> {
	try {
		if (config.provider === "vercel-blob") {
			await list({ token: config.token, limit: 1 });
			return { ok: true };
		}
		const client = s3Client(config);
		await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
		return { ok: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not reach storage.";
		return { ok: false, message };
	}
}
