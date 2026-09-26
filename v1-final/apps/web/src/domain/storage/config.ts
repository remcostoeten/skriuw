import { prisma } from "@/core/db";
import { decryptSecret, encryptSecret } from "@/shared/lib/secret-cipher";
import { testUserStorageConfig } from "@/domain/storage/uploader";
import type {
	S3Config,
	StorageProviderId,
	UserStorageConfigSummary,
	UserStorageProviderConfig,
	VercelBlobConfig,
} from "@/domain/storage/types";

const ENCRYPTION_ENV_VAR = "AI_KEYS_ENCRYPTION_SECRET";

/**
 * Server-wide fallback storage used for uploads when a user hasn't connected
 * their own storage. Prefers a self-hostable S3-compatible bucket
 * (DEFAULT_STORAGE_S3_*) over Vercel Blob (BLOB_READ_WRITE_TOKEN) so
 * self-hosted deployments aren't forced onto Vercel's platform.
 */
export function getServerDefaultStorageConfig(): UserStorageProviderConfig | null {
	const bucket = process.env.DEFAULT_STORAGE_S3_BUCKET;
	if (bucket) {
		const region = process.env.DEFAULT_STORAGE_S3_REGION ?? "";
		const accessKeyId = process.env.DEFAULT_STORAGE_S3_ACCESS_KEY_ID ?? "";
		const secretAccessKey = process.env.DEFAULT_STORAGE_S3_SECRET_ACCESS_KEY ?? "";
		if (!region || !accessKeyId || !secretAccessKey) {
			throw new Error(
				"DEFAULT_STORAGE_S3_BUCKET is set but DEFAULT_STORAGE_S3_REGION, DEFAULT_STORAGE_S3_ACCESS_KEY_ID, or DEFAULT_STORAGE_S3_SECRET_ACCESS_KEY is missing.",
			);
		}
		const config: S3Config = {
			provider: "s3",
			region,
			bucket,
			accessKeyId,
			secretAccessKey,
			endpoint: process.env.DEFAULT_STORAGE_S3_ENDPOINT || undefined,
			publicBaseUrl: process.env.DEFAULT_STORAGE_S3_PUBLIC_BASE_URL || undefined,
		};
		return config;
	}

	if (process.env.BLOB_READ_WRITE_TOKEN) {
		const config: VercelBlobConfig = {
			provider: "vercel-blob",
			token: process.env.BLOB_READ_WRITE_TOKEN,
		};
		return config;
	}

	return null;
}

type ConfigRecord = {
	provider: string;
	encryptedConfig: string;
	configPreview: string;
	status: string;
	lastTestedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

function toSummary(record: ConfigRecord): UserStorageConfigSummary {
	return {
		provider: record.provider as StorageProviderId,
		configPreview: record.configPreview,
		status: record.status as UserStorageConfigSummary["status"],
		lastTestedAt: record.lastTestedAt?.toISOString() ?? null,
		createdAt: record.createdAt.toISOString(),
		updatedAt: record.updatedAt.toISOString(),
	};
}

function mask(value: string): string {
	if (value.length <= 8) return "••••";
	return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function previewFor(config: UserStorageProviderConfig): string {
	if (config.provider === "vercel-blob") return `Vercel Blob · ${mask(config.token)}`;
	return `S3 · ${config.bucket} · ${mask(config.accessKeyId)}`;
}

function normalizeInput(raw: unknown): UserStorageProviderConfig {
	if (typeof raw !== "object" || raw === null) throw new Error("Invalid storage config.");
	const body = raw as Record<string, unknown>;

	if (body.provider === "vercel-blob") {
		const token = typeof body.token === "string" ? body.token.trim() : "";
		if (token.length < 10) throw new Error("A valid Vercel Blob token is required.");
		const config: VercelBlobConfig = { provider: "vercel-blob", token };
		return config;
	}

	if (body.provider === "s3") {
		const region = typeof body.region === "string" ? body.region.trim() : "";
		const bucket = typeof body.bucket === "string" ? body.bucket.trim() : "";
		const accessKeyId = typeof body.accessKeyId === "string" ? body.accessKeyId.trim() : "";
		const secretAccessKey =
			typeof body.secretAccessKey === "string" ? body.secretAccessKey.trim() : "";
		const endpoint =
			typeof body.endpoint === "string" ? body.endpoint.trim() || undefined : undefined;
		const publicBaseUrl =
			typeof body.publicBaseUrl === "string"
				? body.publicBaseUrl.trim() || undefined
				: undefined;

		if (!region || !bucket || !accessKeyId || !secretAccessKey) {
			throw new Error("Region, bucket, access key, and secret key are required.");
		}
		const config: S3Config = {
			provider: "s3",
			region,
			bucket,
			accessKeyId,
			secretAccessKey,
			endpoint,
			publicBaseUrl,
		};
		return config;
	}

	throw new Error("Unsupported storage provider.");
}

export async function getUserStorageConfigSummary(
	userId: string,
): Promise<UserStorageConfigSummary | null> {
	const record = await prisma.userStorageConfig.findUnique({ where: { userId } });
	return record ? toSummary(record) : null;
}

export async function getDecryptedUserStorageConfig(
	userId: string,
): Promise<UserStorageProviderConfig | null> {
	const record = await prisma.userStorageConfig.findUnique({ where: { userId } });
	if (!record) return null;
	const json = decryptSecret(record.encryptedConfig, ENCRYPTION_ENV_VAR);
	return JSON.parse(json) as UserStorageProviderConfig;
}

/** Validates connectivity, then encrypts and upserts the user's storage config. */
export async function saveUserStorageConfig(
	userId: string,
	rawConfig: unknown,
): Promise<UserStorageConfigSummary> {
	const config = normalizeInput(rawConfig);
	const test = await testUserStorageConfig(config);
	if (!test.ok) {
		throw new Error(`Could not verify storage credentials: ${test.message}`);
	}

	const encryptedConfig = encryptSecret(JSON.stringify(config), ENCRYPTION_ENV_VAR);
	const configPreview = previewFor(config);

	const record = await prisma.userStorageConfig.upsert({
		where: { userId },
		create: {
			userId,
			provider: config.provider,
			encryptedConfig,
			configPreview,
			status: "valid",
			lastTestedAt: new Date(),
		},
		update: {
			provider: config.provider,
			encryptedConfig,
			configPreview,
			status: "valid",
			lastTestedAt: new Date(),
		},
	});

	return toSummary(record);
}

export async function deleteUserStorageConfig(userId: string): Promise<void> {
	await prisma.userStorageConfig.deleteMany({ where: { userId } });
}
