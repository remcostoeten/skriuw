export type StorageProviderId = "vercel-blob" | "s3";

export type VercelBlobConfig = {
	provider: "vercel-blob";
	token: string;
};

export type S3Config = {
	provider: "s3";
	endpoint?: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	publicBaseUrl?: string;
};

export type UserStorageProviderConfig = VercelBlobConfig | S3Config;

export type UserStorageConfigStatus = "untested" | "valid" | "invalid" | "error";

export type UserStorageConfigSummary = {
	provider: StorageProviderId;
	configPreview: string;
	status: UserStorageConfigStatus;
	lastTestedAt: string | null;
	createdAt: string;
	updatedAt: string;
};
