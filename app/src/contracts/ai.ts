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
