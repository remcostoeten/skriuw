export type AiCompletionParameters = {
  maxOutputBytes: number;
  timeoutMs: number;
  retryCount: number;
  temperatureMillis: number | null;
  topPMillis: number | null;
};

export type AiCompletionRequest = {
  requestId: string;
  providerId: string;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  parameters: AiCompletionParameters;
};

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type AiProviderErrorCategory =
  | "unavailable_provider"
  | "missing_credential"
  | "invalid_credential"
  | "quota_exhausted"
  | "rate_limited"
  | "rejected_request"
  | "transport_failure"
  | "malformed_response"
  | "internal_failure";

export type AiRecoveryAction =
  | "configure_credential"
  | "retry"
  | "choose_different_model"
  | "check_provider_status"
  | "reduce_request"
  | "contact_provider"
  | "none";

export type AiProviderError = {
  providerId: string;
  category: AiProviderErrorCategory;
  message: string;
  recoveryAction: AiRecoveryAction;
};

export type AiCompletionEvent =
  | { type: "delta"; requestId: string; sequence: number; text: string }
  | { type: "done"; requestId: string; usage?: AiUsage | null }
  | { type: "cancelled"; requestId: string }
  | { type: "timeout"; requestId: string }
  | { type: "provider_error"; requestId: string; error: AiProviderError };

export type LocalAiRuntimeState =
  | "not_installed"
  | "installed_stopped"
  | "starting"
  | "running"
  | "failed"
  | "unsupported";

export type LocalAiStatus = {
  state: LocalAiRuntimeState;
  version?: string | null;
  endpoint: string;
  managed: boolean;
  detail?: string | null;
};

export type LocalAiModel = {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
  digest: string;
  parameterSize?: string | null;
  quantizationLevel?: string | null;
};

export type LocalAiOperation = "install" | "pull";

export type LocalAiProgress =
  | {
      type: "progress";
      operationId: string;
      operation: LocalAiOperation;
      status: string;
      completedBytes: number;
      totalBytes?: number | null;
    }
  | { type: "complete"; operationId: string; operation: LocalAiOperation }
  | { type: "cancelled"; operationId: string; operation: LocalAiOperation };

export type LocalAiErrorCategory =
  | "invalid_request"
  | "unavailable"
  | "download_failed"
  | "checksum_mismatch"
  | "install_failed"
  | "process_failed"
  | "malformed_response"
  | "cancelled"
  | "unsupported";

export type LocalAiError = {
  category: LocalAiErrorCategory;
  message: string;
};

export type RemoteAiKeyTier = "vault" | "session-only";

export type CredentialVaultState =
  | "vault-ok"
  | "vault-locked"
  | "vault-no-collection"
  | "vault-absent"
  | "vault-blocked";

export type CredentialVaultDetection = {
  state: CredentialVaultState;
  detail?: string | null;
};

export type RemoteAiProviderState = {
  providerId: string;
  label: string;
  destination: string;
  keyTier?: RemoteAiKeyTier | null;
  acceptedDisclosureVersion?: number | null;
  currentDisclosureVersion: number;
};

export type RemoteAiModel = {
  providerId: string;
  modelId: string;
  label: string;
  contextWindowTokens: number;
  inputPriceMicrosPerMtok: number;
  outputPriceMicrosPerMtok: number;
};

export type RemoteAiCatalog = {
  version: number;
  pricingAsOf: string;
  models: RemoteAiModel[];
};

export type AiRunState = "done" | "cancelled" | "timed_out" | "failed";

export type AiTokenSource = "provider" | "estimated";

export type AiRunTokens = {
  inputTokens: number;
  outputTokens: number;
  source: AiTokenSource;
};

export type AiRunPrompts = {
  systemPrompt: string;
  userPrompt: string;
};

export type AiRunRecord = {
  runId: string;
  startedAtMs: number;
  origin: string;
  providerId: string;
  modelId: string;
  prompts?: AiRunPrompts | null;
  state: AiRunState;
  errorCategory?: AiProviderErrorCategory | null;
  durationMs: number;
  tokens: AiRunTokens;
  costMicros?: number | null;
};

export type AiHistoryRetention = {
  maxRuns: number;
  maxAgeDays: number;
};

export type AiHistorySettings = {
  retainPrompts: boolean;
  retention: AiHistoryRetention;
};

export type AiRunFilter = {
  providerId?: string | null;
  modelId?: string | null;
  state?: AiRunState | null;
  limit?: number | null;
};

export type AiUsageAggregate = {
  day: string;
  providerId: string;
  modelId: string;
  runs: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  estimated: boolean;
};

export type AiHistoryView = {
  settings: AiHistorySettings;
  pricingAsOf?: string | null;
  aggregates: AiUsageAggregate[];
  runs: AiRunRecord[];
};

export type AiTranscriptionModel = {
  providerId: string;
  modelId: string;
  label: string;
};

export type AiTranscriptionResult = {
  requestId: string;
  transcript: string;
};
