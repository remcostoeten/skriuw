import { HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { list, put } from "@vercel/blob";
import type { UserStorageProviderConfig } from "@/domain/storage/types";

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
