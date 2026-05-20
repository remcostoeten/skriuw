export type AiProvider = "google" | "groq";

export type AiAction = "generateTitle" | "spellCheck" | "continueWriting";

export type AiErrorCode =
	| "authentication_required"
	| "invalid_action"
	| "invalid_model"
	| "no_key"
	| "no_content"
	| "content_too_large"
	| "server_not_configured"
	| "rate_limited"
	| "invalid_key"
	| "provider_mismatch"
	| "forbidden"
	| "model_not_found"
	| "provider_error"
	| "network_error"
	| "unknown";

export type AiUsageStatus = "success" | "error";

export type AiKeySource = "free_quota" | "user_key" | "owner_key" | "payment_backed" | "unknown";

export type AiProviderKeyStatus = "untested" | "valid" | "invalid" | "rate_limited" | "error";

export type AiProviderKeySummary = {
	id: string;
	provider: AiProvider;
	label: string;
	keyPreview: string;
	status: AiProviderKeyStatus;
	lastTestedAt: string | null;
	lastUsedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

export type AiUsageLogRow = {
	id: string;
	userId: string | null;
	provider: AiProvider | string;
	model: string | null;
	action: string;
	humanAction: string | null;
	resourceType: string | null;
	resourceId: string | null;
	resourceUrl: string | null;
	prompt: string | null;
	status: AiUsageStatus;
	errorMessage: string | null;
	inputTokens: number | null;
	outputTokens: number | null;
	totalTokens: number | null;
	keySource: AiKeySource;
	metadata: Record<string, unknown>;
	createdAt: string;
};
