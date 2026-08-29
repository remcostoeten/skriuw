import { invoke, requireDesktopRuntime } from "@/bridge/runtime";
import type {
  CredentialVaultDetection,
  RemoteAiKeyTier,
  RemoteAiModelDirectory,
  RemoteAiProviderState,
} from "@/contracts/ai";

export type RemoteAiSnapshot = {
  vault: CredentialVaultDetection;
  providers: RemoteAiProviderState[];
  models: RemoteAiModelDirectory;
};

export function remoteAiProviders(): Promise<RemoteAiProviderState[]> {
  requireDesktop();
  return invoke<RemoteAiProviderState[]>("remote_ai_providers");
}

export function credentialVaultState(): Promise<CredentialVaultDetection> {
  requireDesktop();
  return invoke<CredentialVaultDetection>("credential_vault_state");
}

export function remoteAiModels(): Promise<RemoteAiModelDirectory> {
  requireDesktop();
  return invoke<RemoteAiModelDirectory>("remote_ai_models");
}

/**
 * Asks the provider which models the stored key can reach and records the
 * answer on this device. Sends the key but spends no tokens; callers must run
 * this from the explicit "Refresh models" action, never on mount.
 */
export function refreshRemoteAiModels(providerId: string): Promise<RemoteAiModelDirectory> {
  requireDesktop();
  return invoke<RemoteAiModelDirectory>("refresh_remote_ai_models", { providerId });
}

export async function loadRemoteAiSnapshot(): Promise<RemoteAiSnapshot> {
  const [vault, providers, models] = await Promise.all([
    credentialVaultState(),
    remoteAiProviders(),
    remoteAiModels(),
  ]);
  return { vault, providers, models };
}

export function saveRemoteAiKey(
  providerId: string,
  key: string,
  tier: RemoteAiKeyTier,
): Promise<RemoteAiProviderState[]> {
  requireDesktop();
  return invoke<RemoteAiProviderState[]>("save_remote_ai_key", { providerId, key, tier });
}

export function removeRemoteAiKey(providerId: string): Promise<RemoteAiProviderState[]> {
  requireDesktop();
  return invoke<RemoteAiProviderState[]>("remove_remote_ai_key", { providerId });
}

export function acceptRemoteAiDisclosure(
  providerId: string,
): Promise<RemoteAiProviderState[]> {
  requireDesktop();
  return invoke<RemoteAiProviderState[]>("accept_remote_ai_disclosure", { providerId });
}

export function revokeRemoteAiProvider(
  providerId: string,
): Promise<RemoteAiProviderState[]> {
  requireDesktop();
  return invoke<RemoteAiProviderState[]>("revoke_remote_ai_provider", { providerId });
}

/**
 * Spends one key on the smallest metered request the provider offers. Callers
 * must run this from an explicit user action: it costs the user money.
 */
export function verifyRemoteAiKey(
  providerId: string,
  modelId: string,
  key: string | null,
): Promise<void> {
  requireDesktop();
  return invoke<void>("verify_remote_ai_key", { providerId, modelId, key });
}

function requireDesktop(): void {
  requireDesktopRuntime("Remote AI provider keys");
}
