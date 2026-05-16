export type AiProvider = "google" | "groq";

export type AiUsageStatus = "success" | "error";

export type AiKeySource =
  | "free_quota"
  | "user_key"
  | "owner_key"
  | "payment_backed"
  | "unknown";

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