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
