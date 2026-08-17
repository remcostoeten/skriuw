import type {
  AiProviderError,
  AiRecoveryAction,
  CredentialVaultDetection,
  CredentialVaultState,
  RemoteAiCatalog,
  RemoteAiModel,
  RemoteAiProviderState,
} from "@/contracts/ai";

const KEY_TIER_LABELS = {
  vault: "Key stored in the system keyring",
  "session-only": "Key held for this session only",
} as const;

const VAULT_MESSAGES: Record<CredentialVaultState, string | null> = {
  "vault-ok": null,
  "vault-no-collection": null,
  "vault-locked": "Unlock your system keyring to store keys beyond this session.",
  "vault-absent":
    "No system keyring is available on this device. Keys can only be kept for this session.",
  "vault-blocked":
    "This build cannot reach your keyring. Keys can only be kept for this session.",
};

const RECOVERY_HINTS: Record<AiRecoveryAction, string | null> = {
  configure_credential: "Check the key and try again.",
  retry: "Try again.",
  choose_different_model: "Choose a different model.",
  check_provider_status: "Check the provider's status page.",
  reduce_request: "Send a smaller request.",
  contact_provider: "Add credit with the provider.",
  none: null,
};

export function remoteAiKeyLabel(provider: RemoteAiProviderState): string {
  return provider.keyTier ? KEY_TIER_LABELS[provider.keyTier] : "No key configured";
}

export function remoteAiConsentIsCurrent(provider: RemoteAiProviderState): boolean {
  return provider.acceptedDisclosureVersion === provider.currentDisclosureVersion;
}

export function remoteAiCanComplete(provider: RemoteAiProviderState): boolean {
  return Boolean(provider.keyTier) && remoteAiConsentIsCurrent(provider);
}

/**
 * The disclosure a user accepts before this provider may receive a request. It
 * names the destination the adapter actually reaches rather than restating a
 * host the renderer would have to keep in step by hand.
 */
export function remoteAiDisclosure(provider: RemoteAiProviderState): string {
  return `The text you send to ${provider.label} — your prompt and the note content you include — leaves this device for ${provider.destination}, authenticated with the key you store here. ${provider.label} decides how long it retains that text. Skriuw sends nothing to this provider until you accept.`;
}

export function remoteAiConsentStatus(provider: RemoteAiProviderState): string {
  if (provider.acceptedDisclosureVersion == null) {
    return "Disclosure not accepted";
  }
  return remoteAiConsentIsCurrent(provider)
    ? "Disclosure accepted"
    : "Disclosure changed since you accepted it";
}

export function vaultMessage(detection: CredentialVaultDetection | null): string | null {
  if (!detection) return null;
  return detection.detail ?? VAULT_MESSAGES[detection.state];
}

export function vaultAcceptsNewKeys(detection: CredentialVaultDetection | null): boolean {
  return detection?.state === "vault-ok" || detection?.state === "vault-no-collection";
}

export function remoteAiModelsFor(
  catalog: RemoteAiCatalog | null,
  providerId: string,
): RemoteAiModel[] {
  return (catalog?.models ?? []).filter((model) => model.providerId === providerId);
}

export function availableRemoteModel(
  selected: string | null,
  models: readonly RemoteAiModel[],
): string | null {
  return selected && models.some((model) => model.modelId === selected)
    ? selected
    : (models[0]?.modelId ?? null);
}

/** Integer micro-dollars per million tokens, rendered without floating-point money. */
export function formatPricePerMtok(micros: number): string {
  const whole = Math.trunc(micros / 1_000_000);
  const cents = Math.round((micros % 1_000_000) / 10_000)
    .toString()
    .padStart(2, "0");
  return `$${whole}.${cents}/MTok`;
}

export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${Math.round(tokens / 1_000_000)}M context`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}K context`;
  }
  return `${tokens} context`;
}

export function remoteAiModelSummary(model: RemoteAiModel): string {
  return [
    formatContextWindow(model.contextWindowTokens),
    `in ${formatPricePerMtok(model.inputPriceMicrosPerMtok)}`,
    `out ${formatPricePerMtok(model.outputPriceMicrosPerMtok)}`,
  ].join(" · ");
}

export function catalogPricingNote(catalog: RemoteAiCatalog | null): string {
  return catalog
    ? `Catalog v${catalog.version} · prices recorded ${catalog.pricingAsOf}, not read live from the provider.`
    : "Catalog unavailable.";
}

/** Turns a rejected provider command into one actionable sentence. */
export function remoteAiErrorMessage(reason: unknown): string {
  const error = asProviderError(reason);
  if (!error) {
    return typeof reason === "object" && reason !== null && "message" in reason
      ? String(reason.message)
      : String(reason);
  }
  const hint = RECOVERY_HINTS[error.recoveryAction];
  return hint ? `${error.message} ${hint}` : error.message;
}

function asProviderError(reason: unknown): AiProviderError | null {
  if (typeof reason !== "object" || reason === null) return null;
  const candidate = reason as Partial<AiProviderError>;
  return typeof candidate.message === "string" &&
    typeof candidate.recoveryAction === "string" &&
    candidate.recoveryAction in RECOVERY_HINTS
    ? (candidate as AiProviderError)
    : null;
}
